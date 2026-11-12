/*
================================================================================
  BookingRD - Instalación en Azure SQL Database
================================================================================
  Forma recomendada: `npm run bd:instalar` (usa la conexión de .env).
  Alternativa: abrir este archivo en SQL Server Management Studio o en VS Code
  con la extensión SQL Server (mssql), conectado a la base BookingRD (no a
  master), y ejecutarlo completo. Las líneas GO separan los lotes.

  Crea las tablas e índices y carga los datos de demostración. Es idempotente.
  Generado por scripts/generar-sql.js; no editar a mano.
================================================================================
*/

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
        CONSTRAINT CK_hoteles_ciudad CHECK (ciudad IN (N'Santo Domingo', N'Punta Cana', N'Puerto Plata', N'Las Terrenas', N'Samaná', N'Las Galeras', N'La Romana', N'Sosúa', N'Cabarete', N'Jarabacoa', N'Constanza', N'Juan Dolio', N'Boca Chica', N'Río San Juan', N'Pedernales', N'Miches', N'Barahona', N'Montecristi', N'Baní')),
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
        CONSTRAINT CK_actividades_categoria CHECK (categoria IN ('tour-playa', 'tour-montana', 'tour-gastronomico', 'cultural', 'zip-line', 'motocross', 'acuaticas', 'golf', 'alquiler-equipo', 'fotografia')),
        CONSTRAINT CK_actividades_ciudad CHECK (ciudad IN (N'Santo Domingo', N'Punta Cana', N'Puerto Plata', N'Las Terrenas', N'Samaná', N'Las Galeras', N'La Romana', N'Sosúa', N'Cabarete', N'Jarabacoa', N'Constanza', N'Juan Dolio', N'Boca Chica', N'Río San Juan', N'Pedernales', N'Miches', N'Barahona', N'Montecristi', N'Baní')),
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
        CONSTRAINT CK_vehiculos_ciudad CHECK (ciudad IN (N'Santo Domingo', N'Punta Cana', N'Puerto Plata', N'Las Terrenas', N'Samaná', N'Las Galeras', N'La Romana', N'Sosúa', N'Cabarete', N'Jarabacoa', N'Constanza', N'Juan Dolio', N'Boca Chica', N'Río San Juan', N'Pedernales', N'Miches', N'Barahona', N'Montecristi', N'Baní')),
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

-- combos: paquetes de un alojamiento y una o dos actividades del mismo
-- destino con un descuento sobre la suma de los precios. Al reservar un combo
-- se crea una reserva por cada parte (enlazadas por id_combo) con el precio
-- ya rebajado.
--   noches_sugeridas: estadía con la que se muestra el precio de referencia.
--   dia_actividad / dia_actividad2: noche de la estadía (1 = día siguiente a
--                     la llegada) en que se programa cada actividad.
IF OBJECT_ID(N'dbo.combos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.combos (
        id_combo            INT IDENTITY(1,1) PRIMARY KEY,
        nombre              NVARCHAR(150)   NOT NULL CONSTRAINT UQ_combos_nombre UNIQUE,
        lema                NVARCHAR(200)   NOT NULL,
        descripcion         NVARCHAR(1000)  NOT NULL,
        ciudad              NVARCHAR(60)    NOT NULL,
        id_hotel            INT             NOT NULL CONSTRAINT FK_combos_hoteles REFERENCES dbo.hoteles(id_hotel),
        id_actividad        INT             NOT NULL CONSTRAINT FK_combos_actividades REFERENCES dbo.actividades(id_actividad),
        id_actividad2       INT             NULL CONSTRAINT FK_combos_actividades2 REFERENCES dbo.actividades(id_actividad),
        dia_actividad       TINYINT         NOT NULL CONSTRAINT DF_combos_dia DEFAULT 1,
        dia_actividad2      TINYINT         NULL,
        noches_sugeridas    TINYINT         NOT NULL CONSTRAINT DF_combos_noches DEFAULT 3,
        descuento_pct       TINYINT         NOT NULL,
        destacado           BIT             NOT NULL CONSTRAINT DF_combos_destacado DEFAULT 0,
        activo              BIT             NOT NULL CONSTRAINT DF_combos_activo DEFAULT 1,
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_combos_creacion DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_combos_descuento CHECK (descuento_pct BETWEEN 1 AND 40),
        CONSTRAINT CK_combos_noches CHECK (noches_sugeridas BETWEEN 1 AND 14),
        CONSTRAINT CK_combos_dias CHECK (dia_actividad BETWEEN 0 AND 14 AND (dia_actividad2 IS NULL OR dia_actividad2 BETWEEN 0 AND 14)),
        CONSTRAINT CK_combos_segunda CHECK ((id_actividad2 IS NULL AND dia_actividad2 IS NULL) OR (id_actividad2 IS NOT NULL AND dia_actividad2 IS NOT NULL AND id_actividad2 <> id_actividad))
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
--   id_combo:  combo con el que se reservó (hotel y actividades del paquete).
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
        id_combo            INT             NULL CONSTRAINT FK_reservas_combos REFERENCES dbo.combos(id_combo),
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

-- Bases instaladas con una versión anterior: agrega la columna del combo.
IF COL_LENGTH(N'dbo.reservas', N'id_combo') IS NULL
    ALTER TABLE dbo.reservas ADD id_combo INT NULL CONSTRAINT FK_reservas_combos REFERENCES dbo.combos(id_combo);
GO

-- pagos: un registro por reserva (relación 1 a 1). Pasarela SIMULADA: solo se
-- guardan la marca, los últimos cuatro dígitos y el titular de la tarjeta,
-- nunca el número completo ni el CVV.
--   metodo:  'tarjeta' (cobrado al reservar) o 'en_destino' (se paga al llegar).
--   estado:  'pagado', 'pendiente' (en destino, por cobrar), 'reembolsado'
--            (tarjeta de una reserva cancelada) o 'anulado' (en destino cancelado).
--   referencia: identificador del pago (PAY + 8 caracteres); autorizacion: código
--            de 6 dígitos que devuelve la pasarela al aprobar una tarjeta.
--   monto:   importe en pesos (igual al total de la reserva).
--   moneda:  moneda del cobro, 'DOP' o 'USD'. En dólares se guardan además el
--            importe cobrado (monto_cobrado) y la tasa usada (pesos por dólar).
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
        monto_cobrado       DECIMAL(12,2)   NULL,
        tasa_cambio         DECIMAL(12,6)   NULL,
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
        CONSTRAINT CK_pagos_moneda CHECK (moneda IN ('DOP', 'USD')),
        CONSTRAINT CK_pagos_cambio CHECK (moneda = 'DOP' OR (monto_cobrado > 0 AND tasa_cambio > 0)),
        CONSTRAINT CK_pagos_tarjeta CHECK (
            metodo = 'en_destino'
            OR (marca IS NOT NULL AND ultimos4 IS NOT NULL AND titular IS NOT NULL AND autorizacion IS NOT NULL))
    );
END
GO

-- Bases instaladas con una versión anterior: columnas del cobro en dólares.
IF COL_LENGTH(N'dbo.pagos', N'monto_cobrado') IS NULL
    ALTER TABLE dbo.pagos ADD monto_cobrado DECIMAL(12,2) NULL, tasa_cambio DECIMAL(12,6) NULL;
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

-- productos: tienda de artesanía dominicana certificada (larimar, ámbar,
-- pintura, café, cacao...). Los vende BookingRD en nombre de talleres locales.
--   taller / origen: quién lo hace y dónde; existencias: unidades a la venta.
IF OBJECT_ID(N'dbo.productos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.productos (
        id_producto         INT IDENTITY(1,1) PRIMARY KEY,
        nombre              NVARCHAR(150)   NOT NULL CONSTRAINT UQ_productos_nombre UNIQUE,
        categoria           VARCHAR(20)     NOT NULL,
        descripcion         NVARCHAR(1000)  NOT NULL,
        taller              NVARCHAR(150)   NOT NULL,
        origen              NVARCHAR(60)    NOT NULL,
        precio              DECIMAL(10,2)   NOT NULL,
        existencias         INT             NOT NULL,
        imagen_url          NVARCHAR(300)   NULL,
        destacado           BIT             NOT NULL CONSTRAINT DF_productos_destacado DEFAULT 0,
        activo              BIT             NOT NULL CONSTRAINT DF_productos_activo DEFAULT 1,
        CONSTRAINT CK_productos_categoria CHECK (categoria IN ('larimar', 'ambar', 'arte', 'cafe-cacao', 'artesania')),
        CONSTRAINT CK_productos_precio CHECK (precio > 0),
        CONSTRAINT CK_productos_existencias CHECK (existencias >= 0)
    );
END
GO

-- pedidos: compras de la tienda. Se pagan con tarjeta al confirmar (pasarela
-- SIMULADA: solo marca, últimos 4 dígitos, titular, referencia y autorización),
-- en pesos o en dólares (pago_moneda, con el importe cobrado y la tasa).
--   entrega:  'hotel' (en la recepción del alojamiento) o 'domicilio'.
--   estado:   'pagado' -> 'enviado' -> 'entregado', o 'cancelado' (reembolsado).
IF OBJECT_ID(N'dbo.pedidos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.pedidos (
        id_pedido           INT IDENTITY(1,1) PRIMARY KEY,
        codigo              CHAR(10)        NOT NULL CONSTRAINT UQ_pedidos_codigo UNIQUE,
        id_usuario          INT             NOT NULL CONSTRAINT FK_pedidos_usuarios REFERENCES dbo.usuarios(id_usuario),
        entrega             VARCHAR(10)     NOT NULL,
        destinatario        NVARCHAR(100)   NOT NULL,
        direccion           NVARCHAR(300)   NOT NULL,
        telefono            VARCHAR(20)     NULL,
        subtotal            DECIMAL(12,2)   NOT NULL,
        envio               DECIMAL(10,2)   NOT NULL,
        total               DECIMAL(12,2)   NOT NULL,
        estado              VARCHAR(12)     NOT NULL CONSTRAINT DF_pedidos_estado DEFAULT 'pagado',
        pago_marca          VARCHAR(20)     NOT NULL,
        pago_ultimos4       CHAR(4)         NOT NULL,
        pago_titular        NVARCHAR(100)   NOT NULL,
        pago_referencia     CHAR(11)        NOT NULL CONSTRAINT UQ_pedidos_referencia UNIQUE,
        pago_autorizacion   CHAR(6)         NOT NULL,
        pago_moneda         CHAR(3)         NOT NULL CONSTRAINT DF_pedidos_moneda DEFAULT 'DOP',
        pago_monto_cobrado  DECIMAL(12,2)   NULL,
        pago_tasa_cambio    DECIMAL(12,6)   NULL,
        fecha_creacion      DATETIME2(0)    NOT NULL CONSTRAINT DF_pedidos_creacion DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_pedidos_entrega CHECK (entrega IN ('hotel', 'domicilio')),
        CONSTRAINT CK_pedidos_estado CHECK (estado IN ('pagado', 'enviado', 'entregado', 'cancelado')),
        CONSTRAINT CK_pedidos_total CHECK (subtotal > 0 AND envio >= 0 AND total = subtotal + envio),
        CONSTRAINT CK_pedidos_moneda CHECK (pago_moneda IN ('DOP', 'USD')),
        CONSTRAINT CK_pedidos_cambio CHECK (pago_moneda = 'DOP' OR (pago_monto_cobrado > 0 AND pago_tasa_cambio > 0))
    );
END
GO

