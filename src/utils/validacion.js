/**
 * @file src/utils/validacion.js
 * @description Funciones de validación reutilizadas por los controladores.
 */

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @returns {boolean} true si el valor es un correo con formato válido. */
function esCorreoValido(correo) {
    return typeof correo === 'string' && PATRON_CORREO.test(correo.trim());
}

/** @returns {boolean} true si el valor es una cadena con contenido. */
function esTextoNoVacio(texto) {
    return typeof texto === 'string' && texto.trim().length > 0;
}

/**
 * Convierte un valor (cadena o número) en entero positivo.
 * @returns {number|null} el entero, o null si no es un entero > 0.
 */
function aEnteroPositivo(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Normaliza un campo de texto del cuerpo de la petición.
 * @returns {string} el texto sin espacios exteriores, o '' si no es una cadena.
 */
function textoLimpio(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
}

module.exports = { esCorreoValido, esTextoNoVacio, aEnteroPositivo, textoLimpio };
