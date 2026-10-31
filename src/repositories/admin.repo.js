/**
 * @file src/repositories/admin.repo.js
 * @description Consultas de la administración de la plataforma (rol "admin"):
 *   indicadores globales, cuentas, empresas, publicaciones, reservas y
 *   mensajes de contacto.
 */

const { peticion, sql } = require('../config/db');
const { aIso, horaIso } = require('../utils/fechas');

const CATEGORIA_HOTEL_SQL = `CASE WHEN h.tipo_alojamiento IN ('villa', 'cabana', 'apartamento', 'hostal')
                                  THEN 'villas-cabanas' ELSE 'hoteles-resorts' END`;

/** Patrón LIKE con los comodines escapados entre corchetes; null si no hay texto. */
const patron = (texto) => (texto ? `%${texto.replace(/[[%_]/g, '[$&]')}%` : null);

/**
 * Indicadores globales.
 * @param {string} desde  AAAA-MM-DD, primer día del primer mes de la serie mensual
 * @param {string} hasta  AAAA-MM-DD, primer día posterior al último mes de la serie
 */
async function resumen(desde, hasta) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('desde', sql.Date, new Date(`${desde}T00:00:00Z`))
        .input('hasta', sql.Date, new Date(`${hasta}T00:00:00Z`))
        .query(`
            SELECT
                (SELECT COUNT(*) FROM dbo.usuarios WHERE rol = 'cliente') AS viajeros,
                (SELECT COUNT(*) FROM dbo.usuarios WHERE rol = 'empresa') AS empresas,
                (SELECT COUNT(*) FROM dbo.usuarios WHERE rol <> 'admin' AND activo = 0) AS suspendidas,
                (SELECT COUNT(*) FROM dbo.hoteles) AS hoteles,
                (SELECT COUNT(*) FROM dbo.actividades) AS actividades,
                (SELECT COUNT(*) FROM dbo.vehiculos) AS vehiculos,
                (SELECT COUNT(*) FROM dbo.reservas WHERE estado = 'confirmada') AS confirmadas,
                (SELECT COUNT(*) FROM dbo.reservas WHERE estado = 'cancelada') AS canceladas,
                (SELECT COALESCE(SUM(total), 0) FROM dbo.reservas WHERE estado = 'confirmada') AS ingresos,
                (SELECT COUNT(*) FROM dbo.mensajes_contacto WHERE atendido = 0) AS mensajesPendientes,
                (SELECT COUNT(*) FROM dbo.resenas) AS resenas,
                (SELECT COUNT(*) FROM dbo.resenas WHERE visible = 0) AS resenasOcultas,
                (SELECT CAST(AVG(CAST(puntuacion AS DECIMAL(5, 2))) AS DECIMAL(4, 2)) FROM dbo.resenas WHERE visible = 1) AS puntuacionMedia;

            SELECT YEAR(fecha_inicio) AS anio, MONTH(fecha_inicio) AS mes, COUNT(*) AS reservas,
                   COALESCE(SUM(total), 0) AS ingresos
            FROM dbo.reservas
            WHERE estado = 'confirmada' AND fecha_inicio >= @desde AND fecha_inicio < @hasta
            GROUP BY YEAR(fecha_inicio), MONTH(fecha_inicio);

            SELECT categoria, COUNT(*) AS reservas FROM (
                SELECT ${CATEGORIA_HOTEL_SQL} AS categoria
                FROM dbo.reservas r INNER JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
                WHERE r.estado = 'confirmada'
                UNION ALL
                SELECT a.categoria
                FROM dbo.reservas r INNER JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
                WHERE r.estado = 'confirmada'
                UNION ALL
                SELECT v.categoria
                FROM dbo.reservas r INNER JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
                WHERE r.estado = 'confirmada'
            ) AS t
            GROUP BY categoria;

            SELECT TOP 5 e.id_empresa, e.nombre_comercial, COUNT(*) AS reservas, SUM(r.total) AS ingresos
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            INNER JOIN dbo.empresas e ON e.id_empresa = COALESCE(h.id_empresa, a.id_empresa, v.id_empresa)
            WHERE r.estado = 'confirmada'
            GROUP BY e.id_empresa, e.nombre_comercial
            ORDER BY SUM(r.total) DESC;
        `);
    const [totales, meses, categorias, empresas] = resultado.recordsets;
    const t = totales[0];
    return {
        totales: {
            viajeros: t.viajeros,
            empresas: t.empresas,
            suspendidas: t.suspendidas,
            hoteles: t.hoteles,
            actividades: t.actividades,
            vehiculos: t.vehiculos,
            confirmadas: t.confirmadas,
            canceladas: t.canceladas,
            ingresos: Number(t.ingresos),
            mensajesPendientes: t.mensajesPendientes,
            resenas: t.resenas,
            resenasOcultas: t.resenasOcultas,
            puntuacionMedia: t.puntuacionMedia === null ? null : Number(t.puntuacionMedia)
        },
        meses: meses.map((m) => ({ anio: m.anio, mes: m.mes, reservas: m.reservas, ingresos: Number(m.ingresos) })),
        categorias: categorias.map((c) => ({ categoria: c.categoria, reservas: c.reservas })),
        empresas: empresas.map((e) => ({ id: e.id_empresa, nombre: e.nombre_comercial, reservas: e.reservas, ingresos: Number(e.ingresos) }))
    };
}

