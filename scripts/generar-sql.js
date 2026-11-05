/**
 * @file scripts/generar-sql.js
 * @description Genera los scripts de instalación de la base de datos a partir
 *   de la estructura (database/esquema.sql) y de los datos de demostración
 *   (database/datos-demo.js). Uso: `npm run bd:generar`.
 *
 *   Resultado
 *     database/instalacion-completa.sql  servidor local (crea la base, el login
 *                                        y el usuario) o Azure desde el marcador
 *                                        @inicio-esquema.
 *     database/instalacion-azure.sql     solo tablas, índices y datos, para
 *                                        ejecutar conectado a la base de Azure
 *                                        (SSMS o VS Code con la extensión mssql).
 *
 *   Todas las inserciones son idempotentes (IF NOT EXISTS por clave natural) y
 *   las fechas de las reservas son relativas al día de la instalación.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const datos = require('../database/datos-demo');

const RAIZ = path.join(__dirname, '..');
const MARCADOR = '-- @inicio-esquema';

/* ---------------------------------------------------------------------------
 * Literales T-SQL
 * ------------------------------------------------------------------------- */

/** Valor JavaScript a literal T-SQL. */
function sql(valor) {
    if (valor === null || valor === undefined) return 'NULL';
    if (typeof valor === 'boolean') return valor ? '1' : '0';
    if (typeof valor === 'number') {
        if (!Number.isFinite(valor)) throw new Error(`Número inválido: ${valor}`);
        return String(valor);
    }
    return `N'${String(valor).replace(/'/g, "''")}'`;
}

/** Fecha relativa al día de instalación (DATE). */
const dia = (desplazamiento) => `DATEADD(DAY, ${desplazamiento}, CAST(SYSUTCDATETIME() AS DATE))`;

/** Fecha y hora relativas (DATETIME2) a una hora fija del día. */
const instante = (desplazamiento, hora) =>
    `DATEADD(HOUR, ${hora}, CAST(DATEADD(DAY, ${desplazamiento}, CAST(SYSUTCDATETIME() AS DATE)) AS DATETIME2(0)))`;

const TABLA = { hotel: 'hoteles', actividad: 'actividades', vehiculo: 'vehiculos' };
const ID = { hotel: 'id_hotel', actividad: 'id_actividad', vehiculo: 'id_vehiculo' };

/** Días relativos de creación y cancelación de una reserva (siempre en el pasado). */
function fechasRegistro(reserva) {
    const creacion = Math.min(reserva.inicio - 21, -2);
    return { creacion, cancelacion: creacion + 1 };
}

/* ---------------------------------------------------------------------------
 * Bloques de inserción
 * ------------------------------------------------------------------------- */

const lotes = [];
const agregar = (comentario, texto) => {
    if (comentario) lotes.push(`-- ${comentario}`);
    lotes.push(`${texto.trim()}\nGO`);
};

function usuarios() {
    agregar('4.1 Cuentas de administración, viajeros y representantes de empresas', '');
    lotes.pop();
    for (const u of datos.usuarios) {
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE correo = ${sql(u.correo)})
    INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol, activo)
    VALUES (${[u.nombre, u.correo, u.telefono, datos.CLAVES[u.clave], u.rol].map(sql).join(', ')}, ${u.activo === false ? 0 : 1});`);
    }
}

const COLUMNAS_EMPRESA = ['cargo_representante', 'nombre_comercial', 'razon_social', 'rnc', 'telefono', 'provincia', 'ciudad',
    'direccion', 'sitio_web', 'licencia_mitur', 'tipo_servicio', 'tipo_alojamiento', 'numero_habitaciones',
    'categorias_actividad', 'descripcion'];

function empresas() {
    lotes.push('-- 4.2 Empresas');
    for (const e of datos.empresas) {
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.empresas WHERE rnc = ${sql(e.rnc)})
    INSERT INTO dbo.empresas (id_usuario, ${COLUMNAS_EMPRESA.join(', ')})
    SELECT u.id_usuario, ${COLUMNAS_EMPRESA.map((c) => sql(e[c])).join(', ')}
    FROM dbo.usuarios u WHERE u.correo = ${sql(e.correo)};`);
    }
}

