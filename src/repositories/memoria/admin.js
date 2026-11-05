/**
 * @file src/repositories/memoria/admin.js
 * @description Versión en memoria de src/repositories/admin.repo.js
 *   (modo de demostración).
 */

'use strict';

const A = require('./almacen');
const { filaReserva } = require('./reservas');
const { horaIso } = require('../../utils/fechas');

async function resumen(desde, hasta) {
    const { bd } = A;
    const confirmadas = bd.reservas.filter((r) => r.estado === 'confirmada');
    const visibles = bd.resenas.filter((rs) => rs.visible).map((rs) => rs.puntuacion);

    const meses = new Map();
    for (const r of confirmadas) {
        if (r.fecha_inicio < desde || r.fecha_inicio >= hasta) continue;
        const clave = r.fecha_inicio.slice(0, 7);
        const mes = meses.get(clave) || { anio: Number(clave.slice(0, 4)), mes: Number(clave.slice(5, 7)), reservas: 0, ingresos: 0 };
        mes.reservas += 1;
        mes.ingresos += Number(r.total);
        meses.set(clave, mes);
    }

    const categorias = new Map();
    for (const r of confirmadas) {
        const categoria = A.categoriaDe(A.tipoDe(r), A.publicacionDe(r));
        categorias.set(categoria, (categorias.get(categoria) || 0) + 1);
    }

    const empresas = new Map();
    for (const r of confirmadas) {
        const e = A.empresa(A.publicacionDe(r).id_empresa);
        const fila = empresas.get(e.id_empresa) || { id: e.id_empresa, nombre: e.nombre_comercial, reservas: 0, ingresos: 0 };
        fila.reservas += 1;
        fila.ingresos += Number(r.total);
        empresas.set(e.id_empresa, fila);
    }

    return {
        totales: {
            viajeros: bd.usuarios.filter((u) => u.rol === 'cliente').length,
            empresas: bd.usuarios.filter((u) => u.rol === 'empresa').length,
            suspendidas: bd.usuarios.filter((u) => u.rol !== 'admin' && !u.activo).length,
            hoteles: bd.hoteles.length,
            actividades: bd.actividades.length,
            vehiculos: bd.vehiculos.length,
            confirmadas: confirmadas.length,
            canceladas: bd.reservas.filter((r) => r.estado === 'cancelada').length,
            ingresos: confirmadas.reduce((suma, r) => suma + Number(r.total), 0),
            mensajesPendientes: bd.mensajes_contacto.filter((m) => !m.atendido).length,
            resenas: bd.resenas.length,
            resenasOcultas: bd.resenas.filter((rs) => !rs.visible).length,
            puntuacionMedia: A.media(visibles)
        },
        meses: [...meses.values()],
        categorias: [...categorias].map(([categoria, reservas]) => ({ categoria, reservas })),
        empresas: [...empresas.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, 5)
    };
}

async function listarUsuarios({ rol, texto }) {
    return A.bd.usuarios
        .filter((u) => u.rol !== 'admin' && (!rol || u.rol === rol))
        .map((u) => ({ u, e: A.bd.empresas.find((e) => e.id_usuario === u.id_usuario) || null }))
        .filter(({ u, e }) => !texto || A.contiene(u.nombre, texto) || A.contiene(u.correo, texto) || (e && A.contiene(e.nombre_comercial, texto)))
        .sort(A.ordenarPor([[({ u }) => A.tiempo(u.fecha_creacion), 'desc'], [({ u }) => u.id_usuario, 'desc']]))
        .slice(0, 300)
        .map(({ u, e }) => ({
            id: u.id_usuario,
            nombre: u.nombre,
            correo: u.correo,
            telefono: u.telefono,
            rol: u.rol,
            activo: Boolean(u.activo),
            fechaCreacion: u.fecha_creacion,
            empresa: e ? { id: e.id_empresa, nombre: e.nombre_comercial } : null,
            reservas: A.bd.reservas.filter((r) => r.id_usuario === u.id_usuario).length
        }));
}