/** Cuentas de viajeros y de empresas (las de administración no se listan). */
async function listarUsuarios({ rol, texto }) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('rol', sql.VarChar(20), rol || null)
        .input('texto', sql.NVarChar(120), patron(texto))
        .query(`
            SELECT TOP 300 u.id_usuario, u.nombre, u.correo, u.telefono, u.rol, u.activo, u.fecha_creacion,
                   e.id_empresa, e.nombre_comercial,
                   (SELECT COUNT(*) FROM dbo.reservas r WHERE r.id_usuario = u.id_usuario) AS reservas
            FROM dbo.usuarios u
            LEFT JOIN dbo.empresas e ON e.id_usuario = u.id_usuario
            WHERE u.rol <> 'admin'
              AND (@rol IS NULL OR u.rol = @rol)
              AND (@texto IS NULL OR u.nombre LIKE @texto OR u.correo LIKE @texto OR e.nombre_comercial LIKE @texto)
            ORDER BY u.fecha_creacion DESC, u.id_usuario DESC
        `);
    return resultado.recordset.map((f) => ({
        id: f.id_usuario,
        nombre: f.nombre,
        correo: f.correo,
        telefono: f.telefono,
        rol: f.rol,
        activo: Boolean(f.activo),
        fechaCreacion: f.fecha_creacion,
        empresa: f.id_empresa ? { id: f.id_empresa, nombre: f.nombre_comercial } : null,
        reservas: f.reservas
    }));
}

/** Empresas con su representante, estado de la cuenta e indicadores. */
async function listarEmpresas() {
    const consulta = await peticion();
    const resultado = await consulta.query(`
        SELECT e.id_empresa, e.nombre_comercial, e.razon_social, e.rnc, e.telefono, e.provincia, e.ciudad,
               e.licencia_mitur, e.tipo_servicio, e.fecha_registro,
               u.id_usuario, u.nombre AS representante, u.correo, u.activo,
               (SELECT COUNT(*) FROM dbo.hoteles h WHERE h.id_empresa = e.id_empresa) AS hoteles,
               (SELECT COUNT(*) FROM dbo.actividades a WHERE a.id_empresa = e.id_empresa) AS actividades,
               (SELECT COUNT(*) FROM dbo.vehiculos v WHERE v.id_empresa = e.id_empresa) AS vehiculos,
               x.reservas, x.ingresos
        FROM dbo.empresas e
        INNER JOIN dbo.usuarios u ON u.id_usuario = e.id_usuario
        OUTER APPLY (
            SELECT COUNT(*) AS reservas, COALESCE(SUM(r.total), 0) AS ingresos
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            WHERE r.estado = 'confirmada' AND COALESCE(h.id_empresa, a.id_empresa, v.id_empresa) = e.id_empresa
        ) AS x
        ORDER BY e.nombre_comercial
    `);
    return resultado.recordset.map((f) => ({
        id: f.id_empresa,
        idUsuario: f.id_usuario,
        nombre: f.nombre_comercial,
        razonSocial: f.razon_social,
        rnc: f.rnc,
        telefono: f.telefono,
        ubicacion: [f.ciudad, f.provincia].filter(Boolean).join(', '),
        licenciaMitur: f.licencia_mitur,
        tipoServicio: f.tipo_servicio,
        fechaRegistro: f.fecha_registro,
        representante: f.representante,
        correo: f.correo,
        activo: Boolean(f.activo),
        hoteles: f.hoteles,
        actividades: f.actividades,
        vehiculos: f.vehiculos,
        reservas: f.reservas,
        ingresos: Number(f.ingresos)
    }));
}

/**
 * Habilita o suspende una cuenta. Las cuentas de administración no se
 * modifican desde aquí.
 * @returns {Promise<boolean>} false si la cuenta no existe o es de administración.
 */
async function cambiarEstadoUsuario(idUsuario, activo) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idUsuario)
        .input('activo', sql.Bit, activo ? 1 : 0)
        .query(`UPDATE dbo.usuarios SET activo = @activo WHERE id_usuario = @id AND rol <> 'admin'`);
    return resultado.rowsAffected[0] > 0;
}

