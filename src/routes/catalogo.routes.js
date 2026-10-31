/**
 * @file src/routes/catalogo.routes.js
 * @description Consultas públicas. Prefijo: /api
 *   GET /estadisticas                                  Indicadores de la página de inicio.
 *   GET /catalogos                                     Destinos, categorías y servicios.
 *   GET /publicaciones                                 Listado con filtros y paginación.
 *   GET /publicaciones/precios                         Rango y distribución de precios (filtro deslizante).
 *   GET /publicaciones/:tipo/:id                       Detalle (tipo: hotel | actividad | vehiculo).
 *   GET /publicaciones/:tipo/:id/disponibilidad        Disponibilidad y total para unas fechas.
 *   GET /publicaciones/:tipo/:id/resenas               Valoración y reseñas visibles.
 *   GET /resenas/destacadas                            Opiniones destacadas de la página de inicio.
 *   GET /imagenes/:id                                  Fotografía subida por una empresa.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validarTipo } = require('./parametros');
const catalogoController = require('../controllers/catalogo.controller');

const router = express.Router();
router.param('tipo', validarTipo);

router.get('/estadisticas', asyncHandler(catalogoController.obtenerEstadisticas));
router.get('/catalogos', catalogoController.obtenerCatalogos);
router.get('/publicaciones', asyncHandler(catalogoController.listarPublicaciones));
router.get('/publicaciones/precios', asyncHandler(catalogoController.obtenerPrecios));
router.get('/publicaciones/:tipo/:id', asyncHandler(catalogoController.obtenerPublicacion));
router.get('/publicaciones/:tipo/:id/disponibilidad', asyncHandler(catalogoController.consultarDisponibilidad));
router.get('/publicaciones/:tipo/:id/resenas', asyncHandler(catalogoController.listarResenas));
router.get('/resenas/destacadas', asyncHandler(catalogoController.listarResenasDestacadas));
router.get('/imagenes/:id', asyncHandler(catalogoController.obtenerImagen));

module.exports = router;
