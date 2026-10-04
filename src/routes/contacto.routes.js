/**
 * @file src/routes/contacto.routes.js
 * @description Formulario de contacto. Prefijo: /api
 *   POST /contacto  Registra un mensaje dirigido al equipo de BookingRD.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const contactoController = require('../controllers/contacto.controller');

const router = express.Router();

router.post('/contacto', asyncHandler(contactoController.enviarMensaje));

module.exports = router;
