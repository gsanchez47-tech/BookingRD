/**
 * @file src/routes/tienda.routes.js
 * @description Tienda de artesanía. Prefijo: /api/tienda
 *   GET   /productos               Productos a la venta.
 *   POST  /pedidos                 Comprar (sesión de viajero, pago con tarjeta simulado).
 *   GET   /pedidos                 Pedidos del viajero.
 *   PATCH /pedidos/:id/cancelar    Cancelar un pedido aún no enviado.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion, requiereRol } = require('../middleware/autenticacion');
const tiendaController = require('../controllers/tienda.controller');

const router = express.Router();
const soloViajero = [requiereSesion, requiereRol('cliente')];

router.get('/productos', asyncHandler(tiendaController.listarProductos));
router.post('/pedidos', soloViajero, asyncHandler(tiendaController.crearPedido));
router.get('/pedidos', soloViajero, asyncHandler(tiendaController.listarPropios));
router.patch('/pedidos/:id/cancelar', soloViajero, asyncHandler(tiendaController.cancelar));

module.exports = router;
