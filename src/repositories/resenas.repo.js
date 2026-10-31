/**
 * @file src/repositories/resenas.repo.js
 * @description Acceso a datos de reseñas.
 *
 * Una reseña pertenece a una reserva; la publicación reseñada (hotel o
 * actividad) y el autor se obtienen de esa reserva. Solo las reseñas con
 * visible = 1 se muestran al público y cuentan para la valoración media.
 */

const { peticion, sql } = require('../config/db');
const { aIso } = require('../utils/fechas');

/** Columna de la reserva que enlaza cada tipo de publicación. */
const COLUMNA = { hotel: 'id_hotel', actividad: 'id_actividad', vehiculo: 'id_vehiculo' };

/**
 * Columnas de reseña con su reserva, autor y publicación
 * (alias rs = reseña, r = reserva, u = autor, h / a = publicación).
 */
const COLUMNAS_RESENA = `
    rs.id_resena, rs.puntuacion, rs.titulo, rs.comentario, rs.respuesta, rs.fecha_respuesta,
    rs.visible, rs.fecha_creacion,
    r.fecha_inicio, r.fecha_fin, r.personas,
    u.nombre AS autor,
    CASE WHEN r.id_hotel IS NOT NULL THEN 'hotel' WHEN r.id_actividad IS NOT NULL THEN 'actividad' ELSE 'vehiculo' END AS tipo,
    COALESCE(r.id_hotel, r.id_actividad, r.id_vehiculo) AS id_publicacion,
    COALESCE(h.nombre, a.nombre, v.nombre) AS publicacion,
    COALESCE(h.ciudad, a.ciudad, v.ciudad) AS ciudad`;

const UNIONES_RESENA = `
    FROM dbo.resenas rs
    INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva
    INNER JOIN dbo.usuarios u ON u.id_usuario = r.id_usuario
    LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
    LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
    LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo`;

/**
 * Nombre público del autor: nombre de pila e inicial del último apellido
 * ("María Rodríguez" -> "María R.", "Miguel Ángel Herrera" -> "Miguel H."),
 * para no exponer el nombre completo.
 */
function nombrePublico(nombre) {
    const partes = String(nombre || '').trim().split(/\s+/);
    if (partes.length < 2) return partes[0] || 'Viajero';
    return `${partes[0]} ${partes[partes.length - 1].charAt(0)}.`;
}

function aResena(fila, { completo = false } = {}) {
    const resena = {
        id: fila.id_resena,
        puntuacion: fila.puntuacion,
        titulo: fila.titulo,
        comentario: fila.comentario,
        respuesta: fila.respuesta,
        fechaRespuesta: fila.fecha_respuesta,
        fecha: fila.fecha_creacion,
        autor: nombrePublico(fila.autor),
        tipo: fila.tipo,
        idPublicacion: fila.id_publicacion,
        publicacion: fila.publicacion,
        ciudad: fila.ciudad,
        estancia: {
            fechaInicio: aIso(fila.fecha_inicio),
            fechaFin: aIso(fila.fecha_fin),
            personas: fila.personas
        }
    };
    if (completo) {
        resena.visible = Boolean(fila.visible);
        resena.autorCompleto = fila.autor;
        if (fila.proveedor !== undefined) resena.proveedor = fila.proveedor;
    }
    return resena;
}

/**
 * Valoración media, total y distribución por tramos de las reseñas visibles
 * de una publicación.
 * @returns {Promise<{promedio: number|null, total: number, distribucion: object}>}
 */
async function resumenPublicacion(tipo, idPublicacion) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idPublicacion)
        .query(`
            SELECT CAST(AVG(CAST(rs.puntuacion AS DECIMAL(5, 2))) AS DECIMAL(4, 2)) AS promedio,
                   COUNT(*) AS total,
                   SUM(CASE WHEN rs.puntuacion >= 9 THEN 1 ELSE 0 END) AS excelente,
                   SUM(CASE WHEN rs.puntuacion BETWEEN 7 AND 8 THEN 1 ELSE 0 END) AS muy_bueno,
                   SUM(CASE WHEN rs.puntuacion BETWEEN 5 AND 6 THEN 1 ELSE 0 END) AS aceptable,
                   SUM(CASE WHEN rs.puntuacion BETWEEN 3 AND 4 THEN 1 ELSE 0 END) AS regular,
                   SUM(CASE WHEN rs.puntuacion <= 2 THEN 1 ELSE 0 END) AS malo
            FROM dbo.resenas rs
            INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva
            WHERE r.${COLUMNA[tipo]} = @id AND rs.visible = 1
        `);
    const fila = resultado.recordset[0];
    return {
        promedio: fila.promedio === null ? null : Number(fila.promedio),
        total: fila.total,
        distribucion: {
            excelente: fila.excelente || 0,
            muyBueno: fila.muy_bueno || 0,
            aceptable: fila.aceptable || 0,
            regular: fila.regular || 0,
            malo: fila.malo || 0
        }
    };
}

