/**
 * @file src/repositories/combos.repo.js
 * @description Combos de alojamiento y actividades (SQL Server / Azure).
 *   Solo se devuelven combos activos cuyas publicaciones están activas y
 *   pertenecen a empresas no suspendidas. El precio de referencia y el
 *   descuento los calcula src/services/combos.service.js.
 */

const { peticion, sql } = require('../config/db');

/** La publicación (alias) está activa y su empresa no está suspendida. */
const visible = (alias) => `${alias}.activo = 1 AND EXISTS (
        SELECT 1 FROM dbo.empresas e INNER JOIN dbo.usuarios u ON u.id_usuario = e.id_usuario
        WHERE e.id_empresa = ${alias}.id_empresa AND u.activo = 1)`;

const CONSULTA = `
    SELECT cb.id_combo, cb.nombre, cb.lema, cb.descripcion, cb.ciudad, cb.dia_actividad, cb.dia_actividad2,
           cb.noches_sugeridas, cb.descuento_pct, cb.destacado,
           h.id_hotel, h.nombre AS hotel_nombre, h.precio_noche AS hotel_precio, h.capacidad_personas AS hotel_capacidad,
           h.tipo_alojamiento AS hotel_tipo, h.id_imagen AS hotel_id_imagen, h.imagen_url AS hotel_imagen_url,
           a.id_actividad AS a1_id, a.nombre AS a1_nombre, a.precio_persona AS a1_precio, a.duracion_horas AS a1_duracion,
           a.categoria AS a1_categoria, a.id_imagen AS a1_id_imagen, a.imagen_url AS a1_imagen_url,
           a2.id_actividad AS a2_id, a2.nombre AS a2_nombre, a2.precio_persona AS a2_precio, a2.duracion_horas AS a2_duracion,
           a2.categoria AS a2_categoria, a2.id_imagen AS a2_id_imagen, a2.imagen_url AS a2_imagen_url
    FROM dbo.combos cb
    INNER JOIN dbo.hoteles h ON h.id_hotel = cb.id_hotel
    INNER JOIN dbo.actividades a ON a.id_actividad = cb.id_actividad
    LEFT JOIN dbo.actividades a2 ON a2.id_actividad = cb.id_actividad2
    WHERE cb.activo = 1 AND ${visible('h')} AND ${visible('a')}
      AND (cb.id_actividad2 IS NULL OR (${visible('a2')}))`;

/** Fila de la consulta a la forma común de los repositorios de combos. */
function aFilaCombo(f) {
    const imagen = (id, url) => (id ? `/api/imagenes/${id}` : url || null);
    const actividad = (p, dia) => ({
        id: f[`${p}_id`],
        nombre: f[`${p}_nombre`],
        precio: Number(f[`${p}_precio`]),
        duracion: Number(f[`${p}_duracion`]),
        categoria: f[`${p}_categoria`],
        imagen: imagen(f[`${p}_id_imagen`], f[`${p}_imagen_url`]),
        dia
    });
    return {
        id: f.id_combo,
        nombre: f.nombre,
        lema: f.lema,
        descripcion: f.descripcion,
        ciudad: f.ciudad,
        nochesSugeridas: f.noches_sugeridas,
        descuento: f.descuento_pct,
        destacado: Boolean(f.destacado),
        hotel: {
            id: f.id_hotel,
            nombre: f.hotel_nombre,
            precio: Number(f.hotel_precio),
            capacidad: f.hotel_capacidad,
            tipoAlojamiento: f.hotel_tipo,
            imagen: imagen(f.hotel_id_imagen, f.hotel_imagen_url)
        },
        actividades: [actividad('a1', f.dia_actividad)].concat(f.a2_id ? [actividad('a2', f.dia_actividad2)] : [])
    };
}

/** Combos visibles, los destacados primero. */
async function listar() {
    const consulta = await peticion();
    const resultado = await consulta.query(`${CONSULTA} ORDER BY cb.destacado DESC, cb.id_combo`);
    return resultado.recordset.map(aFilaCombo);
}

/** Un combo visible, o null. */
async function obtener(id) {
    const consulta = await peticion();
    const resultado = await consulta.input('id', sql.Int, id).query(`${CONSULTA} AND cb.id_combo = @id`);
    return resultado.recordset[0] ? aFilaCombo(resultado.recordset[0]) : null;
}

module.exports = { listar, obtener };
