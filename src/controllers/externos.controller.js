/**
 * @file src/controllers/externos.controller.js
 * @description Clima de los destinos y tipos de cambio (servicios externos).
 */

'use strict';

const externos = require('../services/externos.service');
const { DESTINOS } = require('../utils/catalogos');
const { solicitudInvalida, ErrorHttp } = require('../utils/errores');

/** GET /api/clima?ciudad=Samaná */
async function obtenerClima(req, res) {
    const ciudad = String(req.query.ciudad || '');
    if (!Object.hasOwn(DESTINOS, ciudad)) throw solicitudInvalida('Indica un destino válido.', 'ciudad');
    const clima = await externos.clima(ciudad);
    if (!clima) throw new ErrorHttp(503, 'El clima no está disponible en este momento.');
    res.set('Cache-Control', 'public, max-age=600');
    res.json(clima);
}

/** GET /api/monedas */
async function obtenerMonedas(req, res) {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(await externos.tasas());
}

module.exports = { obtenerClima, obtenerMonedas };
