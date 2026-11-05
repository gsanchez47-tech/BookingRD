/**
 * @file src/controllers/reservas.controller.js
 * @description Reservas del viajero con sesión iniciada.
 */

const { reservasRepo } = require('../repositories');
const reservasService = require('../services/reservas.service');

/**
 * POST /api/reservas
 * Hotel:     { tipo: 'hotel', idPublicacion, entrada, salida, habitaciones, personas, comentario? }
 * Actividad: { tipo: 'actividad', idPublicacion, fecha, personas, comentario? }
 * Vehículo:  { tipo: 'vehiculo', idPublicacion, recogida, horaRecogida, devolucion, horaDevolucion, edadConductor, ciudadDevolucion?, extras? }
 * Pago (opcional, por defecto en destino):
 *   { pago: { metodo: 'tarjeta', titular, numero, vencimiento: 'MM/AA', cvv } } | { pago: { metodo: 'en_destino' } }
 * Respuestas: 201 { id, codigo, total, publicacion, pago } | 400 | 402 tarjeta rechazada | 403 | 404 | 409 sin cupo.
 */
async function crear(req, res) {
    const reserva = await reservasService.crearReserva(req.usuario, req.body || {});
    res.status(201).json(reserva);
}

/** GET /api/reservas: reservas del usuario. */
async function listarPropias(req, res) {
    res.json({ reservas: await reservasRepo.listarPorUsuario(req.usuario.id) });
}

/** PATCH /api/reservas/:id/cancelar: { estado, reembolso: { monto, marca, ultimos4 } | null } */
async function cancelar(req, res) {
    const { reembolso } = await reservasService.cancelarReserva(req.usuario, req.params.id);
    res.json({ estado: 'cancelada', reembolso });
}

module.exports = { crear, listarPropias, cancelar };