/** Órdenes permitidos de las reseñas de una publicación (lista blanca). */
const ORDENES = {
    recientes: 'rs.fecha_creacion DESC, rs.id_resena DESC',
    'mejor-valoradas': 'rs.puntuacion DESC, rs.fecha_creacion DESC',
    'peor-valoradas': 'rs.puntuacion ASC, rs.fecha_creacion DESC'
};

/** Reseñas visibles de una publicación, paginadas. */
async function listarPorPublicacion(tipo, idPublicacion, { orden = 'recientes', pagina = 1, porPagina = 5 } = {}) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idPublicacion)
        .input('desplazamiento', sql.Int, (pagina - 1) * porPagina)
        .input('porPagina', sql.Int, porPagina)
        .query(`
            SELECT ${COLUMNAS_RESENA}
            ${UNIONES_RESENA}
            WHERE r.${COLUMNA[tipo]} = @id AND rs.visible = 1
            ORDER BY ${ORDENES[orden] || ORDENES.recientes}
            OFFSET @desplazamiento ROWS FETCH NEXT @porPagina ROWS ONLY
        `);
    return resultado.recordset.map((fila) => aResena(fila));
}

/**
 * Reseñas visibles con puntuación alta (primero las de 10, luego las más
 * recientes), para la página de inicio.
 * Solo de publicaciones visibles (activas y de empresas no suspendidas).
 */
async function destacadas(limite = 6) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('limite', sql.Int, limite)
        .query(`
            SELECT TOP (@limite) ${COLUMNAS_RESENA}
            ${UNIONES_RESENA}
            INNER JOIN dbo.empresas e ON e.id_empresa = COALESCE(h.id_empresa, a.id_empresa, v.id_empresa)
            WHERE rs.visible = 1 AND rs.puntuacion >= 9 AND LEN(rs.comentario) >= 60
              AND COALESCE(h.activo, a.activo, v.activo) = 1
              AND EXISTS (SELECT 1 FROM dbo.usuarios ue WHERE ue.id_usuario = e.id_usuario AND ue.activo = 1)
            ORDER BY rs.puntuacion DESC, rs.fecha_creacion DESC, rs.id_resena DESC
        `);
    return resultado.recordset.map((fila) => aResena(fila));
}

/**
 * Reservas confirmadas y ya disfrutadas del viajero que aún no tienen reseña.
 * Una reserva de hotel se puede reseñar desde el día de salida; una de
 * actividad, desde el día de la actividad.
 * @param {string} hoy AAAA-MM-DD
 */
async function pendientesDeUsuario(idUsuario, hoy) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .input('hoy', sql.Date, new Date(`${hoy}T00:00:00Z`))
        .query(`
            SELECT r.id_reserva, r.codigo, r.fecha_inicio, r.fecha_fin,
                   CASE WHEN r.id_hotel IS NOT NULL THEN 'hotel' WHEN r.id_actividad IS NOT NULL THEN 'actividad' ELSE 'vehiculo' END AS tipo,
                   COALESCE(r.id_hotel, r.id_actividad, r.id_vehiculo) AS id_publicacion,
                   COALESCE(h.nombre, a.nombre, v.nombre) AS publicacion,
                   COALESCE(h.ciudad, a.ciudad, v.ciudad) AS ciudad
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            WHERE r.id_usuario = @idUsuario AND r.estado = 'confirmada'
              AND COALESCE(r.fecha_fin, r.fecha_inicio) <= @hoy
              AND NOT EXISTS (SELECT 1 FROM dbo.resenas rs WHERE rs.id_reserva = r.id_reserva)
            ORDER BY COALESCE(r.fecha_fin, r.fecha_inicio) DESC
        `);
    return resultado.recordset.map((fila) => ({
        idReserva: fila.id_reserva,
        codigo: fila.codigo,
        tipo: fila.tipo,
        idPublicacion: fila.id_publicacion,
        publicacion: fila.publicacion,
        ciudad: fila.ciudad,
        fechaInicio: aIso(fila.fecha_inicio),
        fechaFin: aIso(fila.fecha_fin)
    }));
}

/** Reseñas escritas por el viajero (incluye las ocultas por la administración). */
async function listarPorUsuario(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query(`
            SELECT ${COLUMNAS_RESENA}, r.id_reserva
            ${UNIONES_RESENA}
            WHERE r.id_usuario = @idUsuario
            ORDER BY rs.fecha_creacion DESC
        `);
    return resultado.recordset.map((fila) => Object.assign(aResena(fila), { idReserva: fila.id_reserva, visible: Boolean(fila.visible) }));
}

/**
 * Datos de la reserva necesarios para validar una reseña nueva.
 * @returns {Promise<object|null>} { idUsuario, estado, fechaFinal, tieneResena }
 */