async function listarEmpresas() {
    return A.bd.empresas
        .slice()
        .sort(A.ordenarPor([[(e) => e.nombre_comercial, 'asc']]))
        .map((e) => {
            const u = A.usuario(e.id_usuario);
            const confirmadas = A.bd.reservas.filter((r) => r.estado === 'confirmada' && A.publicacionDe(r).id_empresa === e.id_empresa);
            const contar = (tabla) => A.bd[tabla].filter((p) => p.id_empresa === e.id_empresa).length;
            return {
                id: e.id_empresa,
                idUsuario: u.id_usuario,
                nombre: e.nombre_comercial,
                razonSocial: e.razon_social,
                rnc: e.rnc,
                telefono: e.telefono,
                ubicacion: [e.ciudad, e.provincia].filter(Boolean).join(', '),
                licenciaMitur: e.licencia_mitur,
                tipoServicio: e.tipo_servicio,
                fechaRegistro: e.fecha_registro,
                representante: u.nombre,
                correo: u.correo,
                activo: Boolean(u.activo),
                hoteles: contar('hoteles'),
                actividades: contar('actividades'),
                vehiculos: contar('vehiculos'),
                reservas: confirmadas.length,
                ingresos: confirmadas.reduce((suma, r) => suma + Number(r.total), 0)
            };
        });
}

async function cambiarEstadoUsuario(idUsuario, activo) {
    const u = A.usuario(idUsuario);
    if (!u || u.rol === 'admin') return false;
    u.activo = activo ? 1 : 0;
    return true;
}

async function moderarPublicacion(tipo, id, { activo = null, destacado = null }) {
    const p = A.publicacion(tipo, id);
    if (!p) return false;
    if (activo !== null) p.activo = activo ? 1 : 0;
    if (destacado !== null) p.destacado = destacado ? 1 : 0;
    p.fecha_actualizacion = A.ahora();
    return true;
}

async function listarReservas({ estado }) {
    return A.bd.reservas
        .filter((r) => !estado || r.estado === estado)
        .sort(A.ordenarPor([[(r) => r.fecha_inicio, 'desc'], [(r) => r.id_reserva, 'desc']]))
        .slice(0, 300)
        .map((r) => {
            const f = filaReserva(r, { conCliente: true });
            return {
                id: f.id_reserva,
                codigo: f.codigo,
                tipo: f.tipo,
                idPublicacion: f.id_publicacion,
                publicacion: f.publicacion,
                proveedor: f.proveedor,
                cliente: { nombre: f.cliente_nombre, correo: f.cliente_correo },
                fechaInicio: f.fecha_inicio,
                fechaFin: f.fecha_fin,
                personas: f.personas,
                habitaciones: f.habitaciones,
                total: Number(f.total),
                estado: f.estado,
                fechaCreacion: f.fecha_creacion,
                alquiler: f.tipo === 'vehiculo'
                    ? { horaRecogida: horaIso(f.hora_inicio), horaDevolucion: horaIso(f.hora_fin), ciudadDevolucion: f.ciudad_devolucion }
                    : undefined
            };
        });
}

async function listarMensajes() {
    return A.bd.mensajes_contacto
        .slice()
        .sort(A.ordenarPor([[(m) => m.atendido, 'asc'], [(m) => A.tiempo(m.fecha_envio), 'desc']]))
        .slice(0, 300)
        .map((m) => ({
            id: m.id_mensaje,
            nombre: m.nombre,
            correo: m.correo,
            asunto: m.asunto,
            mensaje: m.mensaje,
            atendido: Boolean(m.atendido),
            fechaEnvio: m.fecha_envio
        }));
}

async function marcarMensaje(idMensaje, atendido) {
    const m = A.bd.mensajes_contacto.find((fila) => fila.id_mensaje === idMensaje);
    if (!m) return false;
    m.atendido = atendido ? 1 : 0;
    return true;
}

module.exports = {
    resumen,
    listarUsuarios,
    listarEmpresas,
    cambiarEstadoUsuario,
    moderarPublicacion,
    listarReservas,
    listarMensajes,
    marcarMensaje
};
