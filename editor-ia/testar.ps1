# Roda os testes automaticos do backend e confere o frontend (lint, tipos e build).
# Erros de programas externos sao checados por $LASTEXITCODE (o PowerShell 5.1 trata avisos no stderr como erro)
$ErrorActionPreference = "Continue"
$raiz = $PSScriptRoot
$falhou = $false

Write-Host "== Testes do backend ==" -ForegroundColor Cyan
Set-Location "$raiz\backend"
& .\.venv\Scripts\python.exe -m pytest -q
if ($LASTEXITCODE -ne 0) { $falhou = $true }

Write-Host ""
Write-Host "== Verificacao do frontend ==" -ForegroundColor Cyan
Set-Location "$raiz\frontend"
npm run lint
if ($LASTEXITCODE -ne 0) { $falhou = $true }
npm run build
if ($LASTEXITCODE -ne 0) { $falhou = $true }

Write-Host ""
if ($falhou) { Write-Host "Algum teste falhou (veja acima)." -ForegroundColor Red }
else { Write-Host "Tudo certo." -ForegroundColor Green }
Read-Host "Pressione Enter para fechar"
