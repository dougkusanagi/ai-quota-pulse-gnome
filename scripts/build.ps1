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

Write-Host "Build concluido: dist/ChatGPTUsage.exe"
