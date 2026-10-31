/**
 * @file src/repositories/reservas.repo.js
 * @description Acceso a datos de reservas. Las operaciones que verifican
 *   disponibilidad reciben la transacción activa (src/services/reservas.service.js)
 *   para que el bloqueo y la inserción ocurran de forma atómica.
 */

const { peticion, sql } = require('../config/db');
const { aIso, horaIso } = require('../utils/fechas');

/** Convierte AAAA-MM-DD a Date (medianoche UTC) para parámetros de tipo DATE. */
const aFecha = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/** Publicación reservable: activa y de una empresa no suspendida. */
const ACTIVA_SQL = `CASE WHEN p.activo = 1 AND EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id_usuario = e.id_usuario AND u.activo = 1) THEN 1 ELSE 0 END`;

/**
 * Lee la publicación y bloquea su fila hasta el final de la transacción
 * (UPDLOCK, HOLDLOCK). Dos reservas simultáneas de la misma publicación se
 * procesan en serie, lo que impide superar el cupo.
 *
 * @returns {Promise<object|null>} { id, idEmpresa, nombre, precio, activo, capacidad, unidades }
 *   y, para vehículos, { ciudad, deposito, edadMinima, cargoConductorJoven, cargoOtraCiudad }
 */
async function bloquearPublicacion(transaccion, tipo, id) {
    const consulta = (await peticion(transaccion)).input('id', sql.Int, id);
    if (tipo === 'vehiculo') {
        const r = await consulta.query(`
            SELECT p.id_vehiculo AS id, p.id_empresa, p.nombre, p.precio_dia AS precio, ${ACTIVA_SQL} AS activo,
                   p.unidades, p.ciudad, p.deposito, p.edad_minima, p.cargo_conductor_joven, p.cargo_otra_ciudad
            FROM dbo.vehiculos p WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
            WHERE p.id_vehiculo = @id`);
        const f = r.recordset[0];
        if (!f) return null;
        return {
            id: f.id,
            idEmpresa: f.id_empresa,
            nombre: f.nombre,
            precio: Number(f.precio),
            activo: Boolean(f.activo),
            capacidad: null,
            unidades: f.unidades,
            ciudad: f.ciudad,
            deposito: Number(f.deposito),
            edadMinima: f.edad_minima,
            cargoConductorJoven: f.cargo_conductor_joven === null ? null : Number(f.cargo_conductor_joven),
            cargoOtraCiudad: f.cargo_otra_ciudad === null ? null : Number(f.cargo_otra_ciudad)
        };
    }
    const resultado = await consulta.query(tipo === 'hotel'
        ? `SELECT p.id_hotel AS id, p.id_empresa, p.nombre, p.precio_noche AS precio, ${ACTIVA_SQL} AS activo,
                  p.capacidad_personas AS capacidad, p.habitaciones AS unidades
           FROM dbo.hoteles p WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
           WHERE p.id_hotel = @id`
        : `SELECT p.id_actividad AS id, p.id_empresa, p.nombre, p.precio_persona AS precio, ${ACTIVA_SQL} AS activo,
                  NULL AS capacidad, p.cupo_diario AS unidades
           FROM dbo.actividades p WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
           WHERE p.id_actividad = @id`);
    const fila = resultado.recordset[0];
    if (!fila) return null;
    return {
        id: fila.id,
        idEmpresa: fila.id_empresa,
        nombre: fila.nombre,
        precio: Number(fila.precio),
        activo: Boolean(fila.activo),
        capacidad: fila.capacidad,
        unidades: fila.unidades
    };
}

/**
 * Reservas confirmadas de un hotel que se superponen con [entrada, salida).
 * @returns {Promise<{entrada: string, salida: string, habitaciones: number}[]>}
 */
