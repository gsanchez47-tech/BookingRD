/**
 * @file src/controllers/empresa.controller.js
 * @description Panel de empresa: perfil, indicadores, publicaciones propias
 *   (crear, editar, publicar u ocultar, eliminar), fotografías y reservas
 *   recibidas. Todas las rutas exigen sesión con rol "empresa"; cada
 *   consulta filtra por el id_empresa del token, por lo que una empresa no
 *   puede leer ni modificar datos de otra.
 */

const cuentasRepo = require('../repositories/cuentas.repo');
const publicacionesRepo = require('../repositories/publicaciones.repo');
const reservasRepo = require('../repositories/reservas.repo');
const imagenesRepo = require('../repositories/imagenes.repo');
const resenasRepo = require('../repositories/resenas.repo');
const { validarPublicacion } = require('../validators/publicaciones.validator');
const { validarPerfilEmpresa } = require('../validators/empresa.validator');
const { validarRespuesta } = require('../validators/resenas.validator');
const { solicitudInvalida, noEncontrado, conflicto, prohibido } = require('../utils/errores');
const { aEnteroPositivo } = require('../utils/validacion');
const { hoy } = require('../utils/fechas');

const TAMANO_MAXIMO_IMAGEN = 3 * 1024 * 1024;   // 3 MB (coincide con CK_imagenes_tamano)

/** Firmas binarias de los formatos de imagen admitidos. */
const FIRMAS_IMAGEN = {
    'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP'
};

/** Tipos de publicación que permite cada servicio declarado por la empresa. */
const TIPOS_POR_SERVICIO = {
    alojamiento: ['hotel'],
    actividades: ['actividad'],
    mixto: ['hotel', 'actividad'],
    vehiculos: ['vehiculo']
};

function puedePublicar(tipoServicio, tipo) {
    return (TIPOS_POR_SERVICIO[tipoServicio] || []).includes(tipo);
}

function exigirPermisoDeTipo(req, tipo) {
    if (!puedePublicar(req.usuario.tipoServicio, tipo)) {
        const permitidos = { alojamiento: 'alojamiento', actividades: 'actividades', mixto: 'alojamiento y actividades', vehiculos: 'alquiler de vehículos' };
        throw prohibido(`Tu empresa está registrada solo para ${permitidos[req.usuario.tipoServicio] || 'otro tipo de servicio'}.`);
    }
}

/** GET /api/empresa/perfil: datos de la empresa e indicadores. */
async function obtenerPerfil(req, res) {
    const empresa = await cuentasRepo.obtenerEmpresa(req.usuario.idEmpresa);
    if (!empresa) throw noEncontrado('No se encontró la empresa de esta cuenta.');
    const [resumen, resenas] = await Promise.all([
        reservasRepo.resumenEmpresa(req.usuario.idEmpresa, hoy()),
        resenasRepo.resumenEmpresa(req.usuario.idEmpresa)
    ]);
    res.json({ empresa, resumen: Object.assign(resumen, { resenas }) });
}

/**
 * PUT /api/empresa/perfil
 * Body: { nombreComercial, telefono, provincia, ciudad, direccion, sitioWeb?, licenciaMitur?, descripcion? }
 * El RNC, la razón social y el tipo de servicio solo los modifica la administración.
 */
async function actualizarPerfil(req, res) {
    const datos = validarPerfilEmpresa(req.body || {});
    if (!(await cuentasRepo.actualizarEmpresa(req.usuario.idEmpresa, datos))) {
        throw noEncontrado('No se encontró la empresa de esta cuenta.');
    }
    res.json({ empresa: await cuentasRepo.obtenerEmpresa(req.usuario.idEmpresa) });
}

/** GET /api/empresa/publicaciones?tipo=hotel|actividad|vehiculo */
async function listarPublicaciones(req, res) {
    const tipo = ['actividad', 'vehiculo'].includes(req.query.tipo) ? req.query.tipo : 'hotel';
    const { publicaciones } = await publicacionesRepo.listar(tipo, {
        idEmpresa: req.usuario.idEmpresa,
        incluirInactivas: true,
        orden: 'recientes',
        pagina: 1,
        porPagina: 200
    });
    res.json({ tipo, publicaciones });
}

/** GET /api/empresa/publicaciones/:tipo/:id (incluye las ocultas). */
async function obtenerPublicacion(req, res) {
    const id = aEnteroPositivo(req.params.id);
    const publicacion = id ? await publicacionesRepo.obtener(req.params.tipo, id, { incluirInactiva: true }) : null;
    if (!publicacion || publicacion.idEmpresa !== req.usuario.idEmpresa) throw noEncontrado('La publicación no existe.');
    res.json(publicacion);
}

/** Verifica que la imagen indicada, si la hay, pertenezca a la empresa. */
async function validarImagenPropia(datos, idEmpresa) {
    if (datos.idImagen && !(await imagenesRepo.perteneceAEmpresa(datos.idImagen, idEmpresa))) {
        throw solicitudInvalida('La fotografía seleccionada no es válida. Súbela de nuevo.', 'pub-imagen');
    }
}

