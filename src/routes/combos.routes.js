/**
 * @file src/routes/combos.routes.js
 * @description Combos de alojamiento y actividades. Prefijo: /api/combos
 *   GET  /                 Combos disponibles (?ciudad=).
 *   GET  /:id              Detalle con el precio de referencia.
 *   GET  /:id/cotizacion   Total y disponibilidad para unas fechas.
 *   POST /:id/reservar     Reserva el combo (sesión de viajero).
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion, requiereRol } = require('../middleware/autenticacion');
const combosController = require('../controllers/combos.controller');

const router = express.Router();

router.get('/', asyncHandler(combosController.listar));
router.get('/:id', asyncHandler(combosController.obtener));
router.get('/:id/cotizacion', asyncHandler(combosController.cotizar));
router.post('/:id/reservar', requiereSesion, requiereRol('cliente'), asyncHandler(combosController.reservar));

module.exports = router;