async function reservasHotelEnRango(transaccion, idHotel, entrada, salida) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('idHotel', sql.Int, idHotel)
        .input('entrada', sql.Date, aFecha(entrada))
        .input('salida', sql.Date, aFecha(salida))
        .query(`
            SELECT fecha_inicio, fecha_fin, habitaciones
            FROM dbo.reservas
            WHERE id_hotel = @idHotel AND estado = 'confirmada'
              AND fecha_inicio < @salida AND fecha_fin > @entrada
        `);
    return resultado.recordset.map((fila) => ({
        entrada: aIso(fila.fecha_inicio),
        salida: aIso(fila.fecha_fin),
        habitaciones: fila.habitaciones
    }));
}

/**
 * Alquileres confirmados de un vehículo que ocupan algún día de [inicio, fin]
 * (ambos días incluidos: el auto no está disponible el día de recogida ni el
 * de devolución).
 * @returns {Promise<{inicio: string, fin: string}[]>}
 */
async function reservasVehiculoEnRango(transaccion, idVehiculo, inicio, fin) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('idVehiculo', sql.Int, idVehiculo)
        .input('inicio', sql.Date, aFecha(inicio))
        .input('fin', sql.Date, aFecha(fin))
        .query(`
            SELECT fecha_inicio, fecha_fin
            FROM dbo.reservas
            WHERE id_vehiculo = @idVehiculo AND estado = 'confirmada'
              AND fecha_inicio <= @fin AND fecha_fin >= @inicio
        `);
    return resultado.recordset.map((fila) => ({ inicio: aIso(fila.fecha_inicio), fin: aIso(fila.fecha_fin) }));
}

/** Convierte HH:MM a Date para parámetros TIME (el driver usa la parte horaria en UTC). */
const aHora = (hhmm) => (hhmm ? new Date(`1970-01-01T${hhmm}:00Z`) : null);


/** @returns {Promise<number>} personas con reserva confirmada para la actividad en la fecha. */
async function personasActividadEnFecha(transaccion, idActividad, fecha) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('idActividad', sql.Int, idActividad)
        .input('fecha', sql.Date, aFecha(fecha))
        .query(`
            SELECT COALESCE(SUM(personas), 0) AS personas
            FROM dbo.reservas
            WHERE id_actividad = @idActividad AND estado = 'confirmada' AND fecha_inicio = @fecha
        `);
    return resultado.recordset[0].personas;
}

/** Inserta una reserva confirmada. @returns {Promise<number>} id_reserva */
async function crear(transaccion, reserva) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('codigo', sql.Char(10), reserva.codigo)
        .input('idUsuario', sql.Int, reserva.idUsuario)
        .input('idHotel', sql.Int, reserva.tipo === 'hotel' ? reserva.idPublicacion : null)
        .input('idActividad', sql.Int, reserva.tipo === 'actividad' ? reserva.idPublicacion : null)
        .input('idVehiculo', sql.Int, reserva.tipo === 'vehiculo' ? reserva.idPublicacion : null)
        .input('horaInicio', sql.Time(0), aHora(reserva.horaInicio))
        .input('horaFin', sql.Time(0), aHora(reserva.horaFin))
        .input('ciudadDevolucion', sql.NVarChar(60), reserva.ciudadDevolucion || null)
        .input('edadConductor', sql.TinyInt, reserva.edadConductor || null)
        .input('extras', sql.VarChar(200), reserva.extras && reserva.extras.length ? reserva.extras.join(',') : null)
        .input('deposito', sql.Decimal(10, 2), reserva.deposito ?? null)
        .input('inicio', sql.Date, aFecha(reserva.fechaInicio))
        .input('fin', sql.Date, aFecha(reserva.fechaFin))
        .input('personas', sql.Int, reserva.personas)
        .input('habitaciones', sql.Int, reserva.habitaciones)
        .input('precioUnitario', sql.Decimal(10, 2), reserva.precioUnitario)
        .input('total', sql.Decimal(12, 2), reserva.total)
        .input('comentario', sql.NVarChar(500), reserva.comentario || null)
        .query(`
            INSERT INTO dbo.reservas
                (codigo, id_usuario, id_hotel, id_actividad, id_vehiculo, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
                 ciudad_devolucion, edad_conductor, extras, deposito, personas, habitaciones, precio_unitario, total, comentario)
            OUTPUT INSERTED.id_reserva AS id
            VALUES (@codigo, @idUsuario, @idHotel, @idActividad, @idVehiculo, @inicio, @fin, @horaInicio, @horaFin,
                    @ciudadDevolucion, @edadConductor, @extras, @deposito, @personas, @habitaciones, @precioUnitario, @total, @comentario)
        `);
    return resultado.recordset[0].id;
}