-- pedido_detalle: productos de cada pedido con el precio del momento de la compra.
IF OBJECT_ID(N'dbo.pedido_detalle', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.pedido_detalle (
        id_detalle          INT IDENTITY(1,1) PRIMARY KEY,
        id_pedido           INT             NOT NULL CONSTRAINT FK_detalle_pedidos REFERENCES dbo.pedidos(id_pedido),
        id_producto         INT             NOT NULL CONSTRAINT FK_detalle_productos REFERENCES dbo.productos(id_producto),
        cantidad            INT             NOT NULL,
        precio_unitario     DECIMAL(10,2)   NOT NULL,
        CONSTRAINT UQ_detalle_producto UNIQUE (id_pedido, id_producto),
        CONSTRAINT CK_detalle_cantidad CHECK (cantidad BETWEEN 1 AND 20)
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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_reservas_combo')
    CREATE INDEX IX_reservas_combo ON dbo.reservas (id_combo) WHERE id_combo IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pedidos_usuario')
    CREATE INDEX IX_pedidos_usuario ON dbo.pedidos (id_usuario, fecha_creacion);
GO

-- -----------------------------------------------------------------------------
-- 4. Datos de demostración
-- -----------------------------------------------------------------------------
-- Generado por scripts/generar-sql.js a partir de database/datos-demo.js.
-- No editar a mano: los cambios se pierden al volver a generar.
--
-- Contraseñas de demostración (hash bcrypt de 10 rondas):
--   admin@bookingrd.com      Admin123!     administración de la plataforma
--   cliente@bookingrd.com    Cliente123!   viajero (también los demás viajeros de ejemplo)
--   empresa@bookingrd.com    Empresa123!   Bahía Caribe Tours
--   hoteles@bookingrd.com    Empresa123!   Coralia Hotels & Resorts
--   aventura@bookingrd.com   Empresa123!   Aventura Quisqueya
--   montana@bookingrd.com    Empresa123!   Montaña Verde Ecotours
--   cultura@bookingrd.com    Empresa123!   Raíces Dominicanas Tours
--   autos@bookingrd.com      Empresa123!   Caribe Rent a Car
--   rentacar@bookingrd.com   Empresa123!   Ozama Rent a Car
--   equipo@bookingrd.com     Empresa123!   Equipo & Lente Aventura
--
-- Cada inserción se omite si el registro ya existe, por lo que el script
-- puede ejecutarse más de una vez.

-- 4.1 Cuentas de administración, viajeros y representantes de empresas
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'admin@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Equipo BookingRD', N'admin@bookingrd.com', NULL, N'$2b$10$cjMFwZZ93VU.uubX76EFruIXUaj1Xjn.4sk3k3Gffx9LC2.S/X2ji', N'admin', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'cliente@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'María Rodríguez', N'cliente@bookingrd.com', N'809-555-0190', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'luis.fernandez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Luis Fernández', N'luis.fernandez@correo.com', N'829-555-0111', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'carmen.jimenez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Carmen Jiménez', N'carmen.jimenez@correo.com', N'849-555-0122', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'daniel.ortiz@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Daniel Ortiz', N'daniel.ortiz@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'ana.castillo@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Ana Belén Castillo', N'ana.castillo@correo.com', N'809-555-0131', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'roberto.sanchez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Roberto Sánchez', N'roberto.sanchez@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'patricia.nunez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Patricia Núñez', N'patricia.nunez@correo.com', N'829-555-0144', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'miguel.herrera@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Miguel Ángel Herrera', N'miguel.herrera@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'yesenia.paulino@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Yesenia Paulino', N'yesenia.paulino@correo.com', N'849-555-0156', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'andres.cabrera@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Andrés Cabrera', N'andres.cabrera@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'laura.vasquez@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Laura Vásquez', N'laura.vasquez@correo.com', N'809-555-0167', N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'hector.marte@correo.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Héctor Marte', N'hector.marte@correo.com', NULL, N'$2b$10$vyE683kNv9zJDAxZLG53qeQ0uLLshumOyOtIh6bwoIsmRDrA9JNZ6', N'cliente', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'empresa@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Carlos Peña', N'empresa@bookingrd.com', N'809-555-0101', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'hoteles@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Laura Méndez', N'hoteles@bookingrd.com', N'809-555-0120', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'aventura@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'José Almonte', N'aventura@bookingrd.com', N'809-555-0133', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'montana@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Ana Lucía Taveras', N'montana@bookingrd.com', N'809-555-0145', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'cultura@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Pedro Guzmán', N'cultura@bookingrd.com', N'809-555-0158', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'autos@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Ramón Batista', N'autos@bookingrd.com', N'809-555-0170', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'rentacar@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Gabriela Rosario', N'rentacar@bookingrd.com', N'809-555-0181', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = N'equipo@bookingrd.com')
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (N'Marisol Peralta', N'equipo@bookingrd.com', N'809-555-0192', N'$2b$10$WLULWZV2s8IiRHwjGVPRsO2Cd0/h6EhI1BLOTmSvPxZl6p/5WTFEO', N'empresa', 1);
GO
-- 4.2 Empresas
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'131456789')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Gerente general', N'Bahía Caribe Tours', N'Bahía Caribe Tours SRL', N'131456789', N'809-538-2020', N'Samaná', N'Samaná', N'Av. Malecón 45, Santa Bárbara de Samaná', NULL, N'MITUR-SAM-0142', N'mixto', N'resort', 96, N'tour-playa,tour-montana,cultural', N'Operador de la península de Samaná con alojamiento frente a la bahía y excursiones a cayos, cascadas y parques nacionales.'
    FROM dbo.usuarios u WHERE u.correo = N'empresa@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'132508741')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Directora comercial', N'Coralia Hotels & Resorts', N'Coralia Hoteles del Caribe SRL', N'132508741', N'809-552-4000', N'La Altagracia', N'Punta Cana', N'Blvd. Turístico del Este km 28, Bávaro', N'https://coralia.example.com', N'MITUR-ALT-0877', N'alojamiento', N'resort', 1450, NULL, N'Cadena dominicana de resorts y hoteles de playa y ciudad en las principales zonas turísticas del país.'
    FROM dbo.usuarios u WHERE u.correo = N'hoteles@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'131998452')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Socio gerente', N'Aventura Quisqueya', N'Aventura Quisqueya Excursiones SRL', N'131998452', N'809-466-7788', N'La Altagracia', N'Punta Cana', N'Plaza Bávaro, local 12, Bávaro', NULL, N'MITUR-ALT-1203', N'actividades', NULL, NULL, N'tour-playa,zip-line,motocross,acuaticas', N'Excursiones de aventura en el este y el norte del país: buggies, canopy, catamaranes y snorkel.'
    FROM dbo.usuarios u WHERE u.correo = N'aventura@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'130774519')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Administradora', N'Montaña Verde Ecotours', N'Montaña Verde Ecoturismo EIRL', N'130774519', N'809-574-2121', N'La Vega', N'Jarabacoa', N'Calle Independencia 18, Jarabacoa', NULL, N'MITUR-LVG-0391', N'actividades', NULL, NULL, N'tour-montana,tour-gastronomico,zip-line,motocross', N'Guías certificados de montaña para senderismo, cabalgatas y rutas de café en la Cordillera Central.'
    FROM dbo.usuarios u WHERE u.correo = N'montana@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'132115630')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Director', N'Raíces Dominicanas Tours', N'Raíces Dominicanas Turismo Cultural SRL', N'132115630', N'809-686-3030', N'Distrito Nacional', N'Santo Domingo', N'Calle El Conde 205, Zona Colonial', NULL, N'MITUR-DN-0566', N'actividades', NULL, NULL, N'cultural,tour-gastronomico,tour-playa,acuaticas', N'Turismo cultural, histórico y gastronómico con guías locales en todo el país.'
    FROM dbo.usuarios u WHERE u.correo = N'cultura@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'132667418')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Gerente de operaciones', N'Caribe Rent a Car', N'Caribe Rent a Car SRL', N'132667418', N'809-959-2277', N'La Altagracia', N'Punta Cana', N'Aeropuerto Internacional de Punta Cana, terminal B', NULL, NULL, N'vehiculos', NULL, NULL, NULL, N'Alquiler de autos con mostradores en Punta Cana y Las Terrenas: SUV, pickups 4x4 y convertibles con asistencia en carretera 24 horas.'
    FROM dbo.usuarios u WHERE u.correo = N'autos@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'131778902')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Directora', N'Ozama Rent a Car', N'Ozama Autos y Transporte SRL', N'131778902', N'809-549-0303', N'Santo Domingo', N'Boca Chica', N'Aeropuerto Internacional Las Américas, nivel de llegadas', N'https://ozama-rent.example.com', NULL, N'vehiculos', NULL, NULL, NULL, N'Flota de autos económicos y ejecutivos en los aeropuertos de Santo Domingo y Puerto Plata, con devolución en otras ciudades.'
    FROM dbo.usuarios u WHERE u.correo = N'rentacar@bookingrd.com';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = N'131225874')
    INSERT INTO dbo.empresas (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono, provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio, tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
    SELECT u.id_usuario, N'Fundadora', N'Equipo & Lente Aventura', N'Equipo y Lente Aventura SRL', N'131225874', N'809-571-4455', N'Puerto Plata', N'Cabarete', N'Calle Principal 32, frente a Kite Beach, Cabarete', NULL, N'MITUR-PPL-0918', N'actividades', NULL, NULL, N'alquiler-equipo,fotografia', N'Alquiler de equipo de montaña, playa y río con entrega en tu hotel, y fotógrafos y pilotos de dron certificados que acompañan tus aventuras.'
    FROM dbo.usuarios u WHERE u.correo = N'equipo@bookingrd.com';
GO
-- 4.3 Alojamiento
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Coralia Grand Resort & Spa')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Coralia Grand Resort & Spa', N'resort', N'Punta Cana', N'Playa Bávaro, Punta Cana', N'Resort todo incluido frente a la playa de Bávaro, con piscinas rodeadas de palmeras, cabañas privadas, spa y siete restaurantes.', N'todo-incluido,piscina,playa,spa,gimnasio,restaurante,wifi,aire,traslado', 14500, 4, 320, N'img/publicaciones/coralia-grand.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -300, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Cayo Azul All-Inclusive Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Cayo Azul All-Inclusive Resort', N'resort', N'Punta Cana', N'Playa Arena Gorda, Bávaro', N'Palapas privadas sobre la arena blanca de Arena Gorda, piscinas conectadas con la playa y entretenimiento diurno y nocturno.', N'todo-incluido,piscina,playa,restaurante,wifi,aire,gimnasio', 12800, 4, 280, N'img/publicaciones/cayo-azul.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -297, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Azura Caribbean Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Azura Caribbean Resort', N'hotel', N'Santo Domingo', N'Av. Anacaona, Los Cacicazgos', N'Hotel de ciudad frente al Parque Mirador Sur, con vista al mar Caribe, canchas de tenis y piscina tipo laguna.', N'piscina,restaurante,gimnasio,wifi,aire,estacionamiento,traslado', 6900, 3, 180, N'img/publicaciones/azura-caribbean.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -294, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Mirador del Mar Luxury Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Mirador del Mar Luxury Resort', N'boutique', N'Cabarete', N'Carretera Sosúa-Cabarete, Cabarete', N'Suites de piedra y madera con terraza privada, piscina individual y vista al Atlántico. Solo para adultos.', N'piscina,spa,restaurante,wifi,aire,desayuno', 9800, 2, 36, N'img/publicaciones/mirador-del-mar.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -291, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Solaria Island Beach Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Solaria Island Beach Resort', N'resort', N'La Romana', N'Playa Dominicus, Bayahibe', N'Resort frente a la playa Dominicus, punto de salida de las excursiones a Isla Saona y a Isla Catalina.', N'todo-incluido,piscina,playa,restaurante,wifi,aire', 11200, 4, 240, N'img/publicaciones/solaria-island.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -288, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Bahía Serena Golf & Beach Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Bahía Serena Golf & Beach Resort', N'resort', N'Boca Chica', N'Calle Duarte, Boca Chica', N'Habitaciones con ventanales y vista a la ciudad costera, frente a la laguna de aguas tranquilas de Boca Chica y a 15 minutos del aeropuerto de Las Américas.', N'todo-incluido,piscina,playa,gimnasio,wifi,aire,estacionamiento', 8700, 4, 150, N'img/publicaciones/bahia-serena.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -285, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Costa Dorada Palace Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Costa Dorada Palace Resort', N'resort', N'Sosúa', N'Playa Alicia, Sosúa', N'Habitaciones amplias de diseño contemporáneo sobre la bahía de Sosúa, conocida por sus arrecifes de coral y su malecón peatonal.', N'todo-incluido,piscina,playa,spa,restaurante,wifi,aire', 9400, 4, 210, N'img/publicaciones/costa-dorada.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -282, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Palma Real Haven Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Palma Real Haven Resort', N'villa', N'Juan Dolio', N'Autopista Las Américas km 55, Juan Dolio', N'Villas privadas entre cocoteros con piscina, ranchos de techo de cana y área de barbacoa, a cinco minutos de la playa.', N'piscina,wifi,aire,estacionamiento,mascotas,restaurante', 16500, 8, 12, N'img/publicaciones/palma-real-haven.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -279, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Samaná Bay Palms Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Samaná Bay Palms Resort', N'resort', N'Samaná', N'Carretera Las Galeras km 4, Samaná', N'Habitaciones con vista a una playa de arena blanca en la bahía de Samaná, punto de salida de los paseos a Cayo Levantado y de avistamiento de ballenas.', N'piscina,playa,restaurante,wifi,aire,desayuno', 7800, 4, 96, N'img/publicaciones/samana-bay-palms.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -276, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Paraíso Escondido Eco-Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Paraíso Escondido Eco-Resort', N'villa', N'Las Galeras', N'Camino a Playa Rincón, Las Galeras', N'Villas ecológicas sobre la colina con piscina infinita, jardines tropicales y vista al mar abierto.', N'piscina,desayuno,wifi,spa', 13200, 4, 10, N'img/publicaciones/paraiso-escondido.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -273, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Villa Acantilado Casa de Campo')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Villa Acantilado Casa de Campo', N'villa', N'La Romana', N'Casa de Campo, La Romana', N'Villa de cinco habitaciones sobre el acantilado, con piscina, terraza frente al mar Caribe, playa privada con sombrillas y servicio de mayordomo.', N'piscina,playa,wifi,aire,estacionamiento,traslado,desayuno', 38500, 10, 2, N'img/publicaciones/villa-casa-de-campo.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -270, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Torre Malecón Suites')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Torre Malecón Suites', N'apartamento', N'Santo Domingo', N'Av. Winston Churchill, Piantini, Santo Domingo', N'Apartamentos de una y dos habitaciones en el polígono central, con cocina equipada, vista a la ciudad y a pocos minutos del Malecón y la Zona Colonial.', N'wifi,aire,gimnasio,piscina,estacionamiento', 6200, 4, 24, N'img/publicaciones/torre-malecon.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -267, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Hotel Boutique El Conde')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Hotel Boutique El Conde', N'boutique', N'Santo Domingo', N'Calle El Conde 410, Zona Colonial, Santo Domingo', N'Hotel boutique en una casona restaurada de la calle peatonal El Conde, con recepción 24 horas, desayuno criollo y la Catedral Primada a dos cuadras.', N'wifi,aire,desayuno,restaurante,traslado', 7400, 3, 28, N'img/publicaciones/hotel-el-conde.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -264, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Atlántico Business Hotel')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Atlántico Business Hotel', N'hotel', N'Puerto Plata', N'Av. Luis Ginebra, Puerto Plata', N'Hotel de ciudad frente al Malecón de Puerto Plata, con salas de reuniones, gimnasio y check-in rápido para viajes de trabajo.', N'wifi,aire,gimnasio,piscina,estacionamiento,restaurante', 5600, 2, 60, N'img/publicaciones/atlantico-business.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -261, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Palmar de Bávaro Beach Resort')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Palmar de Bávaro Beach Resort', N'resort', N'Punta Cana', N'Playa Bávaro, Av. Alemania, Punta Cana', N'Resort todo incluido entre cocoteros, con piscinas conectadas por puentes de madera, siete restaurantes y acceso directo a la arena blanca de Bávaro.', N'wifi,piscina,playa,todo-incluido,restaurante,spa,gimnasio,aire,traslado', 16800, 4, 220, N'img/publicaciones/palmar-bavaro.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -258, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132508741';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.hoteles WHERE nombre = N'Cabañas Río Yaque')
    INSERT INTO dbo.hoteles (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios, precio_noche, capacidad_personas, habitaciones, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Cabañas Río Yaque', N'cabana', N'Jarabacoa', N'Camino a La Confluencia km 2, Jarabacoa', N'Cabañas de piedra y madera a orillas del río Yaque del Norte, con chimenea, cama king, desayuno de campo y salida a pie a los saltos de Jimenoa y Baiguate.', N'desayuno,wifi,estacionamiento,restaurante,mascotas', 5200, 3, 8, N'img/publicaciones/cabanas-rio-yaque.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -255, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
-- 4.4 Actividades
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Excursión en catamarán a Isla Saona')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Excursión en catamarán a Isla Saona', N'tour-playa', N'La Romana', N'Muelle de Bayahibe', N'Navegación en catamarán hasta Isla Saona, almuerzo en la playa y regreso en lancha rápida con parada en la piscina natural.', N'Transporte, catamarán, almuerzo buffet, bebidas y parada en la piscina natural', 9, 5900, 60, N'img/publicaciones/isla-saona.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -300, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Excursión a Playa Rincón y Cabo Cabrón')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Excursión a Playa Rincón y Cabo Cabrón', N'tour-playa', N'Las Terrenas', N'Calle Duarte, Las Terrenas', N'Salida desde Las Terrenas, recorrido en lancha por los acantilados de Cabo Cabrón y día libre en Playa Rincón, una de las playas vírgenes más extensas del país.', N'Transporte, lancha, guía, almuerzo de pescado frito y bebidas', 7, 3200, 20, N'img/publicaciones/playa-rincon.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -297, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Bahía de las Águilas en bote')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Bahía de las Águilas en bote', N'tour-playa', N'Pedernales', N'Muelle de La Cueva, Cabo Rojo', N'Travesía en bote por los acantilados y la costa árida del Parque Nacional Jaragua hasta los ocho kilómetros de arena blanca de Bahía de las Águilas.', N'Bote, guía naturalista, almuerzo y equipo de snorkel', 7, 3600, 18, N'img/publicaciones/bahia-aguilas.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -294, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Senderismo al Salto El Limón')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Senderismo al Salto El Limón', N'tour-montana', N'Samaná', N'Comunidad de El Limón', N'Sendero entre la selva húmeda de la península hasta la cascada de 40 metros del Salto El Limón, con baño en la poza.', N'Guía local, caballo opcional, almuerzo criollo', 4, 2200, 30, N'img/publicaciones/salto-el-limon.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -291, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ascenso al Pico Duarte')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Ascenso al Pico Duarte', N'tour-montana', N'Jarabacoa', N'La Ciénaga de Manabao', N'Expedición de tres días al punto más alto del Caribe (3,098 m) por bosques de pino, con amanecer sobre el mar de nubes junto al busto de Duarte.', N'Guías certificados, mulas de carga, comidas, permisos y equipo de campamento', 72, 14500, 12, N'img/publicaciones/pico-duarte.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -288, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Valle del Rincón y cascadas de Jarabacoa')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Valle del Rincón y cascadas de Jarabacoa', N'tour-montana', N'Jarabacoa', N'Parque central de Jarabacoa', N'Ruta por el Valle del Rincón con visita a los saltos de Jimenoa y Baiguate y miradores sobre el río Yaque del Norte.', N'Transporte, guía, entrada a los saltos y almuerzo', 5, 2400, 20, N'img/publicaciones/valle-rincon.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -285, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Cabalgata a los cafetales de la Cordillera')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Cabalgata a los cafetales de la Cordillera', N'tour-gastronomico', N'Jarabacoa', N'Rancho Montaña Verde, Jarabacoa', N'Recorrido a caballo por fincas de café, con explicación del proceso del grano y degustación en una casa de campo.', N'Caballo, guía, cata de café de altura y almuerzo campestre', 4, 2600, 14, N'img/publicaciones/cabalgata-cafetales.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -282, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ruta del cacao orgánico')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Ruta del cacao orgánico', N'tour-gastronomico', N'Río San Juan', N'Parque central de Río San Juan', N'Visita a una comunidad productora de cacao orgánico: del árbol a la tableta de chocolate hecha por los visitantes.', N'Transporte, visita a la finca, taller de chocolate y almuerzo', 5, 2300, 20, N'img/publicaciones/ruta-cacao.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -279, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Desayuno criollo y Mercado Modelo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Desayuno criollo y Mercado Modelo', N'tour-gastronomico', N'Santo Domingo', N'Mercado Modelo, Av. Mella', N'Mañana de sabores: desayuno de mangú con salami, queso frito y huevos, y recorrido por los puestos de frutas, especias y dulces del Mercado Modelo.', N'Guía gastronómico, desayuno de mangú con los tres golpes, jugos naturales y degustaciones', 3, 1800, 16, N'img/publicaciones/desayuno-criollo.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -276, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Clase de cocina: sancocho dominicano')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Clase de cocina: sancocho dominicano', N'tour-gastronomico', N'Boca Chica', N'Casa de cocina La Caldera, Boca Chica', N'Aprende a preparar el sancocho de siete carnes con víveres de la tierra y compártelo en la mesa con el chef y el grupo.', N'Ingredientes, chef instructor, recetario y almuerzo', 3, 2700, 12, N'img/publicaciones/sancocho.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -273, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Almuerzo típico: la bandera dominicana')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Almuerzo típico: la bandera dominicana', N'tour-gastronomico', N'Juan Dolio', N'Comedor Doña Rosa, Juan Dolio', N'Arroz blanco, habichuelas guisadas, pollo criollo, ensalada y tostones en un comedor familiar, con la historia de cada plato.', N'Almuerzo completo, bebida natural y postre de la casa', 2, 1200, 24, N'img/publicaciones/almuerzo-bandera.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -270, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Zona Colonial a pie: Catedral Primada y Parque Colón', N'cultural', N'Santo Domingo', N'Parque Colón, Zona Colonial', N'Recorrido por la primera ciudad del Nuevo Mundo: Catedral Primada, Parque Colón, Alcázar de Colón, Calle Las Damas y Panteón Nacional.', N'Guía historiador y entradas al Alcázar de Colón y al Museo de las Casas Reales', 3, 1500, 25, N'img/publicaciones/zona-colonial.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -267, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Parque Nacional Los Haitises y cuevas taínas')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Parque Nacional Los Haitises y cuevas taínas', N'cultural', N'Samaná', N'Muelle de Samaná', N'Navegación entre cayos y manglares hasta las cuevas de la Arena y de la Línea, con pictografías taínas.', N'Lancha, guía, entrada al parque y almuerzo', 6, 3400, 24, N'img/publicaciones/los-haitises.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -264, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Basílica de Higüey y Altos de Chavón')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Basílica de Higüey y Altos de Chavón', N'cultural', N'Punta Cana', N'Recogida en el hotel (zona Bávaro)', N'Visita a la Basílica de Nuestra Señora de la Altagracia y al pueblo de estilo mediterráneo de Altos de Chavón, con su anfiteatro sobre el río.', N'Transporte, guía, entradas y almuerzo', 7, 3900, 30, N'img/publicaciones/basilica-higuey.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -261, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Puerto Plata victoriana y Calle de la Sombrilla')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Puerto Plata victoriana y Calle de la Sombrilla', N'cultural', N'Puerto Plata', N'Parque Independencia, Puerto Plata', N'Casas victorianas, la Calle de la Sombrilla, la Fortaleza San Felipe y el Museo del Ámbar en el centro histórico de Puerto Plata.', N'Guía local, entrada a la Fortaleza San Felipe y degustación de chocolate', 3, 1700, 25, N'img/publicaciones/puerto-plata-victoriana.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -258, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Santiago de los Caballeros y su Monumento')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Santiago de los Caballeros y su Monumento', N'cultural', N'Puerto Plata', N'Parque central de Puerto Plata', N'Excursión a la ciudad corazón del Cibao: Monumento a los Héroes de la Restauración, Centro León y una fábrica de cigarros artesanales.', N'Transporte, guía, entrada al Monumento y al Centro León, almuerzo', 8, 3500, 20, N'img/publicaciones/monumento-santiago.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -255, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Canopy en la selva de Anamuya')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Canopy en la selva de Anamuya', N'zip-line', N'Punta Cana', N'Recogida en el hotel (zona Bávaro)', N'Doce líneas de tirolesa sobre las montañas de Anamuya, con plataformas en los árboles y una línea de 700 metros.', N'Transporte, equipo certificado, 12 líneas de tirolesa y refrigerio', 4, 4200, 24, N'img/publicaciones/canopy-anamuya.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -252, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Vuelo en parapente sobre el valle de Constanza')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Vuelo en parapente sobre el valle de Constanza', N'zip-line', N'Constanza', N'Mirador de Constanza', N'Vuelo biplaza con piloto certificado sobre el valle agrícola más alto del Caribe, sin experiencia previa.', N'Piloto certificado, equipo completo, fotos y video del vuelo', 2, 5500, 8, N'img/publicaciones/parapente-constanza.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -249, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ruta en cuatrimoto por Valle Nuevo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Ruta en cuatrimoto por Valle Nuevo', N'motocross', N'Constanza', N'Parque central de Constanza', N'Recorrido en cuatrimoto por las carreteras y caminos de montaña de Constanza, entre fincas y lomas, hasta las pirámides de Valle Nuevo.', N'Cuatrimoto, casco, guía, merienda y almuerzo campestre', 5, 5200, 10, N'img/publicaciones/cuatrimoto-constanza.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -246, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Snorkel en los arrecifes de Isla Catalina')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Snorkel en los arrecifes de Isla Catalina', N'acuaticas', N'La Romana', N'Marina de Casa de Campo', N'Snorkel en las paredes de coral de Isla Catalina, con peces tropicales, esponjas y aguas de visibilidad excepcional.', N'Barco, equipo de snorkel, guía de buceo y almuerzo', 7, 4600, 40, N'img/publicaciones/snorkel-catalina.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -243, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'27 Charcos de Damajagua')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'27 Charcos de Damajagua', N'acuaticas', N'Puerto Plata', N'Centro de visitantes de Damajagua, Imbert', N'Descenso por saltos y toboganes naturales de piedra caliza en el río Damajagua, acompañado por guías.', N'Transporte, casco, chaleco, guías y almuerzo', 5, 3100, 30, N'img/publicaciones/27-charcos.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -240, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Paseo en yate por la Marina de Casa de Campo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Paseo en yate por la Marina de Casa de Campo', N'acuaticas', N'La Romana', N'Marina Casa de Campo, muelle principal', N'Salida desde la marina hacia la desembocadura del río Chavón y la costa de La Romana, con parada para nadar y snorkel.', N'Yate con capitán, bebidas, snorkel en la desembocadura del río Chavón', 4, 7800, 12, N'img/publicaciones/marina-casa-de-campo.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -237, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Día de parque acuático en Punta Cana')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Día de parque acuático en Punta Cana', N'acuaticas', N'Punta Cana', N'Recepción del parque, Bávaro', N'Toboganes de espiral, piscinas y zona infantil para pasar el día en familia, con almuerzo incluido.', N'Entrada, toboganes, piscinas, almuerzo y casillero', 6, 2900, 80, N'img/publicaciones/parque-acuatico.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -234, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Golf en Teeth of the Dog, Casa de Campo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Golf en Teeth of the Dog, Casa de Campo', N'golf', N'La Romana', N'Casa Club de Casa de Campo, La Romana', N'Ronda de 18 hoyos en el campo diseñado por Pete Dye, con siete hoyos junto al mar Caribe. Alquiler de palos disponible.', N'Green fee de 18 hoyos, carrito compartido, cubeta de práctica y caddie', 5, 18500, 16, N'img/publicaciones/golf-casa-de-campo.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -231, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Parque Nacional Los Tres Ojos')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Parque Nacional Los Tres Ojos', N'cultural', N'Santo Domingo', N'Entrada del parque, Av. Las Américas, Santo Domingo Este', N'Descenso guiado a las cuatro lagunas de agua dulce dentro de cavernas de piedra caliza, con cruce en balsa hacia el cuarto ojo y explicación de su uso por los taínos.', N'Guía, entrada al parque, cruce en balsa y agua', 2.5, 1450, 30, N'img/publicaciones/tres-ojos.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -228, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Plaza de la Cultura y Biblioteca Nacional')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Plaza de la Cultura y Biblioteca Nacional', N'cultural', N'Santo Domingo', N'Monumento a Lemba, Plaza de la Cultura, Av. Máximo Gómez', N'Recorrido por los museos de la Plaza de la Cultura, el Teatro Nacional y la Biblioteca Nacional Pedro Henríquez Ureña, con la historia del cimarrón Lemba frente a su monumento.', N'Guía de historia, entradas a dos museos y transporte desde la Zona Colonial', 4, 2200, 20, N'img/publicaciones/plaza-cultura.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -225, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Noche de tambores y son en la Zona Colonial')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Noche de tambores y son en la Zona Colonial', N'cultural', N'Santo Domingo', N'Parque Colón, frente a la Catedral Primada', N'Paseo nocturno por las calles iluminadas de la Ciudad Colonial que termina en una peña de son y tambores con músicos locales y clase corta de baile.', N'Guía, clase de baile, una bebida y entrada a la peña', 3, 1900, 24, N'img/publicaciones/tambores-zona-colonial.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -222, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ruta de bachata y karaoke en Sosúa')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Ruta de bachata y karaoke en Sosúa', N'cultural', N'Sosúa', N'Calle Pedro Clisante, Sosúa', N'Noche por los bares de Sosúa con un anfitrión local: bachata en vivo, karaoke y la historia musical de la costa norte, con transporte de regreso al hotel.', N'Anfitrión, dos bebidas, entradas y transporte de regreso', 4, 2400, 16, N'img/publicaciones/bachata-sosua.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -219, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Mirador de San José de Ocoa por Valle Nuevo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Mirador de San José de Ocoa por Valle Nuevo', N'tour-montana', N'Constanza', N'Parque central de Constanza', N'Travesía en 4x4 por el Parque Nacional Valle Nuevo hasta los miradores de San José de Ocoa, con parada en las Pirámides y almuerzo campestre.', N'Transporte 4x4, guía, almuerzo y entrada al parque', 8, 3900, 12, N'img/publicaciones/mirador-ocoa.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -216, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Tirolesa sobre la península de Samaná')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Tirolesa sobre la península de Samaná', N'zip-line', N'Samaná', N'Base de la tirolesa, carretera Samaná - Las Galeras km 6', N'Doce líneas de tirolesa sobre el bosque húmedo con vista a la bahía de Samaná, incluida la línea final de 600 metros. Apta desde los 8 años.', N'Equipo de seguridad, guías certificados, transporte desde Samaná y fruta', 3, 4300, 40, N'img/publicaciones/tirolesa-samana.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -213, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Vuelo en helicóptero sobre Punta Cana')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Vuelo en helicóptero sobre Punta Cana', N'zip-line', N'Punta Cana', N'Helipuerto de Bávaro, Av. Barceló', N'Vuelo panorámico de 20 minutos sobre las playas de Bávaro, Cabeza de Toro y Cap Cana, con salida desde Bávaro y recogida en tu hotel.', N'Vuelo, piloto, auriculares, recogida y regreso al hotel', 1.5, 9800, 18, N'img/publicaciones/helicoptero-punta-cana.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -210, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Paseo en yate privado desde Boca Chica')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Paseo en yate privado desde Boca Chica', N'acuaticas', N'Boca Chica', N'Marina Zarpar, Boca Chica', N'Yate privado para hasta 10 personas con parada para nadar en las aguas tranquilas de la bahía de Boca Chica y en La Matica, con música y bebidas a bordo.', N'Capitán, tripulación, bebidas, snacks y equipo de snorkel', 4, 5200, 10, N'img/publicaciones/yate-boca-chica.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -207, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Catamarán privado por la bahía de Samaná')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Catamarán privado por la bahía de Samaná', N'tour-playa', N'Samaná', N'Muelle turístico de Samaná, Malecón', N'Catamarán a motor para grupos pequeños: Cayo Levantado, la costa de Los Haitises y, entre enero y marzo, avistamiento de ballenas jorobadas.', N'Capitán, guía, almuerzo a bordo, bebidas y entrada a Cayo Levantado', 6, 6900, 12, N'img/publicaciones/catamaran-samana.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -204, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Moto acuática en playa Bávaro')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Moto acuática en playa Bávaro', N'acuaticas', N'Punta Cana', N'Playa Bávaro, frente al Palmar de Bávaro Beach Resort', N'Media hora en moto acuática por la costa de Bávaro con instructor, para una o dos personas por moto. No se necesita experiencia.', N'Moto acuática, chaleco, instrucción y combustible', 0.5, 3200, 30, N'img/publicaciones/moto-acuatica.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -201, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Teleférico de Puerto Plata y Cristo Redentor')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Teleférico de Puerto Plata y Cristo Redentor', N'cultural', N'Puerto Plata', N'Estación del teleférico, Av. Manolo Tavárez Justo', N'Subida en teleférico a la Loma Isabel de Torres, a casi 800 metros sobre el Atlántico: jardín botánico en la cima, el Cristo Redentor y la vista de toda la bahía de Puerto Plata.', N'Transporte desde el hotel, boleto del teleférico, guía y agua', 3, 2100, 40, N'img/publicaciones/teleferico-puerto-plata.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -198, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Canyoning y tubing en el río Jimenoa')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Canyoning y tubing en el río Jimenoa', N'tour-montana', N'Jarabacoa', N'Base de Montaña Verde, Calle Independencia 18, Jarabacoa', N'Descenso con cuerdas por el cañón del río Jimenoa, saltos a pozas de agua cristalina y regreso flotando en neumático por los rápidos suaves. El único río del Caribe donde se hace rafting de verdad está a la vuelta.', N'Guías certificados, casco, arnés, traje de neopreno, neumático y almuerzo de campo', 5, 3600, 16, N'img/publicaciones/canyoning-jarabacoa.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -195, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Clase de bachata y merengue en la Zona Colonial')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Clase de bachata y merengue en la Zona Colonial', N'cultural', N'Santo Domingo', N'Plaza de España, frente al Alcázar de Colón', N'Hora y media de clase con bailarines profesionales para aprender los pasos básicos de la bachata y el merengue, y después a practicar con música en vivo en un colmadón de la Zona Colonial.', N'Clase, una bebida y entrada al local con música en vivo', 3, 1600, 24, N'img/publicaciones/clase-bachata.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -192, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Aves endémicas de Los Haitises')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Aves endémicas de Los Haitises', N'tour-montana', N'Samaná', N'Muelle de Sabana de la Mar', N'Recorrido en bote y a pie con un guía ornitólogo para ver la cotorra de La Española, el gavilán de La Española y las colonias de pelícanos y fragatas entre los mogotes del parque nacional.', N'Guía especialista, binoculares, bote, entrada al parque y merienda', 5, 3800, 12, N'img/publicaciones/aves-los-haitises.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -189, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131456789';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Montaña Redonda: columpios y tirolesa')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Montaña Redonda: columpios y tirolesa', N'zip-line', N'Miches', N'Parqueo de Montaña Redonda, carretera Miches-Sabana de la Mar', N'Subida en camión 4x4 a la cima de Montaña Redonda, columpios gigantes con vista de 360 grados a las lagunas Redonda y Limón y descenso por tirolesa. Termina en Playa Esmeralda.', N'Transporte 4x4, entrada, tirolesa con equipo de seguridad y tiempo libre en Playa Esmeralda', 6, 3900, 30, N'img/publicaciones/montana-redonda.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -186, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131998452';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Barahona: Río Los Patos y balneario San Rafael')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Barahona: Río Los Patos y balneario San Rafael', N'tour-playa', N'Barahona', N'Parque central de Barahona', N'Ruta por la costa sur entre montaña y mar: el balneario de San Rafael con sus pozas escalonadas y el Río Los Patos, el río más corto del país, que desemboca en el Caribe. Parada en el mirador de Paraíso.', N'Transporte, guía, almuerzo de pescado frito con tostones y bebidas', 7, 2900, 20, N'img/publicaciones/rio-los-patos.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -183, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132115630';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Ruta de las fresas y las flores de Constanza')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Ruta de las fresas y las flores de Constanza', N'tour-gastronomico', N'Constanza', N'Parque central de Constanza', N'Visita a fincas de fresas, invernaderos de flores y huertos del valle más alto del Caribe, con degustación de fresas con crema, dulces de leche y café de altura.', N'Transporte entre fincas, guía, degustaciones y una caja de fresas para llevar', 4, 1900, 20, N'img/publicaciones/fresas-constanza.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -180, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'130774519';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Kit de camping de montaña')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Kit de camping de montaña', N'alquiler-equipo', N'Constanza', N'Entrega en tu alojamiento de Constanza o en Valle Nuevo', N'Casa de campaña para dos personas resistente a la lluvia, dos bolsas de dormir para temperaturas bajo cero, aislantes y linterna frontal. Pensado para las noches frías de Valle Nuevo.', N'Casa de campaña, 2 bolsas de dormir, 2 aislantes, linterna frontal y entrega', 24, 1400, 10, N'img/publicaciones/kit-camping.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -177, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Abrigo térmico, gorro y guantes')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Abrigo térmico, gorro y guantes', N'alquiler-equipo', N'Jarabacoa', N'Entrega en tu alojamiento de Jarabacoa o Constanza', N'Abrigo de plumón, gorro y guantes para subir al Pico Duarte o pasar la noche en la montaña, en tallas S a XL. Se lavan y desinfectan después de cada uso.', N'Abrigo, gorro, guantes y entrega', 24, 450, 30, N'img/publicaciones/abrigo-termico.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -174, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Equipo de snorkel completo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Equipo de snorkel completo', N'alquiler-equipo', N'La Romana', N'Entrega en tu hotel de Bayahíbe o La Romana', N'Máscara de vidrio templado, tubo con válvula seca y aletas ajustables para los arrecifes de Isla Catalina, Isla Saona y Playa Dominicus.', N'Máscara, tubo, aletas, bolsa de malla y entrega', 24, 450, 40, N'img/publicaciones/kit-snorkel.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -171, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Tabla de paddleboard con chaleco')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Tabla de paddleboard con chaleco', N'alquiler-equipo', N'Las Terrenas', N'Playa Bonita, Las Terrenas', N'Tabla inflable de paddle surf estable para principiantes, remo de aluminio y chaleco salvavidas. Ideal para las aguas tranquilas de Playa Bonita y Cosón por la mañana.', N'Tabla, remo, chaleco salvavidas e indicaciones básicas', 24, 1600, 12, N'img/publicaciones/paddleboard.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -168, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Chalecos salvavidas certificados')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Chalecos salvavidas certificados', N'alquiler-equipo', N'Cabarete', N'Tienda en Kite Beach, Cabarete', N'Chalecos salvavidas certificados para adultos y niños, para kayak, paseos en bote o ríos. Se entregan revisados y con tallas a tu medida.', N'Chaleco salvavidas por persona y entrega en Cabarete o Sosúa', 24, 250, 50, N'img/publicaciones/chaleco-salvavidas.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -165, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Neverita portátil con hielo')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Neverita portátil con hielo', N'alquiler-equipo', N'Punta Cana', N'Entrega en tu hotel de Bávaro o Punta Cana', N'Nevera portátil de 30 litros con hielo y ruedas, para el día de playa en Macao, Juanillo o el río. Se recoge al día siguiente en el hotel.', N'Neverita, dos bolsas de hielo, entrega y recogida', 24, 350, 25, N'img/publicaciones/neverita.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -162, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Video con dron en Kite Beach')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Video con dron en Kite Beach', N'fotografia', N'Cabarete', N'Kite Beach, Cabarete', N'Piloto de dron certificado que graba tu sesión de kitesurf o windsurf desde el aire y desde la orilla. Recibes un video editado de un minuto y todo el material en alta resolución.', N'Piloto de dron, cámara en tierra, video editado y archivos originales en 48 horas', 2, 6500, 4, N'img/publicaciones/dron.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -159, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Sesión de fotos en una playa virgen')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Sesión de fotos en una playa virgen', N'fotografia', N'Las Galeras', N'Pueblo de Las Galeras, salida en lancha', N'Fotógrafo local que te lleva en lancha a Playa Frontón o Playa Madama para una sesión de pareja, familia o luna de miel con la luz del atardecer.', N'Fotógrafo, lancha, 60 fotos editadas y galería en línea', 3, 5800, 3, N'img/publicaciones/camara-playa.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -156, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.actividades WHERE nombre = N'Fotógrafo de aventura en la montaña')
    INSERT INTO dbo.actividades (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye, duracion_horas, precio_persona, cupo_diario, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Fotógrafo de aventura en la montaña', N'fotografia', N'Jarabacoa', N'Tu punto de salida en Jarabacoa o Constanza', N'Creador de contenido que acompaña tu ruta de senderismo, canyoning o parapente y captura fotos y video en acción, incluidas tomas aéreas cuando el lugar lo permite.', N'Fotógrafo con equipo resistente al agua, 80 fotos editadas y un video corto', 5, 5200, 3, N'img/publicaciones/fotografo-montana.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -153, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131225874';
GO
-- 4.5 Autos de alquiler
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Toyota Corolla o similar')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Toyota Corolla o similar', N'Toyota', N'Corolla', 2024, N'economico', N'automatica', N'gasolina', 5, 4, 2, 1, NULL, N'Santo Domingo', N'Aeropuerto Internacional Las Américas (SDQ), mostrador en llegadas', N'Sedán económico y de bajo consumo, ideal para moverte por la capital y recorrer el país. Recógelo al aterrizar en Las Américas.', N'Seguro básico de colisión con deducible, asistencia en carretera 24 horas, kilometraje ilimitado', 2900, 15000, 21, 600, 4500, 8, N'img/publicaciones/toyota-corolla.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -300, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Mercedes-Benz Clase C')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Mercedes-Benz Clase C', N'Mercedes-Benz', N'C 200', 2023, N'lujo', N'automatica', N'gasolina', 5, 4, 3, 1, NULL, N'Santo Domingo', N'Aeropuerto Internacional Las Américas (SDQ), mostrador en llegadas', N'Sedán ejecutivo con interior de piel, asistente de estacionamiento y Apple CarPlay. Para viajes de negocios o una ocasión especial.', N'Seguro de colisión con deducible reducido, asistencia 24 horas, entrega con tanque lleno', 9500, 45000, 25, NULL, 6000, 3, N'img/publicaciones/mercedes-clase-c.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -297, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Ford Mustang Convertible')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Ford Mustang Convertible', N'Ford', N'Mustang EcoBoost Convertible', 2023, N'convertible', N'automatica', N'gasolina', 4, 2, 1, 1, 300, N'Puerto Plata', N'Aeropuerto Internacional Gregorio Luperón (POP), mostrador en llegadas', N'Descapotable para recorrer la costa norte entre Puerto Plata, Sosúa y Cabarete con la capota abajo.', N'Seguro de colisión con deducible, asistencia 24 horas, 300 km diarios', 8900, 40000, 25, NULL, NULL, 2, N'img/publicaciones/ford-mustang.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -294, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Cadillac Escalade')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Cadillac Escalade', N'Cadillac', N'Escalade', 2024, N'suv', N'automatica', N'gasolina', 7, 5, 5, 1, NULL, N'Punta Cana', N'Aeropuerto Internacional de Punta Cana (PUJ), terminal B', N'SUV de lujo de tres filas para familias o grupos con mucho equipaje. Asientos de piel, pantalla trasera y techo panorámico.', N'Seguro de colisión con deducible reducido, asistencia 24 horas, kilometraje ilimitado', 14500, 60000, 25, NULL, 7500, 2, N'img/publicaciones/cadillac-escalade.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -291, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132667418';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Jeep Gladiator 4x4')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Jeep Gladiator 4x4', N'Jeep', N'Gladiator Rubicon', 2023, N'pickup', N'automatica', N'gasolina', 5, 4, 4, 1, 250, N'Las Terrenas', N'Oficina Las Terrenas, Calle Duarte frente al Pueblo de los Pescadores', N'Pickup 4x4 con techo desmontable para llegar a Playa Rincón, Playa Frontón y los caminos de montaña de la península de Samaná.', N'Seguro de colisión con deducible, asistencia 24 horas, 250 km diarios', 7800, 35000, 25, NULL, 5500, 3, N'img/publicaciones/jeep-gladiator.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -288, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132667418';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Kia K7 o similar')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Kia K7 o similar', N'Kia', N'K7', 2023, N'sedan', N'automatica', N'gasolina', 5, 4, 3, 1, NULL, N'Santo Domingo', N'Oficina Piantini, Av. Abraham Lincoln esq. Gustavo Mejía Ricart', N'Sedán grande y silencioso con cámara de reversa y asientos amplios atrás, cómodo para viajes largos entre la capital y el interior.', N'Seguro básico de colisión con deducible, asistencia 24 horas, kilometraje ilimitado', 4300, 20000, 23, 700, 4500, 4, N'img/publicaciones/kia-k7.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -285, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Volvo XC40')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Volvo XC40', N'Volvo', N'XC40', 2024, N'lujo', N'automatica', N'hibrido', 5, 5, 3, 1, NULL, N'Santo Domingo', N'Aeropuerto Internacional Las Américas (SDQ), mostrador en llegadas', N'SUV compacto premium híbrido, con techo panorámico, asistente de carril y sonido de alta gama. Bajo consumo para recorrer la costa este.', N'Seguro de colisión con deducible reducido, asistencia 24 horas, entrega con tanque lleno', 8200, 40000, 25, NULL, 6000, 2, N'img/publicaciones/volvo-xc40.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -282, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131778902';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Honda CR-V')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Honda CR-V', N'Honda', N'CR-V Touring', 2025, N'suv', N'automatica', N'gasolina', 5, 5, 4, 1, NULL, N'Punta Cana', N'Aeropuerto Internacional de Punta Cana (PUJ), terminal B', N'SUV familiar con amplio maletero, Apple CarPlay y control de crucero adaptativo. La opción equilibrada para moverse entre los resorts y Higüey.', N'Seguro de colisión con deducible, asistencia 24 horas, kilometraje ilimitado', 5600, 25000, 23, 800, 5000, 6, N'img/publicaciones/honda-crv.jpg', 1, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -279, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132667418';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Suzuki Jimny 4x4')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Suzuki Jimny 4x4', N'Suzuki', N'Jimny 5 puertas', 2025, N'compacto', N'manual', N'gasolina', 4, 5, 2, 1, 250, N'Las Terrenas', N'Oficina Las Terrenas, Calle Duarte frente al Pueblo de los Pescadores', N'Todoterreno compacto con tracción 4x4 y reductora, fácil de estacionar en el pueblo y capaz en los caminos de tierra hacia las playas de la península.', N'Seguro de colisión con deducible, asistencia 24 horas, 250 km diarios', 4100, 20000, 21, 600, 4500, 4, N'img/publicaciones/suzuki-jimny.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -276, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132667418';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Jeep Wrangler Unlimited')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Jeep Wrangler Unlimited', N'Jeep', N'Wrangler Unlimited Sahara', 2024, N'suv', N'automatica', N'gasolina', 5, 5, 3, 1, 300, N'Punta Cana', N'Aeropuerto Internacional de Punta Cana (PUJ), terminal B', N'Wrangler de cuatro puertas con techo desmontable, ideal para la ruta a Macao, Miches y Montaña Redonda.', N'Seguro de colisión con deducible, asistencia 24 horas, 300 km diarios', 7400, 35000, 25, NULL, 5500, 3, N'img/publicaciones/jeep-wrangler.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -273, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'132667418';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.vehiculos WHERE nombre = N'Chevrolet Tahoe')
    INSERT INTO dbo.vehiculos (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas, maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito, edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, imagen_url, destacado, fecha_creacion)
    SELECT e.id_empresa, N'Chevrolet Tahoe', N'Chevrolet', N'Tahoe High Country', 2024, N'suv', N'automatica', N'gasolina', 8, 5, 6, 1, NULL, N'Puerto Plata', N'Aeropuerto Internacional Gregorio Luperón (POP), mostrador en llegadas', N'SUV de tres filas para ocho pasajeros, con espacio para el equipaje de todo el grupo. Recógela al aterrizar en la costa norte.', N'Seguro de colisión con deducible reducido, asistencia 24 horas, kilometraje ilimitado', 12800, 55000, 25, NULL, 7000, 2, N'img/publicaciones/chevrolet-tahoe.jpg', 0, DATEADD(HOUR, 12, CAST(DATEADD(DAY, -270, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.empresas e WHERE e.rnc = N'131778902';
GO
-- 4.6 Combos de alojamiento y actividades
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Samaná entre ballenas y cascadas')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Samaná entre ballenas y cascadas', N'3 noches frente a la bahía, el Salto El Limón y Los Haitises', N'Tres noches en Samaná Bay Palms con dos excursiones: el sendero a caballo o a pie hasta el Salto El Limón y el recorrido en bote por los mogotes y las cuevas taínas de Los Haitises.', N'Samaná', h.id_hotel, a.id_actividad, a2.id_actividad,
           1, 2, 3, 15, 1
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a CROSS JOIN dbo.actividades a2
    WHERE h.nombre = N'Samaná Bay Palms Resort' AND a.nombre = N'Senderismo al Salto El Limón' AND a2.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Bayahíbe: Saona y Catalina')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Bayahíbe: Saona y Catalina', N'4 noches todo incluido con las dos islas del sureste', N'Cuatro noches en Solaria Island frente a Playa Dominicus, el catamarán a Isla Saona con la piscina natural y una mañana de snorkel en los arrecifes de Isla Catalina.', N'La Romana', h.id_hotel, a.id_actividad, a2.id_actividad,
           1, 3, 4, 15, 1
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a CROSS JOIN dbo.actividades a2
    WHERE h.nombre = N'Solaria Island Beach Resort' AND a.nombre = N'Excursión en catamarán a Isla Saona' AND a2.nombre = N'Snorkel en los arrecifes de Isla Catalina';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Costa Norte: charcos y teleférico')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Costa Norte: charcos y teleférico', N'3 noches en Cabarete con Damajagua y la Loma Isabel de Torres', N'Tres noches en Mirador del Mar, solo para adultos, con los 27 Charcos de Damajagua y la subida en teleférico al Cristo Redentor de Puerto Plata.', N'Cabarete', h.id_hotel, a.id_actividad, a2.id_actividad,
           1, 2, 3, 12, 1
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a CROSS JOIN dbo.actividades a2
    WHERE h.nombre = N'Mirador del Mar Luxury Resort' AND a.nombre = N'27 Charcos de Damajagua' AND a2.nombre = N'Teleférico de Puerto Plata y Cristo Redentor';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Punta Cana con adrenalina')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Punta Cana con adrenalina', N'4 noches todo incluido, canopy en la selva y moto acuática', N'Cuatro noches en Coralia Grand Resort & Spa con el canopy de Anamuya sobre la selva y una salida en moto acuática por la costa de Bávaro.', N'Punta Cana', h.id_hotel, a.id_actividad, a2.id_actividad,
           1, 3, 4, 10, 1
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a CROSS JOIN dbo.actividades a2
    WHERE h.nombre = N'Coralia Grand Resort & Spa' AND a.nombre = N'Canopy en la selva de Anamuya' AND a2.nombre = N'Moto acuática en playa Bávaro';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Jarabacoa de río y café')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Jarabacoa de río y café', N'3 noches en cabaña con canyoning y cafetales a caballo', N'Tres noches en Cabañas Río Yaque con el descenso del cañón del Jimenoa y la cabalgata a los cafetales de la Cordillera Central.', N'Jarabacoa', h.id_hotel, a.id_actividad, a2.id_actividad,
           1, 2, 3, 12, 0
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a CROSS JOIN dbo.actividades a2
    WHERE h.nombre = N'Cabañas Río Yaque' AND a.nombre = N'Canyoning y tubing en el río Jimenoa' AND a2.nombre = N'Cabalgata a los cafetales de la Cordillera';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Ciudad Colonial con ritmo')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Ciudad Colonial con ritmo', N'2 noches en El Conde, historia a pie y clase de bachata', N'Dos noches en una casona restaurada de la calle El Conde, el recorrido por la Catedral Primada y el Parque Colón y una clase de bachata y merengue con música en vivo.', N'Santo Domingo', h.id_hotel, a.id_actividad, a2.id_actividad,
           0, 1, 2, 10, 0
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a CROSS JOIN dbo.actividades a2
    WHERE h.nombre = N'Hotel Boutique El Conde' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón' AND a2.nombre = N'Clase de bachata y merengue en la Zona Colonial';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = N'Las Galeras, playa virgen')
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT N'Las Galeras, playa virgen', N'3 noches en villa ecológica y Playa Rincón en lancha', N'Tres noches en las villas de Paraíso Escondido con piscina infinita y un día en lancha por Cabo Cabrón hasta Playa Rincón.', N'Las Galeras', h.id_hotel, a.id_actividad, NULL,
           1, NULL, 3, 10, 0
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a
    WHERE h.nombre = N'Paraíso Escondido Eco-Resort' AND a.nombre = N'Excursión a Playa Rincón y Cabo Cabrón';
GO
-- 4.7 Reservas (fechas relativas al día de la instalación)
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD7K2M9QA')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD7K2M9QA', u.id_usuario, h.id_hotel, DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 33, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 14500, 43500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD4H8T2LX')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD4H8T2LX', u.id_usuario, a.id_actividad, DATEADD(DAY, 12, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 2200, 4400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -9, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Senderismo al Salto El Limón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD9P3W6ZE')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD9P3W6ZE', u.id_usuario, h.id_hotel, DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 9800, 19600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Mirador del Mar Luxury Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD2C5N8RV')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD2C5N8RV', u.id_usuario, a.id_actividad, DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 1500, 4500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -41, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDC5K8M2T')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDC5K8M2T', u.id_usuario, h.id_hotel, DATEADD(DAY, 40, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 43, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 8624, 25872,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           (SELECT id_combo FROM dbo.combos WHERE nombre = N'Costa Norte: charcos y teleférico')
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Mirador del Mar Luxury Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDC6L9N3U')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDC6L9N3U', u.id_usuario, a.id_actividad, DATEADD(DAY, 41, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 2728, 5456,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           (SELECT id_combo FROM dbo.combos WHERE nombre = N'Costa Norte: charcos y teleférico')
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'27 Charcos de Damajagua';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDC7M2P4V')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDC7M2P4V', u.id_usuario, a.id_actividad, DATEADD(DAY, 42, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1848, 3696,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           (SELECT id_combo FROM dbo.combos WHERE nombre = N'Costa Norte: charcos y teleférico')
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Teleférico de Puerto Plata y Cristo Redentor';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD5L7Q2MA')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD5L7Q2MA', u.id_usuario, h.id_hotel, DATEADD(DAY, 18, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 22, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 7800, 31200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -3, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'luis.fernandez@correo.com' AND h.nombre = N'Samaná Bay Palms Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD8T3V6NB')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD8T3V6NB', u.id_usuario, a.id_actividad, DATEADD(DAY, 19, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 3400, 6800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD3R9K4PC')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD3R9K4PC', u.id_usuario, a.id_actividad, DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 3200, 12800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Excursión a Playa Rincón y Cabo Cabrón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD6M2X8RD')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD6M2X8RD', u.id_usuario, h.id_hotel, DATEADD(DAY, 25, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 28, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, 1, 13200, 39600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'carmen.jimenez@correo.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD9N5H2SE')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD9N5H2SE', u.id_usuario, a.id_actividad, DATEADD(DAY, 8, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 5900, 23600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD4P7J3TF')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD4P7J3TF', u.id_usuario, a.id_actividad, DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 4200, 8400,
           N'cancelada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -51, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), DATEADD(HOUR, 10, CAST(DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))),
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Canopy en la selva de Anamuya';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD2W8F5UG')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD2W8F5UG', u.id_usuario, h.id_hotel, DATEADD(DAY, 40, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 45, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, 1, 12800, 64000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'daniel.ortiz@correo.com' AND h.nombre = N'Cayo Azul All-Inclusive Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD7Y4C9VH')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD7Y4C9VH', u.id_usuario, a.id_actividad, DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 14500, 29000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Ascenso al Pico Duarte';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRD5Z6B3WJ')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRD5Z6B3WJ', u.id_usuario, a.id_actividad, DATEADD(DAY, 5, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1800, 3600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -16, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Desayuno criollo y Mercado Modelo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDA7C2K9V')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDA7C2K9V', u.id_usuario, v.id_vehiculo, DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 33, CAST(SYSUTCDATETIME() AS DATE)),
           N'11:00', N'10:00', N'Punta Cana', 34, N'proteccion-total,silla-infantil',
           60000, 1, NULL, 14500, 47250,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'cliente@bookingrd.com' AND v.nombre = N'Cadillac Escalade';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDA3J8M4P')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDA3J8M4P', u.id_usuario, v.id_vehiculo, DATEADD(DAY, 18, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 22, CAST(SYSUTCDATETIME() AS DATE)),
           N'09:00', N'09:00', N'Samaná', 29, N'gps',
           35000, 1, NULL, 7800, 38100,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -3, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'luis.fernandez@correo.com' AND v.nombre = N'Jeep Gladiator 4x4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDA9T5Q2R')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDA9T5Q2R', u.id_usuario, v.id_vehiculo, DATEADD(DAY, 8, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 13, CAST(SYSUTCDATETIME() AS DATE)),
           N'14:00', N'12:00', N'Punta Cana', 23, N'conductor-adicional',
           15000, 1, NULL, 2900, 24250,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'carmen.jimenez@correo.com' AND v.nombre = N'Toyota Corolla o similar';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0001RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0001RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -120, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 14500, 58000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -141, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'ana.castillo@correo.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0002RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0002RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -75, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, 1, 14500, 72500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -96, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'roberto.sanchez@correo.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0003RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0003RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -27, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 14500, 43500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -51, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Coralia Grand Resort & Spa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0004RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0004RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -150, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -146, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 12800, 51200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -171, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'patricia.nunez@correo.com' AND h.nombre = N'Cayo Azul All-Inclusive Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0005RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0005RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -47, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, 1, 12800, 38400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -71, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Cayo Azul All-Inclusive Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0006RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0006RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -95, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -93, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 1, 1, 6900, 13800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'miguel.herrera@correo.com' AND h.nombre = N'Azura Caribbean Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0007RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0007RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -38, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 6900, 13800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'yesenia.paulino@correo.com' AND h.nombre = N'Azura Caribbean Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0009RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0009RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -110, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -107, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 9800, 29400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -131, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'andres.cabrera@correo.com' AND h.nombre = N'Mirador del Mar Luxury Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0010RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0010RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -200, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -196, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 11200, 44800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -221, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'ana.castillo@correo.com' AND h.nombre = N'Solaria Island Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0011RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0011RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -57, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 11200, 33600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'roberto.sanchez@correo.com' AND h.nombre = N'Solaria Island Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0012RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0012RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -130, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -127, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, 1, 8700, 26100,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -151, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'carmen.jimenez@correo.com' AND h.nombre = N'Bahía Serena Golf & Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0013RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0013RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -25, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -23, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 8700, 17400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Bahía Serena Golf & Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0014RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0014RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -180, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -175, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 9400, 47000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -201, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'miguel.herrera@correo.com' AND h.nombre = N'Costa Dorada Palace Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0015RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0015RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, 1, 9400, 37600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Costa Dorada Palace Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0016RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0016RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -87, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 6, 1, 16500, 49500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'patricia.nunez@correo.com' AND h.nombre = N'Palma Real Haven Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0017RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0017RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -18, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, 1, 16500, 33000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -41, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'yesenia.paulino@correo.com' AND h.nombre = N'Palma Real Haven Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0018RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0018RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -140, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -136, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 7800, 31200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -161, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'andres.cabrera@correo.com' AND h.nombre = N'Samaná Bay Palms Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0019RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0019RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -42, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, 1, 7800, 23400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'carmen.jimenez@correo.com' AND h.nombre = N'Samaná Bay Palms Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0020RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0020RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -100, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -97, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 13200, 39600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -121, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'roberto.sanchez@correo.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0021RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0021RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 13200, 26400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -56, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0022RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0022RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -160, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 5900, 23600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -181, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'hector.marte@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0023RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0023RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -55, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 5900, 11800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -76, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0024RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0024RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -15, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 5900, 17700,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -36, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'miguel.herrera@correo.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0026RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0026RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -80, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 3200, 6400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -101, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Excursión a Playa Rincón y Cabo Cabrón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0027RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0027RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -210, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 3600, 7200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -231, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Bahía de las Águilas en bote';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0028RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0028RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -65, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 3600, 14400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -86, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Bahía de las Águilas en bote';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0029RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0029RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -170, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 2200, 4400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -191, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'ana.castillo@correo.com' AND a.nombre = N'Senderismo al Salto El Limón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0030RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0030RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -28, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 2200, 6600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -49, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'hector.marte@correo.com' AND a.nombre = N'Senderismo al Salto El Limón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0032RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0032RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -240, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 1, NULL, 14500, 14500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -261, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'miguel.herrera@correo.com' AND a.nombre = N'Ascenso al Pico Duarte';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0033RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0033RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -85, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 2400, 4800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -106, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'laura.vasquez@correo.com' AND a.nombre = N'Valle del Rincón y cascadas de Jarabacoa';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0034RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0034RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -115, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 2600, 5200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -136, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'Cabalgata a los cafetales de la Cordillera';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0035RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0035RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 2600, 5200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Cabalgata a los cafetales de la Cordillera';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0036RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0036RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -190, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 2300, 6900,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -211, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Ruta del cacao orgánico';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0037RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0037RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1800, 3600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Desayuno criollo y Mercado Modelo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0038RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0038RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -18, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1800, 3600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -39, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Desayuno criollo y Mercado Modelo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0039RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0039RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -100, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 1200, 4800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -121, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Almuerzo típico: la bandera dominicana';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0040RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0040RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -260, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1500, 3000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -281, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'ana.castillo@correo.com' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0041RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0041RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1500, 3000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -56, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Zona Colonial a pie: Catedral Primada y Parque Colón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0042RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0042RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -145, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 3400, 6800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -166, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'laura.vasquez@correo.com' AND a.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0043RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0043RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -12, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 3400, 13600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'Parque Nacional Los Haitises y cuevas taínas';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0044RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0044RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -125, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 3900, 7800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -146, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'miguel.herrera@correo.com' AND a.nombre = N'Basílica de Higüey y Altos de Chavón';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0045RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0045RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1700, 3400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'hector.marte@correo.com' AND a.nombre = N'Puerto Plata victoriana y Calle de la Sombrilla';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0046RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0046RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -110, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 4200, 8400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -131, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Canopy en la selva de Anamuya';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0047RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0047RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 4200, 12600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Canopy en la selva de Anamuya';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0048RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0048RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 1, NULL, 5500, 5500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Vuelo en parapente sobre el valle de Constanza';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0049RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0049RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -95, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 5200, 10400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Ruta en cuatrimoto por Valle Nuevo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0050RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0050RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -175, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 4600, 13800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -196, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Snorkel en los arrecifes de Isla Catalina';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0051RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0051RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -80, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 3100, 6200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -101, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'ana.castillo@correo.com' AND a.nombre = N'27 Charcos de Damajagua';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0052RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0052RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -150, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -146, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 8, 1, 38500, 154000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -171, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Villa Acantilado Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0053RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0053RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -60, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -57, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 6, 1, 38500, 115500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Villa Acantilado Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0054RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0054RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 7800, 31200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Paseo en yate por la Marina de Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0055RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0055RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 2900, 11600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Día de parque acuático en Punta Cana';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0056RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0056RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -26, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 3100, 12400,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -47, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'27 Charcos de Damajagua';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0057RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0057RS', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)),
           N'10:00', N'10:00', N'Santo Domingo', 32, NULL,
           15000, 1, NULL, 2900, 11600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -71, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'miguel.herrera@correo.com' AND v.nombre = N'Toyota Corolla o similar';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0058RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0058RS', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -25, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)),
           N'10:00', N'10:00', N'Santo Domingo', 32, NULL,
           15000, 1, NULL, 2900, 8700,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'yesenia.paulino@correo.com' AND v.nombre = N'Toyota Corolla o similar';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0059RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0059RS', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -70, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -65, CAST(SYSUTCDATETIME() AS DATE)),
           N'10:00', N'10:00', N'Punta Cana', 32, NULL,
           60000, 1, NULL, 14500, 72500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'hector.marte@correo.com' AND v.nombre = N'Cadillac Escalade';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0060RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0060RS', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -32, CAST(SYSUTCDATETIME() AS DATE)),
           N'10:00', N'10:00', N'Puerto Plata', 32, NULL,
           40000, 1, NULL, 8900, 26700,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -56, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'patricia.nunez@correo.com' AND v.nombre = N'Ford Mustang Convertible';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0061RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0061RS', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -86, CAST(SYSUTCDATETIME() AS DATE)),
           N'10:00', N'10:00', N'Las Terrenas', 32, NULL,
           35000, 1, NULL, 7800, 31200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'roberto.sanchez@correo.com' AND v.nombre = N'Jeep Gladiator 4x4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0062RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0062RS', u.id_usuario, a.id_actividad, DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 18500, 37000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Golf en Teeth of the Dog, Casa de Campo';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDV0063RS')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDV0063RS', u.id_usuario, h.id_hotel, DATEADD(DAY, -28, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -26, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 7400, 14800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -49, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'ana.castillo@correo.com' AND h.nombre = N'Hotel Boutique El Conde';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN2P8K4T')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN2P8K4T', u.id_usuario, h.id_hotel, DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -36, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 16800, 67200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'laura.vasquez@correo.com' AND h.nombre = N'Palmar de Bávaro Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN3Q7M2V')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN3Q7M2V', u.id_usuario, h.id_hotel, DATEADD(DAY, -95, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -90, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, 1, 16800, 84000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'hector.marte@correo.com' AND h.nombre = N'Palmar de Bávaro Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN4R6W8X')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_hotel, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN4R6W8X', u.id_usuario, h.id_hotel, DATEADD(DAY, 58, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 62, CAST(SYSUTCDATETIME() AS DATE)),
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, 1, 16800, 67200,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Palmar de Bávaro Beach Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN5S4Y3Z')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN5S4Y3Z', u.id_usuario, a.id_actividad, DATEADD(DAY, -22, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1900, 3800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'patricia.nunez@correo.com' AND a.nombre = N'Noche de tambores y son en la Zona Colonial';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN6T3A9B')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN6T3A9B', u.id_usuario, a.id_actividad, DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 1900, 7600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -82, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'andres.cabrera@correo.com' AND a.nombre = N'Noche de tambores y son en la Zona Colonial';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN7U2C8D')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN7U2C8D', u.id_usuario, a.id_actividad, DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 3, NULL, 4300, 12900,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -54, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'yesenia.paulino@correo.com' AND a.nombre = N'Tirolesa sobre la península de Samaná';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN8V9E7F')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN8V9E7F', u.id_usuario, a.id_actividad, DATEADD(DAY, -75, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 4300, 8600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -96, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'roberto.sanchez@correo.com' AND a.nombre = N'Tirolesa sobre la península de Samaná';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDN9W8G6H')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDN9W8G6H', u.id_usuario, a.id_actividad, DATEADD(DAY, -14, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 1450, 2900,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'daniel.ortiz@correo.com' AND a.nombre = N'Parque Nacional Los Tres Ojos';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDP2X7J5K')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDP2X7J5K', u.id_usuario, a.id_actividad, DATEADD(DAY, -280, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 6900, 27600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -301, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Catamarán privado por la bahía de Samaná';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDP3Y6L4M')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDP3Y6L4M', u.id_usuario, a.id_actividad, DATEADD(DAY, -48, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 2, NULL, 9800, 19600,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -69, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'carmen.jimenez@correo.com' AND a.nombre = N'Vuelo en helicóptero sobre Punta Cana';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDP4Z5N3P')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_actividad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDP4Z5N3P', u.id_usuario, a.id_actividad, DATEADD(DAY, 21, CAST(SYSUTCDATETIME() AS DATE)), NULL,
           NULL, NULL, NULL, NULL, NULL,
           NULL, 4, NULL, 5200, 20800,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Paseo en yate privado desde Boca Chica';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDP5A4Q2R')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDP5A4Q2R', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)),
           N'13:00', N'12:00', N'Punta Cana', 29, NULL,
           25000, 1, NULL, 5600, 28000,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -87, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'ana.castillo@correo.com' AND v.nombre = N'Honda CR-V';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDP6B3S9T')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDP6B3S9T', u.id_usuario, v.id_vehiculo, DATEADD(DAY, -29, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, -26, CAST(SYSUTCDATETIME() AS DATE)),
           N'09:00', N'09:00', N'Las Terrenas', 24, N'gps',
           20000, 1, NULL, 4100, 15150,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'miguel.herrera@correo.com' AND v.nombre = N'Suzuki Jimny 4x4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = N'BRDP7C2U8V')
    INSERT INTO dbo.reservas
        (codigo, id_usuario, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT N'BRDP7C2U8V', u.id_usuario, v.id_vehiculo, DATEADD(DAY, 44, CAST(SYSUTCDATETIME() AS DATE)), DATEADD(DAY, 49, CAST(SYSUTCDATETIME() AS DATE)),
           N'15:00', N'15:00', N'Puerto Plata', 38, N'silla-infantil',
           55000, 1, NULL, 12800, 65500,
           N'confirmada', NULL,
           DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL,
           NULL
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'laura.vasquez@correo.com' AND v.nombre = N'Chevrolet Tahoe';
GO
-- 4.8 Pagos de las reservas (pasarela simulada: solo marca y últimos 4 dígitos)
INSERT INTO dbo.pagos (id_reserva, metodo, estado, monto, marca, ultimos4, titular, referencia, autorizacion, fecha_pago, fecha_reembolso)
SELECT r.id_reserva, v.metodo, v.estado, v.monto, v.marca, v.ultimos4,
       CASE WHEN v.metodo = 'tarjeta' THEN u.nombre END, v.referencia, v.autorizacion, v.fecha_pago, v.fecha_reembolso
FROM (VALUES
        (N'BRD7K2M9QA', N'tarjeta', N'pagado', 43500, N'Mastercard', N'4444', N'PAY7K2M9QAD', N'324057', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD4H8T2LX', N'en_destino', N'pendiente', 4400, NULL, NULL, N'PAY4H8T2LXD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -9, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD9P3W6ZE', N'tarjeta', N'pagado', 19600, N'Visa', N'4242', N'PAY9P3W6ZED', N'955371', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD2C5N8RV', N'tarjeta', N'pagado', 4500, N'Visa', N'4242', N'PAY2C5N8RVD', N'717801', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -41, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDC5K8M2T', N'en_destino', N'pendiente', 25872, NULL, NULL, N'PAYC5K8M2TD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDC6L9N3U', N'en_destino', N'pendiente', 5456, NULL, NULL, N'PAYC6L9N3UD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDC7M2P4V', N'tarjeta', N'pagado', 3696, N'Mastercard', N'4444', N'PAYC7M2P4VD', N'751683', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD5L7Q2MA', N'tarjeta', N'pagado', 31200, N'Visa', N'4242', N'PAY5L7Q2MAD', N'031054', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -3, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD8T3V6NB', N'en_destino', N'pendiente', 6800, NULL, NULL, N'PAY8T3V6NBD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD3R9K4PC', N'tarjeta', N'pagado', 12800, N'Mastercard', N'4444', N'PAY3R9K4PCD', N'466599', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD6M2X8RD', N'tarjeta', N'pagado', 39600, N'Mastercard', N'4444', N'PAY6M2X8RDD', N'226823', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD9N5H2SE', N'tarjeta', N'pagado', 23600, N'Visa', N'4242', N'PAY9N5H2SED', N'387409', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD4P7J3TF', N'tarjeta', N'reembolsado', 8400, N'Mastercard', N'4444', N'PAY4P7J3TFD', N'727926', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -51, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), DATEADD(HOUR, 10, CAST(DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))),
        (N'BRD2W8F5UG', N'tarjeta', N'pagado', 64000, N'American Express', N'0005', N'PAY2W8F5UGD', N'044686', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD7Y4C9VH', N'en_destino', N'pagado', 29000, NULL, NULL, N'PAY7Y4C9VHD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRD5Z6B3WJ', N'tarjeta', N'pagado', 3600, N'Visa', N'4242', N'PAY5Z6B3WJD', N'195147', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -16, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDA7C2K9V', N'tarjeta', N'pagado', 47250, N'Mastercard', N'4444', N'PAYA7C2K9VD', N'252786', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDA3J8M4P', N'tarjeta', N'pagado', 38100, N'Visa', N'4242', N'PAYA3J8M4PD', N'054811', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -3, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDA9T5Q2R', N'tarjeta', N'pagado', 24250, N'Mastercard', N'4444', N'PAYA9T5Q2RD', N'870468', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0001RS', N'tarjeta', N'pagado', 58000, N'American Express', N'0005', N'PAYV0001RSD', N'524238', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -141, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0002RS', N'en_destino', N'pagado', 72500, NULL, NULL, N'PAYV0002RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -96, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0003RS', N'tarjeta', N'pagado', 43500, N'Visa', N'4242', N'PAYV0003RSD', N'650942', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -51, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0004RS', N'tarjeta', N'pagado', 51200, N'American Express', N'0005', N'PAYV0004RSD', N'714294', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -171, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0005RS', N'tarjeta', N'pagado', 38400, N'Mastercard', N'4444', N'PAYV0005RSD', N'777646', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -71, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0006RS', N'tarjeta', N'pagado', 13800, N'Visa', N'4242', N'PAYV0006RSD', N'840998', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0007RS', N'en_destino', N'pagado', 13800, NULL, NULL, N'PAYV0007RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0009RS', N'tarjeta', N'pagado', 29400, N'Visa', N'4242', N'PAYV0009RSD', N'031054', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -131, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0010RS', N'tarjeta', N'pagado', 44800, N'Mastercard', N'4444', N'PAYV0010RSD', N'516319', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -221, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0011RS', N'tarjeta', N'pagado', 33600, N'Visa', N'4242', N'PAYV0011RSD', N'579671', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0012RS', N'tarjeta', N'pagado', 26100, N'American Express', N'0005', N'PAYV0012RSD', N'643023', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -151, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0013RS', N'en_destino', N'pagado', 17400, NULL, NULL, N'PAYV0013RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0014RS', N'tarjeta', N'pagado', 47000, N'Visa', N'4242', N'PAYV0014RSD', N'769727', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -201, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0015RS', N'tarjeta', N'pagado', 37600, N'American Express', N'0005', N'PAYV0015RSD', N'833079', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0016RS', N'tarjeta', N'pagado', 49500, N'Mastercard', N'4444', N'PAYV0016RSD', N'896431', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0017RS', N'tarjeta', N'pagado', 33000, N'Visa', N'4242', N'PAYV0017RSD', N'959783', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -41, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0018RS', N'en_destino', N'pagado', 31200, NULL, NULL, N'PAYV0018RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -161, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0019RS', N'tarjeta', N'pagado', 23400, N'Mastercard', N'4444', N'PAYV0019RSD', N'086487', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0020RS', N'tarjeta', N'pagado', 39600, N'American Express', N'0005', N'PAYV0020RSD', N'571752', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -121, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0021RS', N'tarjeta', N'pagado', 26400, N'Mastercard', N'4444', N'PAYV0021RSD', N'635104', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -56, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0022RS', N'tarjeta', N'pagado', 23600, N'Visa', N'4242', N'PAYV0022RSD', N'698456', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -181, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0023RS', N'tarjeta', N'pagado', 11800, N'American Express', N'0005', N'PAYV0023RSD', N'761808', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -76, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0024RS', N'en_destino', N'pagado', 17700, NULL, NULL, N'PAYV0024RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -36, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0026RS', N'tarjeta', N'pagado', 6400, N'American Express', N'0005', N'PAYV0026RSD', N'951864', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -101, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0027RS', N'tarjeta', N'pagado', 7200, N'Mastercard', N'4444', N'PAYV0027RSD', N'015216', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -231, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0028RS', N'tarjeta', N'pagado', 14400, N'Visa', N'4242', N'PAYV0028RSD', N'078568', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -86, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0029RS', N'en_destino', N'pagado', 4400, NULL, NULL, N'PAYV0029RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -191, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0030RS', N'en_destino', N'pagado', 6600, NULL, NULL, N'PAYV0030RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -49, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0032RS', N'tarjeta', N'pagado', 14500, N'Mastercard', N'4444', N'PAYV0032RSD', N'753889', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -261, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0033RS', N'tarjeta', N'pagado', 4800, N'Visa', N'4242', N'PAYV0033RSD', N'817241', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -106, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0034RS', N'tarjeta', N'pagado', 5200, N'American Express', N'0005', N'PAYV0034RSD', N'880593', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -136, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0035RS', N'en_destino', N'pagado', 5200, NULL, NULL, N'PAYV0035RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0036RS', N'tarjeta', N'pagado', 6900, N'Visa', N'4242', N'PAYV0036RSD', N'007297', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -211, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0037RS', N'tarjeta', N'pagado', 3600, N'American Express', N'0005', N'PAYV0037RSD', N'070649', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0038RS', N'tarjeta', N'pagado', 3600, N'Mastercard', N'4444', N'PAYV0038RSD', N'134001', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -39, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0039RS', N'tarjeta', N'pagado', 4800, N'Visa', N'4242', N'PAYV0039RSD', N'197353', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -121, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0040RS', N'tarjeta', N'pagado', 3000, N'Mastercard', N'4444', N'PAYV0040RSD', N'682618', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -281, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0041RS', N'en_destino', N'pagado', 3000, NULL, NULL, N'PAYV0041RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -56, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0042RS', N'tarjeta', N'pagado', 6800, N'American Express', N'0005', N'PAYV0042RSD', N'809322', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -166, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0043RS', N'tarjeta', N'pagado', 13600, N'Mastercard', N'4444', N'PAYV0043RSD', N'872674', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0044RS', N'tarjeta', N'pagado', 7800, N'Visa', N'4242', N'PAYV0044RSD', N'936026', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -146, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0045RS', N'tarjeta', N'pagado', 3400, N'American Express', N'0005', N'PAYV0045RSD', N'999378', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0046RS', N'en_destino', N'pagado', 8400, NULL, NULL, N'PAYV0046RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -131, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0047RS', N'tarjeta', N'pagado', 12600, N'Visa', N'4242', N'PAYV0047RSD', N'126082', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0048RS', N'tarjeta', N'pagado', 5500, N'American Express', N'0005', N'PAYV0048RSD', N'189434', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0049RS', N'tarjeta', N'pagado', 10400, N'Mastercard', N'4444', N'PAYV0049RSD', N'252786', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0050RS', N'tarjeta', N'pagado', 13800, N'American Express', N'0005', N'PAYV0050RSD', N'738051', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -196, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0051RS', N'tarjeta', N'pagado', 6200, N'Mastercard', N'4444', N'PAYV0051RSD', N'801403', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -101, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0052RS', N'en_destino', N'pagado', 154000, NULL, NULL, N'PAYV0052RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -171, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0053RS', N'tarjeta', N'pagado', 115500, N'American Express', N'0005', N'PAYV0053RSD', N'928107', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -81, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0054RS', N'tarjeta', N'pagado', 31200, N'Mastercard', N'4444', N'PAYV0054RSD', N'991459', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0055RS', N'tarjeta', N'pagado', 11600, N'Visa', N'4242', N'PAYV0055RSD', N'054811', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0056RS', N'tarjeta', N'pagado', 12400, N'American Express', N'0005', N'PAYV0056RSD', N'118163', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -47, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0057RS', N'en_destino', N'pagado', 11600, NULL, NULL, N'PAYV0057RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -71, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0058RS', N'tarjeta', N'pagado', 8700, N'Visa', N'4242', N'PAYV0058RSD', N'244867', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0059RS', N'tarjeta', N'pagado', 72500, N'American Express', N'0005', N'PAYV0059RSD', N'308219', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0060RS', N'tarjeta', N'pagado', 26700, N'Visa', N'4242', N'PAYV0060RSD', N'793484', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -56, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0061RS', N'tarjeta', N'pagado', 31200, N'American Express', N'0005', N'PAYV0061RSD', N'856836', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -111, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0062RS', N'tarjeta', N'pagado', 37000, N'Mastercard', N'4444', N'PAYV0062RSD', N'920188', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -66, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDV0063RS', N'en_destino', N'pagado', 14800, NULL, NULL, N'PAYV0063RSD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -49, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN2P8K4T', N'tarjeta', N'pagado', 67200, N'American Express', N'0005', N'PAYN2P8K4TD', N'902144', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -61, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN3Q7M2V', N'tarjeta', N'pagado', 84000, N'Visa', N'4242', N'PAYN3Q7M2VD', N'076362', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -116, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN4R6W8X', N'tarjeta', N'pagado', 67200, N'American Express', N'0005', N'PAYN4R6W8XD', N'327564', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN5S4Y3Z', N'tarjeta', N'pagado', 3800, N'American Express', N'0005', N'PAYN5S4Y3ZD', N'232536', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN6T3A9B', N'en_destino', N'pagado', 7600, NULL, NULL, N'PAYN6T3A9BD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -82, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN7U2C8D', N'tarjeta', N'pagado', 12900, N'Mastercard', N'4444', N'PAYN7U2C8DD', N'516319', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -54, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN8V9E7F', N'tarjeta', N'pagado', 8600, N'Mastercard', N'4444', N'PAYN8V9E7FD', N'205272', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -96, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDN9W8G6H', N'tarjeta', N'pagado', 2900, N'American Express', N'0005', N'PAYN9W8G6HD', N'450761', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -35, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDP2X7J5K', N'tarjeta', N'pagado', 27600, N'Mastercard', N'4444', N'PAYP2X7J5KD', N'585384', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -301, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDP3Y6L4M', N'tarjeta', N'pagado', 19600, N'American Express', N'0005', N'PAYP3Y6L4MD', N'830873', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -69, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDP4Z5N3P', N'tarjeta', N'pagado', 20800, N'Mastercard', N'4444', N'PAYP4Z5N3PD', N'155552', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDP5A4Q2R', N'tarjeta', N'pagado', 28000, N'Mastercard', N'4444', N'PAYP5A4Q2RD', N'229029', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -87, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDP6B3S9T', N'tarjeta', N'pagado', 15150, N'American Express', N'0005', N'PAYP6B3S9TD', N'044686', DATEADD(HOUR, 15, CAST(DATEADD(DAY, -50, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL),
        (N'BRDP7C2U8V', N'en_destino', N'pendiente', 65500, NULL, NULL, N'PAYP7C2U8VD', NULL, DATEADD(HOUR, 15, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), NULL)
) AS v (codigo, metodo, estado, monto, marca, ultimos4, referencia, autorizacion, fecha_pago, fecha_reembolso)
INNER JOIN dbo.reservas r ON r.codigo = v.codigo
INNER JOIN dbo.usuarios u ON u.id_usuario = r.id_usuario
WHERE NOT EXISTS (SELECT 1 FROM dbo.pagos p WHERE p.id_reserva = r.id_reserva);
GO
-- 4.9 Reseñas de reservas ya disfrutadas (dos días después de terminar)
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0001RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Nuestra luna de miel perfecta', N'La playa de Bávaro frente a la habitación, el spa y la cena en el restaurante de mariscos fueron de otro nivel. El personal nos preparó una sorpresa por la luna de miel sin que lo pidiéramos.', N'Gracias, Ana Belén. Fue un placer acompañarles en un momento tan especial. Les esperamos en su primer aniversario.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -113, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -114, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0001RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0002RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Ideal para familias', N'Fuimos con dos niños y el club infantil los mantuvo felices todo el día. Las piscinas son enormes y la comida variada. Solo el check-in tardó un poco el día de llegada.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -68, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0002RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0003RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Repetiría sin pensarlo', N'Habitación amplia con vista al mar, buffet con mucha fruta fresca y un spa excelente. La playa siempre limpia y con camastros disponibles.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -25, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0003RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0004RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buen todo incluido', N'El agua es tan turquesa como en las fotos. Los restaurantes a la carta requieren reserva temprano, pero la atención fue muy amable en todo momento.', N'Gracias por tu comentario, Patricia. Ya habilitamos la reserva de restaurantes desde la recepción el mismo día de llegada.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -143, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -144, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0004RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0005RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Playa espectacular', N'La mejor playa que hemos visitado en Punta Cana. Las habitaciones están renovadas y el personal de animación es muy simpático sin ser invasivo.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0005RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0006RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Cómodo para viaje de trabajo', N'Buena ubicación en Santo Domingo, wifi rápido y desayuno temprano. La vista al Malecón desde el piso alto vale la pena.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -91, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0006RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0007RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Fin de semana en la capital', N'Aprovechamos para recorrer la Zona Colonial y volver a descansar a la piscina. Personal atento y habitación muy limpia.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -36, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0007RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRD9P3W6ZE')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Vista al Atlántico inolvidable', N'La suite con piscina privada frente al mar de Cabarete es un sueño. Desayuno servido en la terraza y un servicio impecable de principio a fin.', N'María, gracias por elegirnos. Nos alegra que la terraza haya sido tu lugar favorito. Te esperamos pronto.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -41, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRD9P3W6ZE';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0009RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Para desconectar de verdad', N'Tranquilo, elegante y con una vista que no cansa. Perfecto para parejas. Muy cerca de las escuelas de kitesurf de Cabarete.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -105, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0009RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0010RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Excelente base para ir a Saona', N'Desde el hotel organizamos la excursión a Isla Saona. Las instalaciones son modernas y el restaurante italiano nos encantó.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -194, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0010RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0011RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 7, N'Bien, con detalles por mejorar', N'La playa y las piscinas están muy bien. El aire acondicionado de nuestra habitación hacía ruido y tardaron un día en cambiarnos.', N'Roberto, lamentamos lo del aire acondicionado. Revisamos todas las unidades de ese pabellón. Gracias por avisarnos.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -54, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -55, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0011RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0012RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Cerca de la capital', N'A media hora del aeropuerto y con una playa de aguas tranquilas, ideal para los niños. El campo de golf está muy bien cuidado.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -125, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0012RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0013RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Escapada perfecta', N'Fuimos un fin de semana largo y descansamos de verdad. El personal de playa siempre pendiente y la comida criolla del restaurante muy buena.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -21, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0013RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0014RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Sosúa tiene su encanto', N'Playa de arena dorada, buen snorkel a pocos metros y el pueblo cerca para cenar. El hotel cumple con lo que promete.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -173, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0014RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0015RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Atención de primera', N'Celebramos el cumpleaños de mi esposa y el equipo decoró la habitación con flores tropicales. Detalles que hacen la diferencia.', N'Héctor, gracias por compartir ese momento con nosotros. Feliz cumpleaños de nuevo a tu esposa.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -63, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -64, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0015RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0016RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'La villa ideal para grupos', N'Éramos seis amigas y la villa tenía espacio de sobra, piscina propia y rancho para la barbacoa. Juan Dolio es tranquilo y la playa está a pasos.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -85, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0016RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0017RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Muy recomendable', N'Limpio, bien equipado y con un jardín precioso. Los anfitriones nos recomendaron dónde comer pescado frito en la playa.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -16, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0017RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0018RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Temporada de ballenas', N'Fuimos en febrero y desde el hotel salimos a ver ballenas jorobadas. La bahía al amanecer es un espectáculo y el personal muy cálido.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -134, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0018RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0019RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buena relación calidad precio', N'Habitaciones amplias con balcón a la bahía. El desayuno podría tener más variedad, pero la ubicación es inmejorable.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -40, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0019RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0020RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Un rincón mágico', N'Las villas entre la vegetación, el sonido del mar y la piscina infinita al atardecer. Es el lugar más bonito donde nos hemos hospedado en el país.', N'Gracias, Roberto. Las Galeras guarda muchos secretos. La próxima vez les llevamos a Playa Frontón.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -94, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -95, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0020RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0021RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Naturaleza y descanso', N'Perfecto para desconectarse. El camino de llegada es un poco empinado, pero vale cada minuto. Comida casera deliciosa.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -31, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0021RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0022RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'El mejor día del viaje', N'Catamarán con música, la piscina natural con estrellas de mar y almuerzo en la playa. El guía Ramón nos hizo reír todo el camino.', N'Gracias, Héctor. Le pasamos tus saludos a Ramón.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -157, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -158, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0022RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0023RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Imperdible', N'La isla es preciosa y el regreso en lancha rápida fue emocionante. Lleven protector solar, el sol pega fuerte.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -53, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0023RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0024RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Muy bien organizada', N'Puntuales en la recogida, equipo de snorkel en buen estado y un almuerzo con pescado fresco. Todo como lo describen.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0024RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRD3R9K4PC')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Playa Rincón es un paraíso', N'El paseo en bote por los acantilados de Cabo Cabrón es impresionante y Playa Rincón casi vacía. El coco frío en la orilla fue el cierre perfecto.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -58, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRD3R9K4PC';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0026RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Bonita excursión', N'Paisajes increíbles. El mar estaba algo movido de regreso, pero el capitán manejó muy bien.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -78, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0026RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0027RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'La playa más bonita del país', N'Arena blanca, agua cristalina y nadie más alrededor. El viaje hasta Pedernales es largo, pero no hay nada igual en el Caribe.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -208, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0027RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0028RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Vale el viaje', N'Los guías conocen muy bien la zona y nos explicaron la importancia del parque Jaragua. Lleven comida y mucha agua.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -63, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0028RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0029RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Cascada impresionante', N'Subimos a caballo y bajamos a pie. Bañarse al pie del salto es una experiencia única. El almuerzo criollo al final estuvo muy rico.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -168, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0029RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0030RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Recomendado', N'El sendero tiene partes resbaladizas, mejor ir con zapatos cerrados. Los guías son pacientes y conocen cada planta del camino.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -26, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0030RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRD7Y4C9VH')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Llegar a la cima del Caribe', N'Tres días de montaña, noches frías en La Compartición y el amanecer desde la cima. Los guías y los arrieros fueron extraordinarios.', N'Daniel, felicidades por coronar el Pico Duarte. Fue un honor acompañarles.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -87, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -88, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRD7Y4C9VH';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0032RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Exigente pero inolvidable', N'Hay que tener buena condición física. La organización es excelente: comida caliente, mulas para el equipaje y mucha seguridad.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -238, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0032RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0033RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Jarabacoa enamora', N'Visitamos Salto de Baiguate y Jimenoa en un solo día. El clima fresco de la montaña es un descanso del calor de la costa.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -83, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0033RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0034RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Café recién tostado en la montaña', N'La cabalgata entre pinos y la visita al cafetal familiar fueron lo mejor del viaje. Nos llevamos dos libras de café para la casa.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -113, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0034RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0035RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Experiencia auténtica', N'Caballos mansos y bien cuidados, ideal para principiantes. La familia productora nos explicó todo el proceso del café.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0035RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0036RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Del árbol a la barra de chocolate', N'Aprendimos a fermentar, secar y moler el cacao. Hicimos nuestra propia barra de chocolate. Ideal para ir con niños.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -188, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0036RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0037RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Mangú como en casa de la abuela', N'Desayuno de mangú con los tres golpes y luego un recorrido por el Mercado Modelo con mucha historia. Guía muy simpática.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -58, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0037RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0038RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Muy bonito', N'Buena forma de conocer el Santo Domingo cotidiano. El mercado puede estar muy lleno, conviene ir temprano como propone el tour.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -16, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0038RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0039RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Sabor dominicano de verdad', N'Arroz, habichuelas guisadas, pollo y ensalada, con jugo de chinola. La anfitriona nos contó la historia de cada plato.', N'Gracias, Carmen. Ese jugo de chinola es receta de la casa.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -97, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -98, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0039RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0040RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Historia viva', N'Caminar por la Calle Las Damas y entrar a la Catedral Primada con un guía que sabe tanto fue fascinante. Terminamos con un helado en el Parque Colón.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -258, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0040RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0041RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Imprescindible en Santo Domingo', N'Tres horas que pasan volando. El guía adapta el ritmo al grupo y recomienda buenos lugares para comer después.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0041RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0042RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Los Haitises superó todo', N'Los mogotes saliendo del agua, los manglares y los petroglifos taínos en las cuevas. Vimos pelícanos y fragatas muy de cerca.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -143, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0042RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0043RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Paisaje de película', N'La bahía de San Lorenzo es preciosa. El guía explicó muy bien la historia taína de las pinturas en la Cueva de la Línea.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -10, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0043RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0044RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buen complemento a la playa', N'Altos de Chavón tiene una vista hermosa sobre el río Chavón. La basílica es impresionante por dentro. Un día cultural muy completo.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -123, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0044RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0045RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Puerto Plata con color', N'Las casas victorianas, la Calle de la Sombrilla y el teleférico al final. Las fotos quedan espectaculares.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -88, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0045RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0046RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Adrenalina pura', N'Doce líneas sobre la selva, una más alta que la otra. El equipo de seguridad revisa todo dos veces y te hace sentir muy confiado.', N'Patricia, gracias por volar con nosotros. La línea 12 siempre deja a todos sin palabras.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -107, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -108, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0046RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0047RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Muy divertido', N'Fuimos con mi hijo de doce años y le encantó. Instructores jóvenes y con mucha energía.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -38, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0047RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0048RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Volar sobre el valle', N'Ver los campos de cultivo de Constanza desde el aire es indescriptible. El piloto me dio total confianza.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -68, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0048RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0049RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Frío y aventura', N'Senderos de tierra entre pinos y la pirámide de Valle Nuevo. Lleven abrigo, la temperatura baja bastante.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -93, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0049RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0050RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Agua cristalina', N'Vimos peces de colores, una tortuga y un arrecife muy bien conservado. La comida a bordo, sencilla pero rica.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -173, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0050RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0051RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'La aventura más divertida', N'Saltar y deslizarse por los charcos es una experiencia única. Los guías te ayudan en cada salto y hay opción de saltar menos.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -78, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0051RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0052RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'La mejor villa de nuestra vida', N'Celebramos los 60 años de mi papá con toda la familia. La piscina frente al mar, el mayordomo y la playa privada lo hicieron perfecto.', N'Héctor, gracias por celebrar con nosotros. Felicidades de nuevo a su papá.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -143, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -144, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0052RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0053RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Espectacular', N'La vista desde la terraza al atardecer es inolvidable. Todo impecable. Está algo lejos del pueblo, conviene alquilar carrito de golf.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -55, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0053RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0054RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Un día de lujo', N'El capitán nos llevó hasta el río Chavón y paramos a nadar en agua cristalina. Las bebidas frías y la música, perfectas.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -38, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0054RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0055RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Los niños no querían irse', N'Los toboganes de espiral son muy divertidos y la zona infantil tiene salvavidas pendientes todo el tiempo. Buen almuerzo.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0055RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0056RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Para toda la familia', N'Hicimos el recorrido de siete charcos con los niños. Agua fresca, cascadas y mucha risa. Lleven zapatos de agua.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -24, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0056RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0057RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Rápido y sin sorpresas', N'Me entregaron el auto en diez minutos al salir del aeropuerto. Limpio, con el tanque lleno y el precio igual al de la reserva.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -44, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0057RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0058RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Buena opción económica', N'Consume poco y es cómodo para la autopista hacia Punta Cana. La devolución en otra ciudad fue muy fácil.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0058RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0059RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Perfecto para la familia', N'Viajamos siete con todo el equipaje sin problemas. El personal de Caribe Rent nos esperó aunque el vuelo llegó tarde.', N'Gracias, Héctor. Siempre monitoreamos los vuelos para esperar a nuestros clientes.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -62, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -63, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0059RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0060RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'La costa norte con la capota abajo', N'Puerto Plata, Sosúa y Cabarete en un convertible fue inolvidable. Auto impecable y entrega puntual.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0060RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0061RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Llegamos a Playa Frontón', N'Sin un 4x4 no hubiéramos llegado a las playas escondidas de Samaná. El límite de 250 km diarios fue más que suficiente.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -84, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0061RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0062RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Un campo de otro mundo', N'Los hoyos junto al mar son espectaculares y el caddie conocía cada green. Una experiencia que todo golfista debe vivir.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -43, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0062RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDV0063RS')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'En el corazón de la Zona Colonial', N'La recepción nos atendió de maravilla y nos recomendó restaurantes cercanos. Habitación con mucho encanto colonial.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -24, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDV0063RS';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN2P8K4T')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Las piscinas con puentes son preciosas', N'Pasamos cuatro días entre la playa y las piscinas. La comida del restaurante criollo fue lo mejor, y el personal siempre atento con una sonrisa.', N'Gracias, Laura. Le contaremos al equipo del restaurante criollo.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -33, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -34, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN2P8K4T';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN3Q7M2V')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Ideal para ir con niños', N'La habitación familiar tenía espacio de sobra y la playa es tranquila. Recomiendo reservar el restaurante de mariscos al llegar porque se llena.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -88, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN3Q7M2V';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN5S4Y3Z')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'La mejor noche del viaje', N'Caminar por la Zona Colonial iluminada y terminar bailando son con los músicos fue mágico. El guía nos enseñó los pasos básicos con mucha paciencia.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN5S4Y3Z';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN6T3A9B')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Música de verdad', N'Nada de espectáculo para turistas: músicos del barrio tocando tambores y güira. Fuimos cuatro amigos y repetiríamos sin dudarlo.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -59, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN6T3A9B';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN7U2C8D')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Vista increíble de la bahía', N'La última línea, sobre el bosque y con la bahía de fondo, vale el viaje. Los guías revisan el equipo en cada plataforma y te hacen sentir seguro.', N'Gracias, Yesenia. Esa última línea es la favorita del equipo también.',
           DATEADD(HOUR, 10, CAST(DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))), 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -31, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN7U2C8D';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN8V9E7F')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Adrenalina en familia', N'Mi hijo de diez años la disfrutó tanto como nosotros. Llevamos zapatos cerrados como recomiendan y agua; el transporte salió puntual.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -73, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN8V9E7F';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDN9W8G6H')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 8, N'Un oasis en la ciudad', N'Cuesta creer que esas lagunas estén en plena capital. La bajada tiene muchos escalones, así que conviene ir con calzado cómodo.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -12, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDN9W8G6H';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDP2X7J5K')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Vimos ballenas a pocos metros', N'Fuimos en febrero y vimos tres grupos de ballenas jorobadas. El capitán apagó los motores para no molestarlas. Almuerzo rico en Cayo Levantado.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -278, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDP2X7J5K';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDP3Y6L4M')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 10, N'Punta Cana desde el aire', N'Veinte minutos que se sienten como un sueño: el agua turquesa y la línea de playa infinita. Nos recogieron en el hotel a la hora exacta.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -46, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDP3Y6L4M';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDP5A4Q2R')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Cómoda y económica', N'La CR-V consumió poco y cupieron todas las maletas. La entrega en el aeropuerto fue rápida y el vehículo estaba impecable.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -59, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDP5A4Q2R';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = N'BRDP6B3S9T')
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, 9, N'Perfecta para los caminos de Samaná', N'Con el Jimny llegamos a Playa Frontón y a Playa Moróns sin problema. Es pequeño, pero para dos personas con mochilas sobra espacio.', NULL,
           NULL, 1, DATEADD(HOUR, 10, CAST(DATEADD(DAY, -24, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.reservas r WHERE r.codigo = N'BRDP6B3S9T';
GO
-- 4.10 Publicaciones guardadas por los viajeros
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.hoteles h ON h.id_hotel = f.id_hotel
               WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Paraíso Escondido Eco-Resort')
    INSERT INTO dbo.favoritos (id_usuario, id_hotel, fecha_creacion)
    SELECT u.id_usuario, h.id_hotel, DATEADD(HOUR, 18, CAST(DATEADD(DAY, -20, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Paraíso Escondido Eco-Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.actividades a ON a.id_actividad = f.id_actividad
               WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Excursión en catamarán a Isla Saona')
    INSERT INTO dbo.favoritos (id_usuario, id_actividad, fecha_creacion)
    SELECT u.id_usuario, a.id_actividad, DATEADD(HOUR, 18, CAST(DATEADD(DAY, -19, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'Excursión en catamarán a Isla Saona';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.actividades a ON a.id_actividad = f.id_actividad
               WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'27 Charcos de Damajagua')
    INSERT INTO dbo.favoritos (id_usuario, id_actividad, fecha_creacion)
    SELECT u.id_usuario, a.id_actividad, DATEADD(HOUR, 18, CAST(DATEADD(DAY, -18, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'cliente@bookingrd.com' AND a.nombre = N'27 Charcos de Damajagua';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.hoteles h ON h.id_hotel = f.id_hotel
               WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Palma Real Haven Resort')
    INSERT INTO dbo.favoritos (id_usuario, id_hotel, fecha_creacion)
    SELECT u.id_usuario, h.id_hotel, DATEADD(HOUR, 18, CAST(DATEADD(DAY, -17, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u CROSS JOIN dbo.hoteles h
    WHERE u.correo = N'cliente@bookingrd.com' AND h.nombre = N'Palma Real Haven Resort';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.actividades a ON a.id_actividad = f.id_actividad
               WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Ascenso al Pico Duarte')
    INSERT INTO dbo.favoritos (id_usuario, id_actividad, fecha_creacion)
    SELECT u.id_usuario, a.id_actividad, DATEADD(HOUR, 18, CAST(DATEADD(DAY, -16, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u CROSS JOIN dbo.actividades a
    WHERE u.correo = N'luis.fernandez@correo.com' AND a.nombre = N'Ascenso al Pico Duarte';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.vehiculos v ON v.id_vehiculo = f.id_vehiculo
               WHERE u.correo = N'cliente@bookingrd.com' AND v.nombre = N'Ford Mustang Convertible')
    INSERT INTO dbo.favoritos (id_usuario, id_vehiculo, fecha_creacion)
    SELECT u.id_usuario, v.id_vehiculo, DATEADD(HOUR, 18, CAST(DATEADD(DAY, -15, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u CROSS JOIN dbo.vehiculos v
    WHERE u.correo = N'cliente@bookingrd.com' AND v.nombre = N'Ford Mustang Convertible';
GO
-- 4.11 Mensajes del formulario de contacto
IF NOT EXISTS (SELECT 1 FROM dbo.mensajes_contacto WHERE correo = N'rosa.almanzar@correo.com' AND asunto = N'empresa')
    INSERT INTO dbo.mensajes_contacto (nombre, correo, asunto, mensaje, atendido, fecha_envio)
    VALUES (N'Rosa Almánzar', N'rosa.almanzar@correo.com', N'empresa', N'Tenemos un hostal en Constanza y queremos publicarlo. ¿Qué requisitos piden?', 0, DATEADD(HOUR, 16, CAST(DATEADD(DAY, -3, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))));
GO
IF NOT EXISTS (SELECT 1 FROM dbo.mensajes_contacto WHERE correo = N'kevin.mejia@correo.com' AND asunto = N'viajero')
    INSERT INTO dbo.mensajes_contacto (nombre, correo, asunto, mensaje, atendido, fecha_envio)
    VALUES (N'Kevin Mejía', N'kevin.mejia@correo.com', N'viajero', N'No me llegó el correo de confirmación de la reserva, aunque tengo el código.', 1, DATEADD(HOUR, 16, CAST(DATEADD(DAY, -5, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0))));
GO
-- 4.12 Tienda de artesanía: productos
INSERT INTO dbo.productos (nombre, categoria, descripcion, taller, origen, precio, existencias, imagen_url, destacado)
SELECT v.* FROM (VALUES
        (N'Colgante de larimar en plata 925', N'larimar', N'Larimar azul cielo de la mina de Los Chupaderos, pulido a mano y montado en plata 925 con cadena de 45 cm. Cada piedra tiene un dibujo único.', N'Taller Larimar del Sur', N'Barahona', 4200, 18, N'img/productos/colgante-larimar.jpg', 1),
        (N'Aretes de larimar en gota', N'larimar', N'Par de aretes de larimar en forma de gota con gancho de plata 925. Ligeros para el uso diario.', N'Taller Larimar del Sur', N'Barahona', 3100, 22, N'img/productos/aretes-larimar.jpg', 0),
        (N'Dije de ámbar dominicano', N'ambar', N'Ámbar de la Cordillera Septentrional tallado en facetas, con certificado de autenticidad del taller. Algunas piezas conservan pequeñas inclusiones naturales.', N'Ámbar Septentrional', N'Puerto Plata', 3800, 12, N'img/productos/dije-ambar.jpg', 1),
        (N'Pulsera de ámbar y semillas', N'ambar', N'Pulsera elástica de cuentas de ámbar pulido alternadas con semillas de jabilla, hecha por artesanas de Santiago.', N'Ámbar Septentrional', N'Santiago', 1900, 30, N'img/productos/pulsera-ambar.jpg', 0),
        (N'Cuadro de petroglifos taínos', N'arte', N'Pintura acrílica sobre lienzo de 40 x 50 cm inspirada en los petroglifos de Las Caritas del Lago Enriquillo, firmada por el artista.', N'Colectivo Arte Taíno', N'Santo Domingo', 6800, 6, N'img/productos/cuadro-petroglifos.jpg', 1),
        (N'Cemí taíno tallado en piedra', N'arte', N'Réplica de un cemí de tres puntas tallada en piedra caliza coralina, de unos 15 cm. Se entrega con una nota sobre su significado.', N'Colectivo Arte Taíno', N'La Romana', 2600, 10, N'img/productos/cemi-taino.jpg', 0),
        (N'Café de Jarabacoa, 454 g', N'cafe-cacao', N'Café arábica de altura cultivado a más de 1,000 metros, tostado medio y molido para colador o greca. Notas a chocolate y caña.', N'Cooperativa Cafetalera de la Cordillera', N'Jarabacoa', 850, 60, N'img/productos/cafe-jarabacoa.jpg', 1),
        (N'Chocolate 70 % de cacao orgánico', N'cafe-cacao', N'Barra de 80 g de cacao orgánico fermentado en la finca, con solo azúcar de caña. Del grano a la barra en San Francisco de Macorís.', N'Cacao del Cibao', N'San Francisco de Macorís', 450, 80, N'img/productos/chocolate-sfm.jpg', 0),
        (N'Bolas de cacao para chocolate caliente', N'cafe-cacao', N'Seis bolas de cacao puro con canela, como se preparan en el campo dominicano. Se disuelven en leche caliente con un poco de azúcar.', N'Cacao del Cibao', N'San Francisco de Macorís', 520, 45, N'img/productos/bolas-cacao.jpg', 0),
        (N'Muñeca Limé sin rostro', N'artesania', N'Muñeca de barro de 25 cm con vestido de flores pintado a mano, el recuerdo más típico de la artesanía dominicana. Su rostro sin rasgos representa a la mujer de todas las razas del país.', N'Artesanas de Higüerito', N'Moca', 1650, 25, N'img/productos/muneca-lime.jpg', 1),
        (N'Máscara de diablo cojuelo', N'artesania', N'Máscara de carnaval en papel maché con cuernos y colores vivos, hecha por los mismos artesanos que preparan las comparsas del carnaval de La Vega.', N'Comparsa Los Cojuelos', N'La Vega', 2400, 8, N'img/productos/mascara-carnaval.jpg', 0)
) AS v (nombre, categoria, descripcion, taller, origen, precio, existencias, imagen_url, destacado)
WHERE NOT EXISTS (SELECT 1 FROM dbo.productos p WHERE p.nombre = v.nombre);
GO
-- 4.13 Pedidos de la tienda (pago simulado con tarjeta)
IF NOT EXISTS (SELECT 1 FROM dbo.pedidos WHERE codigo = N'PEDK4M7Q2A')
BEGIN
    INSERT INTO dbo.pedidos (codigo, id_usuario, entrega, destinatario, direccion, telefono, subtotal, envio, total, estado,
                             pago_marca, pago_ultimos4, pago_titular, pago_referencia, pago_autorizacion, fecha_creacion)
    SELECT N'PEDK4M7Q2A', u.id_usuario, N'hotel', N'María Rodríguez', N'Coralia Grand Resort & Spa, Playa Bávaro, Punta Cana', N'809-555-0190', 5900, 0, 5900, N'entregado', N'Visa', N'4242', u.nombre, N'PAYK4M7Q2AT', N'326263', DATEADD(HOUR, 16, CAST(DATEADD(DAY, -6, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u WHERE u.correo = N'cliente@bookingrd.com';

    INSERT INTO dbo.pedido_detalle (id_pedido, id_producto, cantidad, precio_unitario)
    SELECT pe.id_pedido, pr.id_producto, v.cantidad, pr.precio
    FROM (VALUES (N'Colgante de larimar en plata 925', 1), (N'Café de Jarabacoa, 454 g', 2)) AS v (nombre, cantidad)
    INNER JOIN dbo.productos pr ON pr.nombre = v.nombre
    CROSS JOIN dbo.pedidos pe
    WHERE pe.codigo = N'PEDK4M7Q2A';
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.pedidos WHERE codigo = N'PEDP8T3W6B')
BEGIN
    INSERT INTO dbo.pedidos (codigo, id_usuario, entrega, destinatario, direccion, telefono, subtotal, envio, total, estado,
                             pago_marca, pago_ultimos4, pago_titular, pago_referencia, pago_autorizacion, fecha_creacion)
    SELECT N'PEDP8T3W6B', u.id_usuario, N'domicilio', N'Luis Fernández', N'Calle Las Carreras 14, Santiago de los Caballeros', N'829-555-0111', 3000, 450, 3450, N'enviado', N'Visa', N'4242', u.nombre, N'PAYP8T3W6BT', N'498275', DATEADD(HOUR, 16, CAST(DATEADD(DAY, -2, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))
    FROM dbo.usuarios u WHERE u.correo = N'luis.fernandez@correo.com';

    INSERT INTO dbo.pedido_detalle (id_pedido, id_producto, cantidad, precio_unitario)
    SELECT pe.id_pedido, pr.id_producto, v.cantidad, pr.precio
    FROM (VALUES (N'Muñeca Limé sin rostro', 1), (N'Chocolate 70 % de cacao orgánico', 3)) AS v (nombre, cantidad)
    INNER JOIN dbo.productos pr ON pr.nombre = v.nombre
    CROSS JOIN dbo.pedidos pe
    WHERE pe.codigo = N'PEDP8T3W6B';
END
GO

PRINT N'Instalación de BookingRD completada.';
GO
