/**
 * @file src/routes/auth.routes.js
 * @description Rutas de cuentas. Prefijo: /api/auth
 *   POST /registro  Alta de cuenta de viajero (cliente) o de empresa.
 *   POST /login     Inicio de sesión; devuelve un JWT.
 *   GET  /sesion    Valida el token vigente y devuelve los datos del usuario.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion } = require('../middleware/autenticacion');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/registro', asyncHandler(authController.registrar));
router.post('/login', asyncHandler(authController.iniciarSesion));
router.get('/sesion', requiereSesion, authController.obtenerSesion);

module.exports = router;
