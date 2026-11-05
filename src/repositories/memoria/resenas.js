/**
 * @file src/repositories/memoria/resenas.js
 * @description Versión en memoria de src/repositories/resenas.repo.js
 *   (modo de demostración).
 */

'use strict';

const { ORDENES, nombrePublico, aResena } = require('../resenas.repo');
const A = require('./almacen');

/** Fila con las columnas de COLUMNAS_RESENA (reseña, reserva, autor y publicación). */
function filaResena(rs) {
    const r = A.bd.reservas.find((fila) => fila.id_reserva === rs.id_reserva);
    const p = A.publicacionDe(r);
    return Object.assign({}, rs, {
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        personas: r.personas,
        autor: A.usuario(r.id_usuario).nombre,
        tipo: A.tipoDe(r),
        id_publicacion: A.idPublicacionDe(r),
        publicacion: p.nombre,
        ciudad: p.ciudad,
        id_reserva: r.id_reserva,
        id_usuario: r.id_usuario,
        id_empresa: p.id_empresa,
        publicacion_activa: p.activo,
        proveedor: A.empresa(p.id_empresa).nombre_comercial,
        _publicacion: p
    });
}

const filas = () => A.bd.resenas.map(filaResena);

const de = (tipo, id) => (f) => f.tipo === tipo && f.id_publicacion === id;

const COMPARADORES = {
    recientes: [[(f) => A.tiempo(f.fecha_creacion), 'desc'], [(f) => f.id_resena, 'desc']],
    'mejor-valoradas': [[(f) => f.puntuacion, 'desc'], [(f) => A.tiempo(f.fecha_creacion), 'desc']],
    'peor-valoradas': [[(f) => f.puntuacion, 'asc'], [(f) => A.tiempo(f.fecha_creacion), 'desc']]
};

/** Quita las columnas auxiliares que no devuelve la consulta SQL. */
const sinProveedor = (f) => { const copia = Object.assign({}, f); delete copia.proveedor; return copia; };

async function resumenPublicacion(tipo, idPublicacion) {
    const p = filas().filter((f) => f.visible && de(tipo, idPublicacion)(f)).map((f) => f.puntuacion);
    const contar = (condicion) => p.filter(condicion).length;
    return {
        promedio: A.media(p),
        total: p.length,
        distribucion: {
            excelente: contar((x) => x >= 9),
            muyBueno: contar((x) => x >= 7 && x <= 8),
            aceptable: contar((x) => x >= 5 && x <= 6),
            regular: contar((x) => x >= 3 && x <= 4),
            malo: contar((x) => x <= 2)
        }
    };
}

async function listarPorPublicacion(tipo, idPublicacion, { orden = 'recientes', pagina = 1, porPagina = 5 } = {}) {
    const desde = (pagina - 1) * porPagina;
    return filas()
        .filter((f) => f.visible && de(tipo, idPublicacion)(f))
        .sort(A.ordenarPor(COMPARADORES[orden] || COMPARADORES.recientes))
        .slice(desde, desde + porPagina)
        .map((f) => aResena(sinProveedor(f)));
}

async function destacadas(limite = 6) {
    return filas()
        .filter((f) => f.visible && f.puntuacion >= 9 && f.comentario.length >= 60
            && f.publicacion_activa && A.empresaActiva(f._publicacion))
        .sort(A.ordenarPor([[(f) => f.puntuacion, 'desc'], [(f) => A.tiempo(f.fecha_creacion), 'desc'], [(f) => f.id_resena, 'desc']]))
        .slice(0, limite)
        .map((f) => aResena(sinProveedor(f)));
}