async function obtenerReserva(idReserva) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idReserva)
        .query(`
            SELECT r.id_usuario, r.estado, COALESCE(r.fecha_fin, r.fecha_inicio) AS fecha_final,
                   CASE WHEN EXISTS (SELECT 1 FROM dbo.resenas rs WHERE rs.id_reserva = r.id_reserva) THEN 1 ELSE 0 END AS tiene_resena
            FROM dbo.reservas r
            WHERE r.id_reserva = @id
        `);
    const fila = resultado.recordset[0];
    return fila
        ? { idUsuario: fila.id_usuario, estado: fila.estado, fechaFinal: aIso(fila.fecha_final), tieneResena: Boolean(fila.tiene_resena) }
        : null;
}

/**
 * Inserta una reseña. La restricción UNIQUE sobre id_reserva impide una
 * segunda reseña de la misma reserva aunque lleguen dos peticiones a la vez.
 * @returns {Promise<number>} id_resena
 */
async function crear({ idReserva, puntuacion, titulo, comentario }) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idReserva', sql.Int, idReserva)
        .input('puntuacion', sql.TinyInt, puntuacion)
        .input('titulo', sql.NVarChar(120), titulo)
        .input('comentario', sql.NVarChar(1500), comentario)
        .query(`
            INSERT INTO dbo.resenas (id_reserva, puntuacion, titulo, comentario)
            OUTPUT INSERTED.id_resena AS id
            VALUES (@idReserva, @puntuacion, @titulo, @comentario)
        `);
    return resultado.recordset[0].id;
}

/** Reseñas de las publicaciones de una empresa (incluye las ocultas). */
async function listarPorEmpresa(idEmpresa) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .query(`
            SELECT ${COLUMNAS_RESENA}
            ${UNIONES_RESENA}
            WHERE COALESCE(h.id_empresa, a.id_empresa, v.id_empresa) = @idEmpresa
            ORDER BY CASE WHEN rs.respuesta IS NULL THEN 0 ELSE 1 END, rs.fecha_creacion DESC
        `);
    return resultado.recordset.map((fila) => aResena(fila, { completo: true }));
}

/**
 * Guarda (o reemplaza) la respuesta de la empresa a una reseña de sus
 * publicaciones. Una respuesta vacía la elimina.
 * @returns {Promise<boolean>} false si la reseña no existe o no es de la empresa.
 */
async function responder(idResena, idEmpresa, respuesta) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idResena)
        .input('idEmpresa', sql.Int, idEmpresa)
        .input('respuesta', sql.NVarChar(1000), respuesta || null)
        .query(`
            UPDATE rs
            SET respuesta = @respuesta,
                fecha_respuesta = CASE WHEN @respuesta IS NULL THEN NULL ELSE SYSUTCDATETIME() END
            FROM dbo.resenas rs
            INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            WHERE rs.id_resena = @id AND COALESCE(h.id_empresa, a.id_empresa, v.id_empresa) = @idEmpresa
        `);
    return resultado.rowsAffected[0] > 0;
}

/** Todas las reseñas de la plataforma, para la administración. */
async function listarTodas({ visible = null } = {}) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('visible', sql.Bit, visible === null ? null : (visible ? 1 : 0))
        .query(`
            SELECT ${COLUMNAS_RESENA}, e.nombre_comercial AS proveedor
            ${UNIONES_RESENA}
            INNER JOIN dbo.empresas e ON e.id_empresa = COALESCE(h.id_empresa, a.id_empresa, v.id_empresa)
            WHERE @visible IS NULL OR rs.visible = @visible
            ORDER BY rs.fecha_creacion DESC, rs.id_resena DESC
        `);
    return resultado.recordset.map((fila) => aResena(fila, { completo: true }));
}

/** Muestra u oculta una reseña. @returns {Promise<boolean>} */
async function cambiarVisibilidad(idResena, visible) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idResena)
        .input('visible', sql.Bit, visible ? 1 : 0)
        .query('UPDATE dbo.resenas SET visible = @visible WHERE id_resena = @id');
    return resultado.rowsAffected[0] > 0;
}

/** Valoración media y total de reseñas visibles de una empresa. */
async function resumenEmpresa(idEmpresa) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .query(`
            SELECT CAST(AVG(CAST(rs.puntuacion AS DECIMAL(5, 2))) AS DECIMAL(4, 2)) AS promedio,
                   COUNT(*) AS total,
                   SUM(CASE WHEN rs.respuesta IS NULL THEN 1 ELSE 0 END) AS sin_respuesta
            FROM dbo.resenas rs
            INNER JOIN dbo.reservas r ON r.id_reserva = rs.id_reserva
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            WHERE rs.visible = 1 AND COALESCE(h.id_empresa, a.id_empresa, v.id_empresa) = @idEmpresa
        `);
    const fila = resultado.recordset[0];
    return {
        promedio: fila.promedio === null ? null : Number(fila.promedio),
        total: fila.total,
        sinRespuesta: fila.sin_respuesta || 0
    };
}

module.exports = {
    ORDENES,
    nombrePublico,
    resumenPublicacion,
    listarPorPublicacion,
    destacadas,
    pendientesDeUsuario,
    listarPorUsuario,
    obtenerReserva,
    crear,
    listarPorEmpresa,
    responder,
    listarTodas,
    cambiarVisibilidad,
    resumenEmpresa
};