const COLUMNAS_PUBLICACION = {
    hotel: ['nombre', 'tipo_alojamiento', 'ciudad', 'direccion', 'descripcion', 'servicios', 'precio_noche',
        'capacidad_personas', 'habitaciones', 'imagen_url', 'destacado'],
    actividad: ['nombre', 'categoria', 'ciudad', 'punto_encuentro', 'descripcion', 'incluye', 'duracion_horas',
        'precio_persona', 'cupo_diario', 'imagen_url', 'destacado'],
    vehiculo: ['nombre', 'marca', 'modelo', 'anio', 'categoria', 'transmision', 'combustible', 'pasajeros', 'puertas',
        'maletas', 'aire', 'km_por_dia', 'ciudad', 'lugar_recogida', 'descripcion', 'incluye', 'precio_dia', 'deposito',
        'edad_minima', 'cargo_conductor_joven', 'cargo_otra_ciudad', 'unidades', 'imagen_url', 'destacado']
};

function publicaciones(tipo, titulo) {
    lotes.push(`-- ${titulo}`);
    const columnas = COLUMNAS_PUBLICACION[tipo];
    datos[TABLA[tipo]].forEach((p, indice) => {
        const valores = columnas.map((c) => {
            if (c === 'aire') return sql(p.aire !== false);
            if (c === 'destacado') return sql(Boolean(p.destacado));
            return sql(p[c]);
        });
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.${TABLA[tipo]} WHERE nombre = ${sql(p.nombre)})
    INSERT INTO dbo.${TABLA[tipo]} (id_empresa, ${columnas.join(', ')}, fecha_creacion)
    SELECT e.id_empresa, ${valores.join(', ')}, ${instante(-300 + indice * 3, 12)}
    FROM dbo.empresas e WHERE e.rnc = ${sql(p.empresa)};`);
    });
}

/** Combos: alojamiento y una o dos actividades con descuento (claves naturales: nombres). */
function combos() {
    lotes.push('-- 4.6 Combos de alojamiento y actividades');
    for (const c of datos.combos) {
        const segunda = c.actividad2 ? `a2.id_actividad` : 'NULL';
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.combos WHERE nombre = ${sql(c.nombre)})
    INSERT INTO dbo.combos (nombre, lema, descripcion, ciudad, id_hotel, id_actividad, id_actividad2, dia_actividad,
                            dia_actividad2, noches_sugeridas, descuento_pct, destacado)
    SELECT ${[c.nombre, c.lema, c.descripcion, c.ciudad].map(sql).join(', ')}, h.id_hotel, a.id_actividad, ${segunda},
           ${sql(c.dia_actividad)}, ${sql(c.actividad2 ? c.dia_actividad2 : null)}, ${sql(c.noches_sugeridas)}, ${sql(c.descuento_pct)}, ${sql(Boolean(c.destacado))}
    FROM dbo.hoteles h CROSS JOIN dbo.actividades a${c.actividad2 ? ' CROSS JOIN dbo.actividades a2' : ''}
    WHERE h.nombre = ${sql(c.hotel)} AND a.nombre = ${sql(c.actividad)}${c.actividad2 ? ` AND a2.nombre = ${sql(c.actividad2)}` : ''};`);
    }
}

