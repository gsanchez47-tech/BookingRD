/**
 * @file src/routes/viajero.routes.js
 * @description Cuenta de viajero. Requieren sesión con rol "cliente".
 *   GET    /api/favoritos               Publicaciones guardadas.
 *   GET    /api/favoritos/claves        Claves { tipo, id } de las guardadas.
 *   PUT    /api/favoritos/:tipo/:id     Guardar una publicación.
 *   DELETE /api/favoritos/:tipo/:id     Quitarla de las guardadas.
 *   GET    /api/resenas                 Reseñas propias y reservas pendientes de reseñar.
 *   POST   /api/resenas                 Publicar la reseña de una reserva disfrutada.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requiereSesion, requiereRol } = require('../middleware/autenticacion');
const { validarTipo } = require('./parametros');
const viajeroController = require('../controllers/viajero.controller');

const router = express.Router();
router.param('tipo', validarTipo);

// El router se monta en /api junto a otros, por lo que la sesión se exige en
// cada ruta y no con router.use (que afectaría a las demás rutas de /api).
const soloViajero = [requiereSesion, requiereRol('cliente')];

router.get('/favoritos', soloViajero, asyncHandler(viajeroController.listarFavoritos));
router.get('/favoritos/claves', soloViajero, asyncHandler(viajeroController.listarClavesFavoritos));
router.put('/favoritos/:tipo/:id', soloViajero, asyncHandler(viajeroController.agregarFavorito));
router.delete('/favoritos/:tipo/:id', soloViajero, asyncHandler(viajeroController.quitarFavorito));
router.get('/resenas', soloViajero, asyncHandler(viajeroController.listarResenas));
router.post('/resenas', soloViajero, asyncHandler(viajeroController.crearResena));

module.exports = router;
