/**
 * @file src/controllers/tienda.controller.js
 * @description Tienda de artesanía: productos, pedidos del viajero y
 *   seguimiento desde la administración.
 */

const { tiendaRepo } = require('../repositories');
const tiendaService = require('../services/tienda.service');

/** GET /api/tienda/productos */
async function listarProductos(req, res) {
    res.json({ productos: await tiendaRepo.listarProductos() });
}

/**
 * POST /api/tienda/pedidos
 * { productos: [{ id, cantidad }], entrega: 'hotel'|'domicilio', destinatario, direccion, telefono?, pago }
 * 201 pedido | 400 | 402 tarjeta rechazada | 404 | 409 sin existencias
 */
async function crearPedido(req, res) {
    res.status(201).json(await tiendaService.crearPedido(req.usuario, req.body || {}));
}

/** GET /api/tienda/pedidos: pedidos del viajero. */
async function listarPropios(req, res) {
    res.json({ pedidos: await tiendaRepo.listarPedidosPorUsuario(req.usuario.id) });
}

/** PATCH /api/tienda/pedidos/:id/cancelar */
async function cancelar(req, res) {
    const { reembolso } = await tiendaService.cancelarPedido(req.usuario, req.params.id);
    res.json({ estado: 'cancelado', reembolso });
}

/** GET /api/admin/pedidos */
async function listarTodos(req, res) {
    res.json({ pedidos: await tiendaRepo.listarPedidos() });
}

/** PATCH /api/admin/pedidos/:id/avanzar: pagado -> enviado -> entregado. */
async function avanzar(req, res) {
    res.json(await tiendaService.avanzarPedido(req.params.id));
}

module.exports = { listarProductos, crearPedido, listarPropios, cancelar, listarTodos, avanzar };
