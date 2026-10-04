/*
================================================================================
  BookingRD - Script de instalación de base de datos
================================================================================
  Motor:        SQL Server 2019+ / Azure SQL Database
  Base:         BookingRD
  Idempotente:  sí. Cada objeto se crea solo si no existe y los datos de
                demostración se insertan solo si faltan.

  Secciones
    1. Base de datos                  (solo servidor local)
    2. Login y usuario de aplicación  (solo servidor local)
    3. Tablas e índices               (cualquier servidor)
       Tablas: usuarios, empresas, hoteles, actividades, mensajes_contacto.
    4. Cuentas de demostración        (cualquier servidor)

  Modos de ejecución
    a) Azure SQL Database (base compartida del equipo): `npm run configurar`
       o `npm run bd:instalar`. Se ejecuta solo desde el marcador
       @inicio-esquema (secciones 3 y 4).
    b) SQL Server local: abrir en SSMS con un login administrador y ejecutar
       el script completo (F5).

  Estado inicial: sin hoteles ni actividades publicados.
================================================================================
*/

USE master;
GO

-- -----------------------------------------------------------------------------
-- 1. Base de datos
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'BookingRD')
BEGIN
    CREATE DATABASE BookingRD;
END
GO

-- -----------------------------------------------------------------------------
-- 2. Login y usuario de aplicación
-- -----------------------------------------------------------------------------
-- Cuenta de mínimo privilegio para el backend, limitada a la base BookingRD.
-- CREATE LOGIN no admite variables en PASSWORD; la sentencia se construye como
-- SQL dinámico. QUOTENAME escapa las comillas de la contraseña.
DECLARE @PasswordApp NVARCHAR(128) = N'BookingRD#2026!';   -- = DB_PASSWORD en .env

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'bookingrd_app')
BEGIN
    DECLARE @CrearLogin NVARCHAR(400) =
        N'CREATE LOGIN bookingrd_app WITH PASSWORD = ' + QUOTENAME(@PasswordApp, '''') +
        N', CHECK_POLICY = OFF, DEFAULT_DATABASE = BookingRD;';
    EXEC (@CrearLogin);
END
GO

USE BookingRD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'bookingrd_app')
BEGIN
    CREATE USER bookingrd_app FOR LOGIN bookingrd_app;
END
GO

IF IS_ROLEMEMBER(N'db_owner', N'bookingrd_app') = 0
BEGIN
    ALTER ROLE db_owner ADD MEMBER bookingrd_app;
END
GO

-- @inicio-esquema
-- Todo lo que sigue es compatible con Azure SQL Database y se ejecuta sobre la
-- base de datos de la conexión actual.

-- -----------------------------------------------------------------------------
-- 3. Tablas e índices
-- -----------------------------------------------------------------------------

-- usuarios: cuentas del sistema. rol: cliente | empresa | admin.
IF OBJECT_ID(N'dbo.usuarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.usuarios (
        id_usuario      INT IDENTITY(1,1) PRIMARY KEY,
        nombre          NVARCHAR(150)   NOT NULL,
        correo          NVARCHAR(200)   NOT NULL CONSTRAINT UQ_usuarios_correo UNIQUE,
        telefono        NVARCHAR(30)    NULL,
        password_hash   NVARCHAR(200)   NOT NULL,   -- hash bcrypt
        rol             VARCHAR(20)     NOT NULL CONSTRAINT DF_usuarios_rol DEFAULT 'cliente',
        activo          BIT             NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT 1,
        fecha_creacion  DATETIME        NOT NULL CONSTRAINT DF_usuarios_fecha DEFAULT GETDATE(),
        CONSTRAINT CK_usuarios_rol CHECK (rol IN ('cliente', 'empresa', 'admin'))
    );
END
GO

-- Actualización desde la primera versión del esquema (Fase 1 inicial), en la
-- que dbo.empresas no tenía razón social ni datos de servicio. Si se detecta
-- esa estructura, la tabla se elimina para recrearla a continuación; las
-- cuentas de usuario se conservan. Solo afecta a bases de prueba previas.
IF OBJECT_ID(N'dbo.empresas', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'razon_social') IS NULL
BEGIN
    IF OBJECT_ID(N'dbo.FK_hoteles_empresas', N'F') IS NOT NULL
        ALTER TABLE dbo.hoteles DROP CONSTRAINT FK_hoteles_empresas;
    IF OBJECT_ID(N'dbo.FK_actividades_empresas', N'F') IS NOT NULL
        ALTER TABLE dbo.actividades DROP CONSTRAINT FK_actividades_empresas;
    UPDATE dbo.hoteles SET id_empresa = NULL WHERE id_empresa IS NOT NULL;
    UPDATE dbo.actividades SET id_empresa = NULL WHERE id_empresa IS NOT NULL;
    DROP TABLE dbo.empresas;
    PRINT N'dbo.empresas actualizada a la nueva estructura (los datos de empresa anteriores se eliminaron).';
END
GO

-- empresas: datos comerciales de las cuentas con rol 'empresa' (1:1 con usuarios).
--   rnc:                  9 dígitos (persona jurídica) u 11 (cédula), sin guiones.
--   tipo_servicio:        alojamiento | actividades | mixto.
--   tipo_alojamiento,
--   numero_habitaciones:  obligatorios si el servicio incluye alojamiento.
--   categorias_actividad: códigos separados por coma (ver src/utils/catalogos.js);
--                         obligatorio si el servicio incluye actividades.
--   licencia_mitur:       número de licencia del Ministerio de Turismo (opcional).
IF OBJECT_ID(N'dbo.empresas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.empresas (
        id_empresa              INT IDENTITY(1,1) PRIMARY KEY,
        id_usuario              INT             NOT NULL,
        cargo_representante     NVARCHAR(100)   NOT NULL,
        nombre_comercial        NVARCHAR(150)   NOT NULL,
        razon_social            NVARCHAR(150)   NOT NULL,
        rnc                     VARCHAR(11)     NOT NULL CONSTRAINT UQ_empresas_rnc UNIQUE,
        telefono                NVARCHAR(30)    NOT NULL,
        provincia               NVARCHAR(60)    NOT NULL,
        ciudad                  NVARCHAR(100)   NOT NULL,
        direccion               NVARCHAR(250)   NOT NULL,
        sitio_web               NVARCHAR(300)   NULL,
        licencia_mitur          NVARCHAR(30)    NULL,
        tipo_servicio           VARCHAR(20)     NOT NULL,
        tipo_alojamiento        VARCHAR(20)     NULL,
        numero_habitaciones     INT             NULL,
        categorias_actividad    VARCHAR(200)    NULL,
        descripcion             NVARCHAR(MAX)   NULL,
        fecha_registro          DATETIME        NOT NULL CONSTRAINT DF_empresas_fecha DEFAULT GETDATE(),
        CONSTRAINT UQ_empresas_usuario UNIQUE (id_usuario),
        CONSTRAINT FK_empresas_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario),
        CONSTRAINT CK_empresas_rnc CHECK (LEN(rnc) IN (9, 11)),
        CONSTRAINT CK_empresas_tipo CHECK (tipo_servicio IN ('alojamiento', 'actividades', 'mixto')),
        CONSTRAINT CK_empresas_tipo_alojamiento CHECK (
            tipo_alojamiento IS NULL
            OR tipo_alojamiento IN ('hotel', 'resort', 'boutique', 'villa', 'cabana', 'apartamento', 'hostal')),
        CONSTRAINT CK_empresas_datos_alojamiento CHECK (
            tipo_servicio = 'actividades'
            OR (tipo_alojamiento IS NOT NULL AND numero_habitaciones IS NOT NULL AND numero_habitaciones > 0)),
        CONSTRAINT CK_empresas_datos_actividades CHECK (
            tipo_servicio = 'alojamiento'
            OR (categorias_actividad IS NOT NULL AND LEN(categorias_actividad) > 0))
    );
END
GO

-- hoteles: publicaciones de hospedaje.
--   capacidad_personas: máximo de personas por reserva.
--   cupo_maximo:        inventario total de personas.
--   id_empresa:         empresa que publica; NULL si la publicó el sitio.
IF OBJECT_ID(N'dbo.hoteles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hoteles (
        id_hotel            INT IDENTITY(1,1) PRIMARY KEY,
        nombre              NVARCHAR(150)   NOT NULL,
        ciudad              NVARCHAR(100)   NOT NULL,
        descripcion         NVARCHAR(MAX)   NULL,
        precio_noche        DECIMAL(10,2)   NOT NULL,
        capacidad_personas  INT             NOT NULL,
        cupo_maximo         INT             NOT NULL,
        imagen_url          NVARCHAR(500)   NULL,
        id_empresa          INT             NULL CONSTRAINT FK_hoteles_empresas REFERENCES dbo.empresas(id_empresa),
        activo              BIT             NOT NULL CONSTRAINT DF_hoteles_activo DEFAULT 1,
        fecha_creacion      DATETIME        NOT NULL CONSTRAINT DF_hoteles_fecha DEFAULT GETDATE(),
        CONSTRAINT CK_hoteles_precio CHECK (precio_noche > 0),
        CONSTRAINT CK_hoteles_capacidad CHECK (capacidad_personas > 0),
        CONSTRAINT CK_hoteles_cupo CHECK (cupo_maximo > 0)
    );
END
GO

-- actividades: tours y excursiones. Mismo esquema de propiedad que hoteles.
IF OBJECT_ID(N'dbo.actividades', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.actividades (
        id_actividad    INT IDENTITY(1,1) PRIMARY KEY,
        nombre          NVARCHAR(150)   NOT NULL,
        ciudad          NVARCHAR(100)   NOT NULL,
        descripcion     NVARCHAR(MAX)   NULL,
        precio_persona  DECIMAL(10,2)   NOT NULL,
        cupo_maximo     INT             NOT NULL,
        imagen_url      NVARCHAR(500)   NULL,
        id_empresa      INT             NULL CONSTRAINT FK_actividades_empresas REFERENCES dbo.empresas(id_empresa),
        activo          BIT             NOT NULL CONSTRAINT DF_actividades_activo DEFAULT 1,
        fecha_creacion  DATETIME        NOT NULL CONSTRAINT DF_actividades_fecha DEFAULT GETDATE(),
        CONSTRAINT CK_actividades_precio CHECK (precio_persona > 0),
        CONSTRAINT CK_actividades_cupo CHECK (cupo_maximo > 0)
    );
END
GO

-- Restablece las claves foráneas eliminadas por la actualización de dbo.empresas.
IF OBJECT_ID(N'dbo.FK_hoteles_empresas', N'F') IS NULL
    ALTER TABLE dbo.hoteles ADD CONSTRAINT FK_hoteles_empresas FOREIGN KEY (id_empresa) REFERENCES dbo.empresas(id_empresa);
GO
IF OBJECT_ID(N'dbo.FK_actividades_empresas', N'F') IS NULL
    ALTER TABLE dbo.actividades ADD CONSTRAINT FK_actividades_empresas FOREIGN KEY (id_empresa) REFERENCES dbo.empresas(id_empresa);
GO

-- mensajes_contacto: mensajes enviados desde el formulario de contacto.
--   asunto: viajero | empresa | cuenta | otro.
IF OBJECT_ID(N'dbo.mensajes_contacto', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.mensajes_contacto (
        id_mensaje      INT IDENTITY(1,1) PRIMARY KEY,
        nombre          NVARCHAR(150)   NOT NULL,
        correo          NVARCHAR(200)   NOT NULL,
        asunto          VARCHAR(20)     NOT NULL,
        mensaje         NVARCHAR(2000)  NOT NULL,
        atendido        BIT             NOT NULL CONSTRAINT DF_mensajes_atendido DEFAULT 0,
        fecha_envio     DATETIME        NOT NULL CONSTRAINT DF_mensajes_fecha DEFAULT GETDATE(),
        CONSTRAINT CK_mensajes_asunto CHECK (asunto IN ('viajero', 'empresa', 'cuenta', 'otro'))
    );
END
GO

-- Índices de soporte para los listados filtrados por ciudad y por empresa.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_hoteles_ciudad')
    CREATE INDEX IX_hoteles_ciudad ON dbo.hoteles (ciudad);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_actividades_ciudad')
    CREATE INDEX IX_actividades_ciudad ON dbo.actividades (ciudad);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_hoteles_empresa')
    CREATE INDEX IX_hoteles_empresa ON dbo.hoteles (id_empresa);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_actividades_empresa')
    CREATE INDEX IX_actividades_empresa ON dbo.actividades (id_empresa);
GO

-- -----------------------------------------------------------------------------
-- 4. Cuentas de demostración
-- -----------------------------------------------------------------------------
-- Contraseñas almacenadas como hash bcrypt (10 rondas):
--   cliente@bookingrd.com  Cliente123!   rol cliente
--   empresa@bookingrd.com  Empresa123!   rol empresa (servicio mixto)
-- No se insertan hoteles ni actividades: el sitio inicia sin publicaciones.
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'cliente@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'María Rodríguez', N'cliente@bookingrd.com', NULL,
            N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'empresa@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Carlos Peña', N'empresa@bookingrd.com', N'809-555-0101',
            N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '131456789')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono,
         provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio,
         tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Gerente general', N'Bahía Caribe Tours', N'Bahía Caribe Tours SRL', '131456789',
           N'809-538-2020', N'Samaná', N'Santa Bárbara de Samaná', N'Av. Malecón 45', NULL, NULL,
           'mixto', 'hotel', 24, 'tour-playa,acuaticas',
           N'Hotel frente a la bahía y excursiones a cayos y playas de la península.'
    FROM dbo.usuarios u WHERE u.correo = N'empresa@bookingrd.com';
GO

PRINT N'Instalación de BookingRD completada.';
GO
