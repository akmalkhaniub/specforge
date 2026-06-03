# Stops the SpecForge local dev environment: API (3000), web (5173), MinIO
# (9000/9001), and Redis (6379) by killing whatever listens on those ports.
# Leaves the PostgreSQL Windows service running (it is shared infrastructure);
# pass -StopPostgres to stop it too.
#
# Usage:  ./scripts/dev-down.ps1   [-StopPostgres]

param([switch]$StopPostgres)

function Stop-Port($port, $label) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if ($pids) {
    foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
    Write-Host "$label (:$port): stopped"
  } else {
    Write-Host "$label (:$port): not running"
  }
}

Write-Host '== SpecForge dev down ==' -ForegroundColor Cyan
Stop-Port 5173 'Web'
Stop-Port 3000 'API'
Stop-Port 9001 'MinIO console'
Stop-Port 9000 'MinIO'
Stop-Port 6379 'Redis'

if ($StopPostgres) {
  $pg = Get-Service -Name 'postgresql-x64-18' -ErrorAction SilentlyContinue
  if ($pg -and $pg.Status -eq 'Running') { Stop-Service $pg.Name; Write-Host 'Postgres: stopped' }
} else {
  Write-Host 'Postgres: left running (use -StopPostgres to stop)'
}
