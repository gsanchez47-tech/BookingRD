/**
 * @file src/repositories/memoria/reservas.js
 * @description Versión en memoria de src/repositories/reservas.repo.js
 *   (modo de demostración). El parámetro `transaccion` se acepta por
 *   compatibilidad; la exclusión mutua la garantiza conTransaccion.
 */

'use strict';

const { aReserva } = require('../reservas.repo');
const A = require('./almacen');

async function bloquearPublicacion(transaccion, tipo, id) {
    const p = A.publicacion(tipo, id);
    if (!p) return null;
    const base = {
        id,
        idEmpresa: p.id_empresa,
        nombre: p.nombre,
        precio: Number(p[A.TABLAS[tipo].precio]),
        activo: A.esVisible(p),
        capacidad: tipo === 'hotel' ? p.capacidad_personas : null,
        unidades: tipo === 'hotel' ? p.habitaciones : tipo === 'actividad' ? p.cupo_diario : p.unidades
    };
    if (tipo !== 'vehiculo') return base;
    return Object.assign(base, {
        ciudad: p.ciudad,
        deposito: Number(p.deposito),
        edadMinima: p.edad_minima,
        cargoConductorJoven: p.cargo_conductor_joven === null ? null : Number(p.cargo_conductor_joven),
        cargoOtraCiudad: p.cargo_otra_ciudad === null ? null : Number(p.cargo_otra_ciudad)
    });
}

async function reservasHotelEnRango(transaccion, idHotel, entrada, salida) {
    return A.bd.reservas
        .filter((r) => r.id_hotel === idHotel && r.estado === 'confirmada' && r.fecha_inicio < salida && r.fecha_fin > entrada)
        .map((r) => ({ entrada: r.fecha_inicio, salida: r.fecha_fin, habitaciones: r.habitaciones }));
}

async function reservasVehiculoEnRango(transaccion, idVehiculo, inicio, fin) {
    return A.bd.reservas
        .filter((r) => r.id_vehiculo === idVehiculo && r.estado === 'confirmada' && r.fecha_inicio <= fin && r.fecha_fin >= inicio)
        .map((r) => ({ inicio: r.fecha_inicio, fin: r.fecha_fin }));
}

async function personasActividadEnFecha(transaccion, idActividad, fecha) {
    return A.bd.reservas
        .filter((r) => r.id_actividad === idActividad && r.estado === 'confirmada' && r.fecha_inicio === fecha)
        .reduce((suma, r) => suma + r.personas, 0);
}

async function crear(transaccion, reserva) {
    if (A.bd.reservas.some((r) => r.codigo === reserva.codigo)) throw A.errorDuplicado('UQ_reservas_codigo');
    const fila = A.insertar('reservas', 'id_reserva', {
        codigo: reserva.codigo,
        id_usuario: reserva.idUsuario,
        id_hotel: reserva.tipo === 'hotel' ? reserva.idPublicacion : null,
        id_actividad: reserva.tipo === 'actividad' ? reserva.idPublicacion : null,
        id_vehiculo: reserva.tipo === 'vehiculo' ? reserva.idPublicacion : null,
        fecha_inicio: reserva.fechaInicio,
        fecha_fin: reserva.fechaFin || null,
        hora_inicio: reserva.horaInicio || null,
        hora_fin: reserva.horaFin || null,
        ciudad_devolucion: reserva.ciudadDevolucion || null,
        edad_conductor: reserva.edadConductor || null,
        extras: reserva.extras && reserva.extras.length ? reserva.extras.join(',') : null,
        deposito: reserva.deposito ?? null,
        personas: reserva.personas,
        habitaciones: reserva.habitaciones || null,
        precio_unitario: reserva.precioUnitario,
        total: reserva.total,
        estado: 'confirmada',
        comentario: reserva.comentario || null,
        fecha_creacion: A.ahora(),
        fecha_cancelacion: null,
        id_combo: reserva.idCombo || null
    });
    return fila.id_reserva;
}

/** Fila con las columnas de COLUMNAS_RESERVA y los datos del cliente. */
function filaReserva(r, { conCliente = false } = {}) {
    const tipo = A.tipoDe(r);
    const p = A.publicacionDe(r);
    const fila = Object.assign({}, r, {
        tipo,
        id_publicacion: A.idPublicacionDe(r),
        publicacion: p.nombre,
        ciudad: p.ciudad,
        id_imagen: p.id_imagen,
        imagen_url: p.imagen_url,
        lugar_recogida: tipo === 'vehiculo' ? p.lugar_recogida : null,
        proveedor: A.empresa(p.id_empresa).nombre_comercial,
        id_empresa: p.id_empresa,
        id_combo: r.id_combo || null,
        combo: r.id_combo ? (A.bd.combos.find((c) => c.id_combo === r.id_combo) || {}).nombre || null : null
    });
    const pago = A.pagoDe(r.id_reserva);
    if (pago) for (const [clave, valor] of Object.entries(pago)) fila[`pago_${clave}`] = valor;
    if (conCliente) {
        const u = A.usuario(r.id_usuario);
        Object.assign(fila, { cliente_nombre: u.nombre, cliente_correo: u.correo, cliente_telefono: u.telefono });
    }
    return fila;
}

