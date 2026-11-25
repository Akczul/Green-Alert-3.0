"""Pruebas con Cassandra/Druid reales. Solo crea/retira su propio proyecto aleatorio."""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import secrets
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "ga-events-test-" + secrets.token_hex(6)
LOCAL = ROOT / ".local" / PROJECT
LOCAL.mkdir(parents=True)
TOKENS = {key: secrets.token_hex(32) for key in (
    "EVENTS_SERVICE_TOKEN", "EVENTS_RECONCILE_TOKEN", "DRUID_METADATA_PASSWORD", "DRUID_METADATA_ROOT_PASSWORD")}
ENV = LOCAL / "test.env"
NETWORK = PROJECT + "-net"
ENV.write_text("\n".join(f"{k}={v}" for k, v in TOKENS.items()) + "\nEVENTS_PORT=0\nEVENTS_NETWORK="+NETWORK+"\n", encoding="utf-8")
COMPOSE = ["docker", "compose", "--env-file", str(ENV), "-p", PROJECT,
           "-f", str(ROOT / "compose.datos.yml"), "-f", str(ROOT / "compose.apps.yml")]
REPORT = {"project": PROJECT, "startedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "checks": [], "benchmark": [], "resourceSamples": [], "success": False}
BASE = None
NAMESPACE = uuid.UUID("a65223a5-8362-4882-9c9a-5b26d449ed10")


def redact(text):
    for secret in TOKENS.values():
        text = text.replace(secret, "[REDACTADO]")
    return text


def compose(*args, timeout=600):
    result = subprocess.run(COMPOSE + list(args), cwd=ROOT, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=timeout)
    with (LOCAL / "commands.log").open("a", encoding="utf-8") as log:
        log.write(redact(" ".join(args) + "\n" + result.stdout + result.stderr + "\n"))
    if result.returncode:
        raise RuntimeError(f"Compose {' '.join(args)} falló; revisar log local saneado")
    return result.stdout.strip()


def api(path, body=None, token="service", method=None, headers=None, timeout=240):
    actual_headers = {"X-Correlation-ID": "test-c-3638", **(headers or {})}
    if token:
        actual_headers["Authorization"] = "Bearer " + TOKENS[
            "EVENTS_RECONCILE_TOKEN" if token == "reconcile" else "EVENTS_SERVICE_TOKEN"]
    raw = None if body is None else json.dumps(body).encode()
    if raw is not None:
        actual_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE + path, data=raw, headers=actual_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read()), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read()), dict(error.headers)


def expect(path, status=200, **kwargs):
    actual, body, headers = api(path, **kwargs)
    assert actual == status, (path, actual, body)
    return body, headers


def wait_for(predicate, timeout=180):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            result = predicate()
            if result:
                return result
        except Exception as error:
            last = error
        time.sleep(1)
    raise AssertionError(f"Timeout esperando recuperación: {last}")


def check(name, work):
    started = time.perf_counter()
    work()
    REPORT["checks"].append({"name": name, "status": "PASS", "ms": round((time.perf_counter()-started)*1000, 2)})
    print(f"PASS {name}", flush=True)


def event(name, report="report-1", day="2026-01-15", index=0):
    return {"eventId": str(uuid.uuid5(NAMESPACE, name)), "reportId": str(uuid.uuid5(NAMESPACE, report)),
            "schemaVersion": 1, "type": "REPORT_CREATED" if index % 2 == 0 else "ENVIRONMENTAL_OBSERVATION",
            "occurredAt": f"{day}T12:{index % 60:02d}:00Z", "sourceRevision": index,
            "category": "agua" if index % 2 == 0 else "aire", "severity": index % 6, "zone": "zona-1" if index % 2 == 0 else "zona-2"}


def history(report="report-1", day="2026-01-15"):
    rid = str(uuid.uuid5(NAMESPACE, report))
    end = (datetime.date.fromisoformat(day) + datetime.timedelta(days=1)).isoformat()
    return expect(f"/api/v1/reports/{rid}/events?from={day}T00:00:00Z&to={end}T00:00:00Z&limit=500")[0]["data"]


INDICATORS = "/api/v1/indicators?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z"


def total(rows, field="events"):
    return sum(row[field] for row in rows)


