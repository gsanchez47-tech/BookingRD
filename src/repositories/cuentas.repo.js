/**
 * @file src/repositories/cuentas.repo.js
 * @description Usuarios y empresas (tablas dbo.usuarios y dbo.empresas).
 */

const { peticion, sql } = require('../config/db');

async function existeCorreo(correo) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('correo', sql.NVarChar(200), correo)
        .query('SELECT 1 AS existe FROM dbo.usuarios WHERE correo = @correo');
    return resultado.recordset.length > 0;
}

async function existeRnc(rnc) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('rnc', sql.VarChar(11), rnc)
        .query('SELECT 1 AS existe FROM dbo.empresas WHERE rnc = @rnc');
    return resultado.recordset.length > 0;
}

/** @returns {Promise<{id_usuario: number, nombre: string, rol: string}>} */
async function crearUsuario(transaccion, { nombre, correo, telefono, passwordHash, rol }) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('nombre', sql.NVarChar(150), nombre)
        .input('correo', sql.NVarChar(200), correo)
        .input('telefono', sql.NVarChar(30), telefono)
        .input('passwordHash', sql.NVarChar(200), passwordHash)
        .input('rol', sql.VarChar(20), rol)
        .query(`
            INSERT INTO dbo.usuarios (nombre, correo, telefono, password_hash, rol)
            OUTPUT INSERTED.id_usuario, INSERTED.nombre, INSERTED.rol
            VALUES (@nombre, @correo, @telefono, @passwordHash, @rol)
        `);
    return resultado.recordset[0];
}

/** @returns {Promise<number>} id_empresa */
async function crearEmpresa(transaccion, idUsuario, empresa) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .input('cargo', sql.NVarChar(100), empresa.cargo)
        .input('nombreComercial', sql.NVarChar(150), empresa.nombreComercial)
        .input('razonSocial', sql.NVarChar(150), empresa.razonSocial)
        .input('rnc', sql.VarChar(11), empresa.rnc)
        .input('telefono', sql.NVarChar(30), empresa.telefono)
        .input('provincia', sql.NVarChar(60), empresa.provincia)
        .input('ciudad', sql.NVarChar(100), empresa.ciudad)
        .input('direccion', sql.NVarChar(250), empresa.direccion)
        .input('sitioWeb', sql.NVarChar(300), empresa.sitioWeb)
        .input('licenciaMitur', sql.NVarChar(30), empresa.licenciaMitur)
        .input('tipoServicio', sql.VarChar(20), empresa.tipoServicio)
        .input('tipoAlojamiento', sql.VarChar(20), empresa.tipoAlojamiento)
        .input('numeroHabitaciones', sql.Int, empresa.numeroHabitaciones)
        .input('categoriasActividad', sql.VarChar(200), empresa.categoriasActividad)
        .input('descripcion', sql.NVarChar(sql.MAX), empresa.descripcion)
        .query(`
            INSERT INTO dbo.empresas
                (id_usuario, cargo_representante, nombre_comercial, razon_social, rnc, telefono,
                 provincia, ciudad, direccion, sitio_web, licencia_mitur, tipo_servicio,
                 tipo_alojamiento, numero_habitaciones, categorias_actividad, descripcion)
            OUTPUT INSERTED.id_empresa AS id
            VALUES
                (@idUsuario, @cargo, @nombreComercial, @razonSocial, @rnc, @telefono,
                 @provincia, @ciudad, @direccion, @sitioWeb, @licenciaMitur, @tipoServicio,
                 @tipoAlojamiento, @numeroHabitaciones, @categoriasActividad, @descripcion)
        `);
    return resultado.recordset[0].id;
}

/** Datos de inicio de sesión, con la empresa asociada si existe. */
async function obtenerCredenciales(correo) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('correo', sql.NVarChar(200), correo)
        .query(`
            SELECT u.id_usuario, u.nombre, u.rol, u.password_hash, u.activo,
                   e.id_empresa, e.nombre_comercial, e.tipo_servicio
            FROM dbo.usuarios u
            LEFT JOIN dbo.empresas e ON e.id_usuario = u.id_usuario
            WHERE u.correo = @correo
        `);
    return resultado.recordset[0] || null;
}