const ORDEN_RESERVAS = A.ordenarPor([[(r) => r.fecha_inicio, 'desc'], [(r) => r.id_reserva, 'desc']]);

async function listarPorUsuario(idUsuario) {
    return A.bd.reservas
        .filter((r) => r.id_usuario === idUsuario)
        .sort(ORDEN_RESERVAS)
        .map((r) => aReserva(filaReserva(r)));
}

async function listarPorEmpresa(idEmpresa) {
    return A.bd.reservas
        .map((r) => filaReserva(r, { conCliente: true }))
        .filter((f) => f.id_empresa === idEmpresa)
        .sort(ORDEN_RESERVAS)
        .map(aReserva);
}

async function registrarPago(transaccion, idReserva, pago) {
    if (A.bd.pagos.some((p) => p.referencia === pago.referencia)) throw A.errorDuplicado('UQ_pagos_referencia');
    A.insertar('pagos', 'id_pago', Object.assign({}, pago, {
        id_reserva: idReserva,
        moneda: 'DOP',
        fecha_pago: A.ahora(),
        fecha_reembolso: null
    }));
}

async function bloquearReserva(transaccion, idReserva) {
    const r = A.bd.reservas.find((fila) => fila.id_reserva === idReserva);
    if (!r) return null;
    const pago = A.pagoDe(r.id_reserva);
    return {
        id: r.id_reserva,
        idUsuario: r.id_usuario,
        estado: r.estado,
        fechaInicio: r.fecha_inicio,
        total: Number(r.total),
        pago: pago ? { metodo: pago.metodo, estado: pago.estado, marca: pago.marca, ultimos4: pago.ultimos4 } : null
    };
}

async function cancelar(transaccion, idReserva) {
    const r = A.bd.reservas.find((fila) => fila.id_reserva === idReserva);
    if (!r) return;
    r.estado = 'cancelada';
    r.fecha_cancelacion = A.ahora();
    const pago = A.pagoDe(idReserva);
    if (pago && ['pagado', 'pendiente'].includes(pago.estado)) {
        pago.estado = pago.metodo === 'tarjeta' ? 'reembolsado' : 'anulado';
        pago.fecha_reembolso = pago.metodo === 'tarjeta' ? r.fecha_cancelacion : null;
    }
}

async function marcarCobrado(idEmpresa, idReserva) {
    const r = A.bd.reservas.find((fila) => fila.id_reserva === idReserva);
    const pago = r ? A.pagoDe(idReserva) : null;
    if (!pago || r.estado !== 'confirmada' || A.publicacionDe(r).id_empresa !== idEmpresa) return false;
    if (pago.metodo !== 'en_destino' || pago.estado !== 'pendiente') return false;
    pago.estado = 'pagado';
    pago.fecha_pago = A.ahora();
    return true;
}

async function resumenEmpresa(idEmpresa, desde) {
    const propias = A.bd.reservas.filter((r) => A.publicacionDe(r).id_empresa === idEmpresa);
    const confirmadas = propias.filter((r) => r.estado === 'confirmada');
    return {
        hoteles: A.bd.hoteles.filter((p) => p.id_empresa === idEmpresa).length,
        actividades: A.bd.actividades.filter((p) => p.id_empresa === idEmpresa).length,
        vehiculos: A.bd.vehiculos.filter((p) => p.id_empresa === idEmpresa).length,
        proximas: confirmadas.filter((r) => r.fecha_inicio >= desde).length,
        ingresos: confirmadas.reduce((suma, r) => suma + Number(r.total), 0),
        canceladas: propias.filter((r) => r.estado === 'cancelada').length
    };
}

module.exports = {
    aReserva,
    bloquearPublicacion,
    reservasHotelEnRango,
    reservasVehiculoEnRango,
    personasActividadEnFecha,
    crear,
    registrarPago,
    marcarCobrado,
    listarPorUsuario,
    listarPorEmpresa,
    bloquearReserva,
    cancelar,
    resumenEmpresa,
    filaReserva
};
