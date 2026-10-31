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
       usuarios, empresas, imagenes, hoteles, actividades, vehiculos,
       reservas, mensajes_contacto, resenas, favoritos
    4. Datos de demostración          (cualquier servidor)

  Modos de ejecución
    a) Azure SQL Database (base compartida del equipo): `npm run configurar`
       o `npm run bd:instalar`. Se ejecuta solo desde el marcador
       @inicio-esquema (secciones 3 y 4).
    b) SQL Server local: abrir en SSMS con un login administrador y ejecutar
       el script completo (F5).

  Bases creadas con versiones anteriores de este script: las tablas cuya
  estructura cambió (empresas, hoteles, actividades) se recrean
  automáticamente; las cuentas de usuario se conservan.
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

-- 3.0 Actualización desde versiones anteriores del esquema.
--     Se eliminan, en orden de dependencias, las tablas cuya estructura cambió.
--     Las versiones anteriores no contenían publicaciones ni reservas reales.
IF OBJECT_ID(N'dbo.hoteles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hoteles', N'tipo_alojamiento') IS NULL
    OR OBJECT_ID(N'dbo.actividades', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.actividades', N'categoria') IS NULL
    OR OBJECT_ID(N'dbo.empresas', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'razon_social') IS NULL
BEGIN
    IF OBJECT_ID(N'dbo.resenas', N'U') IS NOT NULL DROP TABLE dbo.resenas;
    IF OBJECT_ID(N'dbo.favoritos', N'U') IS NOT NULL DROP TABLE dbo.favoritos;
    IF OBJECT_ID(N'dbo.reservas', N'U') IS NOT NULL DROP TABLE dbo.reservas;
    IF OBJECT_ID(N'dbo.vehiculos', N'U') IS NOT NULL DROP TABLE dbo.vehiculos;
    IF OBJECT_ID(N'dbo.hoteles', N'U') IS NOT NULL DROP TABLE dbo.hoteles;
    IF OBJECT_ID(N'dbo.actividades', N'U') IS NOT NULL DROP TABLE dbo.actividades;
    IF OBJECT_ID(N'dbo.imagenes', N'U') IS NOT NULL DROP TABLE dbo.imagenes;
    IF OBJECT_ID(N'dbo.empresas', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'razon_social') IS NULL
        DROP TABLE dbo.empresas;
    PRINT N'Tablas de una versión anterior actualizadas a la estructura vigente.';
END
GO

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
        fecha_creacion  DATETIME2(0)    NOT NULL CONSTRAINT DF_usuarios_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_usuarios_rol CHECK (rol IN ('cliente', 'empresa', 'admin'))
    );
END
GO

-- empresas: datos comerciales de las cuentas con rol 'empresa' (1:1 con usuarios).
--   rnc:                  9 dígitos (persona jurídica) u 11 (cédula), sin guiones.
--   tipo_servicio:        alojamiento | actividades | mixto | vehiculos (alquiler de autos).
--   tipo_alojamiento,
--   numero_habitaciones:  obligatorios si el servicio incluye alojamiento.
--   categorias_actividad: códigos separados por coma (src/utils/catalogos.js);
--                         obligatorio si el servicio incluye actividades.
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
        fecha_registro          DATETIME2(0)    NOT NULL CONSTRAINT DF_empresas_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_empresas_usuario UNIQUE (id_usuario),
        CONSTRAINT FK_empresas_usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.usuarios(id_usuario),
        CONSTRAINT CK_empresas_rnc CHECK (LEN(rnc) IN (9, 11)),
        CONSTRAINT CK_empresas_tipo CHECK (tipo_servicio IN ('alojamiento', 'actividades', 'mixto', 'vehiculos')),
        CONSTRAINT CK_empresas_tipo_alojamiento CHECK (
            tipo_alojamiento IS NULL
            OR tipo_alojamiento IN ('hotel', 'resort', 'boutique', 'villa', 'cabana', 'apartamento', 'hostal')),
        CONSTRAINT CK_empresas_datos_alojamiento CHECK (
            tipo_servicio IN ('actividades', 'vehiculos')
            OR (tipo_alojamiento IS NOT NULL AND numero_habitaciones IS NOT NULL AND numero_habitaciones > 0)),
        CONSTRAINT CK_empresas_datos_actividades CHECK (
            tipo_servicio IN ('alojamiento', 'vehiculos')
            OR (categorias_actividad IS NOT NULL AND LEN(categorias_actividad) > 0))
    );
END
GO

-- imagenes: fotografías subidas por las empresas desde su panel.
--   Se almacenan en la base para que estén disponibles en todos los equipos
--   que comparten la base de Azure. Se sirven por GET /api/imagenes/:id.
IF OBJECT_ID(N'dbo.imagenes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.imagenes (
        id_imagen       INT IDENTITY(1,1) PRIMARY KEY,
        id_empresa      INT             NOT NULL CONSTRAINT FK_imagenes_empresas REFERENCES dbo.empresas(id_empresa),
        tipo_mime       VARCHAR(20)     NOT NULL,
        contenido       VARBINARY(MAX)  NOT NULL,
        tamano_bytes    INT             NOT NULL,
        fecha_subida    DATETIME2(0)    NOT NULL CONSTRAINT DF_imagenes_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_imagenes_mime CHECK (tipo_mime IN ('image/jpeg', 'image/png', 'image/webp')),
        CONSTRAINT CK_imagenes_tamano CHECK (tamano_bytes > 0 AND tamano_bytes <= 3145728)
    );
END
GO

-- Destinos habilitados (mismo listado que DESTINOS en src/utils/catalogos.js).
-- Se repite en los CHECK de hoteles y actividades.

-- hoteles: publicaciones de alojamiento.
--   capacidad_personas: máximo de huéspedes por habitación o unidad.
--   habitaciones:       unidades disponibles por noche (inventario).
--   servicios:          códigos separados por coma (SERVICIOS_HOTEL).
--   imagen_url:         fotografía estática del sitio (datos de demostración);
--   id_imagen:          fotografía subida por la empresa (tiene prioridad).
IF OBJECT_ID(N'dbo.hoteles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hoteles (
        id_hotel            INT IDENTITY(1,1) PRIMARY KEY,
        id_empresa          INT             NOT NULL CONSTRAINT FK_hoteles_empresas REFERENCES dbo.empresas(id_empresa),
        nombre              NVARCHAR(150)   NOT NULL,
        tipo_alojamiento    VARCHAR(20)     NOT NULL,
        ciudad              NVARCHAR(60)    NOT NULL,
        direccion           NVARCHAR(250)   NOT NULL,
        descripcion         NVARCHAR(2000)  NOT NULL,
        servicios           VARCHAR(300)    NULL,
        precio_noche        DECIMAL(10,2)   NOT NULL,
        capacidad_personas  INT             NOT NULL,
        habitaciones        INT             NOT NULL,
        id_imagen           INT             NULL CONSTRAINT FK_hoteles_imagenes REFERENCES dbo.imagenes(id_imagen),
        imagen_url          NVARCHAR(300)   NULL,
        destacado           BIT             NOT NULL CONSTRAINT DF_hoteles_destacado DEFAULT 0,
        activo              BIT             NOT NULL CONSTRAINT DF_hoteles_activo DEFAULT 1,
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_hoteles_creacion DEFAULT SYSUTCDATETIME(),
        fecha_actualizacion DATETIME2(0)    NULL,
        CONSTRAINT CK_hoteles_tipo CHECK (tipo_alojamiento IN ('hotel', 'resort', 'boutique', 'villa', 'cabana', 'apartamento', 'hostal')),
        CONSTRAINT CK_hoteles_ciudad CHECK (ciudad IN (N'Santo Domingo', N'Punta Cana', N'Puerto Plata', N'Las Terrenas', N'Samaná', N'Las Galeras', N'La Romana', N'Sosúa', N'Cabarete', N'Jarabacoa', N'Constanza', N'Juan Dolio', N'Boca Chica', N'Río San Juan', N'Pedernales')),
        CONSTRAINT CK_hoteles_precio CHECK (precio_noche > 0),
        CONSTRAINT CK_hoteles_capacidad CHECK (capacidad_personas BETWEEN 1 AND 30),
        CONSTRAINT CK_hoteles_habitaciones CHECK (habitaciones BETWEEN 1 AND 5000)
    );
END
GO