/** POST /api/empresa/publicaciones  body: { tipo, ...datos } */
async function crearPublicacion(req, res) {
    const tipo = req.body.tipo;
    if (!['hotel', 'actividad', 'vehiculo'].includes(tipo)) throw solicitudInvalida('Selecciona el tipo de publicación.', 'pub-tipo');
    exigirPermisoDeTipo(req, tipo);
    const datos = validarPublicacion(tipo, req.body);
    await validarImagenPropia(datos, req.usuario.idEmpresa);
    const id = await publicacionesRepo.crear(tipo, req.usuario.idEmpresa, datos);
    res.status(201).json({ tipo, id });
}

/** PUT /api/empresa/publicaciones/:tipo/:id */
async function actualizarPublicacion(req, res) {
    const { tipo } = req.params;
    exigirPermisoDeTipo(req, tipo);
    const id = aEnteroPositivo(req.params.id);
    const datos = validarPublicacion(tipo, req.body);
    await validarImagenPropia(datos, req.usuario.idEmpresa);
    if (!id || !(await publicacionesRepo.actualizar(tipo, id, req.usuario.idEmpresa, datos))) {
        throw noEncontrado('La publicación no existe.');
    }
    res.json({ tipo, id });
}

/** PATCH /api/empresa/publicaciones/:tipo/:id/estado  body: { activo } */
async function cambiarEstado(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (typeof req.body.activo !== 'boolean') throw solicitudInvalida('Indica si la publicación queda activa.');
    if (!id || !(await publicacionesRepo.cambiarEstado(req.params.tipo, id, req.usuario.idEmpresa, req.body.activo))) {
        throw noEncontrado('La publicación no existe.');
    }
    res.json({ activo: req.body.activo });
}

/** DELETE /api/empresa/publicaciones/:tipo/:id */
async function eliminarPublicacion(req, res) {
    const id = aEnteroPositivo(req.params.id);
    const resultado = id ? await publicacionesRepo.eliminar(req.params.tipo, id, req.usuario.idEmpresa) : 'no-existe';
    if (resultado === 'no-existe') throw noEncontrado('La publicación no existe.');
    if (resultado === 'con-reservas') {
        throw conflicto('La publicación tiene reservas y no puede eliminarse. Puedes ocultarla para que no reciba nuevas reservas.');
    }
    res.status(204).end();
}

/**
 * POST /api/empresa/imagenes  body: { imagen: "data:image/jpeg;base64,..." }
 * Valida el formato por su firma binaria (no solo por el tipo declarado).
 */
async function subirImagen(req, res) {
    const coincidencia = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body.imagen || '');
    if (!coincidencia) throw solicitudInvalida('La fotografía debe ser JPG, PNG o WEBP.', 'pub-imagen');
    const [, tipoMime, base64] = coincidencia;
    const contenido = Buffer.from(base64, 'base64');
    if (!contenido.length || contenido.length > TAMANO_MAXIMO_IMAGEN) {
        throw solicitudInvalida('La fotografía debe pesar menos de 3 MB.', 'pub-imagen');
    }
    if (!FIRMAS_IMAGEN[tipoMime](contenido)) throw solicitudInvalida('El archivo no es una imagen válida.', 'pub-imagen');

    const id = await imagenesRepo.crear(req.usuario.idEmpresa, tipoMime, contenido);
    res.status(201).json({ id, url: `/api/imagenes/${id}` });
}

/** GET /api/empresa/reservas */
async function listarReservas(req, res) {
    res.json({ reservas: await reservasRepo.listarPorEmpresa(req.usuario.idEmpresa) });
}

/** GET /api/empresa/resenas: reseñas de las publicaciones de la empresa. */
async function listarResenas(req, res) {
    res.json({ resenas: await resenasRepo.listarPorEmpresa(req.usuario.idEmpresa) });
}

/**
 * PUT /api/empresa/resenas/:id/respuesta  body: { respuesta }
 * La respuesta se publica junto a la reseña; una respuesta vacía la retira.
 */
async function responderResena(req, res) {
    const id = aEnteroPositivo(req.params.id);
    const respuesta = validarRespuesta(req.body || {});
    if (!id || !(await resenasRepo.responder(id, req.usuario.idEmpresa, respuesta))) {
        throw noEncontrado('La reseña no existe o no corresponde a tus publicaciones.');
    }
    res.json({ respuesta: respuesta || null });
}

module.exports = {
    obtenerPerfil,
    actualizarPerfil,
    listarPublicaciones,
    obtenerPublicacion,
    crearPublicacion,
    actualizarPublicacion,
    cambiarEstado,
    eliminarPublicacion,
    subirImagen,
    listarReservas,
    listarResenas,
    responderResena
};