/** Perfil de empresa para el panel. */
async function obtenerEmpresa(idEmpresa) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .query(`
            SELECT e.id_empresa, e.nombre_comercial, e.razon_social, e.rnc, e.telefono, e.provincia,
                   e.ciudad, e.direccion, e.sitio_web, e.licencia_mitur, e.tipo_servicio,
                   e.tipo_alojamiento, e.numero_habitaciones, e.categorias_actividad, e.descripcion,
                   e.cargo_representante, u.nombre AS representante, u.correo
            FROM dbo.empresas e
            INNER JOIN dbo.usuarios u ON u.id_usuario = e.id_usuario
            WHERE e.id_empresa = @idEmpresa
        `);
    const fila = resultado.recordset[0];
    if (!fila) return null;
    return {
        id: fila.id_empresa,
        nombreComercial: fila.nombre_comercial,
        razonSocial: fila.razon_social,
        rnc: fila.rnc,
        telefono: fila.telefono,
        provincia: fila.provincia,
        ciudad: fila.ciudad,
        direccion: fila.direccion,
        sitioWeb: fila.sitio_web,
        licenciaMitur: fila.licencia_mitur,
        tipoServicio: fila.tipo_servicio,
        tipoAlojamiento: fila.tipo_alojamiento,
        numeroHabitaciones: fila.numero_habitaciones,
        categoriasActividad: fila.categorias_actividad ? fila.categorias_actividad.split(',') : [],
        descripcion: fila.descripcion,
        representante: fila.representante,
        cargo: fila.cargo_representante,
        correo: fila.correo
    };
}

/**
 * Indica si la cuenta sigue habilitada. Se consulta en cada petición
 * autenticada para que una suspensión tenga efecto inmediato.
 * @returns {Promise<boolean>}
 */
async function estaActivo(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query('SELECT activo FROM dbo.usuarios WHERE id_usuario = @idUsuario');
    return Boolean(resultado.recordset[0] && resultado.recordset[0].activo);
}

/**
 * Actualiza los datos editables del perfil de empresa. El RNC, la razón
 * social y el tipo de servicio no se modifican desde el panel.
 * @returns {Promise<boolean>} false si la empresa no existe.
 */
async function actualizarEmpresa(idEmpresa, datos) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idEmpresa', sql.Int, idEmpresa)
        .input('nombreComercial', sql.NVarChar(150), datos.nombreComercial)
        .input('telefono', sql.NVarChar(30), datos.telefono)
        .input('provincia', sql.NVarChar(60), datos.provincia)
        .input('ciudad', sql.NVarChar(100), datos.ciudad)
        .input('direccion', sql.NVarChar(250), datos.direccion)
        .input('sitioWeb', sql.NVarChar(300), datos.sitioWeb)
        .input('licenciaMitur', sql.NVarChar(30), datos.licenciaMitur)
        .input('descripcion', sql.NVarChar(sql.MAX), datos.descripcion)
        .query(`
            UPDATE dbo.empresas
            SET nombre_comercial = @nombreComercial, telefono = @telefono, provincia = @provincia,
                ciudad = @ciudad, direccion = @direccion, sitio_web = @sitioWeb,
                licencia_mitur = @licenciaMitur, descripcion = @descripcion
            WHERE id_empresa = @idEmpresa
        `);
    return resultado.rowsAffected[0] > 0;
}

/** @returns {Promise<{nombre: string, correo: string}|null>} nombre y correo de un usuario. */
async function obtenerContacto(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query('SELECT nombre, correo FROM dbo.usuarios WHERE id_usuario = @idUsuario');
    return resultado.recordset[0] || null;
}

module.exports = {
    obtenerContacto,
    existeCorreo,
    existeRnc,
    crearUsuario,
    crearEmpresa,
    obtenerCredenciales,
    obtenerEmpresa,
    estaActivo,
    actualizarEmpresa
};