-- actividades: tours y excursiones.
--   categoria:      código de CATEGORIAS_ACTIVIDAD.
--   cupo_diario:    personas que pueden reservar para una misma fecha.
--   duracion_horas: duración aproximada.
IF OBJECT_ID(N'dbo.actividades', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.actividades (
        id_actividad        INT IDENTITY(1,1) PRIMARY KEY,
        id_empresa          INT             NOT NULL CONSTRAINT FK_actividades_empresas REFERENCES dbo.empresas(id_empresa),
        nombre              NVARCHAR(150)   NOT NULL,
        categoria           VARCHAR(30)     NOT NULL,
        ciudad              NVARCHAR(60)    NOT NULL,
        punto_encuentro     NVARCHAR(250)   NOT NULL,
        descripcion         NVARCHAR(2000)  NOT NULL,
        incluye             NVARCHAR(500)   NULL,
        duracion_horas      DECIMAL(5,1)    NOT NULL,
        precio_persona      DECIMAL(10,2)   NOT NULL,
        cupo_diario         INT             NOT NULL,
        id_imagen           INT             NULL CONSTRAINT FK_actividades_imagenes REFERENCES dbo.imagenes(id_imagen),
        imagen_url          NVARCHAR(300)   NULL,
        destacado           BIT             NOT NULL CONSTRAINT DF_actividades_destacado DEFAULT 0,
        activo              BIT             NOT NULL CONSTRAINT DF_actividades_activo DEFAULT 1,
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_actividades_creacion DEFAULT SYSUTCDATETIME(),
        fecha_actualizacion DATETIME2(0)    NULL,
        CONSTRAINT CK_actividades_categoria CHECK (categoria IN ('tour-playa', 'tour-montana', 'tour-gastronomico', 'cultural', 'zip-line', 'motocross', 'acuaticas', 'golf')),
        CONSTRAINT CK_actividades_ciudad CHECK (ciudad IN (N'Santo Domingo', N'Punta Cana', N'Puerto Plata', N'Las Terrenas', N'Samaná', N'Las Galeras', N'La Romana', N'Sosúa', N'Cabarete', N'Jarabacoa', N'Constanza', N'Juan Dolio', N'Boca Chica', N'Río San Juan', N'Pedernales')),
        CONSTRAINT CK_actividades_precio CHECK (precio_persona > 0),
        CONSTRAINT CK_actividades_cupo CHECK (cupo_diario BETWEEN 1 AND 1000),
        CONSTRAINT CK_actividades_duracion CHECK (duracion_horas > 0 AND duracion_horas <= 240)
    );
END
GO

-- vehiculos: autos de alquiler (empresas con tipo_servicio 'vehiculos').
--   nombre:               nombre comercial del modelo ("Toyota Corolla o similar").
--   categoria:            código de CATEGORIAS_VEHICULO.
--   ciudad:               destino de la sucursal de recogida; lugar_recogida: dirección
--                         o mostrador (aeropuerto, oficina).
--   km_por_dia:           límite diario de kilometraje; NULL = kilometraje ilimitado.
--   precio_dia:           tarifa por día de 24 horas.
--   deposito:             depósito de garantía retenido en la tarjeta al recoger (no se cobra).
--   edad_minima:          edad mínima del conductor; cargo_conductor_joven (por día) se
--                         aplica a conductores de esa edad hasta los 24 años.
--   cargo_otra_ciudad:    cargo único por devolver en otra ciudad; NULL = solo en la misma.
--   unidades:             autos de ese modelo disponibles por día (flota).
IF OBJECT_ID(N'dbo.vehiculos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.vehiculos (
        id_vehiculo             INT IDENTITY(1,1) PRIMARY KEY,
        id_empresa              INT             NOT NULL CONSTRAINT FK_vehiculos_empresas REFERENCES dbo.empresas(id_empresa),
        nombre                  NVARCHAR(150)   NOT NULL,
        marca                   NVARCHAR(60)    NOT NULL,
        modelo                  NVARCHAR(60)    NOT NULL,
        anio                    SMALLINT        NOT NULL,
        categoria               VARCHAR(20)     NOT NULL,
        transmision             VARCHAR(12)     NOT NULL,
        combustible             VARCHAR(12)     NOT NULL,
        pasajeros               TINYINT         NOT NULL,
        puertas                 TINYINT         NOT NULL,
        maletas                 TINYINT         NOT NULL,
        aire                    BIT             NOT NULL CONSTRAINT DF_vehiculos_aire DEFAULT 1,
        km_por_dia              INT             NULL,
        ciudad                  NVARCHAR(60)    NOT NULL,
        lugar_recogida          NVARCHAR(250)   NOT NULL,
        descripcion             NVARCHAR(2000)  NOT NULL,
        incluye                 NVARCHAR(500)   NULL,
        precio_dia              DECIMAL(10,2)   NOT NULL,
        deposito                DECIMAL(10,2)   NOT NULL,
        edad_minima             TINYINT         NOT NULL CONSTRAINT DF_vehiculos_edad DEFAULT 21,
        cargo_conductor_joven   DECIMAL(10,2)   NULL,
        cargo_otra_ciudad       DECIMAL(10,2)   NULL,
        unidades                INT             NOT NULL,
        id_imagen               INT             NULL CONSTRAINT FK_vehiculos_imagenes REFERENCES dbo.imagenes(id_imagen),
        imagen_url              NVARCHAR(300)   NULL,
        destacado               BIT             NOT NULL CONSTRAINT DF_vehiculos_destacado DEFAULT 0,
        activo                  BIT             NOT NULL CONSTRAINT DF_vehiculos_activo DEFAULT 1,
        fecha_creacion          DATETIME2(0)    NOT NULL CONSTRAINT DF_vehiculos_creacion DEFAULT SYSUTCDATETIME(),
        fecha_actualizacion     DATETIME2(0)    NULL,
        CONSTRAINT CK_vehiculos_categoria CHECK (categoria IN ('economico', 'compacto', 'sedan', 'suv', 'minivan', 'lujo', 'convertible', 'pickup')),
        CONSTRAINT CK_vehiculos_transmision CHECK (transmision IN ('automatica', 'manual')),
        CONSTRAINT CK_vehiculos_combustible CHECK (combustible IN ('gasolina', 'diesel', 'hibrido', 'electrico')),
        CONSTRAINT CK_vehiculos_ciudad CHECK (ciudad IN (N'Santo Domingo', N'Punta Cana', N'Puerto Plata', N'Las Terrenas', N'Samaná', N'Las Galeras', N'La Romana', N'Sosúa', N'Cabarete', N'Jarabacoa', N'Constanza', N'Juan Dolio', N'Boca Chica', N'Río San Juan', N'Pedernales')),
        CONSTRAINT CK_vehiculos_anio CHECK (anio BETWEEN 2000 AND 2100),
        CONSTRAINT CK_vehiculos_pasajeros CHECK (pasajeros BETWEEN 1 AND 15),
        CONSTRAINT CK_vehiculos_puertas CHECK (puertas BETWEEN 2 AND 5),
        CONSTRAINT CK_vehiculos_maletas CHECK (maletas BETWEEN 0 AND 10),
        CONSTRAINT CK_vehiculos_km CHECK (km_por_dia IS NULL OR km_por_dia > 0),
        CONSTRAINT CK_vehiculos_precio CHECK (precio_dia > 0 AND deposito >= 0),
        CONSTRAINT CK_vehiculos_edad CHECK (edad_minima BETWEEN 18 AND 30),
        CONSTRAINT CK_vehiculos_cargos CHECK ((cargo_conductor_joven IS NULL OR cargo_conductor_joven >= 0) AND (cargo_otra_ciudad IS NULL OR cargo_otra_ciudad >= 0)),
        CONSTRAINT CK_vehiculos_unidades CHECK (unidades BETWEEN 1 AND 1000)
    );
END
GO

-- reservas: reservas de viajeros. Cada fila corresponde a un hotel, a una
-- actividad o a un vehículo (exactamente uno de los tres).
--   Hotel:     fecha_inicio = entrada, fecha_fin = salida, habitaciones >= 1.
--   Actividad: fecha_inicio = día de la actividad, fecha_fin y habitaciones NULL.
--   Vehículo:  fecha_inicio / hora_inicio = recogida, fecha_fin / hora_fin = devolución;
--              ciudad_devolucion, edad_conductor, extras (códigos separados por coma)
--              y deposito (retenido al recoger, no forma parte del total).
--   codigo:    identificador entregado al viajero (BRD + 7 caracteres).
IF OBJECT_ID(N'dbo.reservas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.reservas (
        id_reserva          INT IDENTITY(1,1) PRIMARY KEY,
        codigo              CHAR(10)        NOT NULL CONSTRAINT UQ_reservas_codigo UNIQUE,
        id_usuario          INT             NOT NULL CONSTRAINT FK_reservas_usuarios REFERENCES dbo.usuarios(id_usuario),
        id_hotel            INT             NULL CONSTRAINT FK_reservas_hoteles REFERENCES dbo.hoteles(id_hotel),
        id_actividad        INT             NULL CONSTRAINT FK_reservas_actividades REFERENCES dbo.actividades(id_actividad),
        id_vehiculo         INT             NULL CONSTRAINT FK_reservas_vehiculos REFERENCES dbo.vehiculos(id_vehiculo),
        fecha_inicio        DATE            NOT NULL,
        fecha_fin           DATE            NULL,
        hora_inicio         TIME(0)         NULL,
        hora_fin            TIME(0)         NULL,
        ciudad_devolucion   NVARCHAR(60)    NULL,
        edad_conductor      TINYINT         NULL,
        extras              VARCHAR(200)    NULL,
        deposito            DECIMAL(10,2)   NULL,
        personas            INT             NOT NULL,
        habitaciones        INT             NULL,
        precio_unitario     DECIMAL(10,2)   NOT NULL,
        total               DECIMAL(12,2)   NOT NULL,
        estado              VARCHAR(15)     NOT NULL CONSTRAINT DF_reservas_estado DEFAULT 'confirmada',
        comentario          NVARCHAR(500)   NULL,
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_reservas_creacion DEFAULT SYSUTCDATETIME(),
        fecha_cancelacion   DATETIME2(0)    NULL,
        CONSTRAINT CK_reservas_publicacion CHECK (
            (CASE WHEN id_hotel IS NULL THEN 0 ELSE 1 END
             + CASE WHEN id_actividad IS NULL THEN 0 ELSE 1 END
             + CASE WHEN id_vehiculo IS NULL THEN 0 ELSE 1 END) = 1),
        CONSTRAINT CK_reservas_fechas_vehiculo CHECK (
            id_vehiculo IS NULL OR (fecha_fin IS NOT NULL AND fecha_fin >= fecha_inicio
                                    AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND edad_conductor IS NOT NULL)),
        CONSTRAINT CK_reservas_fechas_hotel CHECK (
            id_hotel IS NULL OR (fecha_fin IS NOT NULL AND fecha_fin > fecha_inicio AND habitaciones IS NOT NULL AND habitaciones > 0)),
        CONSTRAINT CK_reservas_personas CHECK (personas > 0),
        CONSTRAINT CK_reservas_total CHECK (total > 0),
        CONSTRAINT CK_reservas_estado CHECK (estado IN ('confirmada', 'cancelada'))
    );
END
GO

-- mensajes_contacto: mensajes enviados desde el formulario de contacto.
IF OBJECT_ID(N'dbo.mensajes_contacto', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.mensajes_contacto (
        id_mensaje      INT IDENTITY(1,1) PRIMARY KEY,
        nombre          NVARCHAR(150)   NOT NULL,
        correo          NVARCHAR(200)   NOT NULL,
        asunto          VARCHAR(20)     NOT NULL,
        mensaje         NVARCHAR(2000)  NOT NULL,
        atendido        BIT             NOT NULL CONSTRAINT DF_mensajes_atendido DEFAULT 0,
        fecha_envio     DATETIME2(0)    NOT NULL CONSTRAINT DF_mensajes_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_mensajes_asunto CHECK (asunto IN ('viajero', 'empresa', 'cuenta', 'otro'))
    );
END
GO

-- resenas: opinión del viajero sobre una reserva ya disfrutada (una por reserva).
--   La publicación y el autor se obtienen de la reserva (id_hotel o
--   id_actividad, id_usuario), por lo que no se duplican aquí.
--   puntuacion: escala de 1 a 10.
--   respuesta:  respuesta pública de la empresa (opcional).
--   visible:    la administración puede ocultar una reseña que incumpla las normas.
IF OBJECT_ID(N'dbo.resenas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.resenas (
        id_resena           INT IDENTITY(1,1) PRIMARY KEY,
        id_reserva          INT             NOT NULL CONSTRAINT UQ_resenas_reserva UNIQUE
                                            CONSTRAINT FK_resenas_reservas REFERENCES dbo.reservas(id_reserva),
        puntuacion          TINYINT         NOT NULL,
        titulo              NVARCHAR(120)   NOT NULL,
        comentario          NVARCHAR(1500)  NOT NULL,
        respuesta           NVARCHAR(1000)  NULL,
        fecha_respuesta     DATETIME2(0)    NULL,
        visible             BIT             NOT NULL CONSTRAINT DF_resenas_visible DEFAULT 1,
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_resenas_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_resenas_puntuacion CHECK (puntuacion BETWEEN 1 AND 10)
    );
END
GO

-- favoritos: publicaciones guardadas por un viajero (un hotel, una actividad o un vehículo).
IF OBJECT_ID(N'dbo.favoritos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.favoritos (
        id_favorito         INT IDENTITY(1,1) PRIMARY KEY,
        id_usuario          INT             NOT NULL CONSTRAINT FK_favoritos_usuarios REFERENCES dbo.usuarios(id_usuario),
        id_hotel            INT             NULL CONSTRAINT FK_favoritos_hoteles REFERENCES dbo.hoteles(id_hotel),
        id_actividad        INT             NULL CONSTRAINT FK_favoritos_actividades REFERENCES dbo.actividades(id_actividad),
        id_vehiculo         INT             NULL CONSTRAINT FK_favoritos_vehiculos REFERENCES dbo.vehiculos(id_vehiculo),
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_favoritos_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_favoritos_publicacion CHECK (
            (CASE WHEN id_hotel IS NULL THEN 0 ELSE 1 END
             + CASE WHEN id_actividad IS NULL THEN 0 ELSE 1 END
             + CASE WHEN id_vehiculo IS NULL THEN 0 ELSE 1 END) = 1)
    );
END
GO

-- 3.9 Actualización de bases instaladas con versiones anteriores (alquiler de
--     autos y categoría Golf). Cada paso se ejecuta solo si hace falta y no
--     modifica los datos existentes.
IF COL_LENGTH(N'dbo.reservas', N'id_vehiculo') IS NULL
    ALTER TABLE dbo.reservas ADD
        id_vehiculo         INT             NULL,
        hora_inicio         TIME(0)         NULL,
        hora_fin            TIME(0)         NULL,
        ciudad_devolucion   NVARCHAR(60)    NULL,
        edad_conductor      TINYINT         NULL,
        extras              VARCHAR(200)    NULL,
        deposito            DECIMAL(10,2)   NULL;
GO
IF OBJECT_ID(N'dbo.FK_reservas_vehiculos', N'F') IS NULL
    ALTER TABLE dbo.reservas ADD CONSTRAINT FK_reservas_vehiculos FOREIGN KEY (id_vehiculo) REFERENCES dbo.vehiculos(id_vehiculo);
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_reservas_publicacion' AND definition NOT LIKE N'%id_vehiculo%')
    ALTER TABLE dbo.reservas DROP CONSTRAINT CK_reservas_publicacion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_reservas_publicacion')
    ALTER TABLE dbo.reservas ADD CONSTRAINT CK_reservas_publicacion CHECK (
        (CASE WHEN id_hotel IS NULL THEN 0 ELSE 1 END
         + CASE WHEN id_actividad IS NULL THEN 0 ELSE 1 END
         + CASE WHEN id_vehiculo IS NULL THEN 0 ELSE 1 END) = 1);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_reservas_fechas_vehiculo')
    ALTER TABLE dbo.reservas ADD CONSTRAINT CK_reservas_fechas_vehiculo CHECK (
        id_vehiculo IS NULL OR (fecha_fin IS NOT NULL AND fecha_fin >= fecha_inicio
                                AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND edad_conductor IS NOT NULL));
GO
IF COL_LENGTH(N'dbo.favoritos', N'id_vehiculo') IS NULL
    ALTER TABLE dbo.favoritos ADD id_vehiculo INT NULL CONSTRAINT FK_favoritos_vehiculos REFERENCES dbo.vehiculos(id_vehiculo);
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_favoritos_publicacion' AND definition NOT LIKE N'%id_vehiculo%')
    ALTER TABLE dbo.favoritos DROP CONSTRAINT CK_favoritos_publicacion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_favoritos_publicacion')
    ALTER TABLE dbo.favoritos ADD CONSTRAINT CK_favoritos_publicacion CHECK (
        (CASE WHEN id_hotel IS NULL THEN 0 ELSE 1 END
         + CASE WHEN id_actividad IS NULL THEN 0 ELSE 1 END
         + CASE WHEN id_vehiculo IS NULL THEN 0 ELSE 1 END) = 1);
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_empresas_tipo' AND definition NOT LIKE N'%vehiculos%')
BEGIN
    ALTER TABLE dbo.empresas DROP CONSTRAINT CK_empresas_tipo;
    ALTER TABLE dbo.empresas ADD CONSTRAINT CK_empresas_tipo CHECK (tipo_servicio IN ('alojamiento', 'actividades', 'mixto', 'vehiculos'));
END
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_empresas_datos_alojamiento' AND definition NOT LIKE N'%vehiculos%')
BEGIN
    ALTER TABLE dbo.empresas DROP CONSTRAINT CK_empresas_datos_alojamiento;
    ALTER TABLE dbo.empresas ADD CONSTRAINT CK_empresas_datos_alojamiento CHECK (
        tipo_servicio IN ('actividades', 'vehiculos')
        OR (tipo_alojamiento IS NOT NULL AND numero_habitaciones IS NOT NULL AND numero_habitaciones > 0));
END
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_empresas_datos_actividades' AND definition NOT LIKE N'%vehiculos%')
BEGIN
    ALTER TABLE dbo.empresas DROP CONSTRAINT CK_empresas_datos_actividades;
    ALTER TABLE dbo.empresas ADD CONSTRAINT CK_empresas_datos_actividades CHECK (
        tipo_servicio IN ('alojamiento', 'vehiculos')
        OR (categorias_actividad IS NOT NULL AND LEN(categorias_actividad) > 0));
END
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_actividades_categoria' AND definition NOT LIKE N'%golf%')
BEGIN
    ALTER TABLE dbo.actividades DROP CONSTRAINT CK_actividades_categoria;
    ALTER TABLE dbo.actividades ADD CONSTRAINT CK_actividades_categoria CHECK (
        categoria IN ('tour-playa', 'tour-montana', 'tour-gastronomico', 'cultural', 'zip-line', 'motocross', 'acuaticas', 'golf'));
END
GO

-- Índices de soporte para los listados, el panel de empresa y la
-- disponibilidad de reservas.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_hoteles_ciudad')
    CREATE INDEX IX_hoteles_ciudad ON dbo.hoteles (ciudad) INCLUDE (activo, precio_noche);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_hoteles_empresa')
    CREATE INDEX IX_hoteles_empresa ON dbo.hoteles (id_empresa);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_actividades_categoria')
    CREATE INDEX IX_actividades_categoria ON dbo.actividades (categoria, ciudad) INCLUDE (activo, precio_persona);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_actividades_empresa')
    CREATE INDEX IX_actividades_empresa ON dbo.actividades (id_empresa);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_reservas_hotel_fechas')
    CREATE INDEX IX_reservas_hotel_fechas ON dbo.reservas (id_hotel, fecha_inicio, fecha_fin) INCLUDE (habitaciones, estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_reservas_actividad_fecha')
    CREATE INDEX IX_reservas_actividad_fecha ON dbo.reservas (id_actividad, fecha_inicio) INCLUDE (personas, estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_reservas_usuario')
    CREATE INDEX IX_reservas_usuario ON dbo.reservas (id_usuario, fecha_inicio);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_favoritos_hotel')
    CREATE UNIQUE INDEX UX_favoritos_hotel ON dbo.favoritos (id_usuario, id_hotel) WHERE id_hotel IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_favoritos_actividad')
    CREATE UNIQUE INDEX UX_favoritos_actividad ON dbo.favoritos (id_usuario, id_actividad) WHERE id_actividad IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_vehiculos_empresa')
    CREATE INDEX IX_vehiculos_empresa ON dbo.vehiculos (id_empresa);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_vehiculos_ciudad')
    CREATE INDEX IX_vehiculos_ciudad ON dbo.vehiculos (ciudad, categoria) INCLUDE (activo, precio_dia);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_reservas_vehiculo_fechas')
    CREATE INDEX IX_reservas_vehiculo_fechas ON dbo.reservas (id_vehiculo, fecha_inicio, fecha_fin) INCLUDE (estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_favoritos_vehiculo')
    CREATE UNIQUE INDEX UX_favoritos_vehiculo ON dbo.favoritos (id_usuario, id_vehiculo) WHERE id_vehiculo IS NOT NULL;
GO

-- -----------------------------------------------------------------------------
-- 4. Datos de demostración
-- -----------------------------------------------------------------------------
-- Contraseñas almacenadas como hash bcrypt (10 rondas):
--   admin@bookingrd.com      Admin123!     administración de la plataforma
--   cliente@bookingrd.com    Cliente123!   viajero (también los demás viajeros de ejemplo)
--   empresa@bookingrd.com    Empresa123!   Bahía Caribe Tours (mixto)
--   hoteles@bookingrd.com    Empresa123!   Coralia Hotels & Resorts (alojamiento)
--   aventura@bookingrd.com   Empresa123!   Aventura Quisqueya (actividades)
--   montana@bookingrd.com    Empresa123!   Montaña Verde Ecotours (actividades)
--   cultura@bookingrd.com    Empresa123!   Raíces Dominicanas Tours (actividades)
--   autos@bookingrd.com      Empresa123!   Caribe Rent a Car (alquiler de vehículos)
--   rentacar@bookingrd.com   Empresa123!   Ozama Rent a Car (alquiler de vehículos)
-- Cada inserción se omite si el registro ya existe.

-- 4.1 Administración y viajeros
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'admin@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Equipo BookingRD', N'admin@bookingrd.com', NULL, N'$2b$10$cjMFwZZ93VU.uubX76EFruIXUaj1Xjn.4sk3k3Gffx9LC2.S/X2ji', 'admin');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'cliente@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'María Rodríguez', N'cliente@bookingrd.com', N'809-555-0190', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'luis.fernandez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Luis Fernández', N'luis.fernandez@correo.com', N'829-555-0111', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'carmen.jimenez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Carmen Jiménez', N'carmen.jimenez@correo.com', N'849-555-0122', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'daniel.ortiz@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Daniel Ortiz', N'daniel.ortiz@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'ana.castillo@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Ana Belén Castillo', N'ana.castillo@correo.com', N'809-555-0131', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'roberto.sanchez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Roberto Sánchez', N'roberto.sanchez@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'patricia.nunez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Patricia Núñez', N'patricia.nunez@correo.com', N'829-555-0144', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'miguel.herrera@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Miguel Ángel Herrera', N'miguel.herrera@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'yesenia.paulino@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Yesenia Paulino', N'yesenia.paulino@correo.com', N'849-555-0156', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'andres.cabrera@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Andrés Cabrera', N'andres.cabrera@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'laura.vasquez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Laura Vásquez', N'laura.vasquez@correo.com', N'809-555-0167', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'hector.marte@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Héctor Marte', N'hector.marte@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', 'cliente');
GO

-- 4.2 Empresas y sus representantes
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'empresa@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Carlos Peña', N'empresa@bookingrd.com', N'809-555-0101', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '131456789')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Gerente general', N'Bahía Caribe Tours', N'Bahía Caribe Tours SRL', '131456789', N'809-538-2020',
           N'Samaná', N'Samaná', N'Av. Malecón 45, Santa Bárbara de Samaná', NULL, N'MITUR-SAM-0142',
           'mixto', N'resort', 96, N'tour-playa,tour-montana,cultural', N'Operador de la península de Samaná con alojamiento frente a la bahía y excursiones a cayos, cascadas y parques nacionales.'
    FROM dbo.usuarios u WHERE u.correo = N'empresa@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'hoteles@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Laura Méndez', N'hoteles@bookingrd.com', N'809-555-0120', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '132508741')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Directora comercial', N'Coralia Hotels & Resorts', N'Coralia Hoteles del Caribe SRL', '132508741', N'809-552-4000',
           N'La Altagracia', N'Punta Cana', N'Blvd. Turístico del Este km 28, Bávaro', N'https://coralia.example.com', N'MITUR-ALT-0877',
           'alojamiento', N'resort', 1450, NULL, N'Cadena dominicana de resorts y hoteles de playa y ciudad en las principales zonas turísticas del país.'
    FROM dbo.usuarios u WHERE u.correo = N'hoteles@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'aventura@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'José Almonte', N'aventura@bookingrd.com', N'809-555-0133', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '131998452')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Socio gerente', N'Aventura Quisqueya', N'Aventura Quisqueya Excursiones SRL', '131998452', N'809-466-7788',
           N'La Altagracia', N'Punta Cana', N'Plaza Bávaro, local 12, Bávaro', NULL, N'MITUR-ALT-1203',
           'actividades', NULL, NULL, N'tour-playa,zip-line,motocross,acuaticas', N'Excursiones de aventura en el este y el norte del país: buggies, canopy, catamaranes y snorkel.'
    FROM dbo.usuarios u WHERE u.correo = N'aventura@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'montana@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Ana Lucía Taveras', N'montana@bookingrd.com', N'809-555-0145', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '130774519')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Administradora', N'Montaña Verde Ecotours', N'Montaña Verde Ecoturismo EIRL', '130774519', N'809-574-2121',
           N'La Vega', N'Jarabacoa', N'Calle Independencia 18, Jarabacoa', NULL, N'MITUR-LVG-0391',
           'actividades', NULL, NULL, N'tour-montana,tour-gastronomico,zip-line,motocross', N'Guías certificados de montaña para senderismo, cabalgatas y rutas de café en la Cordillera Central.'
    FROM dbo.usuarios u WHERE u.correo = N'montana@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'cultura@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Pedro Guzmán', N'cultura@bookingrd.com', N'809-555-0158', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '132115630')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Director', N'Raíces Dominicanas Tours', N'Raíces Dominicanas Turismo Cultural SRL', '132115630', N'809-686-3030',
           N'Distrito Nacional', N'Santo Domingo', N'Calle El Conde 205, Zona Colonial', NULL, N'MITUR-DN-0566',
           'actividades', NULL, NULL, N'cultural,tour-gastronomico,tour-playa,acuaticas', N'Turismo cultural, histórico y gastronómico con guías locales en todo el país.'
    FROM dbo.usuarios u WHERE u.correo = N'cultura@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'autos@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Ramón Batista', N'autos@bookingrd.com', N'809-555-0170', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '132667418')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Gerente de operaciones', N'Caribe Rent a Car', N'Caribe Rent a Car SRL', '132667418', N'809-959-2277',
           N'La Altagracia', N'Punta Cana', N'Aeropuerto Internacional de Punta Cana, terminal B', NULL, NULL,
           'vehiculos', NULL, NULL, NULL, N'Alquiler de autos con mostradores en Punta Cana y Las Terrenas: SUV, pickups 4x4 y convertibles con asistencia en carretera 24 horas.'
    FROM dbo.usuarios u WHERE u.correo = N'autos@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'rentacar@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
    VALUES (N'Gabriela Rosario', N'rentacar@bookingrd.com', N'809-555-0181', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', 'empresa');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = '131778902')
    INSERT INTO dbo.empresas
        (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad,
         direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones,
         categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Directora', N'Ozama Rent a Car', N'Ozama Autos y Transporte SRL', '131778902', N'809-549-0303',
           N'Santo Domingo', N'Boca Chica', N'Aeropuerto Internacional Las Américas, nivel de llegadas', N'https://ozama-rent.example.com', NULL,
           'vehiculos', NULL, NULL, NULL, N'Flota de autos económicos y ejecutivos en los aeropuertos de Santo Domingo y Puerto Plata, con devolución en otras ciudades.'
    FROM dbo.usuarios u WHERE u.correo = N'rentacar@bookingrd.com';
GO

-- 4.3 Actualización de los datos de demostración de versiones anteriores
--     Publicaciones retiradas: se eliminan si no tienen reservas; si las
--     tienen, se ocultan. Las renombradas conservan su id y sus reservas.
--     Las fotografías de demostración se actualizan solo si la empresa no
--     subió una propia.
UPDATE dbo.actividades SET nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón'
WHERE nombre = N'Zona Colonial a pie: Catedral Primada y Alcázar de Colón'
  AND NOT EXISTS (SELECT 1 FROM dbo.actividades x WHERE x.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón');
GO
UPDATE p SET activo = 0
FROM dbo.hoteles p
WHERE p.nombre IN (N'Villa Brisas de Las Terrenas')
  AND EXISTS (SELECT 1 FROM dbo.reservas r WHERE r.id_hotel = p.id_hotel);
DELETE p
FROM dbo.hoteles p
WHERE p.nombre IN (N'Villa Brisas de Las Terrenas')
  AND NOT EXISTS (SELECT 1 FROM dbo.reservas r WHERE r.id_hotel = p.id_hotel);
GO
UPDATE p SET activo = 0
FROM dbo.actividades p
WHERE p.nombre IN (N'Dunas de Baní y playa Las Salinas', N'Tirolesa sobre el bosque de Samaná', N'Tour de buggies por Bávaro y playa Macao', N'Avistamiento de ballenas jorobadas', N'Clase de kitesurf en Cabarete', N'Altos de Chavón y su anfiteatro')
  AND EXISTS (SELECT 1 FROM dbo.reservas r WHERE r.id_actividad = p.id_actividad);
DELETE p
FROM dbo.actividades p
WHERE p.nombre IN (N'Dunas de Baní y playa Las Salinas', N'Tirolesa sobre el bosque de Samaná', N'Tour de buggies por Bávaro y playa Macao', N'Avistamiento de ballenas jorobadas', N'Clase de kitesurf en Cabarete', N'Altos de Chavón y su anfiteatro')
  AND NOT EXISTS (SELECT 1 FROM dbo.reservas r WHERE r.id_actividad = p.id_actividad);
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/coralia-grand.jpg', ciudad = N'Punta Cana',
       direccion = N'Playa Bávaro, Punta Cana', descripcion = N'Resort todo incluido frente a la playa de Bávaro, con piscinas rodeadas de palmeras, cabañas privadas, spa y siete restaurantes.'
WHERE nombre = N'Coralia Grand Resort & Spa' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/cayo-azul.jpg', ciudad = N'Punta Cana',
       direccion = N'Playa Arena Gorda, Bávaro', descripcion = N'Palapas privadas sobre la arena blanca de Arena Gorda, piscinas conectadas con la playa y entretenimiento diurno y nocturno.'
WHERE nombre = N'Cayo Azul All-Inclusive Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/azura-caribbean.jpg', ciudad = N'Santo Domingo',
       direccion = N'Av. Anacaona, Los Cacicazgos', descripcion = N'Hotel de ciudad frente al Parque Mirador Sur, con vista al mar Caribe, canchas de tenis y piscina tipo laguna.'
WHERE nombre = N'Azura Caribbean Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/mirador-del-mar.jpg', ciudad = N'Cabarete',
       direccion = N'Carretera Sosúa-Cabarete, Cabarete', descripcion = N'Suites de piedra y madera con terraza privada, piscina individual y vista al Atlántico. Solo para adultos.'
WHERE nombre = N'Mirador del Mar Luxury Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/solaria-island.jpg', ciudad = N'La Romana',
       direccion = N'Playa Dominicus, Bayahibe', descripcion = N'Resort frente a la playa Dominicus, punto de salida de las excursiones a Isla Saona y a Isla Catalina.'
WHERE nombre = N'Solaria Island Beach Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/bahia-serena.jpg', ciudad = N'Boca Chica',
       direccion = N'Calle Duarte, Boca Chica', descripcion = N'Habitaciones con ventanales y vista a la ciudad costera, frente a la laguna de aguas tranquilas de Boca Chica y a 15 minutos del aeropuerto de Las Américas.'
WHERE nombre = N'Bahía Serena Golf & Beach Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/costa-dorada.jpg', ciudad = N'Sosúa',
       direccion = N'Playa Alicia, Sosúa', descripcion = N'Habitaciones amplias de diseño contemporáneo sobre la bahía de Sosúa, conocida por sus arrecifes de coral y su malecón peatonal.'
WHERE nombre = N'Costa Dorada Palace Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/palma-real-haven.jpg', ciudad = N'Juan Dolio',
       direccion = N'Autopista Las Américas km 55, Juan Dolio', descripcion = N'Villas privadas entre cocoteros con piscina, ranchos de techo de cana y área de barbacoa, a cinco minutos de la playa.'
WHERE nombre = N'Palma Real Haven Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/samana-bay-palms.jpg', ciudad = N'Samaná',
       direccion = N'Carretera Las Galeras km 4, Samaná', descripcion = N'Habitaciones con vista a una playa de arena blanca en la bahía de Samaná, punto de salida de los paseos a Cayo Levantado y de avistamiento de ballenas.'
WHERE nombre = N'Samaná Bay Palms Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/paraiso-escondido.jpg', ciudad = N'Las Galeras',
       direccion = N'Camino a Playa Rincón, Las Galeras', descripcion = N'Villas ecológicas sobre la colina con piscina infinita, jardines tropicales y vista al mar abierto.'
WHERE nombre = N'Paraíso Escondido Eco-Resort' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/villa-casa-de-campo.jpg', ciudad = N'La Romana',
       direccion = N'Casa de Campo, La Romana', descripcion = N'Villa de cinco habitaciones sobre el acantilado, con piscina, terraza frente al mar Caribe, playa privada con sombrillas y servicio de mayordomo.'
WHERE nombre = N'Villa Acantilado Casa de Campo' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/torre-malecon.jpg', ciudad = N'Santo Domingo',
       direccion = N'Av. Winston Churchill, Piantini, Santo Domingo', descripcion = N'Apartamentos de una y dos habitaciones en el polígono central, con cocina equipada, vista a la ciudad y a pocos minutos del Malecón y la Zona Colonial.'
WHERE nombre = N'Torre Malecón Suites' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/hotel-el-conde.jpg', ciudad = N'Santo Domingo',
       direccion = N'Calle El Conde 410, Zona Colonial, Santo Domingo', descripcion = N'Hotel boutique en una casona restaurada de la calle peatonal El Conde, con recepción 24 horas, desayuno criollo y la Catedral Primada a dos cuadras.'
WHERE nombre = N'Hotel Boutique El Conde' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.hoteles SET imagen_url = N'img/publicaciones/atlantico-business.jpg', ciudad = N'Puerto Plata',
       direccion = N'Av. Luis Ginebra, Puerto Plata', descripcion = N'Hotel de ciudad frente al Malecón de Puerto Plata, con salas de reuniones, gimnasio y check-in rápido para viajes de trabajo.'
WHERE nombre = N'Atlántico Business Hotel' AND id_imagen IS NULL AND imagen_url LIKE N'img/publicaciones/%';
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/isla-saona.jpg', ciudad = N'La Romana',
       punto_encuentro = N'Muelle de Bayahibe', descripcion = N'Navegación en catamarán hasta Isla Saona, almuerzo en la playa y regreso en lancha rápida con parada en la piscina natural.', incluye = N'Transporte, catamarán, almuerzo buffet, bebidas y parada en la piscina natural'
WHERE nombre = N'Excursión en catamarán a Isla Saona' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/playa-rincon.jpg', ciudad = N'Las Terrenas',
       punto_encuentro = N'Calle Duarte, Las Terrenas', descripcion = N'Salida desde Las Terrenas, recorrido en lancha por los acantilados de Cabo Cabrón y día libre en Playa Rincón, una de las playas vírgenes más extensas del país.', incluye = N'Transporte, lancha, guía, almuerzo de pescado frito y bebidas'
WHERE nombre = N'Excursión a Playa Rincón y Cabo Cabrón' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/bahia-aguilas.jpg', ciudad = N'Pedernales',
       punto_encuentro = N'Muelle de La Cueva, Cabo Rojo', descripcion = N'Travesía en bote por los acantilados y la costa árida del Parque Nacional Jaragua hasta los ocho kilómetros de arena blanca de Bahía de las Águilas.', incluye = N'Bote, guía naturalista, almuerzo y equipo de snorkel'
WHERE nombre = N'Bahía de las Águilas en bote' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/salto-el-limon.jpg', ciudad = N'Samaná',
       punto_encuentro = N'Comunidad de El Limón', descripcion = N'Sendero entre la selva húmeda de la península hasta la cascada de 40 metros del Salto El Limón, con baño en la poza.', incluye = N'Guía local, caballo opcional, almuerzo criollo'
WHERE nombre = N'Senderismo al Salto El Limón' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/pico-duarte.jpg', ciudad = N'Jarabacoa',
       punto_encuentro = N'La Ciénaga de Manabao', descripcion = N'Expedición de tres días al punto más alto del Caribe (3,098 m) por bosques de pino, con amanecer sobre el mar de nubes junto al busto de Duarte.', incluye = N'Guías certificados, mulas de carga, comidas, permisos y equipo de campamento'
WHERE nombre = N'Ascenso al Pico Duarte' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/valle-rincon.jpg', ciudad = N'Jarabacoa',
       punto_encuentro = N'Parque central de Jarabacoa', descripcion = N'Ruta por el Valle del Rincón con visita a los saltos de Jimenoa y Baiguate y miradores sobre el río Yaque del Norte.', incluye = N'Transporte, guía, entrada a los saltos y almuerzo'
WHERE nombre = N'Valle del Rincón y cascadas de Jarabacoa' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/cabalgata-cafetales.jpg', ciudad = N'Jarabacoa',
       punto_encuentro = N'Rancho Montaña Verde, Jarabacoa', descripcion = N'Recorrido a caballo por fincas de café, con explicación del proceso del grano y degustación en una casa de campo.', incluye = N'Caballo, guía, cata de café de altura y almuerzo campestre'
WHERE nombre = N'Cabalgata a los cafetales de la Cordillera' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/ruta-cacao.jpg', ciudad = N'Río San Juan',
       punto_encuentro = N'Parque central de Río San Juan', descripcion = N'Visita a una comunidad productora de cacao orgánico: del árbol a la tableta de chocolate hecha por los visitantes.', incluye = N'Transporte, visita a la finca, taller de chocolate y almuerzo'
WHERE nombre = N'Ruta del cacao orgánico' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/desayuno-criollo.jpg', ciudad = N'Santo Domingo',
       punto_encuentro = N'Mercado Modelo, Av. Mella', descripcion = N'Mañana de sabores: desayuno de mangú con salami, queso frito y huevos, y recorrido por los puestos de frutas, especias y dulces del Mercado Modelo.', incluye = N'Guía gastronómico, desayuno de mangú con los tres golpes, jugos naturales y degustaciones'
WHERE nombre = N'Desayuno criollo y Mercado Modelo' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/sancocho.jpg', ciudad = N'Boca Chica',
       punto_encuentro = N'Casa de cocina La Caldera, Boca Chica', descripcion = N'Aprende a preparar el sancocho de siete carnes con víveres de la tierra y compártelo en la mesa con el chef y el grupo.', incluye = N'Ingredientes, chef instructor, recetario y almuerzo'
WHERE nombre = N'Clase de cocina: sancocho dominicano' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/almuerzo-bandera.jpg', ciudad = N'Juan Dolio',
       punto_encuentro = N'Comedor Doña Rosa, Juan Dolio', descripcion = N'Arroz blanco, habichuelas guisadas, pollo criollo, ensalada y tostones en un comedor familiar, con la historia de cada plato.', incluye = N'Almuerzo completo, bebida natural y postre de la casa'
WHERE nombre = N'Almuerzo típico: la bandera dominicana' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/zona-colonial.jpg', ciudad = N'Santo Domingo',
       punto_encuentro = N'Parque Colón, Zona Colonial', descripcion = N'Recorrido por la primera ciudad del Nuevo Mundo: Catedral Primada, Parque Colón, Alcázar de Colón, Calle Las Damas y Panteón Nacional.', incluye = N'Guía historiador y entradas al Alcázar de Colón y al Museo de las Casas Reales'
WHERE nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/los-haitises.jpg', ciudad = N'Samaná',
       punto_encuentro = N'Muelle de Samaná', descripcion = N'Navegación entre cayos y manglares hasta las cuevas de la Arena y de la Línea, con pictografías taínas.', incluye = N'Lancha, guía, entrada al parque y almuerzo'
WHERE nombre = N'Parque Nacional Los Haitises y cuevas taínas' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/basilica-higuey.jpg', ciudad = N'Punta Cana',
       punto_encuentro = N'Recogida en el hotel (zona Bávaro)', descripcion = N'Visita a la Basílica de Nuestra Señora de la Altagracia y al pueblo de estilo mediterráneo de Altos de Chavón, con su anfiteatro sobre el río.', incluye = N'Transporte, guía, entradas y almuerzo'
WHERE nombre = N'Basílica de Higüey y Altos de Chavón' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/puerto-plata-victoriana.jpg', ciudad = N'Puerto Plata',
       punto_encuentro = N'Parque Independencia, Puerto Plata', descripcion = N'Casas victorianas, la Calle de la Sombrilla, la Fortaleza San Felipe y el Museo del Ámbar en el centro histórico de Puerto Plata.', incluye = N'Guía local, entrada a la Fortaleza San Felipe y degustación de chocolate'
WHERE nombre = N'Puerto Plata victoriana y Calle de la Sombrilla' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/monumento-santiago.jpg', ciudad = N'Puerto Plata',
       punto_encuentro = N'Parque central de Puerto Plata', descripcion = N'Excursión a la ciudad corazón del Cibao: Monumento a los Héroes de la Restauración, Centro León y una fábrica de cigarros artesanales.', incluye = N'Transporte, guía, entrada al Monumento y al Centro León, almuerzo'
WHERE nombre = N'Santiago de los Caballeros y su Monumento' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/canopy-anamuya.jpg', ciudad = N'Punta Cana',
       punto_encuentro = N'Recogida en el hotel (zona Bávaro)', descripcion = N'Doce líneas de tirolesa sobre las montañas de Anamuya, con plataformas en los árboles y una línea de 700 metros.', incluye = N'Transporte, equipo certificado, 12 líneas de tirolesa y refrigerio'
WHERE nombre = N'Canopy en la selva de Anamuya' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/parapente-constanza.jpg', ciudad = N'Constanza',
       punto_encuentro = N'Mirador de Constanza', descripcion = N'Vuelo biplaza con piloto certificado sobre el valle agrícola más alto del Caribe, sin experiencia previa.', incluye = N'Piloto certificado, equipo completo, fotos y video del vuelo'
WHERE nombre = N'Vuelo en parapente sobre el valle de Constanza' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/cuatrimoto-constanza.jpg', ciudad = N'Constanza',
       punto_encuentro = N'Parque central de Constanza', descripcion = N'Recorrido en cuatrimoto por las carreteras y caminos de montaña de Constanza, entre fincas y lomas, hasta las pirámides de Valle Nuevo.', incluye = N'Cuatrimoto, casco, guía, merienda y almuerzo campestre'
WHERE nombre = N'Ruta en cuatrimoto por Valle Nuevo' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/snorkel-catalina.jpg', ciudad = N'La Romana',
       punto_encuentro = N'Marina de Casa de Campo', descripcion = N'Snorkel en las paredes de coral de Isla Catalina, con peces tropicales, esponjas y aguas de visibilidad excepcional.', incluye = N'Barco, equipo de snorkel, guía de buceo y almuerzo'
WHERE nombre = N'Snorkel en los arrecifes de Isla Catalina' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/27-charcos.jpg', ciudad = N'Puerto Plata',
       punto_encuentro = N'Centro de visitantes de Damajagua, Imbert', descripcion = N'Descenso por saltos y toboganes naturales de piedra caliza en el río Damajagua, acompañado por guías.', incluye = N'Transporte, casco, chaleco, guías y almuerzo'
WHERE nombre = N'27 Charcos de Damajagua' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/marina-casa-de-campo.jpg', ciudad = N'La Romana',
       punto_encuentro = N'Marina Casa de Campo, muelle principal', descripcion = N'Salida desde la marina hacia la desembocadura del río Chavón y la costa de La Romana, con parada para nadar y snorkel.', incluye = N'Yate con capitán, bebidas, snorkel en la desembocadura del río Chavón'
WHERE nombre = N'Paseo en yate por la Marina de Casa de Campo' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/parque-acuatico.jpg', ciudad = N'Punta Cana',
       punto_encuentro = N'Recepción del parque, Bávaro', descripcion = N'Toboganes de espiral, piscinas y zona infantil para pasar el día en familia, con almuerzo incluido.', incluye = N'Entrada, toboganes, piscinas, almuerzo y casillero'
WHERE nombre = N'Día de parque acuático en Punta Cana' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO
UPDATE dbo.actividades SET imagen_url = N'img/publicaciones/golf-casa-de-campo.jpg', ciudad = N'La Romana',
       punto_encuentro = N'Casa Club de Casa de Campo, La Romana', descripcion = N'Ronda de 18 hoyos en el campo diseñado por Pete Dye, con siete hoyos junto al mar Caribe. Alquiler de palos disponible.', incluye = N'Green fee de 18 hoyos, carrito compartido, cubeta de práctica y caddie'
WHERE nombre = N'Golf en Teeth of the Dog, Casa de Campo' AND id_imagen IS NULL AND (imagen_url IS NULL OR imagen_url LIKE N'img/publicaciones/%');
GO

-- 4.4 Hoteles
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Coralia Grand Resort & Spa')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Coralia Grand Resort & Spa', 'resort', N'Punta Cana', N'Playa Bávaro, Punta Cana', N'Resort todo incluido frente a la playa de Bávaro, con piscinas rodeadas de palmeras, cabañas privadas, spa y siete restaurantes.',
           'todo-incluido,piscina,playa,spa,gimnasio,restaurante,wifi,aire,traslado', 14500, 4, 320, N'img/publicaciones/coralia-grand.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Cayo Azul All-Inclusive Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Cayo Azul All-Inclusive Resort', 'resort', N'Punta Cana', N'Playa Arena Gorda, Bávaro', N'Palapas privadas sobre la arena blanca de Arena Gorda, piscinas conectadas con la playa y entretenimiento diurno y nocturno.',
           'todo-incluido,piscina,playa,restaurante,wifi,aire,gimnasio', 12800, 4, 280, N'img/publicaciones/cayo-azul.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Azura Caribbean Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Azura Caribbean Resort', 'hotel', N'Santo Domingo', N'Av. Anacaona, Los Cacicazgos', N'Hotel de ciudad frente al Parque Mirador Sur, con vista al mar Caribe, canchas de tenis y piscina tipo laguna.',
           'piscina,restaurante,gimnasio,wifi,aire,estacionamiento,traslado', 6900, 3, 180, N'img/publicaciones/azura-caribbean.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Mirador del Mar Luxury Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Mirador del Mar Luxury Resort', 'boutique', N'Cabarete', N'Carretera Sosúa-Cabarete, Cabarete', N'Suites de piedra y madera con terraza privada, piscina individual y vista al Atlántico. Solo para adultos.',
           'piscina,spa,restaurante,wifi,aire,desayuno', 9800, 2, 36, N'img/publicaciones/mirador-del-mar.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Solaria Island Beach Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Solaria Island Beach Resort', 'resort', N'La Romana', N'Playa Dominicus, Bayahibe', N'Resort frente a la playa Dominicus, punto de salida de las excursiones a Isla Saona y a Isla Catalina.',
           'todo-incluido,piscina,playa,restaurante,wifi,aire', 11200, 4, 240, N'img/publicaciones/solaria-island.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Bahía Serena Golf & Beach Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Bahía Serena Golf & Beach Resort', 'resort', N'Boca Chica', N'Calle Duarte, Boca Chica', N'Habitaciones con ventanales y vista a la ciudad costera, frente a la laguna de aguas tranquilas de Boca Chica y a 15 minutos del aeropuerto de Las Américas.',
           'todo-incluido,piscina,playa,gimnasio,wifi,aire,estacionamiento', 8700, 4, 150, N'img/publicaciones/bahia-serena.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Costa Dorada Palace Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Costa Dorada Palace Resort', 'resort', N'Sosúa', N'Playa Alicia, Sosúa', N'Habitaciones amplias de diseño contemporáneo sobre la bahía de Sosúa, conocida por sus arrecifes de coral y su malecón peatonal.',
           'todo-incluido,piscina,playa,spa,restaurante,wifi,aire', 9400, 4, 210, N'img/publicaciones/costa-dorada.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Palma Real Haven Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Palma Real Haven Resort', 'villa', N'Juan Dolio', N'Autopista Las Américas km 55, Juan Dolio', N'Villas privadas entre cocoteros con piscina, ranchos de techo de cana y área de barbacoa, a cinco minutos de la playa.',
           'piscina,wifi,aire,estacionamiento,mascotas,restaurante', 16500, 8, 12, N'img/publicaciones/palma-real-haven.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Samaná Bay Palms Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Samaná Bay Palms Resort', 'resort', N'Samaná', N'Carretera Las Galeras km 4, Samaná', N'Habitaciones con vista a una playa de arena blanca en la bahía de Samaná, punto de salida de los paseos a Cayo Levantado y de avistamiento de ballenas.',
           'piscina,playa,restaurante,wifi,aire,desayuno', 7800, 4, 96, N'img/publicaciones/samana-bay-palms.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Paraíso Escondido Eco-Resort')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Paraíso Escondido Eco-Resort', 'villa', N'Las Galeras', N'Camino a Playa Rincón, Las Galeras', N'Villas ecológicas sobre la colina con piscina infinita, jardines tropicales y vista al mar abierto.',
           'piscina,desayuno,wifi,spa', 13200, 4, 10, N'img/publicaciones/paraiso-escondido.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Villa Acantilado Casa de Campo')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Villa Acantilado Casa de Campo', 'villa', N'La Romana', N'Casa de Campo, La Romana', N'Villa de cinco habitaciones sobre el acantilado, con piscina, terraza frente al mar Caribe, playa privada con sombrillas y servicio de mayordomo.',
           'piscina,playa,wifi,aire,estacionamiento,traslado,desayuno', 38500, 10, 2, N'img/publicaciones/villa-casa-de-campo.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Torre Malecón Suites')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Torre Malecón Suites', 'apartamento', N'Santo Domingo', N'Av. Winston Churchill, Piantini, Santo Domingo', N'Apartamentos de una y dos habitaciones en el polígono central, con cocina equipada, vista a la ciudad y a pocos minutos del Malecón y la Zona Colonial.',
           'wifi,aire,gimnasio,piscina,estacionamiento', 6200, 4, 24, N'img/publicaciones/torre-malecon.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Hotel Boutique El Conde')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Hotel Boutique El Conde', 'boutique', N'Santo Domingo', N'Calle El Conde 410, Zona Colonial, Santo Domingo', N'Hotel boutique en una casona restaurada de la calle peatonal El Conde, con recepción 24 horas, desayuno criollo y la Catedral Primada a dos cuadras.',
           'wifi,aire,desayuno,restaurante,traslado', 7400, 3, 28, N'img/publicaciones/hotel-el-conde.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Atlántico Business Hotel')
    INSERT INTO dbo.hoteles
        (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche,
         capacidad_personas, habitaciones, imagen_url, destacado)
    SELECT e.id_empresa, N'Atlántico Business Hotel', 'hotel', N'Puerto Plata', N'Av. Luis Ginebra, Puerto Plata', N'Hotel de ciudad frente al Malecón de Puerto Plata, con salas de reuniones, gimnasio y check-in rápido para viajes de trabajo.',
           'wifi,aire,gimnasio,piscina,estacionamiento,restaurante', 5600, 2, 60, N'img/publicaciones/atlantico-business.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132508741';
