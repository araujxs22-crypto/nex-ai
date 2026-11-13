@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 20 ou superior.
  pause
  exit /b 1
)
if not exist "node_modules\playwright" (
  echo Dependencias nao instaladas. Execute install.bat primeiro.
  pause
  exit /b 1
)
node server.js
pause
