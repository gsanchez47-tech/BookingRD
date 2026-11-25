/**
 * @file src/routes/notificaciones.routes.js
 * @description Avisos de la campana del encabezado (cualquier cuenta con sesión).
 *   GET  /api/notificaciones          Últimos 20 avisos y cuántos no se han leído.
 *   POST /api/notificaciones/leidas   Marca todos como leídos.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion } = require('../middleware/autenticacion');
const { notificacionesRepo } = require('../repositories');

const router = express.Router();
router.use(requiereSesion);

router.get('/', asyncHandler(async (req, res) => {
    res.json(await notificacionesRepo.listar(req.usuario.id));
}));

router.post('/leidas', asyncHandler(async (req, res) => {
    await notificacionesRepo.marcarLeidas(req.usuario.id);
    res.json({ ok: true });
}));

module.exports = router;