/**
 * Modera una publicación de cualquier empresa: visibilidad y destacado.
 * Un valor null conserva el actual.
 * @returns {Promise<boolean>}
 */
async function moderarPublicacion(tipo, id, { activo = null, destacado = null }) {
    const tabla = { hotel: 'dbo.hoteles', actividad: 'dbo.actividades', vehiculo: 'dbo.vehiculos' }[tipo];
    const columnaId = { hotel: 'id_hotel', actividad: 'id_actividad', vehiculo: 'id_vehiculo' }[tipo];
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, id)
        .input('activo', sql.Bit, activo === null ? null : (activo ? 1 : 0))
        .input('destacado', sql.Bit, destacado === null ? null : (destacado ? 1 : 0))
        .query(`
            UPDATE ${tabla}
            SET activo = COALESCE(@activo, activo),
                destacado = COALESCE(@destacado, destacado),
                fecha_actualizacion = SYSUTCDATETIME()
            WHERE ${columnaId} = @id
        `);
    return resultado.rowsAffected[0] > 0;
}

/** Reservas de toda la plataforma (las 300 más recientes por fecha de servicio). */
async function listarReservas({ estado }) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('estado', sql.VarChar(20), estado || null)
        .query(`
            SELECT TOP 300 r.id_reserva, r.codigo, r.fecha_inicio, r.fecha_fin, r.personas, r.habitaciones,
                   r.total, r.estado, r.fecha_creacion, r.hora_inicio, r.hora_fin, r.ciudad_devolucion,
                   CASE WHEN r.id_hotel IS NOT NULL THEN 'hotel' WHEN r.id_actividad IS NOT NULL THEN 'actividad' ELSE 'vehiculo' END AS tipo,
                   COALESCE(r.id_hotel, r.id_actividad, r.id_vehiculo) AS id_publicacion,
                   COALESCE(h.nombre, a.nombre, v.nombre) AS publicacion,
                   e.nombre_comercial AS proveedor,
                   u.nombre AS cliente_nombre, u.correo AS cliente_correo
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            INNER JOIN dbo.empresas e ON e.id_empresa = COALESCE(h.id_empresa, a.id_empresa, v.id_empresa)
            INNER JOIN dbo.usuarios u ON u.id_usuario = r.id_usuario
            WHERE (@estado IS NULL OR r.estado = @estado)
            ORDER BY r.fecha_inicio DESC, r.id_reserva DESC
        `);
    return resultado.recordset.map((f) => ({
        id: f.id_reserva,
        codigo: f.codigo,
        tipo: f.tipo,
        idPublicacion: f.id_publicacion,
        publicacion: f.publicacion,
        proveedor: f.proveedor,
        cliente: { nombre: f.cliente_nombre, correo: f.cliente_correo },
        fechaInicio: aIso(f.fecha_inicio),
        fechaFin: aIso(f.fecha_fin),
        personas: f.personas,
        habitaciones: f.habitaciones,
        total: Number(f.total),
        estado: f.estado,
        fechaCreacion: f.fecha_creacion,
        alquiler: f.tipo === 'vehiculo'
            ? { horaRecogida: horaIso(f.hora_inicio), horaDevolucion: horaIso(f.hora_fin), ciudadDevolucion: f.ciudad_devolucion }
            : undefined
    }));
}

/** Mensajes del formulario de contacto: primero los pendientes. */
async function listarMensajes() {
    const consulta = await peticion();
    const resultado = await consulta.query(`
        SELECT TOP 300 id_mensaje, nombre, correo, asunto, mensaje, atendido, fecha_envio
        FROM dbo.mensajes_contacto
        ORDER BY atendido, fecha_envio DESC
    `);
    return resultado.recordset.map((f) => ({
        id: f.id_mensaje,
        nombre: f.nombre,
        correo: f.correo,
        asunto: f.asunto,
        mensaje: f.mensaje,
        atendido: Boolean(f.atendido),
        fechaEnvio: f.fecha_envio
    }));
}

/** @returns {Promise<boolean>} */
async function marcarMensaje(idMensaje, atendido) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idMensaje)
        .input('atendido', sql.Bit, atendido ? 1 : 0)
        .query('UPDATE dbo.mensajes_contacto SET atendido = @atendido WHERE id_mensaje = @id');
    return resultado.rowsAffected[0] > 0;
}

module.exports = {
    resumen,
    listarUsuarios,
    listarEmpresas,
    cambiarEstadoUsuario,
    moderarPublicacion,
    listarReservas,
    listarMensajes,
    marcarMensaje
};
