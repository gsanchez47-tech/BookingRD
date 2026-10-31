/**
 * @file src/routes/parametros.js
 * @description Validación de parámetros de ruta compartidos.
 */

/** Tipos de publicación de la plataforma. */
const TIPOS_PUBLICACION = ['hotel', 'actividad', 'vehiculo'];

/** Parámetro :tipo de publicación: "hotel", "actividad" o "vehiculo"; otro valor responde 404. */
function validarTipo(req, res, next, tipo) {
    if (!TIPOS_PUBLICACION.includes(tipo)) {
        return res.status(404).json({ error: 'La ruta solicitada no existe.' });
    }
    next();
}

module.exports = { validarTipo, TIPOS_PUBLICACION };
