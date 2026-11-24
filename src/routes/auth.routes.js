/**
 * @file src/routes/auth.routes.js
 * @description Rutas de cuentas. Prefijo: /api/auth
 *   POST /registro            Solicitud de cuenta (viajero o empresa): envía un código al correo.
 *   POST /registro/verificar  Confirma el código y crea la cuenta; devuelve un JWT.
 *   POST /registro/reenviar   Envía un código nuevo (como mucho uno por minuto).
 *   POST /recuperar           Envía el enlace para crear una contraseña nueva.
 *   GET  /restablecer         Comprueba que el enlace sigue vigente.
 *   POST /restablecer         Guarda la contraseña nueva; devuelve un JWT.
 *   GET  /correo-prueba/:archivo  Correo guardado (solo sin SMTP configurado).
 *   POST /login     Inicio de sesión; devuelve un JWT.
 *   GET  /sesion    Valida el token vigente y devuelve los datos del usuario.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion } = require('../middleware/autenticacion');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/registro', asyncHandler(authController.registrar));
router.post('/registro/verificar', asyncHandler(authController.verificarRegistro));
router.post('/registro/reenviar', asyncHandler(authController.reenviarCodigo));
router.post('/recuperar', asyncHandler(authController.solicitarRecuperacion));
router.get('/restablecer', asyncHandler(authController.comprobarEnlace));
router.post('/restablecer', asyncHandler(authController.restablecerPassword));
router.get('/correo-prueba/:archivo', asyncHandler(authController.verCorreoPrueba));
router.post('/login', asyncHandler(authController.iniciarSesion));
router.get('/sesion', requiereSesion, authController.obtenerSesion);

module.exports = router;