GO

-- 4.5 Actividades
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Excursión en catamarán a Isla Saona')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Excursión en catamarán a Isla Saona', 'tour-playa', N'La Romana', N'Muelle de Bayahibe', N'Navegación en catamarán hasta Isla Saona, almuerzo en la playa y regreso en lancha rápida con parada en la piscina natural.',
           N'Transporte, catamarán, almuerzo buffet, bebidas y parada en la piscina natural', 9, 5900, 60, N'img/publicaciones/isla-saona.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Excursión a Playa Rincón y Cabo Cabrón')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Excursión a Playa Rincón y Cabo Cabrón', 'tour-playa', N'Las Terrenas', N'Calle Duarte, Las Terrenas', N'Salida desde Las Terrenas, recorrido en lancha por los acantilados de Cabo Cabrón y día libre en Playa Rincón, una de las playas vírgenes más extensas del país.',
           N'Transporte, lancha, guía, almuerzo de pescado frito y bebidas', 7, 3200, 20, N'img/publicaciones/playa-rincon.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Bahía de las Águilas en bote')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Bahía de las Águilas en bote', 'tour-playa', N'Pedernales', N'Muelle de La Cueva, Cabo Rojo', N'Travesía en bote por los acantilados y la costa árida del Parque Nacional Jaragua hasta los ocho kilómetros de arena blanca de Bahía de las Águilas.',
           N'Bote, guía naturalista, almuerzo y equipo de snorkel', 7, 3600, 18, N'img/publicaciones/bahia-aguilas.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Senderismo al Salto El Limón')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Senderismo al Salto El Limón', 'tour-montana', N'Samaná', N'Comunidad de El Limón', N'Sendero entre la selva húmeda de la península hasta la cascada de 40 metros del Salto El Limón, con baño en la poza.',
           N'Guía local, caballo opcional, almuerzo criollo', 4, 2200, 30, N'img/publicaciones/salto-el-limon.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ascenso al Pico Duarte')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Ascenso al Pico Duarte', 'tour-montana', N'Jarabacoa', N'La Ciénaga de Manabao', N'Expedición de tres días al punto más alto del Caribe (3,098 m) por bosques de pino, con amanecer sobre el mar de nubes junto al busto de Duarte.',
           N'Guías certificados, mulas de carga, comidas, permisos y equipo de campamento', 72, 14500, 12, N'img/publicaciones/pico-duarte.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Valle del Rincón y cascadas de Jarabacoa')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Valle del Rincón y cascadas de Jarabacoa', 'tour-montana', N'Jarabacoa', N'Parque central de Jarabacoa', N'Ruta por el Valle del Rincón con visita a los saltos de Jimenoa y Baiguate y miradores sobre el río Yaque del Norte.',
           N'Transporte, guía, entrada a los saltos y almuerzo', 5, 2400, 20, N'img/publicaciones/valle-rincon.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Cabalgata a los cafetales de la Cordillera')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Cabalgata a los cafetales de la Cordillera', 'tour-gastronomico', N'Jarabacoa', N'Rancho Montaña Verde, Jarabacoa', N'Recorrido a caballo por fincas de café, con explicación del proceso del grano y degustación en una casa de campo.',
           N'Caballo, guía, cata de café de altura y almuerzo campestre', 4, 2600, 14, N'img/publicaciones/cabalgata-cafetales.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ruta del cacao orgánico')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Ruta del cacao orgánico', 'tour-gastronomico', N'Río San Juan', N'Parque central de Río San Juan', N'Visita a una comunidad productora de cacao orgánico: del árbol a la tableta de chocolate hecha por los visitantes.',
           N'Transporte, visita a la finca, taller de chocolate y almuerzo', 5, 2300, 20, N'img/publicaciones/ruta-cacao.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Desayuno criollo y Mercado Modelo')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Desayuno criollo y Mercado Modelo', 'tour-gastronomico', N'Santo Domingo', N'Mercado Modelo, Av. Mella', N'Mañana de sabores: desayuno de mangú con salami, queso frito y huevos, y recorrido por los puestos de frutas, especias y dulces del Mercado Modelo.',
           N'Guía gastronómico, desayuno de mangú con los tres golpes, jugos naturales y degustaciones', 3, 1800, 16, N'img/publicaciones/desayuno-criollo.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Clase de cocina: sancocho dominicano')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Clase de cocina: sancocho dominicano', 'tour-gastronomico', N'Boca Chica', N'Casa de cocina La Caldera, Boca Chica', N'Aprende a preparar el sancocho de siete carnes con víveres de la tierra y compártelo en la mesa con el chef y el grupo.',
           N'Ingredientes, chef instructor, recetario y almuerzo', 3, 2700, 12, N'img/publicaciones/sancocho.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Almuerzo típico: la bandera dominicana')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Almuerzo típico: la bandera dominicana', 'tour-gastronomico', N'Juan Dolio', N'Comedor Doña Rosa, Juan Dolio', N'Arroz blanco, habichuelas guisadas, pollo criollo, ensalada y tostones en un comedor familiar, con la historia de cada plato.',
           N'Almuerzo completo, bebida natural y postre de la casa', 2, 1200, 24, N'img/publicaciones/almuerzo-bandera.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Zona Colonial a pie: Catedral Primada y Parque Colón', 'cultural', N'Santo Domingo', N'Parque Colón, Zona Colonial', N'Recorrido por la primera ciudad del Nuevo Mundo: Catedral Primada, Parque Colón, Alcázar de Colón, Calle Las Damas y Panteón Nacional.',
           N'Guía historiador y entradas al Alcázar de Colón y al Museo de las Casas Reales', 3, 1500, 25, N'img/publicaciones/zona-colonial.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Parque Nacional Los Haitises y cuevas taínas')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Parque Nacional Los Haitises y cuevas taínas', 'cultural', N'Samaná', N'Muelle de Samaná', N'Navegación entre cayos y manglares hasta las cuevas de la Arena y de la Línea, con pictografías taínas.',
           N'Lancha, guía, entrada al parque y almuerzo', 6, 3400, 24, N'img/publicaciones/los-haitises.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Basílica de Higüey y Altos de Chavón')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Basílica de Higüey y Altos de Chavón', 'cultural', N'Punta Cana', N'Recogida en el hotel (zona Bávaro)', N'Visita a la Basílica de Nuestra Señora de la Altagracia y al pueblo de estilo mediterráneo de Altos de Chavón, con su anfiteatro sobre el río.',
           N'Transporte, guía, entradas y almuerzo', 7, 3900, 30, N'img/publicaciones/basilica-higuey.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Puerto Plata victoriana y Calle de la Sombrilla')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Puerto Plata victoriana y Calle de la Sombrilla', 'cultural', N'Puerto Plata', N'Parque Independencia, Puerto Plata', N'Casas victorianas, la Calle de la Sombrilla, la Fortaleza San Felipe y el Museo del Ámbar en el centro histórico de Puerto Plata.',
           N'Guía local, entrada a la Fortaleza San Felipe y degustación de chocolate', 3, 1700, 25, N'img/publicaciones/puerto-plata-victoriana.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Santiago de los Caballeros y su Monumento')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Santiago de los Caballeros y su Monumento', 'cultural', N'Puerto Plata', N'Parque central de Puerto Plata', N'Excursión a la ciudad corazón del Cibao: Monumento a los Héroes de la Restauración, Centro León y una fábrica de cigarros artesanales.',
           N'Transporte, guía, entrada al Monumento y al Centro León, almuerzo', 8, 3500, 20, N'img/publicaciones/monumento-santiago.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Canopy en la selva de Anamuya')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Canopy en la selva de Anamuya', 'zip-line', N'Punta Cana', N'Recogida en el hotel (zona Bávaro)', N'Doce líneas de tirolesa sobre las montañas de Anamuya, con plataformas en los árboles y una línea de 700 metros.',
           N'Transporte, equipo certificado, 12 líneas de tirolesa y refrigerio', 4, 4200, 24, N'img/publicaciones/canopy-anamuya.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Vuelo en parapente sobre el valle de Constanza')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Vuelo en parapente sobre el valle de Constanza', 'zip-line', N'Constanza', N'Mirador de Constanza', N'Vuelo biplaza con piloto certificado sobre el valle agrícola más alto del Caribe, sin experiencia previa.',
           N'Piloto certificado, equipo completo, fotos y video del vuelo', 2, 5500, 8, N'img/publicaciones/parapente-constanza.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ruta en cuatrimoto por Valle Nuevo')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Ruta en cuatrimoto por Valle Nuevo', 'motocross', N'Constanza', N'Parque central de Constanza', N'Recorrido en cuatrimoto por las carreteras y caminos de montaña de Constanza, entre fincas y lomas, hasta las pirámides de Valle Nuevo.',
           N'Cuatrimoto, casco, guía, merienda y almuerzo campestre', 5, 5200, 10, N'img/publicaciones/cuatrimoto-constanza.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Snorkel en los arrecifes de Isla Catalina')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Snorkel en los arrecifes de Isla Catalina', 'acuaticas', N'La Romana', N'Marina de Casa de Campo', N'Snorkel en las paredes de coral de Isla Catalina, con peces tropicales, esponjas y aguas de visibilidad excepcional.',
           N'Barco, equipo de snorkel, guía de buceo y almuerzo', 7, 4600, 40, N'img/publicaciones/snorkel-catalina.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'27 Charcos de Damajagua')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'27 Charcos de Damajagua', 'acuaticas', N'Puerto Plata', N'Centro de visitantes de Damajagua, Imbert', N'Descenso por saltos y toboganes naturales de piedra caliza en el río Damajagua, acompañado por guías.',
           N'Transporte, casco, chaleco, guías y almuerzo', 5, 3100, 30, N'img/publicaciones/27-charcos.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Paseo en yate por la Marina de Casa de Campo')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Paseo en yate por la Marina de Casa de Campo', 'acuaticas', N'La Romana', N'Marina Casa de Campo, muelle principal', N'Salida desde la marina hacia la desembocadura del río Chavón y la costa de La Romana, con parada para nadar y snorkel.',
           N'Yate con capitán, bebidas, snorkel en la desembocadura del río Chavón', 4, 7800, 12, N'img/publicaciones/marina-casa-de-campo.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Día de parque acuático en Punta Cana')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Día de parque acuático en Punta Cana', 'acuaticas', N'Punta Cana', N'Recepción del parque, Bávaro', N'Toboganes de espiral, piscinas y zona infantil para pasar el día en familia, con almuerzo incluido.',
           N'Entrada, toboganes, piscinas, almuerzo y casillero', 6, 2900, 80, N'img/publicaciones/parque-acuatico.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Golf en Teeth of the Dog, Casa de Campo')
    INSERT INTO dbo.actividades
        (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas,
         precio_persona, cupo_diario, imagen_url, destacado)
    SELECT e.id_empresa, N'Golf en Teeth of the Dog, Casa de Campo', 'golf', N'La Romana', N'Casa Club de Casa de Campo, La Romana', N'Ronda de 18 hoyos en el campo diseñado por Pete Dye, con siete hoyos junto al mar Caribe. Alquiler de palos disponible.',
           N'Green fee de 18 hoyos, carrito compartido, cubeta de práctica y caddie', 5, 18500, 16, N'img/publicaciones/golf-casa-de-campo.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131998452';
