/**
 * @file src/repositories/contacto.repo.js
 * @description Mensajes del formulario de contacto (tabla dbo.mensajes_contacto).
 */

const { peticion, sql } = require('../config/db');

async function crear({ nombre, correo, asunto, mensaje }) {
    const consulta = await peticion();
    await consulta
        .input('nombre', sql.NVarChar(150), nombre)
        .input('correo', sql.NVarChar(200), correo)
        .input('asunto', sql.VarChar(20), asunto)
        .input('mensaje', sql.NVarChar(2000), mensaje)
        .query(`
            INSERT INTO dbo.mensajes_contacto (nombre, correo, asunto, mensaje)
            VALUES (@nombre, @correo, @asunto, @mensaje)
        `);
}

module.exports = { crear };
