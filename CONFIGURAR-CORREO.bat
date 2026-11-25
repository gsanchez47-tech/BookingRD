@echo off
rem BookingRD - configurar el envio real de correos con Gmail.
chcp 65001 >nul
title Configurar el correo de BookingRD
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo   Node.js no esta instalado. Abre primero el instalador de BookingRD.
    pause
    exit /b 1
)
node scripts\configurar-correo.js
echo.
pause