GO

-- 4.5b Vehículos de alquiler
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Toyota Corolla o similar')
    INSERT INTO dbo.vehiculos
        (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas,
         aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima,
         cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado)
    SELECT e.id_empresa, N'Toyota Corolla o similar', N'Toyota', N'Corolla', 2024, 'economico',
           'automatica', 'gasolina', 5, 4, 2, 1, NULL,
           N'Santo Domingo', N'Aeropuerto Internacional Las Américas (SDQ), mostrador en llegadas', N'Sedán económico y de bajo consumo, ideal para moverte por la capital y recorrer el país. Recógelo al aterrizar en Las Américas.', N'Seguro básico de colisión con deducible, asistencia en carretera 24 horas, kilometraje ilimitado', 2900, 15000,
           21, 600, 4500, 8, N'img/publicaciones/toyota-corolla.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Mercedes-Benz Clase C')
    INSERT INTO dbo.vehiculos
        (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas,
         aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima,
         cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado)
    SELECT e.id_empresa, N'Mercedes-Benz Clase C', N'Mercedes-Benz', N'C 200', 2023, 'lujo',
           'automatica', 'gasolina', 5, 4, 3, 1, NULL,
           N'Santo Domingo', N'Aeropuerto Internacional Las Américas (SDQ), mostrador en llegadas', N'Sedán ejecutivo con interior de piel, asistente de estacionamiento y Apple CarPlay. Para viajes de negocios o una ocasión especial.', N'Seguro de colisión con deducible reducido, asistencia 24 horas, entrega con tanque lleno', 9500, 45000,
           25, NULL, 6000, 3, N'img/publicaciones/mercedes-clase-c.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Ford Mustang Convertible')
    INSERT INTO dbo.vehiculos
        (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas,
         aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima,
         cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado)
    SELECT e.id_empresa, N'Ford Mustang Convertible', N'Ford', N'Mustang EcoBoost Convertible', 2023, 'convertible',
           'automatica', 'gasolina', 4, 2, 1, 1, 300,
           N'Puerto Plata', N'Aeropuerto Internacional Gregorio Luperón (POP), mostrador en llegadas', N'Descapotable para recorrer la costa norte entre Puerto Plata, Sosúa y Cabarete con la capota abajo.', N'Seguro de colisión con deducible, asistencia 24 horas, 300 km diarios', 8900, 40000,
           25, NULL, NULL, 2, N'img/publicaciones/ford-mustang.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Cadillac Escalade')
    INSERT INTO dbo.vehiculos
        (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas,
         aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima,
         cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado)
    SELECT e.id_empresa, N'Cadillac Escalade', N'Cadillac', N'Escalade', 2024, 'suv',
           'automatica', 'gasolina', 7, 5, 5, 1, NULL,
           N'Punta Cana', N'Aeropuerto Internacional de Punta Cana (PUJ), terminal B', N'SUV de lujo de tres filas para familias o grupos con mucho equipaje. Asientos de piel, pantalla trasera y techo panorámico.', N'Seguro de colisión con deducible reducido, asistencia 24 horas, kilometraje ilimitado', 14500, 60000,
           25, NULL, 7500, 2, N'img/publicaciones/cadillac-escalade.jpg', 1
    FROM dbo.empresas e WHERE e.rnc = '132667418';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Jeep Gladiator 4x4')
    INSERT INTO dbo.vehiculos
        (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas,
         aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima,
         cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado)
    SELECT e.id_empresa, N'Jeep Gladiator 4x4', N'Jeep', N'Gladiator Rubicon', 2023, 'pickup',
           'automatica', 'gasolina', 5, 4, 4, 1, 250,
           N'Las Terrenas', N'Oficina Las Terrenas, Calle Duarte frente al Pueblo de los Pescadores', N'Pickup 4x4 con techo desmontable para llegar a Playa Rincón, Playa Frontón y los caminos de montaña de la península de Samaná.', N'Seguro de colisión con deducible, asistencia 24 horas, 250 km diarios', 7800, 35000,
           25, NULL, 5500, 3, N'img/publicaciones/jeep-gladiator.jpg', 0
    FROM dbo.empresas e WHERE e.rnc = '132667418';
