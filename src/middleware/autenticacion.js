/**
 * @file src/middleware/autenticacion.js
 * @description Verificación del token JWT de sesión y autorización por rol.
 */

const jwt = require('jsonwebtoken');
const cuentasRepo = require('../repositories/cuentas.repo');

/**
 * Exige un token JWT válido en el encabezado `Authorization: Bearer <token>`
 * y una cuenta habilitada. Si es válido, expone su contenido en `req.usuario`
 * ({ id, nombre, rol } y, en cuentas de empresa, { idEmpresa, nombreEmpresa, tipoServicio }).
 *
 * La consulta del estado de la cuenta hace que una suspensión aplicada desde
 * la administración surta efecto en la siguiente petición, sin esperar a
 * que el token venza.
 *
 * @returns 401 si el token falta, está vencido o fue alterado, o si la cuenta
 *   está suspendida.
 */
async function requiereSesion(req, res, next) {
    const [tipo, token] = (req.headers.authorization || '').split(' ');

    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
    }

    let datos;
    try {
        datos = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ error: 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.' });
    }

    try {
        if (!(await cuentasRepo.estaActivo(datos.id))) {
            return res.status(401).json({ error: 'Tu cuenta está suspendida. Escribe a soporte@bookingrd.com.' });
        }
    } catch (error) {
        return next(error);   // base no disponible: lo resuelve el manejador central (503)
    }
    req.usuario = datos;
    next();
}

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados.
 * Debe usarse después de requiereSesion.
 *
 * @param {...string} roles
 * @returns 403 si el rol no está permitido.
 */
function requiereRol(...roles) {
    return function (req, res, next) {
        if (!req.usuario || !roles.includes(req.usuario.rol)) {
            return res.status(403).json({ error: 'Tu cuenta no tiene permiso para realizar esta acción.' });
        }
        if (req.usuario.rol === 'empresa' && !req.usuario.idEmpresa) {
            return res.status(403).json({ error: 'La cuenta no tiene una empresa asociada.' });
        }
        next();
    };
}

module.exports = { requiereSesion, requiereRol };
