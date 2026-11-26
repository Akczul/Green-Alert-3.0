param([switch]$Keep)
$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path $PSScriptRoot -Parent
$project = 'ga-analytics-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$evidence = Join-Path $serviceRoot '.local/verification'
New-Item -ItemType Directory -Force $evidence | Out-Null
$names = @('MONGO_ROOT_PASSWORD','MONGO_APP_PASSWORD','ANALYTICS_INTERNAL_TOKEN','ANALYTICS_IMAGE','ANALYTICS_PORT')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

function Invoke-Compose {
    param([string[]]$ComposeArgs)
    & docker compose --project-name $project --file (Join-Path $serviceRoot 'compose.yaml') @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "Falló Docker Compose (código $LASTEXITCODE)." }
}

try {
    $env:MONGO_ROOT_PASSWORD = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $env:MONGO_APP_PASSWORD = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $env:ANALYTICS_INTERNAL_TOKEN = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $env:ANALYTICS_IMAGE = $project + ':test'
    # Puerto libre asignado por Docker; no competir con el principal ni otros agentes.
    $env:ANALYTICS_PORT = '0'
    Invoke-Compose @('config', '--quiet')
    Invoke-Compose @('up', '--build', '--detach', '--wait', '--wait-timeout', '180', 'api')
    Invoke-Compose @('run', '--rm', '-T', 'tests') | Tee-Object -FilePath (Join-Path $evidence 'tests.txt')
    $address = (Invoke-Compose @('port', 'api', '8000') | Select-Object -Last 1).Trim()
    & node (Join-Path $serviceRoot 'integration/probe-live.mjs') "http://$address" |
        Set-Content -Encoding utf8 (Join-Path $evidence 'node-live.json')
    if ($LASTEXITCODE -ne 0) { throw 'Falló adaptador Node con API real.' }
    $seedOutput = Invoke-Compose @('run', '--rm', '-T', 'tests', 'python', '-m', 'scripts.probe', 'seed')
    $seedText = $seedOutput -join "`n"
    $seed = $seedText | ConvertFrom-Json
    $seedText | Set-Content -Encoding utf8 (Join-Path $evidence 'snapshot.json')
    Invoke-Compose @('stop', 'mongo')
    Invoke-Compose @('run', '--rm', '-T', 'tests', 'python', '-m', 'scripts.probe', 'outage') |
        Set-Content -Encoding utf8 (Join-Path $evidence 'outage.json')
    Invoke-Compose @('start', 'mongo')
    Invoke-Compose @('restart', 'api')
    Invoke-Compose @('run', '--rm', '-T', 'tests', 'python', '-m', 'scripts.probe', 'wait')
    $seedText | & docker compose --project-name $project --file (Join-Path $serviceRoot 'compose.yaml') run --rm -T tests python -m scripts.probe verify |
        Tee-Object -FilePath (Join-Path $evidence 'recovery.json')
    if ($LASTEXITCODE -ne 0) { throw 'Falló recuperación tras reinicio.' }
    $runId = $seed.runs[0].data.run_id
    Invoke-Compose @('run', '--rm', '-T', '-e', "BENCHMARK_RUN_ID=$runId", 'tests', 'python', '-m', 'scripts.benchmark') |
        Set-Content -Encoding utf8 (Join-Path $evidence 'benchmark.json')
    Invoke-Compose @('run', '--rm', '-T', 'tests', 'python', '-m', 'scripts.probe', 'openapi') |
        Set-Content -Encoding utf8 (Join-Path $evidence 'openapi.json')
    $containers = Invoke-Compose @('ps', '-q')
    & docker stats --no-stream --format '{{json .}}' @containers |
        Set-Content -Encoding utf8 (Join-Path $evidence 'docker-stats.jsonl')
    if ($LASTEXITCODE -ne 0) { throw 'Falló lectura de recursos.' }
    & docker image inspect $env:ANALYTICS_IMAGE --format '{{.Id}} {{.Config.User}}' |
        Set-Content -Encoding utf8 (Join-Path $evidence 'image.txt')
    Write-Output "Verificación completa. Evidencia local: $evidence"
} catch {
    # Los logs de aplicación propios no incluyen cabeceras ni secretos del entorno.
    Invoke-Compose @('logs', '--no-color', '--tail', '60', 'api', 'mongo') |
        Set-Content -Encoding utf8 (Join-Path $evidence 'failure.txt')
    throw
} finally {
    if (-not $Keep) {
        # Proyecto generado aquí; no acepta nombres/volúmenes ajenos del usuario.
        Invoke-Compose @('down', '--volumes', '--remove-orphans')
    }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
