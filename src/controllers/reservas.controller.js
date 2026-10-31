/**
 * @file src/controllers/reservas.controller.js
 * @description Reservas del viajero con sesión iniciada.
 */

const reservasService = require('../services/reservas.service');
const reservasRepo = require('../repositories/reservas.repo');

/**
 * POST /api/reservas
 * Hotel:     { tipo: 'hotel', idPublicacion, entrada, salida, habitaciones, personas, comentario? }
 * Actividad: { tipo: 'actividad', idPublicacion, fecha, personas, comentario? }
 * Respuestas: 201 { id, codigo, total, publicacion } | 400 | 403 | 404 | 409 sin cupo.
 */
async function crear(req, res) {
    const reserva = await reservasService.crearReserva(req.usuario, req.body || {});
    res.status(201).json(reserva);
}

/** GET /api/reservas: reservas del usuario. */
async function listarPropias(req, res) {
    res.json({ reservas: await reservasRepo.listarPorUsuario(req.usuario.id) });
}

/** PATCH /api/reservas/:id/cancelar */
async function cancelar(req, res) {
    await reservasService.cancelarReserva(req.usuario, req.params.id);
    res.json({ estado: 'cancelada' });
}

module.exports = { crear, listarPropias, cancelar };
