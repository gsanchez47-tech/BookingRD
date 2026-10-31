/**
 * @file src/routes/empresa.routes.js
 * @description Panel de empresa. Prefijo: /api/empresa. Requieren sesión con rol "empresa".
 *   GET    /perfil                               Perfil e indicadores.
 *   PUT    /perfil                               Actualizar datos de contacto y descripción.
 *   GET    /publicaciones?tipo=                  Publicaciones propias (incluye ocultas).
 *   GET    /publicaciones/:tipo/:id              Detalle de una publicación propia.
 *   POST   /publicaciones                        Crear publicación.
 *   PUT    /publicaciones/:tipo/:id              Editar publicación.
 *   PATCH  /publicaciones/:tipo/:id/estado       Publicar u ocultar.
 *   DELETE /publicaciones/:tipo/:id              Eliminar (solo sin reservas).
 *   POST   /imagenes                             Subir fotografía (JSON con data URL).
 *   GET    /reservas                             Reservas recibidas.
 *   GET    /resenas                              Reseñas de las publicaciones propias.
 *   PUT    /resenas/:id/respuesta                Responder (o retirar la respuesta de) una reseña.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion, requiereRol } = require('../middleware/autenticacion');
const { validarTipo } = require('./parametros');
const empresaController = require('../controllers/empresa.controller');

const router = express.Router();
router.use(requiereSesion, requiereRol('empresa'));
router.param('tipo', validarTipo);

router.get('/perfil', asyncHandler(empresaController.obtenerPerfil));
router.put('/perfil', asyncHandler(empresaController.actualizarPerfil));
router.get('/publicaciones', asyncHandler(empresaController.listarPublicaciones));
router.get('/publicaciones/:tipo/:id', asyncHandler(empresaController.obtenerPublicacion));
router.post('/publicaciones', asyncHandler(empresaController.crearPublicacion));
router.put('/publicaciones/:tipo/:id', asyncHandler(empresaController.actualizarPublicacion));
router.patch('/publicaciones/:tipo/:id/estado', asyncHandler(empresaController.cambiarEstado));
router.delete('/publicaciones/:tipo/:id', asyncHandler(empresaController.eliminarPublicacion));
router.post('/imagenes', asyncHandler(empresaController.subirImagen));
router.get('/reservas', asyncHandler(empresaController.listarReservas));
router.get('/resenas', asyncHandler(empresaController.listarResenas));
router.put('/resenas/:id/respuesta', asyncHandler(empresaController.responderResena));

module.exports = router;
