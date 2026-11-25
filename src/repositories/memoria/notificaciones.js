/**
 * @file src/repositories/memoria/notificaciones.js
 * @description Versión en memoria de src/repositories/notificaciones.repo.js.
 */

'use strict';

const A = require('./almacen');

async function crear({ idUsuario, tipo, titulo, mensaje, enlace = null }) {
    A.insertar('notificaciones', 'id_notificacion', {
        id_usuario: idUsuario, tipo, titulo: String(titulo).slice(0, 150), mensaje: String(mensaje).slice(0, 400),
        enlace, leida: false, fecha: A.ahora()
    });
    A.guardar();
}

async function listar(idUsuario) {
    const propias = A.bd.notificaciones.filter((n) => n.id_usuario === idUsuario)
        .sort((a, b) => A.tiempo(b.fecha) - A.tiempo(a.fecha) || b.id_notificacion - a.id_notificacion);
    return {
        notificaciones: propias.slice(0, 20).map((n) => ({
            id: n.id_notificacion, tipo: n.tipo, titulo: n.titulo, mensaje: n.mensaje, enlace: n.enlace,
            leida: Boolean(n.leida), fecha: new Date(A.tiempo(n.fecha)).toISOString()
        })),
        sinLeer: propias.filter((n) => !n.leida).length
    };
}

async function marcarLeidas(idUsuario) {
    for (const n of A.bd.notificaciones) if (n.id_usuario === idUsuario) n.leida = true;
    A.guardar();
}

function aviso(r) {
    const p = A.publicacionDe(r);
    const u = A.usuario(r.id_usuario);
    const tipo = A.tipoDe(r);
    return {
        id: r.id_reserva, codigo: r.codigo, idUsuario: r.id_usuario, cliente: u.nombre, correo: u.correo,
        tipo, idPublicacion: A.idPublicacionDe(r), publicacion: p.nombre, ciudad: p.ciudad, imagenUrl: p.imagen_url,
        lugar: p.direccion || p.punto_encuentro || p.lugar_recogida || null,
        fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin || null, personas: r.personas, habitaciones: r.habitaciones
    };
}

async function paraRecordatorio(fecha) {
    return A.bd.reservas.filter((r) => r.estado === 'confirmada' && !r.recordatorio_enviado && r.fecha_inicio === fecha).map(aviso);
}

async function paraResena(desde, hasta) {
    return A.bd.reservas.filter((r) => {
        const fin = r.fecha_fin || r.fecha_inicio;
        return r.estado === 'confirmada' && !r.resena_pedida && fin >= desde && fin <= hasta
            && !A.bd.resenas.some((rs) => rs.id_reserva === r.id_reserva);
    }).map(aviso);
}

async function marcarRecordatorio(idReserva) {
    const r = A.bd.reservas.find((x) => x.id_reserva === idReserva);
    if (r) r.recordatorio_enviado = true;
    A.guardar();
}

async function marcarResenaPedida(idReserva) {
    const r = A.bd.reservas.find((x) => x.id_reserva === idReserva);
    if (r) r.resena_pedida = true;
    A.guardar();
}

async function empresaDePublicacion(tipo, idPublicacion) {
    const p = A.publicacion(tipo, idPublicacion);
    if (!p) return null;
    const e = A.empresa(p.id_empresa);
    const u = e && A.usuario(e.id_usuario);
    return u ? { idUsuario: u.id_usuario, nombre: u.nombre, correo: u.correo, nombreComercial: e.nombre_comercial, publicacion: p.nombre, imagenUrl: p.imagen_url, ciudad: p.ciudad } : null;
}

module.exports = { crear, listar, marcarLeidas, paraRecordatorio, paraResena, marcarRecordatorio, marcarResenaPedida, empresaDePublicacion };
