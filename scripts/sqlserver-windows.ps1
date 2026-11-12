<#
.SYNOPSIS
    BookingRD: configura SQL Server en este equipo y crea la base de datos.

.DESCRIPTION
    Lo ejecuta INICIAR-BookingRD.bat la primera vez (o `npm run sqlserver`).

      1. Pide permisos de administrador (para iniciar y reiniciar el servicio).
      2. Busca SQL Server instalado; si no hay, ofrece instalar
         SQL Server 2022 Express con winget.
      3. Se conecta con la cuenta de Windows (autenticación integrada).
      4. Habilita autenticación mixta y TCP/IP en el puerto 1433
         (database/habilitar-sqlserver.sql).
      5. Crea la base BookingRD, sus tablas y los datos de ejemplo
         (database/instalacion-completa.sql) y una contraseña nueva para el
         usuario bookingrd_app.
      6. Reinicia el servicio, prueba la conexión que usará BookingRD y
         escribe .env.

    Códigos de salida: 0 listo, 2 sin permisos, 3 sin SQL Server, 4 error.
    Si termina con un código distinto de 0, BookingRD usa la base local en
    archivo y este script puede repetirse más tarde.
#>

param(
    [switch]$Elevado
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
$ArchivoEnv = Join-Path $Raiz '.env'
$Utf8SinBom = New-Object System.Text.UTF8Encoding $false

function Escribir([string]$Texto, [string]$Color = 'Gray') {
    Write-Host $Texto -ForegroundColor $Color
}

function Terminar([int]$Codigo) {
    # La ventana con permisos de administrador es aparte: se deja abierta para leer el resultado.
    if ($Elevado) {
        Write-Host ''
        if ($Codigo -eq 0) {
            Write-Host 'Esta ventana se cierra sola en 5 segundos.' -ForegroundColor DarkGray
            Start-Sleep -Seconds 5
        } else {
            Read-Host 'Pulsa Enter para continuar' | Out-Null
        }
    }
    exit $Codigo
}

# ---------------------------------------------------------------------------
# 1. Permisos de administrador
# ---------------------------------------------------------------------------
$identidad = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identidad.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevado) {
        Escribir 'No se obtuvieron permisos de administrador.' Yellow
        exit 2
    }
    Escribir 'Windows va a pedir permiso de administrador para configurar SQL Server.' Cyan
    try {
        $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Elevado')
        $proceso = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentos -Verb RunAs -Wait -PassThru
        exit $proceso.ExitCode
    } catch {
        Escribir 'Se canceló el permiso de administrador.' Yellow
        exit 2
    }
}

Escribir ''
Escribir '  BookingRD: configuración de SQL Server' Cyan
Escribir '  ======================================' Cyan
Escribir ''

# ---------------------------------------------------------------------------
# 2. Instancias de SQL Server instaladas
# ---------------------------------------------------------------------------
function Obtener-Instancias {
    $clave = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (Test-Path $clave) {
        return @((Get-Item $clave).Property)
    }
    return @()
}

$instancias = @(Obtener-Instancias)
if ($instancias.Count -eq 0) {
    Escribir 'No se encontró SQL Server en este equipo.' Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        $respuesta = Read-Host 'Instalar SQL Server 2022 Express ahora? Es gratuito y tarda unos 10 minutos (s/n)'
        if ($respuesta -match '^[sS]') {
            Escribir 'Instalando SQL Server 2022 Express. Si aparece el instalador, elige "Básica" (Basic).' Cyan
            winget install -e --id Microsoft.SQLServer.2022.Express --accept-package-agreements --accept-source-agreements
            $instancias = @(Obtener-Instancias)
        }
    } else {
        Escribir 'Descarga SQL Server Express desde https://www.microsoft.com/sql-server/sql-server-downloads' Yellow
    }
    if ($instancias.Count -eq 0) {
        Escribir 'Sin SQL Server, BookingRD usará la base local en archivo (también guarda los datos).' Yellow
        Escribir 'Cuando instales SQL Server, ejecuta: npm run sqlserver' Yellow
        Terminar 3
    }
}

# La instancia predeterminada (si existe) suele escuchar ya en el puerto 1433.
if ($instancias -contains 'MSSQLSERVER') { $instancia = 'MSSQLSERVER' }
elseif ($instancias -contains 'SQLEXPRESS') { $instancia = 'SQLEXPRESS' }
else { $instancia = $instancias[0] }

if ($instancia -eq 'MSSQLSERVER') {
    $servicio = 'MSSQLSERVER'
    $destino = '.'
} else {
    $servicio = "MSSQL`$$instancia"
    $destino = ".\$instancia"
}
Escribir "Instancia: $instancia (servicio $servicio)"

try {
    Set-Service -Name $servicio -StartupType Automatic
    if ((Get-Service -Name $servicio).Status -ne 'Running') {
        Escribir 'Iniciando el servicio de SQL Server...'
        Start-Service -Name $servicio
    }
} catch {
    Escribir "No se pudo iniciar el servicio $servicio : $($_.Exception.Message)" Red
    Terminar 4
}

# ---------------------------------------------------------------------------
# 3-5. Conexión con la cuenta de Windows, configuración y base de datos
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Data

function Abrir-Conexion([string]$Cadena) {
    $conexion = New-Object System.Data.SqlClient.SqlConnection $Cadena
    $conexion.Open()
    return $conexion
}