def reconcile():
    body, _ = expect("/api/v1/reconciliation/2026-01-15", token="reconcile", method="POST")
    assert body["data"]["state"] == "SUCCESS", body
    REPORT.setdefault("druidTasks", []).append(body["data"])


def indicators_equal(expected):
    def predicate():
        body, _ = expect(INDICATORS)
        return body["data"] if total(body["data"]) == expected else False
    return wait_for(predicate)


def resources(label):
    ids = compose("ps", "-q").splitlines()
    result = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{json .}}", *ids],
                            capture_output=True, text=True, timeout=30)
    REPORT["resourceSamples"].append({"label": label, "containers": [json.loads(line) for line in result.stdout.splitlines() if line]})


def run():
    global BASE
    print(f"Proyecto aislado: {PROJECT}. Arrancando motores reales...", flush=True)
    compose("config", "--quiet")
    subprocess.run(["docker","network","create","--label","org.greenalert.events.runner="+PROJECT,NETWORK],check=True,capture_output=True)
    compose("up", "-d", "--build", timeout=1200)
    port = compose("port", "events", "8080").split(":")[-1]
    BASE = "http://127.0.0.1:" + port
    wait_for(lambda: api("/actuator/health/readiness")[0] == 200, timeout=300)
    REPORT["docker"] = subprocess.check_output(["docker", "info", "--format", "{{.MemTotal}} bytes; {{.NCPU}} CPUs"], text=True).strip()
    REPORT["sourceRevision"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    REPORT["sourceFilesSha256"] = {str(path.relative_to(ROOT)).replace("\\","/"): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(ROOT.rglob("*")) if path.is_file() and (path.parts[len(ROOT.parts)] in {"src","infra","tests"} or path.name in {"pom.xml","Dockerfile","compose.datos.yml","compose.apps.yml"})}
    resources("ready")
    check("health y readiness reales", lambda: expect("/actuator/health/liveness", token=None))
    check("sin token denegado", lambda: expect(INDICATORS, status=401, token=None))
    check("token normal no reconcilia", lambda: expect("/api/v1/reconciliation/2026-01-15", status=401, method="POST"))
    check("token operador no registra", lambda: expect("/api/v1/events", status=401, token="reconcile", body=event("denied")))
    check("correlación inválida", lambda: expect(INDICATORS, status=400, headers={"X-Correlation-ID": "bad value"}))
    def openapi():
        doc, _ = expect("/v3/api-docs")
        assert len(doc["paths"]) == 5
        (LOCAL / "openapi.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    check("OpenAPI generado", openapi)
    first = event("first")
    def create():
        body, headers = expect("/api/v1/events", status=201, body=first)
        assert body["data"]["created"] is True and headers["X-Correlation-ID"] == "test-c-3638"
    check("escritura Cassandra y correlación", create)
    check("lectura historial reporte", lambda: assert_history([first]))
    check("reintento idempotente", lambda: expect("/api/v1/events", body=first))
    check("UUID conflictivo", lambda: expect("/api/v1/events", status=409, body={**first, "severity": 5}))
    check("UUID no puede moverse de reporte", lambda: expect("/api/v1/events", status=409, body={**first, "reportId": str(uuid.uuid5(NAMESPACE,"another-report"))}))
    def repair():
        # Simula proyección incompleta tras fallo. Nunca toca la tabla canónica ni datos ajenos.
        compose("exec", "-T", "cassandra", "cqlsh", "-e",
                f"DELETE FROM greenalert_events.events_by_report WHERE report_id={first['reportId']} AND month='2026-01';")
        assert history() == []
        expect("/api/v1/events", body=first)
        assert_history([first])
    check("reintento repara proyección histórica incompleta", repair)
    check("propiedades desconocidas rechazadas", lambda: expect("/api/v1/events", status=400, body={**event("extra"), "email": "synthetic@example.invalid"}))
    check("severidad inválida", lambda: expect("/api/v1/events", status=400, body={**event("bad"), "severity": 6}))
    check("revisión fraccionaria no se trunca",lambda: expect("/api/v1/events",status=400,body={**event("fraction"),"sourceRevision":0.5}))
    check("severidad string no se convierte",lambda: expect("/api/v1/events",status=400,body={**event("string-number"),"severity":"3"}))
    check("rango histórico invertido", lambda: expect(f"/api/v1/reports/{first['reportId']}/events?from=2026-01-16T00:00:00Z&to=2026-01-15T00:00:00Z", status=400))
    check("payload acotado", lambda: expect("/api/v1/events", status=413, body={"padding": "x"*262145}))
    def duplicates():
        same = event("simultaneous")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: api("/api/v1/events", body=same), range(8)))
        assert sorted(r[0] for r in results) == [200]*7 + [201], [r[0] for r in results]
        assert len(history()) == 2
    check("8 duplicados simultáneos con LWT", duplicates)
    dataset = [event(f"ingest-{i}", index=i) for i in range(16)]
    check("lote concurrente Cassandra", lambda: expect("/api/v1/events/batches", body={"events": dataset}))
    check("ingesta real Druid", reconcile)
    def aggregate():
        rows = indicators_equal(18)
        assert total(rows, "reportsCreated") == 10
        assert len(history()) == 18
        REPORT["aggregate"] = {"events": 18, "reportsCreated": 10, "rows": rows}
    check("agregados exactos contra fuente", aggregate)
    check("indicadores rechazan límites inferiores a una hora", lambda: expect("/api/v1/indicators?from=2026-01-15T12:01:00Z&to=2026-01-15T13:00:00Z",status=400))
    def period():
        rows=expect("/api/v1/indicators?from=2026-01-15T13:00:00Z&to=2026-01-15T14:00:00Z")[0]["data"]
        assert rows == []
    check("filtro de período excluye horas ajenas",period)
    def filters():
        for query, expected in (("&category=agua", 10), ("&severity=0", 5), ("&zone=zona-2", 8), ("&category=agua&zone=zona-1",10)):
            rows = expect(INDICATORS + query)[0]["data"]
            assert total(rows) == expected, (query, rows)
    check("filtros período categoría severidad zona", filters)
    check("reingesta reemplaza intervalo", reconcile)
    check("replay no duplica métricas", lambda: indicators_equal(18))
    def busy_projection():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            task=pool.submit(api,"/api/v1/reconciliation/2026-01-15",token="reconcile",method="POST")
            wait_for(lambda: api("/api/v1/events",body=first)[0] == 429,timeout=30)
            _, headers=expect("/api/v1/reconciliation/2026-01-15",status=429,token="reconcile",method="POST")
            assert headers.get("Retry-After") == "5"
            assert task.result()[0] == 200
        indicators_equal(18)
    check("reconciliación exclusiva y backpressure 429",busy_projection)
    def unavailable_cassandra():
        compose("stop", "cassandra")
        try:
            expect("/api/v1/events", status=503, body=event("after-cassandra-failure"))
            assert api("/actuator/health/readiness")[0] == 503
        finally:
            compose("start", "cassandra")
        wait_for(lambda: api("/actuator/health/readiness")[0] == 200, timeout=240)
        expect("/api/v1/events", status=201, body=event("after-cassandra-failure"))
        assert len(history()) == 19
    check("caída Cassandra y recuperación sin reiniciar API", unavailable_cassandra)
    def unavailable_druid():
        compose("stop", "broker", "coordinator")
        try:
            expect(INDICATORS, status=503)
            expect("/api/v1/reconciliation/2026-01-15", token="reconcile", method="POST", status=503)
            expect("/api/v1/events", status=201, body=event("while-druid-down"))
        finally:
            compose("start", "coordinator", "broker")
        wait_for(lambda: api("/actuator/health/readiness")[0] == 200, timeout=240)
        reconcile()
        indicators_equal(20)
    check("caída Druid conserva historial y replay recupera", unavailable_druid)
    def benchmark():
        for sample in range(4):
            for mode in (("sequential","concurrent") if sample % 2 == 0 else ("concurrent","sequential")):
                data = [event(f"bench-{mode}-{sample}-{i}", report=f"bench-{i % 16}", day="2026-01-16", index=i) for i in range(64)]
                start=time.perf_counter()
                body,_=expect("/api/v1/events/batches?mode="+mode, body={"events": data})
                elapsed=(time.perf_counter()-start)*1000
                assert len(body["data"]) == 64 and all(r["created"] for r in body["data"])
                REPORT["benchmark"].append({"mode": mode,"sample": sample,"events":64,"ms":round(elapsed,2),"warmup":sample==0})
                resources(mode+"-"+str(sample))
        for i in range(16):
            assert len(history(f"bench-{i}","2026-01-16")) == 32
        REPORT["benchmarkSummary"] = {mode: statistics.median(x["ms"] for x in REPORT["benchmark"] if x["mode"]==mode and not x["warmup"]) for mode in ("sequential","concurrent")}
        peak=expect("/actuator/metrics/events.processing.peak")[0]["measurements"][0]["value"]
        assert peak > 1, peak
        REPORT["observedPeakConcurrency"] = peak
    check("concurrencia real 512 escrituras y resultados equivalentes", benchmark)
    peaks=[]
    for container_id in compose("ps","-q").splitlines():
        sample=subprocess.run(["docker","exec",container_id,"cat","/sys/fs/cgroup/memory.peak","/sys/fs/cgroup/cpu.stat"],
                              capture_output=True,text=True,timeout=10)
        if sample.returncode==0:
            lines=sample.stdout.splitlines()
            peaks.append({"containerId":container_id,"memoryPeakBytes":int(lines[0]),
                          "cpuCumulative":dict(line.split() for line in lines[1:])})
    REPORT["cgroupBeforeRestart"]=peaks
    def restart():
        global BASE
        before=history()
        rows=indicators_equal(20)
        # Reinicio del stack completo: discos y metadatos conservados, no se reingesta.
        compose("stop", timeout=180)
        compose("start", timeout=300)
        # Docker puede reasignar un puerto publicado como 0 al volver a arrancar.
        BASE="http://127.0.0.1:"+compose("port","events","8080").split(":")[-1]
        wait_for(lambda: api("/actuator/health/readiness")[0] == 200, timeout=300)
        assert history() == before
        assert indicators_equal(20) == rows
        expect("/api/v1/events", body=first)
    check("persistencia Cassandra y Druid tras reiniciar todo el stack", restart)
    def rotation():
        old=TOKENS["EVENTS_SERVICE_TOKEN"]
        TOKENS["EVENTS_SERVICE_TOKEN"]=secrets.token_hex(32)
        ENV.write_text("\n".join(f"{k}={v}" for k,v in TOKENS.items())+"\nEVENTS_PORT="+BASE.rsplit(":",1)[1]+"\nEVENTS_NETWORK="+NETWORK+"\n",encoding="utf-8")
        compose("up","-d","--no-deps","--force-recreate","events")
        wait_for(lambda: api("/actuator/health/readiness")[0]==200,timeout=120)
        # api agrega credencial actual; petición directa para verificar revocación del valor anterior.
        request=urllib.request.Request(BASE+INDICATORS,headers={"Authorization":"Bearer "+old})
        try:
            urllib.request.urlopen(request,timeout=10)
            raise AssertionError("Credencial anterior aceptada")
        except urllib.error.HTTPError as error:
            assert error.code==401
    check("rotación de credencial invalida token anterior",rotation)
    resources("final")
    REPORT["success"] = True


def assert_history(expected):
    actual=history()
    assert {x["eventId"] for x in actual} == {x["eventId"] for x in expected}
    assert all(x["reportId"] == expected[0]["reportId"] for x in actual)


try:
    run()
except Exception as error:
    REPORT["error"] = redact(str(error))
    print("FAIL " + REPORT["error"], flush=True)
finally:
    try:
        compose("logs", "--no-color", "--tail", "120", timeout=40)
    except Exception:
        pass
    try:
        compose("down", "--volumes", "--remove-orphans", timeout=180)
        subprocess.run(["docker","network","rm",NETWORK],check=True,capture_output=True)
        REPORT["cleanup"] = "solo proyecto " + PROJECT
    except Exception as error:
        REPORT["cleanupError"] = str(error)
    REPORT["finishedUtc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (LOCAL / "result.json").write_text(json.dumps(REPORT, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Resultado: " + str(LOCAL / "result.json"), flush=True)
sys.exit(0 if REPORT["success"] else 1)
