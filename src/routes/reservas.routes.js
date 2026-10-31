/**
 * @file src/routes/reservas.routes.js
 * @description Reservas del viajero. Prefijo: /api/reservas. Requieren sesión.
 *   POST  /               Crear reserva (rol cliente).
 *   GET   /               Reservas del usuario.
 *   PATCH /:id/cancelar   Cancelar una reserva futura propia.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion } = require('../middleware/autenticacion');
const reservasController = require('../controllers/reservas.controller');

const router = express.Router();
router.use(requiereSesion);

router.post('/', asyncHandler(reservasController.crear));
router.get('/', asyncHandler(reservasController.listarPropias));
router.patch('/:id/cancelar', asyncHandler(reservasController.cancelar));

module.exports = router;
