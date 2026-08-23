# Piri web arayuzunu baslatir.
# Kullanim: sag tik -> "Run with PowerShell"  veya  .\run_web.ps1

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  PIRI - Yarismaci Destek Asistani" -ForegroundColor Cyan
Write-Host "  Embedding modeli yukleniyor, lutfen bekleyin..." -ForegroundColor DarkGray
Write-Host ""

# Bos port sec (8000 doluysa bir sonrakine gecer) ve tarayiciyi otomatik ac
$port = 8000
while ((Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    $port++
}
$env:PIRI_PORT = "$port"

Start-Job -ScriptBlock {
    param($p)
    Start-Sleep -Seconds 25
    Start-Process "http://127.0.0.1:$p"
} -ArgumentList $port | Out-Null

.\.venv-local\Scripts\python.exe backend\web_app.py
