$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$nodePath = 'C:\Users\HUAWEI\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$entryPoint = Join-Path $backendRoot 'dist\index.js'
$logPath = Join-Path $env:TEMP 'weikebenyuan-local-backend.log'

$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '3306'
$env:DB_NAME = 'chankang_platform'
$env:DB_USER = 'chankang'
$env:DB_PASSWORD = 'chankang_password'
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '6379'
$env:JWT_SECRET = 'local-test-secret'
$env:JWT_EXPIRES_IN = '7d'
$env:ALLOW_LOCAL_UPLOAD_FALLBACK = 'true'

while ($true) {
  if (-not (Test-Path -LiteralPath $nodePath)) {
    "[$(Get-Date -Format s)] Node runtime not found: $nodePath" |
      Out-File -LiteralPath $logPath -Append -Encoding utf8
    Start-Sleep -Seconds 30
    continue
  }

  if (-not (Test-Path -LiteralPath $entryPoint)) {
    "[$(Get-Date -Format s)] Backend build not found: $entryPoint" |
      Out-File -LiteralPath $logPath -Append -Encoding utf8
    Start-Sleep -Seconds 30
    continue
  }

  "[$(Get-Date -Format s)] Starting local backend" |
    Out-File -LiteralPath $logPath -Append -Encoding utf8

  Push-Location $backendRoot
  try {
    & $nodePath $entryPoint *>> $logPath
  } catch {
    "[$(Get-Date -Format s)] $($_.Exception.Message)" |
      Out-File -LiteralPath $logPath -Append -Encoding utf8
  } finally {
    Pop-Location
  }

  "[$(Get-Date -Format s)] Backend stopped; restarting in 5 seconds" |
    Out-File -LiteralPath $logPath -Append -Encoding utf8
  Start-Sleep -Seconds 5
}
