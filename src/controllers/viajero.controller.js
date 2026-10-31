/**
 * @file src/controllers/viajero.controller.js
 * @description Funciones de la cuenta de viajero (rol "cliente"):
 *   publicaciones guardadas (favoritos) y reseñas de reservas disfrutadas.
 */

const publicacionesRepo = require('../repositories/publicaciones.repo');
const favoritosRepo = require('../repositories/favoritos.repo');
const resenasRepo = require('../repositories/resenas.repo');
const { validarResena } = require('../validators/resenas.validator');
const { noEncontrado, conflicto, prohibido } = require('../utils/errores');
const { aEnteroPositivo } = require('../utils/validacion');
const { hoy } = require('../utils/fechas');
const { TIPOS_PUBLICACION } = require('../routes/parametros');

/** Errores de clave duplicada de SQL Server (índice único y restricción UNIQUE). */
const esDuplicado = (error) => error && (error.number === 2601 || error.number === 2627);

/** GET /api/favoritos: publicaciones guardadas con sus datos completos. */
async function listarFavoritos(req, res) {
    const listas = await Promise.all(
        TIPOS_PUBLICACION.map((tipo) => publicacionesRepo.listarFavoritas(tipo, req.usuario.id))
    );
    const publicaciones = listas.flat()
        .sort((a, b) => new Date(b.fechaGuardado) - new Date(a.fechaGuardado));
    res.json({ publicaciones });
}

/** GET /api/favoritos/claves: [{ tipo, id }] para marcar los corazones del catálogo. */
async function listarClavesFavoritos(req, res) {
    res.json({ favoritos: await favoritosRepo.listarClaves(req.usuario.id) });
}

/** PUT /api/favoritos/:tipo/:id */
async function agregarFavorito(req, res) {
    const id = aEnteroPositivo(req.params.id);
    let existe = false;
    try {
        existe = id ? await favoritosRepo.agregar(req.usuario.id, req.params.tipo, id) : false;
    } catch (error) {
        if (!esDuplicado(error)) throw error;   // dos clics simultáneos: ya quedó guardada
        existe = true;
    }
    if (!existe) throw noEncontrado('La publicación no existe o ya no está disponible.');
    res.json({ guardado: true });
}

/** DELETE /api/favoritos/:tipo/:id */
async function quitarFavorito(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (id) await favoritosRepo.quitar(req.usuario.id, req.params.tipo, id);
    res.json({ guardado: false });
}

/** GET /api/resenas: reseñas escritas y reservas pendientes de reseñar. */
async function listarResenas(req, res) {
    const [resenas, pendientes] = await Promise.all([
        resenasRepo.listarPorUsuario(req.usuario.id),
        resenasRepo.pendientesDeUsuario(req.usuario.id, hoy())
    ]);
    res.json({ resenas, pendientes });
}

/**
 * POST /api/resenas
 * Body: { idReserva, puntuacion (1-10), titulo, comentario }
 * Solo el titular de una reserva confirmada y ya disfrutada puede reseñarla, una vez.
 * Respuestas: 201 { id } | 400 | 403 | 404 | 409 ya reseñada.
 */
async function crearResena(req, res) {
    const datos = validarResena(req.body || {});
    const reserva = await resenasRepo.obtenerReserva(datos.idReserva);
    if (!reserva || reserva.idUsuario !== req.usuario.id) throw noEncontrado('La reserva no existe.');
    if (reserva.estado !== 'confirmada') throw prohibido('Las reservas canceladas no se pueden reseñar.');
    if (reserva.fechaFinal > hoy()) throw prohibido('Podrás reseñar esta reserva cuando termine tu estancia, actividad o alquiler.');
    if (reserva.tieneResena) throw conflicto('Ya publicaste una reseña de esta reserva.');
    try {
        const id = await resenasRepo.crear(datos);
        res.status(201).json({ id });
    } catch (error) {
        if (esDuplicado(error)) throw conflicto('Ya publicaste una reseña de esta reserva.');
        throw error;
    }
}

module.exports = {
    listarFavoritos,
    listarClavesFavoritos,
    agregarFavorito,
    quitarFavorito,
    listarResenas,
    crearResena
};