GO

-- 4.6 Reservas de ejemplo (fechas relativas a la instalación)
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD7K2M9QA')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total,
         estado, fecha_cancelacion)
    SELECT 'BRD7K2M9QA', u.id_usuario, h.id_hotel,
           DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 33, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 3,
           'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD4H8T2LX')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD4H8T2LX', u.id_usuario, a.id_actividad,
           DATEADD(DAY, 12, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Senderismo al Salto El Limón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD9P3W6ZE')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total,
         estado, fecha_cancelacion)
    SELECT 'BRD9P3W6ZE', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 2,
           'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Mirador del Mar Luxury Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD2C5N8RV')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD2C5N8RV', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)),
           3, a.precio_persona, a.precio_persona * 3, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD5L7Q2MA')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total,
         estado, fecha_cancelacion)
    SELECT 'BRD5L7Q2MA', u.id_usuario, h.id_hotel,
           DATEADD(DAY, 18, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 22, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 4,
           'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'luis.fernandez@correo.com' AND h.nombre = N'Samaná Bay Palms Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD8T3V6NB')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD8T3V6NB', u.id_usuario, a.id_actividad,
           DATEADD(DAY, 19, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD3R9K4PC')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD3R9K4PC', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Excursión a Playa Rincón y Cabo Cabrón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD6M2X8RD')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total,
         estado, fecha_cancelacion)
    SELECT 'BRD6M2X8RD', u.id_usuario, h.id_hotel,
           DATEADD(DAY, 25, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 28, CAST(SYSUTCDATETIME() AS DATE)),
           4, 1, h.precio_noche, h.precio_noche * 3,
           'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'carmen.jimenez@correo.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD9N5H2SE')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD9N5H2SE', u.id_usuario, a.id_actividad,
           DATEADD(DAY, 8, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD4P7J3TF')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD4P7J3TF', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2, 'cancelada', SYSUTCDATETIME()
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Canopy en la selva de Anamuya';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD2W8F5UG')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total,
         estado, fecha_cancelacion)
    SELECT 'BRD2W8F5UG', u.id_usuario, h.id_hotel,
           DATEADD(DAY, 40, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 45, CAST(SYSUTCDATETIME() AS DATE)),
           3, 1, h.precio_noche, h.precio_noche * 5,
           'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'daniel.ortiz@correo.com' AND h.nombre = N'Cayo Azul All-Inclusive Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD7Y4C9VH')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD7Y4C9VH', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Ascenso al Pico Duarte';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRD5Z6B3WJ')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total, estado, fecha_cancelacion)
    SELECT 'BRD5Z6B3WJ', u.id_usuario, a.id_actividad,
           DATEADD(DAY, 5, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2, 'confirmada', NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Desayuno criollo y Mercado Modelo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDA7C2K9V')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDA7C2K9V', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 33, CAST(SYSUTCDATETIME() AS DATE)),
           '11:00', '10:00', N'Punta Cana', 34, N'proteccion-total,silla-infantil', v.deposito,
           1, v.precio_dia, 47250
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'cliente@bookingrd.com' AND v.nombre = N'Cadillac Escalade';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDA3J8M4P')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDA3J8M4P', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, 18, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 22, CAST(SYSUTCDATETIME() AS DATE)),
           '09:00', '09:00', N'Samaná', 29, N'gps', v.deposito,
           1, v.precio_dia, 38100
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'luis.fernandez@correo.com' AND v.nombre = N'Jeep Gladiator 4x4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDA9T5Q2R')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDA9T5Q2R', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, 8, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 13, CAST(SYSUTCDATETIME() AS DATE)),
           '14:00', '12:00', N'Punta Cana', 23, N'conductor-adicional', v.deposito,
           1, v.precio_dia, 24250
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'carmen.jimenez@correo.com' AND v.nombre = N'Toyota Corolla o similar';
GO

