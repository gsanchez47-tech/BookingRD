/**
 * @file src/routes/catalogo.routes.js
 * @description Consultas públicas de la página de inicio. Prefijo: /api
 *   GET /estadisticas            Totales de publicaciones, ciudades y empresas.
 *   GET /hoteles?ciudad=&personas=      Hoteles publicados.
 *   GET /actividades?ciudad=&personas=  Actividades publicadas.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const catalogoController = require('../controllers/catalogo.controller');

const router = express.Router();

router.get('/estadisticas', asyncHandler(catalogoController.obtenerEstadisticas));
router.get('/hoteles', asyncHandler(catalogoController.listarHoteles));
router.get('/actividades', asyncHandler(catalogoController.listarActividades));

module.exports = router;