function reservas() {
    lotes.push('-- 4.7 Reservas (fechas relativas al día de la instalación)');
    for (const r of datos.reservas) {
        const { creacion, cancelacion } = fechasRegistro(r);
        const cancelada = r.estado === 'cancelada';
        const p = r.tipo.charAt(0);
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.reservas WHERE codigo = ${sql(r.codigo)})
    INSERT INTO dbo.reservas
        (codigo, id_usuario, ${ID[r.tipo]}, fecha_inicio, fecha_fin, hora_inicio, hora_fin, ciudad_devolucion,
         edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, estado, comentario,
         fecha_creacion, fecha_cancelacion, id_combo)
    SELECT ${sql(r.codigo)}, u.id_usuario, ${p}.${ID[r.tipo]}, ${dia(r.inicio)}, ${r.fin === undefined ? 'NULL' : dia(r.fin)},
           ${sql(r.hora_inicio)}, ${sql(r.hora_fin)}, ${sql(r.ciudad_devolucion)}, ${sql(r.edad_conductor)}, ${sql(r.extras)},
           ${sql(r.deposito)}, ${sql(r.personas)}, ${sql(r.habitaciones)}, ${sql(r.precio_unitario)}, ${sql(r.total)},
           ${sql(cancelada ? 'cancelada' : 'confirmada')}, ${sql(r.comentario)},
           ${instante(creacion, 15)}, ${cancelada ? instante(cancelacion, 10) : 'NULL'},
           ${r.combo ? `(SELECT id_combo FROM dbo.combos WHERE nombre = ${sql(r.combo)})` : 'NULL'}
    FROM dbo.usuarios u CROSS JOIN dbo.${TABLA[r.tipo]} ${p}
    WHERE u.correo = ${sql(r.usuario)} AND ${p}.nombre = ${sql(r.publicacion)};`);
    }
}

/**
 * Pagos de demostración (datos.pagoDemo): un solo lote con todas las filas.
 * La fecha del pago es la de creación de la reserva; la del reembolso, la de
 * cancelación. El titular es el nombre del viajero.
 */
function pagos() {
    lotes.push('-- 4.8 Pagos de las reservas (pasarela simulada: solo marca y últimos 4 dígitos)');
    const filas = datos.reservas.map((r) => {
        const p = datos.pagoDemo(r);
        const { creacion, cancelacion } = fechasRegistro(r);
        return `        (${sql(r.codigo)}, ${sql(p.metodo)}, ${sql(p.estado)}, ${sql(p.monto)}, ${sql(p.marca)}, ${sql(p.ultimos4)}, `
            + `${sql(p.referencia)}, ${sql(p.autorizacion)}, ${instante(creacion, 15)}, `
            + `${p.estado === 'reembolsado' ? instante(cancelacion, 10) : 'NULL'})`;
    });
    agregar(null, `
INSERT INTO dbo.pagos (id_reserva, metodo, estado, monto, marca, ultimos4, titular, referencia, autorizacion, fecha_pago, fecha_reembolso)
SELECT r.id_reserva, v.metodo, v.estado, v.monto, v.marca, v.ultimos4,
       CASE WHEN v.metodo = 'tarjeta' THEN u.nombre END, v.referencia, v.autorizacion, v.fecha_pago, v.fecha_reembolso
FROM (VALUES
${filas.join(',\n')}
) AS v (codigo, metodo, estado, monto, marca, ultimos4, referencia, autorizacion, fecha_pago, fecha_reembolso)
INNER JOIN dbo.reservas r ON r.codigo = v.codigo
INNER JOIN dbo.usuarios u ON u.id_usuario = r.id_usuario
WHERE NOT EXISTS (SELECT 1 FROM dbo.pagos p WHERE p.id_reserva = r.id_reserva);`);
}

function resenas() {
    lotes.push('-- 4.9 Reseñas de reservas ya disfrutadas (dos días después de terminar)');
    const porCodigo = new Map(datos.reservas.map((r) => [r.codigo, r]));
    for (const s of datos.resenas) {
        const r = porCodigo.get(s.reserva);
        if (!r) throw new Error(`Reseña de una reserva inexistente: ${s.reserva}`);
        const final = r.fin === undefined ? r.inicio : r.fin;
        if (final > -2) throw new Error(`La reserva ${s.reserva} aún no ha terminado; no puede tener reseña.`);
        if (r.estado === 'cancelada') throw new Error(`La reserva ${s.reserva} está cancelada; no puede tener reseña.`);
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.resenas rs INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva WHERE r.codigo = ${sql(s.reserva)})
    INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario, respuesta, fecha_respuesta, visible, fecha_creacion)
    SELECT r.id_reserva, ${sql(s.puntuacion)}, ${sql(s.titulo)}, ${sql(s.comentario)}, ${sql(s.respuesta)},
           ${s.respuesta ? instante(final + 3, 10) : 'NULL'}, ${s.visible === false ? 0 : 1}, ${instante(final + 2, 10)}
    FROM dbo.reservas r WHERE r.codigo = ${sql(s.reserva)};`);
    }
}

