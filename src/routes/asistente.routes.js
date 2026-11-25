/**
 * @file src/routes/asistente.routes.js
 * @description Asistente Caribe con IA (opcional).
 *   GET  /api/asistente/estado   { ia: boolean }  ¿Hay una clave de IA configurada?
 *   POST /api/asistente          { mensaje, historial?, idioma? } -> { respuesta, accion, destino, personas }
 *                                503 sin clave o si la IA no responde: el asistente usa sus opciones.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const asistente = require('../services/asistente.service');

const router = express.Router();

const limite = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.LIMITE_ASISTENTE || 40),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muchas preguntas seguidas. Espera unos minutos o usa las opciones del asistente.' }
});

/** Usuario del token, si lo hay (el asistente también funciona sin sesión). */
function usuarioOpcional(req) {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
}

router.get('/estado', (req, res) => res.json({ ia: asistente.disponible() }));

router.post('/', limite, asyncHandler(async (req, res) => {
    if (!asistente.disponible()) return res.status(503).json({ error: 'El asistente con IA no está configurado.', ia: false });
    const mensaje = String((req.body || {}).mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'Escribe tu pregunta.' });
    const historial = Array.isArray(req.body.historial) ? req.body.historial.slice(-6) : [];
    const idioma = req.body.idioma === 'en' ? 'en' : 'es';
    try {
        res.json(await asistente.responder({ mensaje: mensaje.slice(0, 600), historial, usuario: usuarioOpcional(req), idioma }));
    } catch (error) {
        console.error(`Asistente con IA: ${error.message}`);
        res.status(503).json({ error: 'La IA no respondió. Sigo con las opciones.', ia: true });
    }
}));

module.exports = router;