-- 4.7 Historial de reservas disfrutadas y sus reseñas
--     Cada reseña se apoya en una reserva confirmada ya terminada. La fecha
--     de la reseña es dos días posterior al final de la reserva.
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0001RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0001RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -120, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 4
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'ana.castillo@correo.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0001RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Nuestra luna de miel perfecta', N'La playa de Bávaro frente a la habitación, el spa y la cena en el restaurante de mariscos fueron de otro nivel. El personal nos preparó una sorpresa por la luna de miel sin que lo pidiéramos.', N'Gracias, Ana Belén. Fue un placer acompañarles en un momento tan especial. Les esperamos en su primer aniversario.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0001RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0002RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0002RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -75, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)),
           4, 1, h.precio_noche, h.precio_noche * 5
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'roberto.sanchez@correo.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0002RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Ideal para familias', N'Fuimos con dos niños y el club infantil los mantuvo felices todo el día. Las piscinas son enormes y la comida variada. Solo el check-in tardó un poco el día de llegada.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0002RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0003RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0003RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -27, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0003RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Repetiría sin pensarlo', N'Habitación amplia con vista al mar, buffet con mucha fruta fresca y un spa excelente. La playa siempre limpia y con camastros disponibles.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0003RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0004RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0004RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -150, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -146, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 4
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'patricia.nunez@correo.com' AND h.nombre = N'Cayo Azul All-Inclusive Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0004RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buen todo incluido', N'El agua es tan turquesa como en las fotos. Los restaurantes a la carta requieren reserva temprano, pero la atención fue muy amable en todo momento.', N'Gracias por tu comentario, Patricia. Ya habilitamos la reserva de restaurantes desde la recepción el mismo día de llegada.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0004RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0005RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0005RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -47, CAST(SYSUTCDATETIME() AS DATE)),
           3, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Cayo Azul All-Inclusive Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0005RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Playa espectacular', N'La mejor playa que hemos visitado en Punta Cana. Las habitaciones están renovadas y el personal de animación es muy simpático sin ser invasivo.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0005RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0006RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0006RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -95, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -93, CAST(SYSUTCDATETIME() AS DATE)),
           1, 1, h.precio_noche, h.precio_noche * 2
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'miguel.herrera@correo.com' AND h.nombre = N'Azura Caribbean Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0006RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Cómodo para viaje de trabajo', N'Buena ubicación en Santo Domingo, wifi rápido y desayuno temprano. La vista al Malecón desde el piso alto vale la pena.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0006RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0007RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0007RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -38, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 2
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'yesenia.paulino@correo.com' AND h.nombre = N'Azura Caribbean Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0007RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Fin de semana en la capital', N'Aprovechamos para recorrer la Zona Colonial y volver a descansar a la piscina. Personal atento y habitación muy limpia.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0007RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRD9P3W6ZE')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Vista al Atlántico inolvidable', N'La suite con piscina privada frente al mar de Cabarete es un sueño. Desayuno servido en la terraza y un servicio impecable de principio a fin.', N'María, gracias por elegirnos. Nos alegra que la terraza haya sido tu lugar favorito. Te esperamos pronto.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRD9P3W6ZE' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0009RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0009RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -110, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -107, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'andres.cabrera@correo.com' AND h.nombre = N'Mirador del Mar Luxury Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0009RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Para desconectar de verdad', N'Tranquilo, elegante y con una vista que no cansa. Perfecto para parejas. Muy cerca de las escuelas de kitesurf de Cabarete.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0009RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0010RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0010RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -200, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -196, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 4
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'ana.castillo@correo.com' AND h.nombre = N'Solaria Island Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0010RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Excelente base para ir a Saona', N'Desde el hotel organizamos la excursión a Isla Saona. Las instalaciones son modernas y el restaurante italiano nos encantó.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0010RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0011RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0011RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -57, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'roberto.sanchez@correo.com' AND h.nombre = N'Solaria Island Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0011RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 7, N'Bien, con detalles por mejorar', N'La playa y las piscinas están muy bien. El aire acondicionado de nuestra habitación hacía ruido y tardaron un día en cambiarnos.', N'Roberto, lamentamos lo del aire acondicionado. Revisamos todas las unidades de ese pabellón. Gracias por avisarnos.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0011RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0012RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0012RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -130, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -127, CAST(SYSUTCDATETIME() AS DATE)),
           4, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'carmen.jimenez@correo.com' AND h.nombre = N'Bahía Serena Golf & Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0012RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Cerca de la capital', N'A media hora del aeropuerto y con una playa de aguas tranquilas, ideal para los niños. El campo de golf está muy bien cuidado.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0012RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0013RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0013RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -25, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -23, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 2
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Bahía Serena Golf & Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0013RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Escapada perfecta', N'Fuimos un fin de semana largo y descansamos de verdad. El personal de playa siempre pendiente y la comida criolla del restaurante muy buena.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0013RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0014RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0014RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -180, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -175, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 5
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'miguel.herrera@correo.com' AND h.nombre = N'Costa Dorada Palace Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0014RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Sosúa tiene su encanto', N'Playa de arena dorada, buen snorkel a pocos metros y el pueblo cerca para cenar. El hotel cumple con lo que promete.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0014RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0015RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0015RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)),
           3, 1, h.precio_noche, h.precio_noche * 4
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Costa Dorada Palace Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0015RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Atención de primera', N'Celebramos el cumpleaños de mi esposa y el equipo decoró la habitación con flores tropicales. Detalles que hacen la diferencia.', N'Héctor, gracias por compartir ese momento con nosotros. Feliz cumpleaños de nuevo a tu esposa.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0015RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0016RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0016RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -87, CAST(SYSUTCDATETIME() AS DATE)),
           6, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'patricia.nunez@correo.com' AND h.nombre = N'Palma Real Haven Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0016RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'La villa ideal para grupos', N'Éramos seis amigas y la villa tenía espacio de sobra, piscina propia y rancho para la barbacoa. Juan Dolio es tranquilo y la playa está a pasos.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0016RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0017RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0017RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -18, CAST(SYSUTCDATETIME() AS DATE)),
           4, 1, h.precio_noche, h.precio_noche * 2
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'yesenia.paulino@correo.com' AND h.nombre = N'Palma Real Haven Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0017RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Muy recomendable', N'Limpio, bien equipado y con un jardín precioso. Los anfitriones nos recomendaron dónde comer pescado frito en la playa.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0017RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0018RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0018RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -140, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -136, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 4
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'andres.cabrera@correo.com' AND h.nombre = N'Samaná Bay Palms Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0018RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Temporada de ballenas', N'Fuimos en febrero y desde el hotel salimos a ver ballenas jorobadas. La bahía al amanecer es un espectáculo y el personal muy cálido.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0018RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0019RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0019RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -42, CAST(SYSUTCDATETIME() AS DATE)),
           4, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'carmen.jimenez@correo.com' AND h.nombre = N'Samaná Bay Palms Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0019RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buena relación calidad precio', N'Habitaciones amplias con balcón a la bahía. El desayuno podría tener más variedad, pero la ubicación es inmejorable.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0019RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0020RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0020RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -100, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -97, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'roberto.sanchez@correo.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0020RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Un rincón mágico', N'Las villas entre la vegetación, el sonido del mar y la piscina infinita al atardecer. Es el lugar más bonito donde nos hemos hospedado en el país.', N'Gracias, Roberto. Las Galeras guarda muchos secretos. La próxima vez les llevamos a Playa Frontón.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0020RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0021RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0021RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 2
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0021RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Naturaleza y descanso', N'Perfecto para desconectarse. El camino de llegada es un poco empinado, pero vale cada minuto. Comida casera deliciosa.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0021RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0022RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0022RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -160, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'hector.marte@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0022RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'El mejor día del viaje', N'Catamarán con música, la piscina natural con estrellas de mar y almuerzo en la playa. El guía Ramón nos hizo reír todo el camino.', N'Gracias, Héctor. Le pasamos tus saludos a Ramón.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0022RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0023RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0023RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -55, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0023RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Imperdible', N'La isla es preciosa y el regreso en lancha rápida fue emocionante. Lleven protector solar, el sol pega fuerte.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0023RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0024RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0024RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -15, CAST(SYSUTCDATETIME() AS DATE)),
           3, a.precio_persona, a.precio_persona * 3
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'miguel.herrera@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0024RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Muy bien organizada', N'Puntuales en la recogida, equipo de snorkel en buen estado y un almuerzo con pescado fresco. Todo como lo describen.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0024RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRD3R9K4PC')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Playa Rincón es un paraíso', N'El paseo en bote por los acantilados de Cabo Cabrón es impresionante y Playa Rincón casi vacía. El coco frío en la orilla fue el cierre perfecto.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRD3R9K4PC' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0026RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0026RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -80, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Excursión a Playa Rincón y Cabo Cabrón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0026RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Bonita excursión', N'Paisajes increíbles. El mar estaba algo movido de regreso, pero el capitán manejó muy bien.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0026RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0027RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0027RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -210, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Bahía de las Águilas en bote';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0027RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'La playa más bonita del país', N'Arena blanca, agua cristalina y nadie más alrededor. El viaje hasta Pedernales es largo, pero no hay nada igual en el Caribe.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0027RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0028RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0028RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -65, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Bahía de las Águilas en bote';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0028RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Vale el viaje', N'Los guías conocen muy bien la zona y nos explicaron la importancia del parque Jaragua. Lleven comida y mucha agua.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0028RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0029RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0029RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -170, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'ana.castillo@correo.com' AND a.nombre = N'Senderismo al Salto El Limón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0029RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Cascada impresionante', N'Subimos a caballo y bajamos a pie. Bañarse al pie del salto es una experiencia única. El almuerzo criollo al final estuvo muy rico.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0029RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0030RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0030RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -28, CAST(SYSUTCDATETIME() AS DATE)),
           3, a.precio_persona, a.precio_persona * 3
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'hector.marte@correo.com' AND a.nombre = N'Senderismo al Salto El Limón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0030RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Recomendado', N'El sendero tiene partes resbaladizas, mejor ir con zapatos cerrados. Los guías son pacientes y conocen cada planta del camino.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0030RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRD7Y4C9VH')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Llegar a la cima del Caribe', N'Tres días de montaña, noches frías en La Compartición y el amanecer desde la cima. Los guías y los arrieros fueron extraordinarios.', N'Daniel, felicidades por coronar el Pico Duarte. Fue un honor acompañarles.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRD7Y4C9VH' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0032RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0032RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -240, CAST(SYSUTCDATETIME() AS DATE)),
           1, a.precio_persona, a.precio_persona * 1
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'miguel.herrera@correo.com' AND a.nombre = N'Ascenso al Pico Duarte';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0032RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Exigente pero inolvidable', N'Hay que tener buena condición física. La organización es excelente: comida caliente, mulas para el equipaje y mucha seguridad.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0032RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0033RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0033RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -85, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'laura.vasquez@correo.com' AND a.nombre = N'Valle del Rincón y cascadas de Jarabacoa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0033RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Jarabacoa enamora', N'Visitamos Salto de Baiguate y Jimenoa en un solo día. El clima fresco de la montaña es un descanso del calor de la costa.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0033RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0034RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0034RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -115, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'Cabalgata a los cafetales de la Cordillera';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0034RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Café recién tostado en la montaña', N'La cabalgata entre pinos y la visita al cafetal familiar fueron lo mejor del viaje. Nos llevamos dos libras de café para la casa.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0034RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0035RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0035RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Cabalgata a los cafetales de la Cordillera';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0035RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Experiencia auténtica', N'Caballos mansos y bien cuidados, ideal para principiantes. La familia productora nos explicó todo el proceso del café.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0035RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0036RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0036RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -190, CAST(SYSUTCDATETIME() AS DATE)),
           3, a.precio_persona, a.precio_persona * 3
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Ruta del cacao orgánico';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0036RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Del árbol a la barra de chocolate', N'Aprendimos a fermentar, secar y moler el cacao. Hicimos nuestra propia barra de chocolate. Ideal para ir con niños.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0036RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0037RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0037RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Desayuno criollo y Mercado Modelo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0037RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Mangú como en casa de la abuela', N'Desayuno de mangú con los tres golpes y luego un recorrido por el Mercado Modelo con mucha historia. Guía muy simpática.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0037RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0038RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0038RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -18, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Desayuno criollo y Mercado Modelo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0038RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Muy bonito', N'Buena forma de conocer el Santo Domingo cotidiano. El mercado puede estar muy lleno, conviene ir temprano como propone el tour.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0038RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0039RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0039RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -100, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Almuerzo típico: la bandera dominicana';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0039RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Sabor dominicano de verdad', N'Arroz, habichuelas guisadas, pollo y ensalada, con jugo de chinola. La anfitriona nos contó la historia de cada plato.', N'Gracias, Carmen. Ese jugo de chinola es receta de la casa.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0039RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0040RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0040RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -260, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'ana.castillo@correo.com' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0040RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Historia viva', N'Caminar por la Calle Las Damas y entrar a la Catedral Primada con un guía que sabe tanto fue fascinante. Terminamos con un helado en el Parque Colón.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0040RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0041RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0041RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0041RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Imprescindible en Santo Domingo', N'Tres horas que pasan volando. El guía adapta el ritmo al grupo y recomienda buenos lugares para comer después.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0041RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0042RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0042RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -145, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'laura.vasquez@correo.com' AND a.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0042RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Los Haitises superó todo', N'Los mogotes saliendo del agua, los manglares y los petroglifos taínos en las cuevas. Vimos pelícanos y fragatas muy de cerca.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0042RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0043RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0043RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -12, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0043RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Paisaje de película', N'La bahía de San Lorenzo es preciosa. El guía explicó muy bien la historia taína de las pinturas en la Cueva de la Línea.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0043RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0044RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0044RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -125, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'miguel.herrera@correo.com' AND a.nombre = N'Basílica de Higüey y Altos de Chavón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0044RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buen complemento a la playa', N'Altos de Chavón tiene una vista hermosa sobre el río Chavón. La basílica es impresionante por dentro. Un día cultural muy completo.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0044RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0045RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0045RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'hector.marte@correo.com' AND a.nombre = N'Puerto Plata victoriana y Calle de la Sombrilla';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0045RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Puerto Plata con color', N'Las casas victorianas, la Calle de la Sombrilla y el teleférico al final. Las fotos quedan espectaculares.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0045RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0046RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0046RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -110, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Canopy en la selva de Anamuya';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0046RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Adrenalina pura', N'Doce líneas sobre la selva, una más alta que la otra. El equipo de seguridad revisa todo dos veces y te hace sentir muy confiado.', N'Patricia, gracias por volar con nosotros. La línea 12 siempre deja a todos sin palabras.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0046RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0047RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0047RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)),
           3, a.precio_persona, a.precio_persona * 3
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Canopy en la selva de Anamuya';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0047RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Muy divertido', N'Fuimos con mi hijo de doce años y le encantó. Instructores jóvenes y con mucha energía.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0047RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0048RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0048RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)),
           1, a.precio_persona, a.precio_persona * 1
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Vuelo en parapente sobre el valle de Constanza';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0048RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Volar sobre el valle', N'Ver los campos de cultivo de Constanza desde el aire es indescriptible. El piloto me dio total confianza.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0048RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0049RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0049RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -95, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Ruta en cuatrimoto por Valle Nuevo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0049RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Frío y aventura', N'Senderos de tierra entre pinos y la pirámide de Valle Nuevo. Lleven abrigo, la temperatura baja bastante.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0049RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0050RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0050RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -175, CAST(SYSUTCDATETIME() AS DATE)),
           3, a.precio_persona, a.precio_persona * 3
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Snorkel en los arrecifes de Isla Catalina';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0050RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Agua cristalina', N'Vimos peces de colores, una tortuga y un arrecife muy bien conservado. La comida a bordo, sencilla pero rica.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0050RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0051RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0051RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -80, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'ana.castillo@correo.com' AND a.nombre = N'27 Charcos de Damajagua';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0051RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'La aventura más divertida', N'Saltar y deslizarse por los charcos es una experiencia única. Los guías te ayudan en cada salto y hay opción de saltar menos.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0051RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0052RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0052RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -150, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -146, CAST(SYSUTCDATETIME() AS DATE)),
           8, 1, h.precio_noche, h.precio_noche * 4
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Villa Acantilado Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0052RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'La mejor villa de nuestra vida', N'Celebramos los 60 años de mi papá con toda la familia. La piscina frente al mar, el mayordomo y la playa privada lo hicieron perfecto.', N'Héctor, gracias por celebrar con nosotros. Felicidades de nuevo a su papá.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0052RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0053RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0053RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -57, CAST(SYSUTCDATETIME() AS DATE)),
           6, 1, h.precio_noche, h.precio_noche * 3
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Villa Acantilado Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0053RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Espectacular', N'La vista desde la terraza al atardecer es inolvidable. Todo impecable. Está algo lejos del pueblo, conviene alquilar carrito de golf.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0053RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0054RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0054RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Paseo en yate por la Marina de Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0054RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Un día de lujo', N'El capitán nos llevó hasta el río Chavón y paramos a nadar en agua cristalina. Las bebidas frías y la música, perfectas.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0054RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0055RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0055RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Día de parque acuático en Punta Cana';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0055RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Los niños no querían irse', N'Los toboganes de espiral son muy divertidos y la zona infantil tiene salvavidas pendientes todo el tiempo. Buen almuerzo.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0055RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0056RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0056RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -26, CAST(SYSUTCDATETIME() AS DATE)),
           4, a.precio_persona, a.precio_persona * 4
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'27 Charcos de Damajagua';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0056RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Para toda la familia', N'Hicimos el recorrido de siete charcos con los niños. Agua fresca, cascadas y mucha risa. Lleven zapatos de agua.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0056RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0057RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDV0057RS', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)),
           '10:00', '10:00', N'Santo Domingo', 32, NULL, v.deposito,
           1, v.precio_dia, 11600
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'miguel.herrera@correo.com' AND v.nombre = N'Toyota Corolla o similar';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0057RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Rápido y sin sorpresas', N'Me entregaron el auto en diez minutos al salir del aeropuerto. Limpio, con el tanque lleno y el precio igual al de la reserva.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0057RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0058RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDV0058RS', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, -25, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)),
           '10:00', '10:00', N'Santo Domingo', 32, NULL, v.deposito,
           1, v.precio_dia, 8700
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'yesenia.paulino@correo.com' AND v.nombre = N'Toyota Corolla o similar';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0058RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buena opción económica', N'Consume poco y es cómodo para la autopista hacia Punta Cana. La devolución en otra ciudad fue muy fácil.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0058RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0059RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDV0059RS', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -65, CAST(SYSUTCDATETIME() AS DATE)),
           '10:00', '10:00', N'Punta Cana', 32, NULL, v.deposito,
           1, v.precio_dia, 72500
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'hector.marte@correo.com' AND v.nombre = N'Cadillac Escalade';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0059RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Perfecto para la familia', N'Viajamos siete con todo el equipaje sin problemas. El personal de Caribe Rent nos esperó aunque el vuelo llegó tarde.', N'Gracias, Héctor. Siempre monitoreamos los vuelos para esperar a nuestros clientes.', DATEADD(DAY, 1, rs_fecha.fecha), rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0059RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0060RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDV0060RS', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -32, CAST(SYSUTCDATETIME() AS DATE)),
           '10:00', '10:00', N'Puerto Plata', 32, NULL, v.deposito,
           1, v.precio_dia, 26700
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'patricia.nunez@correo.com' AND v.nombre = N'Ford Mustang Convertible';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0060RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'La costa norte con la capota abajo', N'Puerto Plata, Sosúa y Cabarete en un convertible fue inolvidable. Auto impecable y entrega puntual.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0060RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0061RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, precio_unitario, total)
    SELECT 'BRDV0061RS', u.id_usuario, v.id_vehiculo,
           DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -86, CAST(SYSUTCDATETIME() AS DATE)),
           '10:00', '10:00', N'Las Terrenas', 32, NULL, v.deposito,
           1, v.precio_dia, 31200
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'roberto.sanchez@correo.com' AND v.nombre = N'Jeep Gladiator 4x4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0061RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'Llegamos a Playa Frontón', N'Sin un 4x4 no hubiéramos llegado a las playas escondidas de Samaná. El límite de 250 km diarios fue más que suficiente.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0061RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0062RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, personas, precio_unitario, total)
    SELECT 'BRDV0062RS', u.id_usuario, a.id_actividad,
           DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)),
           2, a.precio_persona, a.precio_persona * 2
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Golf en Teeth of the Dog, Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0062RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 10, N'Un campo de otro mundo', N'Los hoyos junto al mar son espectaculares y el caddie conocía cada green. Una experiencia que todo golfista debe vivir.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0062RS' AND r.estado = 'confirmada';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = 'BRDV0063RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, personas, habitaciones, precio_unitario, total)
    SELECT 'BRDV0063RS', u.id_usuario, h.id_hotel,
           DATEADD(DAY, -28, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, -26, CAST(SYSUTCDATETIME() AS DATE)),
           2, 1, h.precio_noche, h.precio_noche * 2
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'ana.castillo@correo.com' AND h.nombre = N'Hotel Boutique El Conde';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = 'BRDV0063RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, fecha_creacion)
    SELECT r.id_reserva, 9, N'En el corazón de la Zona Colonial', N'La recepción nos atendió de maravilla y nos recomendó restaurantes cercanos. Habitación con mucho encanto colonial.', NULL, NULL, rs_fecha.fecha
    FROM dbo.reservas r
    CROSS APPLY (SELECT CAST(DATEADD(DAY, 2, COALESCE(r.fecha_fin, r.fecha_inicio)) AS DATETIME2(0)) AS fecha) rs_fecha
    WHERE r.codigo = 'BRDV0063RS' AND r.estado = 'confirmada';
