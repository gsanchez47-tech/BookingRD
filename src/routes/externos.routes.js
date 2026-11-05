/**
 * @file src/routes/externos.routes.js
 * @description Datos de servicios externos. Prefijo: /api
 *   GET /clima?ciudad=<destino>   Clima actual y pronóstico de cuatro días (Open-Meteo).
 *   GET /monedas                  Pesos por dólar y por euro (ExchangeRate-API).
 */

'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const externosController = require('../controllers/externos.controller');

const router = express.Router();

router.get('/clima', asyncHandler(externosController.obtenerClima));
router.get('/monedas', asyncHandler(externosController.obtenerMonedas));

module.exports = router;
