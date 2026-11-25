@echo off
rem BookingRD - ajustes: correo real (Gmail) y asistente con IA.
chcp 65001 >nul
title Configurar BookingRD
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo   Node.js no esta instalado. Abre primero el instalador de BookingRD.
    pause
    exit /b 1
)
echo.
echo   Configurar BookingRD
echo   ====================
echo.
echo   1. Correo real con Gmail (codigos, reservas y avisos)
echo   2. Asistente Caribe con IA (opcional)
echo   3. Salir
echo.
choice /c 123 /n /m "  Elige 1, 2 o 3: "
if errorlevel 3 exit /b 0
if errorlevel 2 (
    node scripts\configurar-ia.js
) else (
    node scripts\configurar-correo.js
)
echo.
pause