GO

-- 4.8 Publicaciones guardadas (favoritos) de ejemplo
INSERT INTO dbo.favoritos (id_usuario, id_hotel)
SELECT u.id_usuario, p.id_hotel
FROM dbo.usuarios u CROSS JOIN dbo.hoteles p
WHERE u.correo = N'cliente@bookingrd.com' AND p.nombre = N'Paraíso Escondido Eco-Resort'
  AND NOT EXISTS (SELECT 1 FROM dbo.favoritos x WHERE x.id_usuario = u.id_usuario AND x.id_hotel = p.id_hotel);
GO
INSERT INTO dbo.favoritos (id_usuario, id_actividad)
SELECT u.id_usuario, p.id_actividad
FROM dbo.usuarios u CROSS JOIN dbo.actividades p
WHERE u.correo = N'cliente@bookingrd.com' AND p.nombre = N'Excursión en catamarán a Isla Saona'
  AND NOT EXISTS (SELECT 1 FROM dbo.favoritos x WHERE x.id_usuario = u.id_usuario AND x.id_actividad = p.id_actividad);
GO
INSERT INTO dbo.favoritos (id_usuario, id_actividad)
SELECT u.id_usuario, p.id_actividad
FROM dbo.usuarios u CROSS JOIN dbo.actividades p
WHERE u.correo = N'cliente@bookingrd.com' AND p.nombre = N'27 Charcos de Damajagua'
  AND NOT EXISTS (SELECT 1 FROM dbo.favoritos x WHERE x.id_usuario = u.id_usuario AND x.id_actividad = p.id_actividad);
