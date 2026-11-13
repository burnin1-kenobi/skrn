# Instala tudo o que o projeto precisa (rode uma vez, e de novo se algo mudar).
# Uso: clique duas vezes em instalar.cmd  ou  powershell -ExecutionPolicy Bypass -File .\instalar.ps1
# Erros de programas externos sao checados por $LASTEXITCODE (o PowerShell 5.1 trata avisos no stderr como erro)
$ErrorActionPreference = "Continue"
$raiz = $PSScriptRoot

function Falhar($mensagem) {
    Write-Host ""
    Write-Host "ERRO: $mensagem" -ForegroundColor Red
    Read-Host "Pressione Enter para fechar"
    exit 1
}

Write-Host "== Verificando programas ==" -ForegroundColor Cyan
$python = $null
$candidatos = @(
    @{ exe = "py"; args = @("-3.12") },
    @{ exe = "py"; args = @("-3.13") },
    @{ exe = "python"; args = @() }
)
foreach ($c in $candidatos) {
    try {
        $versao = & $c.exe @($c.args + "--version") 2>$null
        if ($LASTEXITCODE -eq 0 -and "$versao" -match "Python 3\.(1[2-9])") { $python = $c; break }
    } catch { }
}
if (-not $python) { Falhar "Python 3.12 ou mais novo nao encontrado. Instale com: winget install -e --id Python.Python.3.12" }
Write-Host "Python: $(& $python.exe @($python.args + '--version'))"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Falhar "Node.js nao encontrado. Instale com: winget install -e --id OpenJS.NodeJS.LTS" }
$node = node --version
Write-Host "Node.js: $node"

Write-Host ""
Write-Host "== Backend (Python) ==" -ForegroundColor Cyan
Set-Location "$raiz\backend"
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    & $python.exe @($python.args + @("-m", "venv", ".venv"))
    if ($LASTEXITCODE -ne 0) { Falhar "Nao consegui criar o ambiente virtual do Python." }
}
& .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
if ($LASTEXITCODE -ne 0) { Falhar "Falha ao instalar as dependencias do backend." }

Write-Host ""
Write-Host "== Frontend (Next.js) ==" -ForegroundColor Cyan
Set-Location "$raiz\frontend"
npm ci
if ($LASTEXITCODE -ne 0) { Falhar "Falha ao instalar as dependencias do frontend." }

Write-Host ""
Write-Host "Tudo instalado. Agora rode iniciar.cmd" -ForegroundColor Green
Read-Host "Pressione Enter para fechar"
