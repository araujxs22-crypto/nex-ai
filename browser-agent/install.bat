@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo NEX - Instalador do agente de navegador
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 20 ou superior e abra este arquivo novamente.
  pause
  exit /b 1
)
echo Instalando Playwright...
call npm install
if errorlevel 1 (
  echo Falha ao instalar dependencias.
  pause
  exit /b 1
)
echo Baixando o Chromium do Playwright...
call npx playwright install chromium
if errorlevel 1 (
  echo Falha ao instalar Chromium.
  pause
  exit /b 1
)
echo.
echo Instalacao concluida. Agora execute start.bat.
pause
