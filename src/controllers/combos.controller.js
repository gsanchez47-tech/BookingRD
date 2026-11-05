/**
 * @file src/controllers/combos.controller.js
 * @description Combos de alojamiento y actividades: consulta, cotización y reserva.
 */

const { combosRepo } = require('../repositories');
const reservasService = require('../services/reservas.service');
const { noEncontrado } = require('../utils/errores');
const { aEnteroPositivo } = require('../utils/validacion');

/**
 * Precio de referencia del combo: noches sugeridas, una habitación y dos
 * personas (o la capacidad de la habitación si es menor).
 */
function conPrecioReferencia(combo) {
    const personas = Math.min(2, combo.hotel.capacidad);
    const normal = combo.hotel.precio * combo.nochesSugeridas + combo.actividades.reduce((suma, a) => suma + a.precio * personas, 0);
    const total = Math.round(normal * (100 - combo.descuento)) / 100;
    return Object.assign({}, combo, {
        imagen: combo.hotel.imagen,
        referencia: { noches: combo.nochesSugeridas, personas, normal, total, ahorro: Math.round((normal - total) * 100) / 100 }
    });
}

async function obtenerCombo(id) {
    const combo = await combosRepo.obtener(aEnteroPositivo(id) || 0);
    if (!combo) throw noEncontrado('Este combo no existe o ya no está disponible.');
    return combo;
}

/** GET /api/combos?ciudad= */
async function listar(req, res) {
    let combos = await combosRepo.listar();
    if (req.query.ciudad) combos = combos.filter((c) => c.ciudad === String(req.query.ciudad));
    res.json({ combos: combos.map(conPrecioReferencia) });
}

/** GET /api/combos/:id */
async function obtener(req, res) {
    res.json(conPrecioReferencia(await obtenerCombo(req.params.id)));
}

/** GET /api/combos/:id/cotizacion?entrada&noches&habitaciones&personas */
async function cotizar(req, res) {
    const combo = await obtenerCombo(req.params.id);
    res.json(await reservasService.cotizarCombo(combo, req.query));
}

/**
 * POST /api/combos/:id/reservar
 * { entrada, noches, habitaciones, personas, comentario?, pago }
 * 201 { combo, reservas: [{ codigo, tipo, publicacion, fecha, total }], total, normal, ahorro, pago }
 */
async function reservar(req, res) {
    const combo = await obtenerCombo(req.params.id);
    res.status(201).json(await reservasService.reservarCombo(req.usuario, combo, req.body || {}));
}

module.exports = { listar, obtener, cotizar, reservar };
