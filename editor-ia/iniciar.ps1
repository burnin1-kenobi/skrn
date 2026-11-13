# Liga o backend e o frontend, cada um numa janela, e abre o navegador.
# Para desligar, feche as duas janelas que abrirem.
$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot

if (-not (Test-Path "$raiz\backend\.venv\Scripts\python.exe") -or -not (Test-Path "$raiz\frontend\node_modules")) {
    Write-Host "Primeiro rode instalar.cmd" -ForegroundColor Yellow
    Read-Host "Pressione Enter para fechar"
    exit 1
}

Start-Process powershell -WorkingDirectory "$raiz\backend" -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle = 'Editor IA - backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
)
Start-Process powershell -WorkingDirectory "$raiz\frontend" -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle = 'Editor IA - frontend'; npm run dev -- --hostname 127.0.0.1 --port 3000"
)

Write-Host "Aguardando os servidores ligarem..."
for ($i = 0; $i -lt 60; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000" -TimeoutSec 2 | Out-Null
        break
    } catch { Start-Sleep -Seconds 1 }
}
Start-Process "http://127.0.0.1:3000"
