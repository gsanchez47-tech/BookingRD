/**
 * @file src/routes/externos.routes.js
 * @description Datos de servicios externos. Prefijo: /api
 *   GET /clima?ciudad=<destino>   Clima actual y pronóstico de cuatro días (Open-Meteo).
 *   GET /monedas                  Pesos por dólar y por euro (ExchangeRate-API).
 *   GET /mar?ciudad=<destino>     Olas y temperatura del agua (Open-Meteo Marine).
 *   GET /feriados                 Próximos feriados de la RD (Nager.Date).
 *   GET /destinos/resumen?ciudad= Resumen del destino (Wikipedia en español).
 */

'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const externosController = require('../controllers/externos.controller');

const router = express.Router();

router.get('/clima', asyncHandler(externosController.obtenerClima));
router.get('/monedas', asyncHandler(externosController.obtenerMonedas));
router.get('/mar', asyncHandler(externosController.obtenerMar));
router.get('/feriados', asyncHandler(externosController.obtenerFeriados));
router.get('/destinos/resumen', asyncHandler(externosController.obtenerResumenDestino));

module.exports = router;