async function pendientesDeUsuario(idUsuario, hoy) {
    return A.bd.reservas
        .filter((r) => r.id_usuario === idUsuario && r.estado === 'confirmada'
            && (r.fecha_fin || r.fecha_inicio) <= hoy
            && !A.bd.resenas.some((rs) => rs.id_reserva === r.id_reserva))
        .sort(A.ordenarPor([[(r) => r.fecha_fin || r.fecha_inicio, 'desc']]))
        .map((r) => {
            const p = A.publicacionDe(r);
            return {
                idReserva: r.id_reserva,
                codigo: r.codigo,
                tipo: A.tipoDe(r),
                idPublicacion: A.idPublicacionDe(r),
                publicacion: p.nombre,
                ciudad: p.ciudad,
                fechaInicio: r.fecha_inicio,
                fechaFin: r.fecha_fin
            };
        });
}

async function listarPorUsuario(idUsuario) {
    return filas()
        .filter((f) => f.id_usuario === idUsuario)
        .sort(A.ordenarPor([[(f) => A.tiempo(f.fecha_creacion), 'desc']]))
        .map((f) => Object.assign(aResena(sinProveedor(f)), { idReserva: f.id_reserva, visible: Boolean(f.visible) }));
}

async function obtenerReserva(idReserva) {
    const r = A.bd.reservas.find((fila) => fila.id_reserva === idReserva);
    if (!r) return null;
    return {
        idUsuario: r.id_usuario,
        estado: r.estado,
        fechaFinal: r.fecha_fin || r.fecha_inicio,
        tieneResena: A.bd.resenas.some((rs) => rs.id_reserva === idReserva)
    };
}

async function crear({ idReserva, puntuacion, titulo, comentario }) {
    if (A.bd.resenas.some((rs) => rs.id_reserva === idReserva)) throw A.errorDuplicado('UQ_resenas_reserva');
    const fila = A.insertar('resenas', 'id_resena', {
        id_reserva: idReserva,
        puntuacion,
        titulo,
        comentario,
        respuesta: null,
        fecha_respuesta: null,
        visible: 1,
        fecha_creacion: A.ahora()
    });
    return fila.id_resena;
}

async function listarPorEmpresa(idEmpresa) {
    return filas()
        .filter((f) => f.id_empresa === idEmpresa)
        .sort(A.ordenarPor([[(f) => (f.respuesta === null ? 0 : 1), 'asc'], [(f) => A.tiempo(f.fecha_creacion), 'desc']]))
        .map((f) => aResena(sinProveedor(f), { completo: true }));
}

async function responder(idResena, idEmpresa, respuesta) {
    const rs = A.bd.resenas.find((fila) => fila.id_resena === idResena);
    if (!rs || filaResena(rs).id_empresa !== idEmpresa) return false;
    rs.respuesta = respuesta || null;
    rs.fecha_respuesta = respuesta ? A.ahora() : null;
    return true;
}

async function listarTodas({ visible = null } = {}) {
    return filas()
        .filter((f) => visible === null || Boolean(f.visible) === Boolean(visible))
        .sort(A.ordenarPor([[(f) => A.tiempo(f.fecha_creacion), 'desc'], [(f) => f.id_resena, 'desc']]))
        .map((f) => aResena(f, { completo: true }));
}

async function cambiarVisibilidad(idResena, visible) {
    const rs = A.bd.resenas.find((fila) => fila.id_resena === idResena);
    if (!rs) return false;
    rs.visible = visible ? 1 : 0;
    return true;
}

async function resumenEmpresa(idEmpresa) {
    const propias = filas().filter((f) => f.visible && f.id_empresa === idEmpresa);
    return {
        promedio: A.media(propias.map((f) => f.puntuacion)),
        total: propias.length,
        sinRespuesta: propias.filter((f) => f.respuesta === null).length
    };
}

module.exports = {
    ORDENES,
    nombrePublico,
    aResena,
    resumenPublicacion,
    listarPorPublicacion,
    destacadas,
    pendientesDeUsuario,
    listarPorUsuario,
    obtenerReserva,
    crear,
    listarPorEmpresa,
    responder,
    listarTodas,
    cambiarVisibilidad,
    resumenEmpresa
};
