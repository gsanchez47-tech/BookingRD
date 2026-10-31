/**
 * @file src/controllers/catalogo.controller.js
 * @description Consultas públicas: indicadores, catálogos de valores,
 *   listado y detalle de publicaciones, disponibilidad e imágenes.
 */

const publicacionesRepo = require('../repositories/publicaciones.repo');
const imagenesRepo = require('../repositories/imagenes.repo');
const resenasRepo = require('../repositories/resenas.repo');
const reservasService = require('../services/reservas.service');
const catalogos = require('../utils/catalogos');
const { solicitudInvalida, noEncontrado } = require('../utils/errores');
const { aEnteroPositivo, textoLimpio } = require('../utils/validacion');

const MAXIMO_POR_PAGINA = 48;
const POR_PAGINA_PREDETERMINADO = 12;

/** GET /api/estadisticas */
async function obtenerEstadisticas(req, res) {
    res.json(await publicacionesRepo.estadisticas());
}

/** GET /api/catalogos: listas de valores para formularios y filtros. */
function obtenerCatalogos(req, res) {
    res.json({
        destinos: Object.keys(catalogos.DESTINOS),
        categoriasAlojamiento: catalogos.CATEGORIAS_ALOJAMIENTO,
        categoriasActividad: catalogos.CATEGORIAS_ACTIVIDAD,
        categoriasVehiculo: catalogos.CATEGORIAS_VEHICULO,
        transmisiones: catalogos.TRANSMISIONES,
        combustibles: catalogos.COMBUSTIBLES,
        extrasVehiculo: catalogos.EXTRAS_VEHICULO,
        horarioAlquiler: catalogos.HORARIO_ALQUILER,
        tiposAlojamiento: Object.fromEntries(Object.entries(catalogos.TIPOS_ALOJAMIENTO).map(([codigo, t]) => [codigo, t.nombre])),
        serviciosHotel: catalogos.SERVICIOS_HOTEL
    });
}

/**
 * Lee y valida los filtros del listado. Si se indica una categoría sin
 * tipo, el tipo se deduce de la categoría.
 */
function leerFiltros(query) {
    const categoria = query.categoria ? String(query.categoria) : null;
    let tipo = query.tipo ? String(query.tipo) : null;
    if (!tipo && categoria) {
        if (catalogos.enCatalogo(catalogos.CATEGORIAS_ALOJAMIENTO, categoria)) tipo = 'hotel';
        else if (catalogos.enCatalogo(catalogos.CATEGORIAS_VEHICULO, categoria)) tipo = 'vehiculo';
        else tipo = 'actividad';
    }
    tipo = tipo || 'hotel';
    if (!['hotel', 'actividad', 'vehiculo'].includes(tipo)) throw solicitudInvalida('El tipo debe ser "hotel", "actividad" o "vehiculo".');

    const categoriasValidas = { hotel: catalogos.CATEGORIAS_ALOJAMIENTO, actividad: catalogos.CATEGORIAS_ACTIVIDAD, vehiculo: catalogos.CATEGORIAS_VEHICULO }[tipo];
    if (categoria && !catalogos.enCatalogo(categoriasValidas, categoria)) throw solicitudInvalida('Categoría no válida.');

    const ciudad = query.ciudad ? String(query.ciudad) : null;
    if (ciudad && !catalogos.enCatalogo(catalogos.DESTINOS, ciudad)) throw solicitudInvalida('Destino no válido.');

    const orden = query.orden ? String(query.orden) : 'destacados';
    if (!Object.hasOwn(publicacionesRepo.ORDENES, orden)) throw solicitudInvalida('Orden no válido.');

    const puntuacionMin = aEnteroPositivo(query.puntuacionMin);
    if (puntuacionMin && puntuacionMin > 10) throw solicitudInvalida('La puntuación mínima va del 1 al 10.');

    const transmision = query.transmision ? String(query.transmision) : null;
    if (transmision && !catalogos.enCatalogo(catalogos.TRANSMISIONES, transmision)) throw solicitudInvalida('Transmisión no válida.');

    return {
        tipo,
        filtros: {
            categoria,
            transmision: tipo === 'vehiculo' ? transmision : null,
            ciudad,
            personas: aEnteroPositivo(query.personas),
            precioMin: aEnteroPositivo(query.precioMin),
            precioMax: aEnteroPositivo(query.precioMax),
            texto: textoLimpio(query.q).slice(0, 100) || null,
            puntuacionMin,
            orden,
            pagina: aEnteroPositivo(query.pagina) || 1,
            porPagina: Math.min(aEnteroPositivo(query.porPagina) || POR_PAGINA_PREDETERMINADO, MAXIMO_POR_PAGINA)
        }
    };
}

/**
 * GET /api/publicaciones?tipo=&categoria=&ciudad=&personas=&precioMin=&precioMax=&puntuacionMin=&q=&orden=&pagina=&porPagina=
 * @returns {{tipo, total, pagina, porPagina, publicaciones[]}}
 */
