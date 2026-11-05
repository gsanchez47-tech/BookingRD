/**
 * @file src/routes/admin.routes.js
 * @description Administración de la plataforma. Prefijo: /api/admin.
 *   Requieren sesión con rol "admin".
 *   GET    /resumen                     Indicadores globales y series.
 *   GET    /usuarios?rol=&q=            Cuentas de viajeros y empresas.
 *   PATCH  /usuarios/:id/estado         Habilitar o suspender una cuenta.
 *   GET    /empresas                    Empresas con indicadores.
 *   GET    /publicaciones?tipo=&q=      Todas las publicaciones.
 *   PATCH  /publicaciones/:tipo/:id     Ocultar, publicar o destacar.
 *   GET    /reservas?estado=            Reservas de la plataforma.
 *   GET    /mensajes                    Mensajes de contacto.
 *   PATCH  /mensajes/:id                Marcar como atendido o pendiente.
 *   GET    /resenas?visible=            Reseñas de la plataforma.
 *   PATCH  /resenas/:id                 Mostrar u ocultar una reseña.
 *   GET    /pedidos                     Pedidos de la tienda de artesanía.
 *   PATCH  /pedidos/:id/avanzar         Pedido enviado o entregado.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion, requiereRol } = require('../middleware/autenticacion');
const tiendaController = require('../controllers/tienda.controller');
const { validarTipo } = require('./parametros');
const adminController = require('../controllers/admin.controller');

const router = express.Router();
router.use(requiereSesion, requiereRol('admin'));
router.param('tipo', validarTipo);

router.get('/resumen', asyncHandler(adminController.obtenerResumen));
router.get('/usuarios', asyncHandler(adminController.listarUsuarios));
router.patch('/usuarios/:id/estado', asyncHandler(adminController.cambiarEstadoUsuario));
router.get('/empresas', asyncHandler(adminController.listarEmpresas));
router.get('/publicaciones', asyncHandler(adminController.listarPublicaciones));
router.patch('/publicaciones/:tipo/:id', asyncHandler(adminController.moderarPublicacion));
router.get('/reservas', asyncHandler(adminController.listarReservas));
router.get('/mensajes', asyncHandler(adminController.listarMensajes));
router.patch('/mensajes/:id', asyncHandler(adminController.marcarMensaje));
router.get('/resenas', asyncHandler(adminController.listarResenas));
router.get('/pedidos', asyncHandler(tiendaController.listarTodos));
router.patch('/pedidos/:id/avanzar', asyncHandler(tiendaController.avanzar));
router.patch('/resenas/:id', asyncHandler(adminController.moderarResena));

module.exports = router;
