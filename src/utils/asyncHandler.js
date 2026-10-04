/**
 * @file src/utils/asyncHandler.js
 * @description Envoltorio para manejadores async de Express 4. Redirige las
 *   promesas rechazadas a next(error), de modo que el manejador de errores
 *   centralizado (src/server.js) responda en lugar de dejar la petición sin
 *   respuesta.
 */

/**
 * @param {Function} manejador  función async (req, res, next)
 * @returns {Function} middleware de Express
 */
function asyncHandler(manejador) {
    return function (req, res, next) {
        Promise.resolve(manejador(req, res, next)).catch(next);
    };
}

module.exports = asyncHandler;
