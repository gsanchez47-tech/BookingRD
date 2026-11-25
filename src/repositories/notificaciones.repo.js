/**
 * @file src/repositories/notificaciones.repo.js
 * @description Avisos de la campana (dbo.notificaciones) y consultas de los
 *   correos automáticos: recordatorio un día antes y solicitud de reseña.
 */

const { peticion, sql } = require('../config/db');
const { aIso } = require('../utils/fechas');

const aNotificacion = (f) => ({
    id: f.id_notificacion,
    tipo: f.tipo,
    titulo: f.titulo,
    mensaje: f.mensaje,
    enlace: f.enlace,
    leida: Boolean(f.leida),
    fecha: f.fecha instanceof Date ? f.fecha.toISOString() : f.fecha
});

async function crear({ idUsuario, tipo, titulo, mensaje, enlace = null }) {
    const consulta = await peticion();
    await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .input('tipo', sql.VarChar(30), tipo)
        .input('titulo', sql.NVarChar(150), String(titulo).slice(0, 150))
        .input('mensaje', sql.NVarChar(400), String(mensaje).slice(0, 400))
        .input('enlace', sql.NVarChar(300), enlace)
        .query(`INSERT INTO dbo.notificaciones (id_usuario, tipo, titulo, mensaje, enlace)
                VALUES (@idUsuario, @tipo, @titulo, @mensaje, @enlace)`);
}

/** Últimos 20 avisos y cuántos no se han leído. */
async function listar(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query(`
            SELECT TOP 20 id_notificacion, tipo, titulo, mensaje, enlace, leida, fecha
            FROM dbo.notificaciones WHERE id_usuario = @idUsuario
            ORDER BY fecha DESC, id_notificacion DESC;
            SELECT COUNT(*) AS sin_leer FROM dbo.notificaciones WHERE id_usuario = @idUsuario AND leida = 0;
        `);
    return { notificaciones: resultado.recordsets[0].map(aNotificacion), sinLeer: resultado.recordsets[1][0].sin_leer };
}

async function marcarLeidas(idUsuario) {
    const consulta = await peticion();
    await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query('UPDATE dbo.notificaciones SET leida = 1 WHERE id_usuario = @idUsuario AND leida = 0');
}

const COLUMNAS_AVISO = `
    r.id_reserva, r.codigo, r.id_usuario, r.fecha_inicio, r.fecha_fin, r.hora_inicio, r.personas, r.habitaciones,
    u.nombre AS cliente, u.correo,
    CASE WHEN r.id_hotel IS NOT NULL THEN 'hotel' WHEN r.id_actividad IS NOT NULL THEN 'actividad' ELSE 'vehiculo' END AS tipo,
    COALESCE(r.id_hotel, r.id_actividad, r.id_vehiculo) AS id_publicacion,
    COALESCE(h.nombre, a.nombre, v.nombre) AS publicacion,
    COALESCE(h.ciudad, a.ciudad, v.ciudad) AS ciudad,
    COALESCE(h.imagen_url, a.imagen_url, v.imagen_url) AS imagen_url,
    COALESCE(h.direccion, a.punto_encuentro, v.lugar_recogida) AS lugar`;
const UNIONES_AVISO = `
    FROM dbo.reservas r
    INNER JOIN dbo.usuarios u ON u.id_usuario = r.id_usuario
    LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
    LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
    LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo`;

const aAviso = (f) => ({
    id: f.id_reserva,
    codigo: f.codigo,
    idUsuario: f.id_usuario,
    cliente: f.cliente,
    correo: f.correo,
    tipo: f.tipo,
    idPublicacion: f.id_publicacion,
    publicacion: f.publicacion,
    ciudad: f.ciudad,
    imagenUrl: f.imagen_url,
    lugar: f.lugar,
    fechaInicio: aIso(f.fecha_inicio),
    fechaFin: f.fecha_fin ? aIso(f.fecha_fin) : null,
    personas: f.personas,
    habitaciones: f.habitaciones
});

/** Reservas confirmadas que empiezan en la fecha indicada y aún no tienen recordatorio. */
async function paraRecordatorio(fecha) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('fecha', sql.Date, fecha)
        .query(`SELECT ${COLUMNAS_AVISO} ${UNIONES_AVISO}
                WHERE r.estado = 'confirmada' AND r.recordatorio_enviado = 0 AND r.fecha_inicio = @fecha`);
    return resultado.recordset.map(aAviso);
}

/** Reservas terminadas entre "desde" y "hasta" (inclusive) sin reseña ni solicitud enviada. */
async function paraResena(desde, hasta) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('desde', sql.Date, desde)
        .input('hasta', sql.Date, hasta)
        .query(`SELECT ${COLUMNAS_AVISO} ${UNIONES_AVISO}
                WHERE r.estado = 'confirmada' AND r.resena_pedida = 0
                  AND COALESCE(r.fecha_fin, r.fecha_inicio) BETWEEN @desde AND @hasta
                  AND NOT EXISTS (SELECT 1 FROM dbo.resenas rs WHERE rs.id_reserva = r.id_reserva)`);
    return resultado.recordset.map(aAviso);
}

async function marcarRecordatorio(idReserva) {
    const consulta = await peticion();
    await consulta.input('id', sql.Int, idReserva).query('UPDATE dbo.reservas SET recordatorio_enviado = 1 WHERE id_reserva = @id');
}

async function marcarResenaPedida(idReserva) {
    const consulta = await peticion();
    await consulta.input('id', sql.Int, idReserva).query('UPDATE dbo.reservas SET resena_pedida = 1 WHERE id_reserva = @id');
}

/** Cuenta de la empresa dueña de una publicación (para avisarle de una reserva). */
async function empresaDePublicacion(tipo, idPublicacion) {
    const tabla = { hotel: 'hoteles', actividad: 'actividades', vehiculo: 'vehiculos' }[tipo];
    const columna = { hotel: 'id_hotel', actividad: 'id_actividad', vehiculo: 'id_vehiculo' }[tipo];
    if (!tabla) return null;
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idPublicacion)
        .query(`SELECT u.id_usuario, u.nombre, u.correo, e.nombre_comercial, p.nombre AS publicacion, p.imagen_url, p.ciudad
                FROM dbo.${tabla} p
                INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
                INNER JOIN dbo.usuarios u ON u.id_usuario = e.id_usuario
                WHERE p.${columna} = @id`);
    const f = resultado.recordset[0];
    return f ? { idUsuario: f.id_usuario, nombre: f.nombre, correo: f.correo, nombreComercial: f.nombre_comercial, publicacion: f.publicacion, imagenUrl: f.imagen_url, ciudad: f.ciudad } : null;
}

module.exports = { crear, listar, marcarLeidas, paraRecordatorio, paraResena, marcarRecordatorio, marcarResenaPedida, empresaDePublicacion };
