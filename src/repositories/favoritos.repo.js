/**
 * @file src/repositories/favoritos.repo.js
 * @description Publicaciones guardadas por los viajeros. El listado completo
 *   con los datos de cada publicación está en publicaciones.repo.js
 *   (listarFavoritas), que comparte las columnas del catálogo.
 */

const { peticion, sql } = require('../config/db');

const COLUMNA = { hotel: 'id_hotel', actividad: 'id_actividad', vehiculo: 'id_vehiculo' };
const TABLA = { hotel: 'dbo.hoteles', actividad: 'dbo.actividades', vehiculo: 'dbo.vehiculos' };

/** @returns {Promise<{tipo: string, id: number}[]>} claves de las publicaciones guardadas. */
async function listarClaves(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query(`
            SELECT CASE WHEN id_hotel IS NOT NULL THEN 'hotel' WHEN id_actividad IS NOT NULL THEN 'actividad' ELSE 'vehiculo' END AS tipo,
                   COALESCE(id_hotel, id_actividad, id_vehiculo) AS id
            FROM dbo.favoritos
            WHERE id_usuario = @idUsuario
        `);
    return resultado.recordset.map((fila) => ({ tipo: fila.tipo, id: fila.id }));
}

/**
 * Guarda una publicación visible. No hace nada si ya estaba guardada.
 * @returns {Promise<boolean>} false si la publicación no existe o no está visible.
 */
async function agregar(idUsuario, tipo, idPublicacion) {
    const columna = COLUMNA[tipo];
    const tabla = TABLA[tipo];
    const visible = `SELECT 1 FROM ${tabla} p
                INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
                INNER JOIN dbo.usuarios u ON u.id_usuario = e.id_usuario
                WHERE p.${columna} = @id AND p.activo = 1 AND u.activo = 1`;
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .input('id', sql.Int, idPublicacion)
        .query(`
            INSERT INTO dbo.favoritos (id_usuario, ${columna})
            SELECT @idUsuario, @id
            WHERE EXISTS (${visible})
              AND NOT EXISTS (SELECT 1 FROM dbo.favoritos f WHERE f.id_usuario = @idUsuario AND f.${columna} = @id);

            SELECT CASE WHEN EXISTS (${visible}) THEN 1 ELSE 0 END AS existe;
        `);
    return Boolean(resultado.recordset[0].existe);
}

/** Quita una publicación de las guardadas. */
async function quitar(idUsuario, tipo, idPublicacion) {
    const consulta = await peticion();
    await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .input('id', sql.Int, idPublicacion)
        .query(`DELETE FROM dbo.favoritos WHERE id_usuario = @idUsuario AND ${COLUMNA[tipo]} = @id`);
}

module.exports = { listarClaves, agregar, quitar };