function favoritos() {
    lotes.push('-- 4.10 Publicaciones guardadas por los viajeros');
    datos.favoritos.forEach((f, indice) => {
        const p = f.tipo.charAt(0);
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.favoritos f INNER JOIN dbo.usuarios u ON u.id_usuario = f.id_usuario
               INNER JOIN dbo.${TABLA[f.tipo]} ${p} ON ${p}.${ID[f.tipo]} = f.${ID[f.tipo]}
               WHERE u.correo = ${sql(f.usuario)} AND ${p}.nombre = ${sql(f.publicacion)})
    INSERT INTO dbo.favoritos (id_usuario, ${ID[f.tipo]}, fecha_creacion)
    SELECT u.id_usuario, ${p}.${ID[f.tipo]}, ${instante(-20 + indice, 18)}
    FROM dbo.usuarios u CROSS JOIN dbo.${TABLA[f.tipo]} ${p}
    WHERE u.correo = ${sql(f.usuario)} AND ${p}.nombre = ${sql(f.publicacion)};`);
    });
}

function mensajes() {
    lotes.push('-- 4.11 Mensajes del formulario de contacto');
    datos.mensajes.forEach((m, indice) => {
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.mensajes_contacto WHERE correo = ${sql(m.correo)} AND asunto = ${sql(m.asunto)})
    INSERT INTO dbo.mensajes_contacto (nombre, correo, asunto, mensaje, atendido, fecha_envio)
    VALUES (${[m.nombre, m.correo, m.asunto, m.mensaje].map(sql).join(', ')}, ${m.atendido ? 1 : 0}, ${instante(-3 - indice * 2, 16)});`);
    });
}

/** Tienda de artesanía: productos y pedidos de ejemplo con su detalle. */
function tienda() {
    lotes.push('-- 4.12 Tienda de artesanía: productos');
    const columnas = ['nombre', 'categoria', 'descripcion', 'taller', 'origen', 'precio', 'existencias', 'imagen_url'];
    const filas = datos.productos.map((p) => `        (${columnas.map((c) => sql(p[c])).join(', ')}, ${sql(Boolean(p.destacado))})`);
    agregar(null, `
INSERT INTO dbo.productos (${columnas.join(', ')}, destacado)
SELECT v.* FROM (VALUES
${filas.join(',\n')}
) AS v (${columnas.join(', ')}, destacado)
WHERE NOT EXISTS (SELECT 1 FROM dbo.productos p WHERE p.nombre = v.nombre);`);

    lotes.push('-- 4.13 Pedidos de la tienda (pago simulado con tarjeta)');
    for (const p of datos.pedidos) {
        const importe = datos.pedidoDemo(p);
        agregar(null, `
IF NOT EXISTS (SELECT 1 FROM dbo.pedidos WHERE codigo = ${sql(p.codigo)})
BEGIN
    INSERT INTO dbo.pedidos (codigo, id_usuario, entrega, destinatario, direccion, telefono, subtotal, envio, total, estado,
                             pago_marca, pago_ultimos4, pago_titular, pago_referencia, pago_autorizacion, fecha_creacion)
    SELECT ${[p.codigo].map(sql)}, u.id_usuario, ${[p.entrega, p.destinatario, p.direccion, p.telefono, importe.subtotal, importe.envio, importe.total, p.estado,
        importe.pago_marca, importe.pago_ultimos4].map(sql).join(', ')}, u.nombre, ${sql(importe.pago_referencia)}, ${sql(importe.pago_autorizacion)}, ${instante(p.dias, 16)}
    FROM dbo.usuarios u WHERE u.correo = ${sql(p.usuario)};

    INSERT INTO dbo.pedido_detalle (id_pedido, id_producto, cantidad, precio_unitario)
    SELECT pe.id_pedido, pr.id_producto, v.cantidad, pr.precio
    FROM (VALUES ${p.productos.map(([n, c]) => `(${sql(n)}, ${c})`).join(', ')}) AS v (nombre, cantidad)
    INNER JOIN dbo.productos pr ON pr.nombre = v.nombre
    CROSS JOIN dbo.pedidos pe
    WHERE pe.codigo = ${sql(p.codigo)};
END`);
    }
}

