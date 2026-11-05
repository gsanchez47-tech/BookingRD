/**
 * @file src/repositories/memoria/tienda.js
 * @description Versión en memoria de src/repositories/tienda.repo.js.
 */

'use strict';

const { aProducto, aPedido } = require('../tienda.repo');
const A = require('./almacen');

async function listarProductos() {
    return A.bd.productos
        .filter((p) => p.activo)
        .sort(A.ordenarPor([[(p) => p.destacado, 'desc'], [(p) => p.categoria, 'asc'], [(p) => p.nombre, 'asc']]))
        .map(aProducto);
}

async function bloquearProducto(transaccion, id) {
    const p = A.bd.productos.find((x) => x.id_producto === id && x.activo);
    return p ? aProducto(p) : null;
}

async function crearPedido(transaccion, pedido) {
    if (A.bd.pedidos.some((p) => p.codigo === pedido.codigo)) throw A.errorDuplicado('UQ_pedidos_codigo');
    const fila = A.insertar('pedidos', 'id_pedido', {
        codigo: pedido.codigo,
        id_usuario: pedido.idUsuario,
        entrega: pedido.entrega,
        destinatario: pedido.destinatario,
        direccion: pedido.direccion,
        telefono: pedido.telefono || null,
        subtotal: pedido.subtotal,
        envio: pedido.envio,
        total: pedido.total,
        estado: 'pagado',
        pago_marca: pedido.pago.marca,
        pago_ultimos4: pedido.pago.ultimos4,
        pago_titular: pedido.pago.titular,
        pago_referencia: pedido.pago.referencia,
        pago_autorizacion: pedido.pago.autorizacion,
        fecha_creacion: A.ahora()
    });
    for (const linea of pedido.lineas) {
        A.insertar('pedido_detalle', 'id_detalle', { id_pedido: fila.id_pedido, id_producto: linea.idProducto, cantidad: linea.cantidad, precio_unitario: linea.precio });
        A.bd.productos.find((p) => p.id_producto === linea.idProducto).existencias -= linea.cantidad;
    }
    return fila.id_pedido;
}

function conLineas(filas) {
    return filas.map((f) => {
        const u = A.usuario(f.id_usuario);
        const lineas = A.bd.pedido_detalle
            .filter((d) => d.id_pedido === f.id_pedido)
            .map((d) => {
                const p = A.bd.productos.find((x) => x.id_producto === d.id_producto);
                return Object.assign({}, d, { nombre: p.nombre, imagen_url: p.imagen_url });
            });
        return aPedido(Object.assign({}, f, { cliente_nombre: u.nombre, cliente_correo: u.correo }), lineas);
    });
}

const ORDEN = A.ordenarPor([[(p) => A.tiempo(p.fecha_creacion), 'desc'], [(p) => p.id_pedido, 'desc']]);

async function listarPedidosPorUsuario(idUsuario) {
    return conLineas(A.bd.pedidos.filter((p) => p.id_usuario === idUsuario).sort(ORDEN));
}

async function listarPedidos() {
    return conLineas(A.bd.pedidos.slice().sort(ORDEN));
}

async function bloquearPedido(transaccion, id) {
    const f = A.bd.pedidos.find((p) => p.id_pedido === id);
    return f ? { id: f.id_pedido, idUsuario: f.id_usuario, estado: f.estado, total: Number(f.total), marca: f.pago_marca, ultimos4: f.pago_ultimos4 } : null;
}

async function cambiarEstadoPedido(transaccion, id, estado) {
    const f = A.bd.pedidos.find((p) => p.id_pedido === id);
    f.estado = estado;
    if (estado === 'cancelado') {
        for (const d of A.bd.pedido_detalle.filter((x) => x.id_pedido === id)) {
            A.bd.productos.find((p) => p.id_producto === d.id_producto).existencias += d.cantidad;
        }
    }
}

module.exports = {
    listarProductos,
    bloquearProducto,
    crearPedido,
    listarPedidosPorUsuario,
    listarPedidos,
    bloquearPedido,
    cambiarEstadoPedido
};
