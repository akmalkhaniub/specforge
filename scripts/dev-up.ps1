# Starts the full SpecForge local dev environment on Windows (no Docker):
# PostgreSQL service, MinIO, Redis, then the API and web dev servers (each in its
# own window). Idempotent — skips anything already running.
#
# Usage:  pwsh -File scripts/dev-up.ps1     (or)  ./scripts/dev-up.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$data = Join-Path $root '.data'

function Test-Port($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

Write-Host '== SpecForge dev up ==' -ForegroundColor Cyan

# 1) PostgreSQL (native Windows service)
$pg = Get-Service -Name 'postgresql-x64-18' -ErrorAction SilentlyContinue
if ($pg) {
  if ($pg.Status -ne 'Running') { Start-Service $pg.Name; Write-Host 'Postgres: started' }
  else { Write-Host 'Postgres: already running' }
} else {
  Write-Host 'Postgres: service postgresql-x64-18 not found (start it manually)' -ForegroundColor Yellow
}

# 2) MinIO
if (Test-Port 9000) {
  Write-Host 'MinIO: already running'
} else {
  New-Item -ItemType Directory -Force (Join-Path $data 'minio') | Out-Null
  $env:MINIO_ROOT_USER = 'minioadmin'
  $env:MINIO_ROOT_PASSWORD = 'minioadmin'
  Start-Process -WindowStyle Hidden -FilePath (Join-Path $tools 'minio.exe') `
    -ArgumentList @('server', (Join-Path $data 'minio'), '--console-address', ':9001')
  Write-Host 'MinIO: started (API :9000, console :9001)'
}

# 3) Redis
if (Test-Port 6379) {
  Write-Host 'Redis: already running'
} else {
  $redis = Get-ChildItem -Recurse -Path $tools -Filter 'redis-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($redis) {
    Start-Process -WindowStyle Hidden -FilePath $redis.FullName -ArgumentList @('--port', '6379', '--save', '""', '--appendonly', 'no')
    Write-Host 'Redis: started (:6379)'
  } else {
    Write-Host 'Redis: redis-server.exe not found under .tools' -ForegroundColor Yellow
  }
}

# 4) API + web dev servers, each in its own window
if (Test-Port 3000) {
  Write-Host 'API: already running on :3000'
} else {
  Start-Process pwsh -ArgumentList @('-NoExit', '-Command', "Set-Location '$root'; pnpm --filter api dev")
  Write-Host 'API: starting on :3000'
}
if (Test-Port 5173) {
  Write-Host 'Web: already running on :5173'
} else {
  Start-Process pwsh -ArgumentList @('-NoExit', '-Command', "Set-Location '$root'; pnpm --filter web dev")
  Write-Host 'Web: starting on :5173'
}

Write-Host ''
Write-Host 'Ready: API http://localhost:3000/health   Web http://localhost:5173' -ForegroundColor Green
