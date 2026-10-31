/**
 * @file src/repositories/imagenes.repo.js
 * @description Fotografías subidas por las empresas (tabla dbo.imagenes).
 */

const { peticion, sql } = require('../config/db');

/** @returns {Promise<number>} id_imagen */
async function crear(idEmpresa, tipoMime, contenido) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .input('tipoMime', sql.VarChar(20), tipoMime)
        .input('contenido', sql.VarBinary(sql.MAX), contenido)
        .input('tamano', sql.Int, contenido.length)
        .query(`
            INSERT INTO dbo.imagenes (id_empresa, tipo_mime, contenido, tamano_bytes)
            OUTPUT INSERTED.id_imagen AS id
            VALUES (@idEmpresa, @tipoMime, @contenido, @tamano)
        `);
    return resultado.recordset[0].id;
}

/** @returns {Promise<{tipoMime: string, contenido: Buffer}|null>} */
async function obtener(idImagen) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idImagen)
        .query('SELECT tipo_mime, contenido FROM dbo.imagenes WHERE id_imagen = @id');
    const fila = resultado.recordset[0];
    return fila ? { tipoMime: fila.tipo_mime, contenido: fila.contenido } : null;
}

/** @returns {Promise<boolean>} true si la imagen existe y pertenece a la empresa. */
async function perteneceAEmpresa(idImagen, idEmpresa) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, idImagen)
        .input('idEmpresa', sql.Int, idEmpresa)
        .query('SELECT 1 AS existe FROM dbo.imagenes WHERE id_imagen = @id AND id_empresa = @idEmpresa');
    return resultado.recordset.length > 0;
}

module.exports = { crear, obtener, perteneceAEmpresa };
