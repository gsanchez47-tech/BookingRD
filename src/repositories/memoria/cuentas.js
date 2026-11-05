/**
 * @file src/repositories/memoria/cuentas.js
 * @description Versión en memoria de src/repositories/cuentas.repo.js
 *   (modo de demostración).
 */

'use strict';

const A = require('./almacen');

async function existeCorreo(correo) {
    return A.bd.usuarios.some((u) => u.correo.toLowerCase() === String(correo).toLowerCase());
}

async function existeRnc(rnc) {
    return A.bd.empresas.some((e) => e.rnc === rnc);
}

async function crearUsuario(transaccion, { nombre, correo, telefono, passwordHash, rol }) {
    if (await existeCorreo(correo)) throw A.errorDuplicado('UQ_usuarios_correo');
    const fila = A.insertar('usuarios', 'id_usuario', {
        nombre,
        correo,
        telefono: telefono || null,
        password_hash: passwordHash,
        rol,
        activo: 1,
        fecha_creacion: A.ahora()
    });
    return { id_usuario: fila.id_usuario, nombre: fila.nombre, rol: fila.rol };
}

async function crearEmpresa(transaccion, idUsuario, empresa) {
    if (await existeRnc(empresa.rnc)) throw A.errorDuplicado('UQ_empresas_rnc');
    const fila = A.insertar('empresas', 'id_empresa', {
        id_usuario: idUsuario,
        cargo_representante: empresa.cargo,
        nombre_comercial: empresa.nombreComercial,
        razon_social: empresa.razonSocial,
        rnc: empresa.rnc,
        telefono: empresa.telefono,
        provincia: empresa.provincia,
        ciudad: empresa.ciudad,
        direccion: empresa.direccion,
        sitio_web: empresa.sitioWeb || null,
        licencia_mitur: empresa.licenciaMitur || null,
        tipo_servicio: empresa.tipoServicio,
        tipo_alojamiento: empresa.tipoAlojamiento || null,
        numero_habitaciones: empresa.numeroHabitaciones || null,
        categorias_actividad: empresa.categoriasActividad || null,
        descripcion: empresa.descripcion || null,
        fecha_registro: A.ahora()
    });
    return fila.id_empresa;
}

async function obtenerCredenciales(correo) {
    const u = A.bd.usuarios.find((fila) => fila.correo.toLowerCase() === String(correo).toLowerCase());
    if (!u) return null;
    const e = A.bd.empresas.find((fila) => fila.id_usuario === u.id_usuario);
    return {
        id_usuario: u.id_usuario,
        nombre: u.nombre,
        rol: u.rol,
        password_hash: u.password_hash,
        activo: u.activo,
        id_empresa: e ? e.id_empresa : null,
        nombre_comercial: e ? e.nombre_comercial : null,
        tipo_servicio: e ? e.tipo_servicio : null
    };
}

async function obtenerEmpresa(idEmpresa) {
    const e = A.empresa(idEmpresa);
    if (!e) return null;
    const u = A.usuario(e.id_usuario);
    return {
        id: e.id_empresa,
        nombreComercial: e.nombre_comercial,
        razonSocial: e.razon_social,
        rnc: e.rnc,
        telefono: e.telefono,
        provincia: e.provincia,
        ciudad: e.ciudad,
        direccion: e.direccion,
        sitioWeb: e.sitio_web,
        licenciaMitur: e.licencia_mitur,
        tipoServicio: e.tipo_servicio,
        tipoAlojamiento: e.tipo_alojamiento,
        numeroHabitaciones: e.numero_habitaciones,
        categoriasActividad: e.categorias_actividad ? e.categorias_actividad.split(',') : [],
        descripcion: e.descripcion,
        representante: u.nombre,
        cargo: e.cargo_representante,
        correo: u.correo
    };
}

async function estaActivo(idUsuario) {
    const u = A.usuario(idUsuario);
    return Boolean(u && u.activo);
}

async function actualizarEmpresa(idEmpresa, datos) {
    const e = A.empresa(idEmpresa);
    if (!e) return false;
    Object.assign(e, {
        nombre_comercial: datos.nombreComercial,
        telefono: datos.telefono,
        provincia: datos.provincia,
        ciudad: datos.ciudad,
        direccion: datos.direccion,
        sitio_web: datos.sitioWeb || null,
        licencia_mitur: datos.licenciaMitur || null,
        descripcion: datos.descripcion || null
    });
    return true;
}

async function obtenerContacto(idUsuario) {
    const u = A.usuario(idUsuario);
    return u ? { nombre: u.nombre, correo: u.correo } : null;
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
