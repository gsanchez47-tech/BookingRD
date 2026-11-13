@echo off
setlocal
chcp 65001 >nul
title Desinstalar BookingRD
rem Quita BookingRD de este equipo: la carpeta C:\BookingRD, los accesos
rem directos y la base de datos BookingRD (SQL Server queda instalado).
echo.
echo   Se va a quitar BookingRD de este equipo, con su base de datos.
choice /C SN /M "  Continuar"
if errorlevel 2 exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\BookingRD\scripts\desinstalar-windows.ps1'"
