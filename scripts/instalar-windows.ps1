<#
================================================================================
  BookingRD - Instalador completo para Windows
================================================================================
  Lo abre INSTALAR-BookingRD.bat (doble clic). Pide permiso de administrador
  una sola vez y hace todo con comandos, sin preguntas:

    1. Node.js LTS: lo instala con winget si falta.
    2. SQL Server: usa el que ya esté instalado o instala SQL Server 2022
       Express sin ventanas.
    3. Copia BookingRD a C:\BookingRD (borra una instalación anterior).
    4. Instala las dependencias (npm).
    5. Crea la base BookingRD con sus tablas y datos de ejemplo, habilita
       TCP/IP y el usuario de la aplicación, y escribe el archivo .env
       (scripts/sqlserver-windows.ps1).
    6. Comprueba con Node.js que la aplicación entra a SQL Server.
    7. Crea los accesos "BookingRD" y "Desinstalar BookingRD" en el
       escritorio y en el menú Inicio, y abre la página.

  Todo lo que pasa queda en C:\BookingRD-instalacion.log
================================================================================
#>
param(
    [switch]$Elevado,
    # Instala sin abrir el navegador al final (pruebas).
    [switch]$SinAbrir
)

$ErrorActionPreference = 'Stop'
$Origen = Split-Path -Parent $PSScriptRoot
$Destino = 'C:\BookingRD'
$Bitacora = 'C:\BookingRD-instalacion.log'

function Escribir([string]$Texto, [string]$Color = 'Gray') {
    try { Write-Host $Texto -ForegroundColor $Color } catch { Write-Host $Texto }
}

function Paso([int]$Numero, [string]$Texto) {
    Escribir ''
    Escribir "  [$Numero/8] $Texto" Cyan
}

function Fallar([string]$Texto) {
    Escribir ''
    Escribir "  ERROR: $Texto" Red
    Escribir "  El detalle completo está en $Bitacora" Yellow
    try { Stop-Transcript | Out-Null } catch { }
    Read-Host '  Pulsa Enter para cerrar' | Out-Null
    exit 1
}

# Vuelve a leer PATH del sistema (después de instalar Node.js en esta misma ventana).
function Refrescar-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

# ---------------------------------------------------------------------------
# Permisos de administrador (una sola vez)
# ---------------------------------------------------------------------------
$identidad = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identidad.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevado) {
        Escribir 'No se obtuvieron permisos de administrador.' Red
        Read-Host 'Pulsa Enter para cerrar' | Out-Null
        exit 2
    }
    Escribir 'Windows va a pedir permiso de administrador: pulsa "Sí".' Cyan
    $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Elevado')
    if ($SinAbrir) { $argumentos += '-SinAbrir' }
    try {
        $proceso = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentos -Verb RunAs -Wait -PassThru
        exit $proceso.ExitCode
    } catch {
        Escribir 'Se canceló el permiso de administrador. Vuelve a abrir INSTALAR-BookingRD.bat y pulsa "Sí".' Yellow
        Read-Host 'Pulsa Enter para cerrar' | Out-Null
        exit 2
    }
}

