@echo off
rem BookingRD - Instalador completo para Windows.
rem Doble clic: pide permiso de administrador una vez e instala todo
rem (Node.js, SQL Server, la aplicacion en C:\BookingRD, la base de datos
rem y los accesos directos). El detalle queda en C:\BookingRD-instalacion.log
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar-windows.ps1"