async function listarPublicaciones(req, res) {
    const { tipo, filtros } = leerFiltros(req.query);
    if (filtros.precioMin && filtros.precioMax && filtros.precioMin > filtros.precioMax) {
        throw solicitudInvalida('El precio mínimo no puede ser mayor que el máximo.');
    }
    const { total, publicaciones } = await publicacionesRepo.listar(tipo, filtros);
    res.json({ tipo, total, pagina: filtros.pagina, porPagina: filtros.porPagina, publicaciones });
}

const TRAMOS_HISTOGRAMA = 24;

/**
 * GET /api/publicaciones/precios?tipo=&categoria=&ciudad=
 * Rango de precios y su distribución para el control deslizante de Explorar.
 * El precio no se filtra aquí: el histograma muestra todo el rango disponible
 * con los demás filtros de categoría y destino.
 * @returns {{tipo, minimo: number|null, maximo: number|null, total: number, tramos: number[]}}
 */
async function obtenerPrecios(req, res) {
    const { tipo, filtros } = leerFiltros(req.query);
    const lista = await publicacionesRepo.precios(tipo, { categoria: filtros.categoria, ciudad: filtros.ciudad });
    if (!lista.length) return res.json({ tipo, minimo: null, maximo: null, total: 0, tramos: [] });
    const minimo = Math.floor(lista[0]);
    const maximo = Math.ceil(lista[lista.length - 1]);
    const ancho = Math.max((maximo - minimo) / TRAMOS_HISTOGRAMA, 1);
    const tramos = new Array(TRAMOS_HISTOGRAMA).fill(0);
    for (const precio of lista) tramos[Math.min(Math.floor((precio - minimo) / ancho), TRAMOS_HISTOGRAMA - 1)] += 1;
    res.json({ tipo, minimo, maximo, total: lista.length, tramos });
}

/** GET /api/publicaciones/:tipo/:id */
async function obtenerPublicacion(req, res) {
    const id = aEnteroPositivo(req.params.id);
    const publicacion = id ? await publicacionesRepo.obtener(req.params.tipo, id) : null;
    if (!publicacion) throw noEncontrado('La publicación no existe o ya no está disponible.');
    res.json(publicacion);
}

const RESENAS_POR_PAGINA = 5;

/**
 * GET /api/publicaciones/:tipo/:id/resenas?orden=recientes|mejor-valoradas|peor-valoradas&pagina=
 * @returns {{resumen: {promedio, total, distribucion}, resenas[], pagina, porPagina, orden}}
 */
async function listarResenas(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (!id || !(await publicacionesRepo.obtener(req.params.tipo, id))) {
        throw noEncontrado('La publicación no existe o ya no está disponible.');
    }
    const orden = Object.hasOwn(resenasRepo.ORDENES, String(req.query.orden)) ? String(req.query.orden) : 'recientes';
    const pagina = aEnteroPositivo(req.query.pagina) || 1;
    const [resumen, resenas] = await Promise.all([
        resenasRepo.resumenPublicacion(req.params.tipo, id),
        resenasRepo.listarPorPublicacion(req.params.tipo, id, { orden, pagina, porPagina: RESENAS_POR_PAGINA })
    ]);
    res.json({ resumen, resenas, pagina, porPagina: RESENAS_POR_PAGINA, orden });
}

/** GET /api/resenas/destacadas: opiniones recientes con puntuación alta (página de inicio). */
async function listarResenasDestacadas(req, res) {
    res.json({ resenas: await resenasRepo.destacadas(6) });
}

/**
 * GET /api/publicaciones/hotel/:id/disponibilidad?entrada=&salida=&habitaciones=&personas=
 * GET /api/publicaciones/actividad/:id/disponibilidad?fecha=&personas=
 * GET /api/publicaciones/vehiculo/:id/disponibilidad?recogida=&horaRecogida=&devolucion=&horaDevolucion=&edadConductor=&ciudadDevolucion=&extras=
 */
async function consultarDisponibilidad(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (!id) throw noEncontrado();
    res.json(await reservasService.consultarDisponibilidad(req.params.tipo, id, req.query));
}

/**
 * GET /api/imagenes/:id
 * Las imágenes no cambian (una foto nueva genera otro id), por lo que se
 * permite almacenarlas en caché de forma prolongada.
 */
async function obtenerImagen(req, res) {
    const id = aEnteroPositivo(req.params.id);
    const imagen = id ? await imagenesRepo.obtener(id) : null;
    if (!imagen) throw noEncontrado('La imagen no existe.');
    res.set({
        'Content-Type': imagen.tipoMime,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    res.send(imagen.contenido);
}

module.exports = {
    obtenerEstadisticas,
    obtenerCatalogos,
    listarPublicaciones,
    obtenerPrecios,
    obtenerPublicacion,
    consultarDisponibilidad,
    listarResenas,
    listarResenasDestacadas,
    obtenerImagen
};
