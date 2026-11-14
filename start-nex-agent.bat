@echo off
setlocal
set "NEX_WORKSPACE=%USERPROFILE%\Documents\NEX-Workspace"
if not exist "%NEX_WORKSPACE%" mkdir "%NEX_WORKSPACE%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale Node.js LTS e tente novamente.
  pause
  exit /b 1
)
node "%~dp0local-agent\server.mjs" "%NEX_WORKSPACE%"
pause
