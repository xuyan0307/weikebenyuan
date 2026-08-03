$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = 'C:\Users\HUAWEI\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
$logPath = Join-Path $env:TEMP 'weikebenyuan-local-frontend.log'

while ($true) {
  if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $vitePath)) {
    "[$(Get-Date -Format s)] Frontend runtime or Vite entry was not found" |
      Out-File -LiteralPath $logPath -Append -Encoding utf8
    Start-Sleep -Seconds 30
    continue
  }

  "[$(Get-Date -Format s)] Starting local frontend" |
    Out-File -LiteralPath $logPath -Append -Encoding utf8

  Push-Location $projectRoot
  try {
    & $nodePath $vitePath --host 127.0.0.1 --port 5173 *>> $logPath
  } catch {
    "[$(Get-Date -Format s)] $($_.Exception.Message)" |
      Out-File -LiteralPath $logPath -Append -Encoding utf8
  } finally {
    Pop-Location
  }

  "[$(Get-Date -Format s)] Frontend stopped; restarting in 5 seconds" |
    Out-File -LiteralPath $logPath -Append -Encoding utf8
  Start-Sleep -Seconds 5
}