function Ejecutar([System.Data.SqlClient.SqlConnection]$Conexion, [string]$Texto) {
    $comando = $Conexion.CreateCommand()
    $comando.CommandText = $Texto
    $comando.CommandTimeout = 600
    return $comando.ExecuteScalar()
}

# Ejecuta un archivo .sql por lotes (separados por líneas GO), como SSMS.
function Ejecutar-Archivo([System.Data.SqlClient.SqlConnection]$Conexion, [string]$Ruta) {
    $texto = [System.IO.File]::ReadAllText($Ruta, [System.Text.Encoding]::UTF8)
    $lotes = [regex]::Split($texto, '^\s*GO\s*$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $numero = 0
    foreach ($lote in $lotes) {
        if ($lote.Trim().Length -eq 0) { continue }
        $numero++
        try {
            [void](Ejecutar $Conexion $lote)
        } catch {
            $inicio = ($lote.Trim() -split "`n")[0]
            throw "Lote $numero de $(Split-Path -Leaf $Ruta) ($inicio): $($_.Exception.Message)"
        }
    }
    return $numero
}

try {
    $admin = Abrir-Conexion "Server=$destino;Database=master;Integrated Security=True;Connect Timeout=60"
} catch {
    Escribir "No se pudo entrar a SQL Server con tu cuenta de Windows: $($_.Exception.Message)" Red
    Escribir 'Tu usuario de Windows debe ser administrador de SQL Server (lo es quien lo instaló).' Yellow
    Terminar 4
}

try {
    $existe = Ejecutar $admin "SELECT COUNT(*) FROM sys.databases WHERE name = N'BookingRD'"
    if ($existe -gt 0) {
        $respuesta = Read-Host 'Ya existe una base BookingRD. Borrarla y crearla de nuevo con los datos de ejemplo? (s = de nuevo, n = conservar los datos)'
        if ($respuesta -match '^[sS]') {
            Escribir 'Eliminando la base anterior...'
            [void](Ejecutar $admin "ALTER DATABASE BookingRD SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE BookingRD;")
        }
    }

    Escribir 'Habilitando TCP/IP (puerto 1433) y la autenticación de SQL Server...'
    [void](Ejecutar-Archivo $admin (Join-Path $Raiz 'database\habilitar-sqlserver.sql'))

    Escribir 'Creando la base BookingRD, sus tablas y los datos de ejemplo...'
    $lotes = Ejecutar-Archivo $admin (Join-Path $Raiz 'database\instalacion-completa.sql')
    Escribir "  $lotes lotes ejecutados." DarkGray

    # Contraseña nueva y aleatoria para el usuario de la aplicación.
    $caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $aleatorio = New-Object System.Random
    $clave = 'Brd' + (-join (1..20 | ForEach-Object { $caracteres[$aleatorio.Next($caracteres.Length)] })) + '#7'
    [void](Ejecutar $admin "ALTER LOGIN bookingrd_app WITH PASSWORD = N'$clave', CHECK_POLICY = OFF; ALTER LOGIN bookingrd_app ENABLE;")

    $conteos = Ejecutar $admin "SELECT CONCAT((SELECT COUNT(*) FROM BookingRD.dbo.usuarios), ' usuarios, ', (SELECT COUNT(*) FROM BookingRD.dbo.reservas), ' reservas, ', (SELECT COUNT(*) FROM BookingRD.dbo.pagos), ' pagos')"
    Escribir "  Base creada: $conteos." Green
    $admin.Close()
} catch {
    Escribir "Error al crear la base de datos: $($_.Exception.Message)" Red
    Terminar 4
}

# ---------------------------------------------------------------------------
# 6. Reinicio del servicio, prueba de conexión y .env
# ---------------------------------------------------------------------------
Escribir 'Reiniciando SQL Server para aplicar la configuración...'
try {
    Restart-Service -Name $servicio -Force
} catch {
    Escribir "No se pudo reiniciar el servicio: $($_.Exception.Message)" Red
    Terminar 4
}

$conectado = $false
for ($intento = 1; $intento -le 10 -and -not $conectado; $intento++) {
    try {
        $prueba = Abrir-Conexion "Server=127.0.0.1,1433;Database=BookingRD;User ID=bookingrd_app;Password=$clave;Connect Timeout=10"
        $prueba.Close()
        $conectado = $true
    } catch {
        $ultimoError = $_.Exception.Message
        Start-Sleep -Seconds 3
    }
}
if (-not $conectado) {
    Escribir "SQL Server no acepta conexiones en el puerto 1433: $ultimoError" Red
    Escribir 'Puede que otra instancia de SQL Server ya use ese puerto. BookingRD usará la base local.' Yellow
    Terminar 4
}

$jwt = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Minimum 0 -Maximum 256) })
$contenido = @"
# Generado por el instalador de BookingRD: SQL Server local ($instancia).
# Para volver a configurarlo: npm run sqlserver
DB_SERVER=localhost
DB_PORT=1433
DB_INSTANCE=
DB_DATABASE=BookingRD
DB_USER=bookingrd_app
DB_PASSWORD=$clave
DB_TRUST_CERT=true
JWT_SECRET=$jwt
PORT=3000
"@
[System.IO.File]::WriteAllText($ArchivoEnv, $contenido, $Utf8SinBom)

Escribir ''
Escribir 'SQL Server quedó listo. BookingRD guardará todo en la base BookingRD.' Green
Escribir 'Para verla en SSMS: servidor localhost (o .\' + $instancia + '), autenticación de Windows.' DarkGray
Terminar 0