/** Columnas de reserva con los datos de la publicación (alias r, h, a). */
const COLUMNAS_RESERVA = `
    r.id_reserva, r.codigo, r.fecha_inicio, r.fecha_fin, r.personas, r.habitaciones,
    r.precio_unitario, r.total, r.estado, r.comentario, r.fecha_creacion,
    r.hora_inicio, r.hora_fin, r.ciudad_devolucion, r.edad_conductor, r.extras, r.deposito,
    v.lugar_recogida,
    CASE WHEN r.id_hotel IS NOT NULL THEN 'hotel' WHEN r.id_actividad IS NOT NULL THEN 'actividad' ELSE 'vehiculo' END AS tipo,
    COALESCE(r.id_hotel, r.id_actividad, r.id_vehiculo) AS id_publicacion,
    COALESCE(h.nombre, a.nombre, v.nombre) AS publicacion,
    COALESCE(h.ciudad, a.ciudad, v.ciudad) AS ciudad,
    COALESCE(h.id_imagen, a.id_imagen, v.id_imagen) AS id_imagen,
    COALESCE(h.imagen_url, a.imagen_url, v.imagen_url) AS imagen_url`;

function aReserva(fila) {
    return {
        id: fila.id_reserva,
        codigo: fila.codigo,
        tipo: fila.tipo,
        idPublicacion: fila.id_publicacion,
        publicacion: fila.publicacion,
        ciudad: fila.ciudad,
        imagen: fila.id_imagen ? `/api/imagenes/${fila.id_imagen}` : fila.imagen_url || null,
        fechaInicio: aIso(fila.fecha_inicio),
        fechaFin: aIso(fila.fecha_fin),
        personas: fila.personas,
        habitaciones: fila.habitaciones,
        precioUnitario: Number(fila.precio_unitario),
        total: Number(fila.total),
        estado: fila.estado,
        comentario: fila.comentario,
        fechaCreacion: fila.fecha_creacion,
        alquiler: fila.tipo === 'vehiculo'
            ? {
                horaRecogida: horaIso(fila.hora_inicio),
                horaDevolucion: horaIso(fila.hora_fin),
                lugarRecogida: fila.lugar_recogida,
                ciudadDevolucion: fila.ciudad_devolucion,
                edadConductor: fila.edad_conductor,
                extras: fila.extras ? fila.extras.split(',') : [],
                deposito: fila.deposito === null ? null : Number(fila.deposito)
            }
            : undefined,
        proveedor: fila.proveedor,
        cliente: fila.cliente_nombre
            ? { nombre: fila.cliente_nombre, correo: fila.cliente_correo, telefono: fila.cliente_telefono }
            : undefined
    };
}

/** Reservas de un viajero, de la más próxima a la más lejana. */
async function listarPorUsuario(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query(`
            SELECT ${COLUMNAS_RESERVA}, e.nombre_comercial AS proveedor
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            INNER JOIN dbo.empresas e ON e.id_empresa = COALESCE(h.id_empresa, a.id_empresa, v.id_empresa)
            WHERE r.id_usuario = @idUsuario
            ORDER BY r.fecha_inicio DESC, r.id_reserva DESC
        `);
    return resultado.recordset.map(aReserva);
}

