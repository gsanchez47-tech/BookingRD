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
       reservas, pagos, mensajes_contacto, resenas, favoritos
    4. Datos de demostración          (cualquier servidor)

  Modos de ejecución
    a) Azure SQL Database (base compartida del equipo): `npm run configurar`
       o `npm run bd:instalar`. Se ejecuta solo desde el marcador
       @inicio-esquema (secciones 3 y 4).
    b) SQL Server local: abrir en SSMS con un login administrador y ejecutar
       el script completo (F5).

  Para empezar de cero en una base ya instalada: `npm run bd:reiniciar`
  (elimina las tablas de BookingRD y vuelve a ejecutar este script).

  Este archivo se genera con `npm run bd:generar` a partir de
  database/esquema.sql (estructura) y database/datos-demo.js (datos).
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

-- pagos: un registro por reserva (relación 1 a 1). Pasarela SIMULADA: solo se
-- guardan la marca, los últimos cuatro dígitos y el titular de la tarjeta,
-- nunca el número completo ni el CVV.
--   metodo:  'tarjeta' (cobrado al reservar) o 'en_destino' (se paga al llegar).
--   estado:  'pagado', 'pendiente' (en destino, por cobrar), 'reembolsado'
--            (tarjeta de una reserva cancelada) o 'anulado' (en destino cancelado).
--   referencia: identificador del pago (PAY + 8 caracteres); autorizacion: código
--            de 6 dígitos que devuelve la pasarela al aprobar una tarjeta.
IF OBJECT_ID(N'dbo.pagos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.pagos (
        id_pago             INT IDENTITY(1,1) PRIMARY KEY,
        id_reserva          INT             NOT NULL CONSTRAINT UQ_pagos_reserva UNIQUE
                                            CONSTRAINT FK_pagos_reservas REFERENCES dbo.reservas(id_reserva),
        metodo              VARCHAR(12)     NOT NULL,
        estado              VARCHAR(12)     NOT NULL,
        monto               DECIMAL(12,2)   NOT NULL,
        moneda              CHAR(3)         NOT NULL CONSTRAINT DF_pagos_moneda DEFAULT 'DOP',
        marca               VARCHAR(20)     NULL,
        ultimos4            CHAR(4)         NULL,
        titular             NVARCHAR(100)   NULL,
        referencia          CHAR(11)        NOT NULL CONSTRAINT UQ_pagos_referencia UNIQUE,
        autorizacion        CHAR(6)         NULL,
        fecha_pago          DATETIME2(0)    NOT NULL CONSTRAINT DF_pagos_fecha DEFAULT SYSUTCDATETIME(),
        fecha_reembolso     DATETIME2(0)    NULL,
        CONSTRAINT CK_pagos_metodo CHECK (metodo IN ('tarjeta', 'en_destino')),
        CONSTRAINT CK_pagos_estado CHECK (estado IN ('pagado', 'pendiente', 'reembolsado', 'anulado')),
        CONSTRAINT CK_pagos_monto CHECK (monto > 0),
        CONSTRAINT CK_pagos_tarjeta CHECK (
            metodo = 'en_destino'
            OR (marca IS NOT NULL AND ultimos4 IS NOT NULL AND titular IS NOT NULL AND autorizacion IS NOT NULL))
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
