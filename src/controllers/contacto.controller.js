/**
 * @file src/controllers/contacto.controller.js
 * @description Recepción de mensajes del formulario de contacto de la página
 *   de inicio. Los mensajes se almacenan en dbo.mensajes_contacto para su
 *   atención por el equipo de BookingRD.
 */

const contactoRepo = require('../repositories/contacto.repo');
const { esCorreoValido, textoLimpio } = require('../utils/validacion');
const { ASUNTOS_CONTACTO } = require('../utils/catalogos');

const LONGITUD_MINIMA_MENSAJE = 10;
const LONGITUD_MAXIMA_MENSAJE = 2000;

/**
 * POST /api/contacto
 *
 * Body: { nombre, correo, asunto, mensaje }
 *   asunto: viajero | empresa | cuenta | otro
 * Respuestas: 201 { mensaje } | 400 { error, campo }.
 */
async function enviarMensaje(req, res) {
    const body = req.body || {};
    const nombre = textoLimpio(body.nombre);
    const correo = textoLimpio(body.correo).toLowerCase();
    const asunto = body.asunto;
    const mensaje = textoLimpio(body.mensaje);

    if (!nombre || nombre.length > 150) return res.status(400).json({ campo: 'contacto-nombre', error: 'Escribe tu nombre.' });
    if (!esCorreoValido(correo) || correo.length > 200) return res.status(400).json({ campo: 'contacto-correo', error: 'Escribe un correo con formato válido.' });
    if (!Object.hasOwn(ASUNTOS_CONTACTO, asunto)) return res.status(400).json({ campo: 'contacto-asunto', error: 'Selecciona el asunto del mensaje.' });
    if (mensaje.length < LONGITUD_MINIMA_MENSAJE || mensaje.length > LONGITUD_MAXIMA_MENSAJE) {
        return res.status(400).json({ campo: 'contacto-mensaje', error: `El mensaje debe tener entre ${LONGITUD_MINIMA_MENSAJE} y ${LONGITUD_MAXIMA_MENSAJE} caracteres.` });
    }

    await contactoRepo.crear({ nombre, correo, asunto, mensaje });

    res.status(201).json({ mensaje: 'Mensaje recibido. Te responderemos al correo indicado.' });
}

module.exports = { enviarMensaje };
