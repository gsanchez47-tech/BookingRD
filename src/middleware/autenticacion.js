/**
 * @file src/middleware/autenticacion.js
 * @description Verificación del token JWT de sesión.
 */

const jwt = require('jsonwebtoken');

/**
 * Exige un token JWT válido en el encabezado `Authorization: Bearer <token>`.
 * Si es válido, expone su contenido en `req.usuario`
 * ({ id, nombre, rol } y, en cuentas de empresa, { idEmpresa, nombreEmpresa, tipoServicio }).
 *
 * @returns 401 si el token falta, está vencido o fue alterado.
 */
function requiereSesion(req, res, next) {
    const [tipo, token] = (req.headers.authorization || '').split(' ');

    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.' });
    }
}

module.exports = { requiereSesion };
