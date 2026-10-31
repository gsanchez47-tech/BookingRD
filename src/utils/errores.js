/**
 * @file src/utils/errores.js
 * @description Error de aplicación con código HTTP. Los servicios y
 *   controladores lo lanzan para que el manejador central (src/server.js)
 *   responda { error, campo } con el código indicado.
 */

class ErrorHttp extends Error {
    /**
     * @param {number} status  código HTTP (400, 401, 403, 404, 409...)
     * @param {string} mensaje mensaje para el usuario
     * @param {string|null} [campo] id del campo del formulario relacionado
     */
    constructor(status, mensaje, campo = null) {
        super(mensaje);
        this.name = 'ErrorHttp';
        this.status = status;
        this.campo = campo;
    }
}

const solicitudInvalida = (mensaje, campo) => new ErrorHttp(400, mensaje, campo);
const noEncontrado = (mensaje = 'El recurso solicitado no existe.') => new ErrorHttp(404, mensaje);
const conflicto = (mensaje, campo) => new ErrorHttp(409, mensaje, campo);
const prohibido = (mensaje = 'No tienes permiso para realizar esta acción.') => new ErrorHttp(403, mensaje);

module.exports = { ErrorHttp, solicitudInvalida, noEncontrado, conflicto, prohibido };
