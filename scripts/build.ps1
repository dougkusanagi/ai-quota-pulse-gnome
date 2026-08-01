$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
uv sync --dev
uv run pyinstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name ChatGPTUsage `
  --paths src `
  src/chatgpt_usage_widget/__main__.py

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller falhou com código $LASTEXITCODE. Verifique se dist/ChatGPTUsage.exe está em execução."
}

Write-Host "Build concluido: dist/ChatGPTUsage.exe"