try { Start-Transcript -Path $Bitacora -Force | Out-Null } catch { }
$Host.UI.RawUI.WindowTitle = 'Instalando BookingRD'
Escribir ''
Escribir '  BookingRD - instalación completa' Cyan
Escribir '  ================================' Cyan
Escribir "  Origen: $Origen"
Escribir "  Destino: $Destino"

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
Paso 0 'Borrando versiones anteriores de BookingRD en esta PC'
# Se detiene la aplicación si está abierta.
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
# La carpeta del instalador (y su zip) no se tocan.
$protegidas = @((Resolve-Path $Origen).Path.TrimEnd('\'))
$padreOrigen = Split-Path -Parent $protegidas[0]
if ((Split-Path -Leaf $padreOrigen) -like 'BookingRD-Instalador*') { $protegidas += $padreOrigen.TrimEnd('\') }
function Esta-Protegida([string]$Ruta) {
    foreach ($p in $protegidas) {
        $r = $Ruta.TrimEnd('\')
        # La carpeta protegida, una que la contiene o algo dentro de ella.
        if ($r -ieq $p -or $p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase) -or $r.StartsWith($p + '\', [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return (Split-Path -Leaf $Ruta) -like 'BookingRD-Instalador*'
}
$perfil = $env:USERPROFILE
$lugares = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $perfil 'Desktop'),
    (Join-Path $perfil 'OneDrive\Desktop'),
    (Join-Path $perfil 'OneDrive\Escritorio'),
    (Join-Path $perfil 'Downloads'),
    (Join-Path $perfil 'Documents'),
    (Join-Path $perfil 'OneDrive\Documents'),
    (Join-Path $perfil 'OneDrive\Documentos')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$patrones = @('BookingRD*', 'rd-turismo*', 'rd_turismo*', 'ABRIR BookingRD*', 'INSTALAR BookingRD*', 'INSTALAR-BookingRD*', 'REPARAR BookingRD*', 'Iniciar BookingRD*', 'Instalar BookingRD*')
$borrados = 0
foreach ($lugar in $lugares) {
    $candidatos = Get-ChildItem -LiteralPath $lugar -Force -Depth 1 -ErrorAction SilentlyContinue |
        Where-Object { $nombre = $_.Name; ($patrones | Where-Object { $nombre -like $_ }).Count -gt 0 }
    foreach ($item in $candidatos) {
        if (Esta-Protegida $item.FullName) { continue }
        if (-not (Test-Path -LiteralPath $item.FullName)) { continue }
        try {
            Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
            Escribir "  Borrado: $($item.FullName)" DarkGray
            $borrados++
        } catch {
            Escribir "  No se pudo borrar $($item.FullName): $($_.Exception.Message)" Yellow
        }
    }
}
$carpetaProyecto = Join-Path $perfil 'Downloads\proyecto'
if ((Test-Path $carpetaProyecto) -and -not (Get-ChildItem -LiteralPath $carpetaProyecto -Force)) { Remove-Item -LiteralPath $carpetaProyecto -Force }
# Accesos directos y menú Inicio de instalaciones anteriores.
foreach ($acceso in @((Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'BookingRD'), (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'BookingRD.lnk'))) {
    if (Test-Path -LiteralPath $acceso) { Remove-Item -LiteralPath $acceso -Recurse -Force -ErrorAction SilentlyContinue; $borrados++ }
}
Escribir "  $borrados elementos anteriores borrados. Las bases de datos viejas se borran en el paso 5." Green

Paso 1 'Node.js'
Refrescar-Path
$node = Get-Command node -ErrorAction SilentlyContinue
$versionNode = if ($node) { (& node --version) } else { '' }
if (-not $node -or [int]($versionNode.TrimStart('v').Split('.')[0]) -lt 18) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Fallar 'Falta Node.js y este Windows no tiene winget. Instala Node.js LTS desde https://nodejs.org y vuelve a abrir el instalador.'
    }
    Escribir '  Instalando Node.js LTS con winget (uno o dos minutos)...'
    & winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Host
    Refrescar-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $rutaNode = 'C:\Program Files\nodejs'
        if (Test-Path "$rutaNode\node.exe") { $env:Path = "$rutaNode;$env:Path" }
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fallar 'No se pudo instalar Node.js.' }
    $versionNode = (& node --version)
}
Escribir "  Node.js $versionNode listo." Green

# ---------------------------------------------------------------------------
# 2. SQL Server
# ---------------------------------------------------------------------------
Paso 2 'SQL Server'
function Obtener-Instancias {
    $clave = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (Test-Path $clave) { return @((Get-Item $clave).Property) }
    return @()
}
$instancias = @(Obtener-Instancias)
if ($instancias.Count -eq 0) {
    Escribir '  No hay SQL Server. Instalando SQL Server 2022 Express (gratuito, unos 10 minutos)...'
    $carpeta = Join-Path $env:TEMP 'BookingRD-sqlexpress'
    New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
    $instalador = Join-Path $carpeta 'SQL2022-SSEI-Expr.exe'
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?linkid=2216019' -OutFile $instalador -UseBasicParsing
        $proceso = Start-Process -FilePath $instalador -ArgumentList @('/Action=Install', '/Quiet', '/IAcceptSqlServerLicenseTerms', '/InstallPath="C:\Program Files\Microsoft SQL Server"') -Wait -PassThru
        Escribir "  El instalador de SQL Server terminó (código $($proceso.ExitCode))."
    } catch {
        Escribir "  Descarga directa falló ($($_.Exception.Message)). Probando con winget..." Yellow
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            & winget install -e --id Microsoft.SQLServer.2022.Express --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Host
        }
    }
    $instancias = @(Obtener-Instancias)
    if ($instancias.Count -eq 0) { Fallar 'No se pudo instalar SQL Server Express. Revisa la conexión a internet y vuelve a intentarlo.' }
}
Escribir "  Instancias encontradas: $($instancias -join ', ')" Green

# ---------------------------------------------------------------------------
# 3. Copia de la aplicación
# ---------------------------------------------------------------------------
Paso 3 "Copiando BookingRD a $Destino"
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
$modulosGuardados = $null
if ((Resolve-Path $Origen).Path.TrimEnd('\') -ieq $Destino) { Fallar "Abre el instalador desde la carpeta descomprimida, no desde $Destino." }
if (Test-Path $Destino) {
    if (Test-Path "$Destino\node_modules\mssql") {
        $modulosGuardados = Join-Path $env:TEMP 'BookingRD-node_modules'
        if (Test-Path $modulosGuardados) { Remove-Item $modulosGuardados -Recurse -Force }
        Move-Item "$Destino\node_modules" $modulosGuardados
    }
    Remove-Item $Destino -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
# robocopy: copia todo menos lo que se genera en cada equipo.
& robocopy $Origen $Destino /E /NFL /NDL /NJH /NJS /NP /XD node_modules .git correos-enviados "$Origen\database\local" /XF .env | Out-Null
if ($LASTEXITCODE -ge 8) { Fallar "No se pudo copiar la aplicación (robocopy $LASTEXITCODE)." }
if ($modulosGuardados) { Move-Item $modulosGuardados "$Destino\node_modules" }
# El usuario normal (sin permisos de administrador) debe poder escribir datos y correos.
& icacls $Destino /grant '*S-1-5-32-545:(OI)(CI)M' /T /Q | Out-Null
Escribir '  Copiado.' Green

# ---------------------------------------------------------------------------
# 4. Dependencias
# ---------------------------------------------------------------------------
Paso 4 'Instalando las dependencias (npm)'
Push-Location $Destino
& npm install --omit=dev --no-audit --no-fund --loglevel=error | Out-Host
$codigoNpm = $LASTEXITCODE
Pop-Location
if ($codigoNpm -ne 0) { Fallar 'npm install falló. Revisa la conexión a internet y vuelve a intentarlo.' }
Escribir '  Dependencias listas.' Green

# ---------------------------------------------------------------------------
# 5. Base de datos
# ---------------------------------------------------------------------------
Paso 5 'Creando la base de datos BookingRD en SQL Server'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Destino\scripts\sqlserver-windows.ps1" -Elevado -Reinstalar -SinPausa | Out-Host
if (-not (Test-Path "$Destino\.env") -or -not (Select-String -Path "$Destino\.env" -Pattern '^DB_SERVER=\S+' -Quiet)) {
    Fallar 'No se pudo configurar SQL Server (detalle en C:\BookingRD\database\local\sqlserver-instalacion.log).'
}

# ---------------------------------------------------------------------------
# 6. Prueba de conexión desde la aplicación
# ---------------------------------------------------------------------------
Paso 6 'Comprobando que BookingRD entra a SQL Server'
Push-Location $Destino
$prueba = & node scripts\verificar-instalacion.js 2>&1
$codigoPrueba = $LASTEXITCODE
Pop-Location
$prueba | ForEach-Object { Escribir "  $_" }
if ($codigoPrueba -ne 0) { Fallar 'La aplicación no pudo usar la base de datos.' }

# ---------------------------------------------------------------------------
# 7. Accesos directos
# ---------------------------------------------------------------------------
Paso 7 'Creando los accesos directos'
$shell = New-Object -ComObject WScript.Shell
function Crear-Acceso([string]$Carpeta, [string]$Nombre, [string]$Archivo, [string]$Descripcion) {
    $acceso = $shell.CreateShortcut((Join-Path $Carpeta "$Nombre.lnk"))
    $acceso.TargetPath = Join-Path $Destino $Archivo
    $acceso.WorkingDirectory = $Destino
    $acceso.IconLocation = "$Destino\public\img\bookingrd.ico,0"
    $acceso.Description = $Descripcion
    $acceso.Save()
}
# El escritorio del usuario que abrió el instalador (puede estar en OneDrive).
$escritorioUsuario = [Environment]::GetFolderPath('Desktop')
$menu = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'BookingRD'
New-Item -ItemType Directory -Force -Path $menu | Out-Null
Crear-Acceso $escritorioUsuario 'BookingRD' 'INICIAR-BookingRD.bat' 'Abrir BookingRD'
Crear-Acceso $menu 'BookingRD' 'INICIAR-BookingRD.bat' 'Abrir BookingRD'
Crear-Acceso $menu 'Desinstalar BookingRD' 'DESINSTALAR-BookingRD.bat' 'Quitar BookingRD y su base de datos'
Escribir "  Acceso 'BookingRD' en el escritorio y en el menú Inicio." Green

Escribir ''
Escribir '  BookingRD quedó instalado.' Green
Escribir '  Para abrirlo: doble clic en "BookingRD" en el escritorio.' Green
try { Stop-Transcript | Out-Null } catch { }

if (-not $SinAbrir) {
    # Se abre como el usuario normal a través del Explorador (no como administrador).
    Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$Destino\INICIAR-BookingRD.bat`""
}
Start-Sleep -Seconds 4
exit 0
