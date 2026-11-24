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

/* Verificación del correo y restablecimiento de contraseña. */

const vigente = (v) => new Date(v.expira).getTime() > Date.now();

async function crearVerificacion({ correo, proposito, codigoHash, datos = null, minutos }) {
    for (const v of A.bd.verificaciones) if (v.correo === correo && v.proposito === proposito) v.usado = 1;
    // Las verificaciones usadas o vencidas no hace falta guardarlas.
    A.bd.verificaciones = A.bd.verificaciones.filter((v) => !v.usado && vigente(v));
    A.insertar('verificaciones', 'id_verificacion', {
        correo, proposito, codigo_hash: codigoHash, datos, intentos: 0, usado: 0,
        expira: new Date(Date.now() + minutos * 60000), fecha_creacion: A.ahora()
    });
    A.guardar();
}

async function verificacionPendiente(correo, proposito) {
    const v = A.bd.verificaciones.filter((x) => x.correo === correo && x.proposito === proposito && !x.usado).pop();
    if (!v) return null;
    return Object.assign({}, v, { vigente: vigente(v) ? 1 : 0, segundos: Math.floor((Date.now() - new Date(v.fecha_creacion).getTime()) / 1000) });
}

async function verificacionPorHash(proposito, codigoHash) {
    return A.bd.verificaciones.find((v) => v.proposito === proposito && v.codigo_hash === codigoHash && !v.usado && vigente(v)) || null;
}

async function sumarIntento(idVerificacion) {
    const v = A.bd.verificaciones.find((x) => x.id_verificacion === idVerificacion);
    if (v && v.intentos < 10) v.intentos += 1;
    A.guardar();
}

async function usarVerificacion(transaccion, idVerificacion) {
    const v = A.bd.verificaciones.find((x) => x.id_verificacion === idVerificacion);
    if (!v || v.usado) return false;
    v.usado = 1;
    A.guardar();
    return true;
}

async function cambiarPassword(transaccion, correo, passwordHash) {
    const u = A.bd.usuarios.find((x) => x.correo.toLowerCase() === correo.toLowerCase());
    if (!u) return false;
    u.password_hash = passwordHash;
    A.guardar();
    return true;
}

module.exports = {
    crearVerificacion,
    verificacionPendiente,
    verificacionPorHash,
    sumarIntento,
    usarVerificacion,
    cambiarPassword,
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
