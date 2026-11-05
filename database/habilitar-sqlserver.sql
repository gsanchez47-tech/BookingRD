/*
================================================================================
  BookingRD - Habilitar conexiones en un SQL Server local
================================================================================
  SQL Server Express se instala, por defecto, solo con autenticación de
  Windows y con TCP/IP deshabilitado. BookingRD (Node.js) se conecta por TCP
  con un usuario de SQL Server, así que este script:

    1. Activa la autenticación mixta (Windows y SQL Server).
    2. Habilita TCP/IP en el puerto fijo 1433.

  Lo ejecuta automáticamente scripts/sqlserver-windows.ps1. Para hacerlo a
  mano: abrir en SSMS con un usuario administrador, ejecutar (F5) y después
  reiniciar el servicio de SQL Server (Servicios de Windows o, en SSMS, clic
  derecho sobre el servidor > Reiniciar). Los cambios se aplican al reiniciar.

  xp_instance_regwrite traduce la ruta del registro a la de la instancia
  actual (por ejemplo MSSQL16.SQLEXPRESS), por eso funciona igual en una
  instancia con nombre o en la predeterminada.
================================================================================
*/

USE master;
GO

-- 1. Autenticación mixta (LoginMode = 2).
EXEC xp_instance_regwrite
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer',
    N'LoginMode', REG_DWORD, 2;
GO

-- 2. TCP/IP habilitado, puerto fijo 1433 y sin puerto dinámico.
EXEC xp_instance_regwrite
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer\SuperSocketNetLib\Tcp',
    N'Enabled', REG_DWORD, 1;

EXEC xp_instance_regwrite
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer\SuperSocketNetLib\Tcp\IPAll',
    N'TcpPort', REG_SZ, N'1433';

EXEC xp_instance_regwrite
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer\SuperSocketNetLib\Tcp\IPAll',
    N'TcpDynamicPorts', REG_SZ, N'';
GO