GO
INSERT INTO dbo.favoritos (id_usuario, id_hotel)
SELECT u.id_usuario, p.id_hotel
FROM dbo.usuarios u CROSS JOIN dbo.hoteles p
WHERE u.correo = N'cliente@bookingrd.com' AND p.nombre = N'Palma Real Haven Resort'
  AND NOT EXISTS (SELECT 1 FROM dbo.favoritos x WHERE x.id_usuario = u.id_usuario AND x.id_hotel = p.id_hotel);
GO
INSERT INTO dbo.favoritos (id_usuario, id_actividad)
SELECT u.id_usuario, p.id_actividad
FROM dbo.usuarios u CROSS JOIN dbo.actividades p
WHERE u.correo = N'luis.fernandez@correo.com' AND p.nombre = N'Ascenso al Pico Duarte'
  AND NOT EXISTS (SELECT 1 FROM dbo.favoritos x WHERE x.id_usuario = u.id_usuario AND x.id_actividad = p.id_actividad);
GO
INSERT INTO dbo.favoritos (id_usuario, id_vehiculo)
SELECT u.id_usuario, p.id_vehiculo
FROM dbo.usuarios u CROSS JOIN dbo.vehiculos p
WHERE u.correo = N'cliente@bookingrd.com' AND p.nombre = N'Ford Mustang Convertible'
  AND NOT EXISTS (SELECT 1 FROM dbo.favoritos x WHERE x.id_usuario = u.id_usuario AND x.id_vehiculo = p.id_vehiculo);
GO

-- 4.9 Mensajes de contacto de ejemplo
IF NOT EXISTS (SELECT 1 FROM dbo.mensajes_contacto WHERE correo = N'rosa.almanzar@correo.com')
    INSERT INTO dbo.mensajes_contacto (nombre, correo, asunto, mensaje, atendido)
    VALUES (N'Rosa Almánzar', N'rosa.almanzar@correo.com', 'empresa', N'Tenemos un hostal en Constanza y queremos publicarlo. ¿Qué requisitos piden?', 0);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.mensajes_contacto WHERE correo = N'kevin.mejia@correo.com')
    INSERT INTO dbo.mensajes_contacto (nombre, correo, asunto, mensaje, atendido)
    VALUES (N'Kevin Mejía', N'kevin.mejia@correo.com', 'viajero', N'No me llegó el correo de confirmación de la reserva, aunque tengo el código.', 1);
GO

PRINT N'Instalación de BookingRD completada.';
GO
