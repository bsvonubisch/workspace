$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required to run Control Room.' }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Install Codex and sign in before starting Control Room.' }
Write-Host 'Open http://127.0.0.1:4318 in your browser. Keep this terminal running.'
node server.mjs
