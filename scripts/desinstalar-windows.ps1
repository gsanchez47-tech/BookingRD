<#
  BookingRD - Desinstalador (lo abre DESINSTALAR-BookingRD.bat con permisos de administrador).
  Detiene la aplicación, borra la base BookingRD y su usuario de SQL Server,
  los accesos directos y la carpeta C:\BookingRD.
#>
$ErrorActionPreference = 'Continue'
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

$clave = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
$instancias = if (Test-Path $clave) { @((Get-Item $clave).Property) } else { @() }
Add-Type -AssemblyName System.Data
foreach ($instancia in $instancias) {
    $destino = if ($instancia -eq 'MSSQLSERVER') { '.' } else { ".\$instancia" }
    try {
        $conexion = New-Object System.Data.SqlClient.SqlConnection "Server=$destino;Database=master;Integrated Security=True;Connect Timeout=15"
        $conexion.Open()
        $comando = $conexion.CreateCommand()
        $comando.CommandText = "IF DB_ID(N'BookingRD') IS NOT NULL BEGIN ALTER DATABASE BookingRD SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE BookingRD; END; IF SUSER_ID(N'bookingrd_app') IS NOT NULL DROP LOGIN bookingrd_app;"
        [void]$comando.ExecuteNonQuery()
        $conexion.Close()
        Write-Host "Base BookingRD eliminada de $destino." -ForegroundColor Green
    } catch {
        Write-Host "No se pudo limpiar $destino : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

$accesos = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'BookingRD.lnk'),
    (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'BookingRD.lnk'),
    (Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'BookingRD')
)
foreach ($acceso in $accesos) { if (Test-Path $acceso) { Remove-Item $acceso -Recurse -Force } }

Set-Location $env:TEMP
# La carpeta se borra al final, cuando este script ya no la usa.
Start-Process cmd.exe -ArgumentList '/c', 'timeout /t 2 /nobreak >nul & rmdir /s /q "C:\BookingRD"' -WindowStyle Hidden
Write-Host 'BookingRD quedó desinstalado.' -ForegroundColor Green
Start-Sleep -Seconds 3