/** Reservas recibidas por las publicaciones de una empresa. */
async function listarPorEmpresa(idEmpresa) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .query(`
            SELECT ${COLUMNAS_RESERVA}, e.nombre_comercial AS proveedor,
                   u.nombre AS cliente_nombre, u.correo AS cliente_correo, u.telefono AS cliente_telefono
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            INNER JOIN dbo.empresas e ON e.id_empresa = COALESCE(h.id_empresa, a.id_empresa, v.id_empresa)
            INNER JOIN dbo.usuarios u ON u.id_usuario = r.id_usuario
            WHERE e.id_empresa = @idEmpresa
            ORDER BY r.fecha_inicio DESC, r.id_reserva DESC
        `);
    return resultado.recordset.map(aReserva);
}

/** Lee una reserva y bloquea su fila para cancelarla. */
async function bloquearReserva(transaccion, idReserva) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('id', sql.Int, idReserva)
        .query(`SELECT id_reserva, id_usuario, estado, fecha_inicio
                FROM dbo.reservas WITH (UPDLOCK, HOLDLOCK) WHERE id_reserva = @id`);
    const fila = resultado.recordset[0];
    return fila
        ? { id: fila.id_reserva, idUsuario: fila.id_usuario, estado: fila.estado, fechaInicio: aIso(fila.fecha_inicio) }
        : null;
}

async function cancelar(transaccion, idReserva) {
    const consulta = await peticion(transaccion);
    await consulta
        .input('id', sql.Int, idReserva)
        .query(`UPDATE dbo.reservas SET estado = 'cancelada', fecha_cancelacion = SYSUTCDATETIME()
                WHERE id_reserva = @id`);
}

/**
 * Indicadores del panel de empresa a partir de la fecha indicada.
 * @returns {Promise<{hoteles: number, actividades: number, vehiculos: number, proximas: number, ingresos: number, canceladas: number}>}
 */
async function resumenEmpresa(idEmpresa, desde) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .input('desde', sql.Date, aFecha(desde))
        .query(`
            SELECT
                (SELECT COUNT(*) FROM dbo.hoteles WHERE id_empresa = @idEmpresa) AS hoteles,
                (SELECT COUNT(*) FROM dbo.actividades WHERE id_empresa = @idEmpresa) AS actividades,
                (SELECT COUNT(*) FROM dbo.vehiculos WHERE id_empresa = @idEmpresa) AS vehiculos,
                COALESCE(SUM(CASE WHEN r.estado = 'confirmada' AND r.fecha_inicio >= @desde THEN 1 ELSE 0 END), 0) AS proximas,
                COALESCE(SUM(CASE WHEN r.estado = 'confirmada' THEN r.total ELSE 0 END), 0) AS ingresos,
                COALESCE(SUM(CASE WHEN r.estado = 'cancelada' THEN 1 ELSE 0 END), 0) AS canceladas
            FROM dbo.reservas r
            LEFT JOIN dbo.hoteles h ON h.id_hotel = r.id_hotel
            LEFT JOIN dbo.actividades a ON a.id_actividad = r.id_actividad
            LEFT JOIN dbo.vehiculos v ON v.id_vehiculo = r.id_vehiculo
            WHERE COALESCE(h.id_empresa, a.id_empresa, v.id_empresa) = @idEmpresa
        `);
    const fila = resultado.recordset[0];
    return {
        hoteles: fila.hoteles,
        actividades: fila.actividades,
        vehiculos: fila.vehiculos,
        proximas: fila.proximas,
        ingresos: Number(fila.ingresos),
        canceladas: fila.canceladas
    };
}

module.exports = {
    bloquearPublicacion,
    reservasHotelEnRango,
    reservasVehiculoEnRango,
    personasActividadEnFecha,
    crear,
    listarPorUsuario,
    listarPorEmpresa,
    bloquearReserva,
    cancelar,
    resumenEmpresa
};
