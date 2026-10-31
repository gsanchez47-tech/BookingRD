/**
 * @file src/validators/resenas.validator.js
 * @description Validación de reseñas y de respuestas de empresa.
 *   Lanza ErrorHttp 400 con el id del campo del formulario que falló.
 */

const { solicitudInvalida } = require('../utils/errores');
const { aEnteroPositivo, textoLimpio } = require('../utils/validacion');

const TITULO_MINIMO = 3;
const TITULO_MAXIMO = 120;
const COMENTARIO_MINIMO = 20;
const COMENTARIO_MAXIMO = 1500;
const RESPUESTA_MAXIMA = 1000;

/**
 * @param {object} body { idReserva, puntuacion, titulo, comentario }
 * @returns {{idReserva: number, puntuacion: number, titulo: string, comentario: string}}
 */
function validarResena(body) {
    const idReserva = aEnteroPositivo(body.idReserva);
    if (!idReserva) throw solicitudInvalida('Indica la reserva que quieres reseñar.');

    const puntuacion = Number(body.puntuacion);
    if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 10) {
        throw solicitudInvalida('Elige una puntuación del 1 al 10.', 'resena-puntuacion');
    }
    const titulo = textoLimpio(body.titulo);
    if (titulo.length < TITULO_MINIMO || titulo.length > TITULO_MAXIMO) {
        throw solicitudInvalida(`El título debe tener entre ${TITULO_MINIMO} y ${TITULO_MAXIMO} caracteres.`, 'resena-titulo');
    }
    const comentario = textoLimpio(body.comentario);
    if (comentario.length < COMENTARIO_MINIMO || comentario.length > COMENTARIO_MAXIMO) {
        throw solicitudInvalida(`Cuéntanos tu experiencia en al menos ${COMENTARIO_MINIMO} caracteres (máximo ${COMENTARIO_MAXIMO}).`, 'resena-comentario');
    }
    return { idReserva, puntuacion, titulo, comentario };
}

/** @returns {string} respuesta normalizada; '' elimina la respuesta. */
function validarRespuesta(body) {
    const respuesta = textoLimpio(body.respuesta);
    if (respuesta.length > RESPUESTA_MAXIMA) {
        throw solicitudInvalida(`La respuesta admite hasta ${RESPUESTA_MAXIMA} caracteres.`, 'respuesta-texto');
    }
    return respuesta;
}

module.exports = { validarResena, validarRespuesta };