/* ---------------------------------------------------------------------------
 * Generación de los archivos
 * ------------------------------------------------------------------------- */

usuarios();
empresas();
publicaciones('hotel', '4.3 Alojamiento');
publicaciones('actividad', '4.4 Actividades');
publicaciones('vehiculo', '4.5 Autos de alquiler');
combos();
reservas();
pagos();
resenas();
favoritos();
mensajes();
tienda();

const cuentas = `-- Contraseñas de demostración (hash bcrypt de 10 rondas):
--   admin@bookingrd.com      Admin123!     administración de la plataforma
--   cliente@bookingrd.com    Cliente123!   viajero (también los demás viajeros de ejemplo)
${datos.empresas.map((e) => `--   ${e.correo.padEnd(24)} Empresa123!   ${e.nombre_comercial}`).join('\n')}`;

const seccionDatos = `
-- -----------------------------------------------------------------------------
-- 4. Datos de demostración
-- -----------------------------------------------------------------------------
-- Generado por scripts/generar-sql.js a partir de database/datos-demo.js.
-- No editar a mano: los cambios se pierden al volver a generar.
--
${cuentas}
--
-- Cada inserción se omite si el registro ya existe, por lo que el script
-- puede ejecutarse más de una vez.

${lotes.join('\n')}

PRINT N'Instalación de BookingRD completada.';
GO
`;

const esquema = fs.readFileSync(path.join(RAIZ, 'database', 'esquema.sql'), 'utf8').replace(/^﻿/, '').trimEnd();
const completo = `${esquema}\n${seccionDatos}`;
fs.writeFileSync(path.join(RAIZ, 'database', 'instalacion-completa.sql'), completo, 'utf8');

const inicio = completo.indexOf(MARCADOR);
if (inicio === -1) throw new Error(`Falta el marcador ${MARCADOR} en database/esquema.sql.`);
const azure = `/*
================================================================================
  BookingRD - Instalación en Azure SQL Database
================================================================================
  Forma recomendada: \`npm run bd:instalar\` (usa la conexión de .env).
  Alternativa: abrir este archivo en SQL Server Management Studio o en VS Code
  con la extensión SQL Server (mssql), conectado a la base BookingRD (no a
  master), y ejecutarlo completo. Las líneas GO separan los lotes.

  Crea las tablas e índices y carga los datos de demostración. Es idempotente.
  Generado por scripts/generar-sql.js; no editar a mano.
================================================================================
*/

${completo.slice(inicio)}`;
fs.writeFileSync(path.join(RAIZ, 'database', 'instalacion-azure.sql'), azure, 'utf8');

console.log(`database/instalacion-completa.sql y database/instalacion-azure.sql generados (${lotes.length} bloques de datos).`);
