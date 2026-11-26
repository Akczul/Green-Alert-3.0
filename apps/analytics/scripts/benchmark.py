"""Mide el cálculo productivo, sin aserción artificial de aceleración."""
import asyncio
import hashlib
import json
import multiprocessing
import os
import platform
import statistics
import threading
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import httpx
import psutil

from greenalert_analytics.risk import risk_job
from scripts.synthetic import risk_payload


class Resources:
    def __enter__(self):
        self.process = psutil.Process()
        self.stop = threading.Event()
        self.peak = 0
        self.start_cpu = self.cpu()
        self.start_wall = time.perf_counter()
        self.thread = threading.Thread(target=self.sample, daemon=True)
        self.thread.start()
        return self

    def processes(self):
        return [self.process] + self.process.children(recursive=True)

    def cpu(self):
        total = 0
        for p in self.processes():
            try:
                t = p.cpu_times()
                total += t.user + t.system
            except psutil.NoSuchProcess:
                pass
        return total

    def sample(self):
        while not self.stop.is_set():
            rss = 0
            for p in self.processes():
                try:
                    rss += p.memory_info().rss
                except psutil.NoSuchProcess:
                    pass
            self.peak = max(self.peak, rss)
            self.stop.wait(.01)

    def __exit__(self, *args):
        self.wall = time.perf_counter() - self.start_wall
        self.cpu_seconds = self.cpu() - self.start_cpu
        self.stop.set()
        self.thread.join()

    def result(self):
        return {"wall_seconds": self.wall, "cpu_seconds_parent_and_children": self.cpu_seconds,
                "peak_rss_sum_mib": self.peak / 1024 ** 2,
                "cpu_core_equivalents": self.cpu_seconds / self.wall}


def digest(result):
    return hashlib.sha256(json.dumps(result, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


async def io_benchmark(run):
    base = os.environ["ANALYTICS_TEST_URL"]
    headers = {"Authorization": "Bearer " + os.environ["ANALYTICS_INTERNAL_TOKEN"], "X-Analytics-Scope": "verification"}
    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=15) as client:
        async def read():
            response = await client.get("/internal/v1/runs/" + run)
            response.raise_for_status()
            return response.json()
        await read()
        with Resources() as sequential:
            seq = [await read() for _ in range(20)]
        semaphore = asyncio.Semaphore(4)

        async def bounded_read():
            async with semaphore:
                return await read()

        with Resources() as concurrent:
            par = await asyncio.gather(*(bounded_read() for _ in range(20)))
        assert seq == par
        return {"requests": 20, "max_concurrency": 4, "equivalent": True,
                "sequential": sequential.result(), "concurrent": concurrent.result(),
                "resource_scope": "cliente HTTP; recursos de API/Mongo se recogen aparte con docker stats"}


def main():
    jobs = [risk_payload(20000, i) for i in range(8)]
    measurements = []
    with ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context("spawn")) as pool:
        started = time.perf_counter()
        list(pool.map(risk_job, [risk_payload(1)] * 2))
        startup = time.perf_counter() - started
        for repeat in range(3):
            # Alternar orden para reducir sesgo de caché/calor; misma entrada cada vez.
            def sequential():
                with Resources() as observed:
                    result = [risk_job(job) for job in jobs]
                return result, observed.result()

            def parallel():
                with Resources() as observed:
                    result = list(pool.map(risk_job, jobs, chunksize=1))
                return result, observed.result()

            if repeat % 2:
                par, p = parallel()
                seq, s = sequential()
            else:
                seq, s = sequential()
                par, p = parallel()
            assert seq == par
            measurements.append({"sequential": s, "parallel": p, "result_sha256": digest(seq)})
    seq_median = statistics.median(m["sequential"]["wall_seconds"] for m in measurements)
    par_median = statistics.median(m["parallel"]["wall_seconds"] for m in measurements)
    result = {"dataset": "synthetic-risk-v1", "jobs": 8, "reports_per_job": 20000, "workers": 2,
              "equivalent": True, "repeats": measurements, "pool_startup_seconds": startup,
              "median_speedup": seq_median / par_median,
              "platform": platform.platform(), "python": platform.python_version(),
              "host_logical_cpus": os.cpu_count(), "cpu_quota": Path("/sys/fs/cgroup/cpu.max").read_text().strip(),
              "resource_notes": "Muestreo RSS cada 10 ms; suma RSS puede contar páginas compartidas. Pool caliente; transporte incluido. Sin garantía de aceleración."}
    if os.environ.get("BENCHMARK_RUN_ID"):
        result["io"] = asyncio.run(io_benchmark(os.environ["BENCHMARK_RUN_ID"]))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
