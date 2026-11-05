@echo off
setlocal
chcp 65001 >nul
title BookingRD
cd /d "%~dp0"

echo.
echo   BookingRD - instalacion y arranque
echo   ==================================
echo.

rem 1. Node.js
where node >nul 2>nul
if errorlevel 1 goto sin_node

rem 2. Dependencias, solo la primera vez
if exist "node_modules\mssql\" goto arrancar
echo   Instalando las dependencias. Solo la primera vez, tarda uno o dos minutos...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto error_npm

:arrancar
rem 3. SQL Server la primera vez, servidor y navegador
echo.
node scripts\iniciar.js
if errorlevel 1 pause
exit /b 0

:sin_node
echo   Falta Node.js, el programa que ejecuta BookingRD.
where winget >nul 2>nul
if errorlevel 1 goto node_manual
echo   Instalando Node.js LTS con winget. Acepta los permisos que pida Windows.
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo   Node.js instalado. Cierra esta ventana y vuelve a abrir INICIAR-BookingRD.bat
pause
exit /b 0

:node_manual
echo   Descargalo de https://nodejs.org, version LTS, instalalo y vuelve a abrir este archivo.
start "" https://nodejs.org
pause
exit /b 1

:error_npm
echo.
echo   No se pudieron instalar las dependencias. Revisa la conexion a internet y vuelve a intentarlo.
pause
exit /b 1
