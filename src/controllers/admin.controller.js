/**
 * @file src/controllers/admin.controller.js
 * @description Administración de la plataforma (rol "admin", equipo de
 *   desarrollo): indicadores globales, suspensión de cuentas, moderación de
 *   publicaciones, consulta de reservas y atención de mensajes de contacto.
 */

const adminRepo = require('../repositories/admin.repo');
const publicacionesRepo = require('../repositories/publicaciones.repo');
const resenasRepo = require('../repositories/resenas.repo');
const { solicitudInvalida, noEncontrado } = require('../utils/errores');
const { aEnteroPositivo, textoLimpio } = require('../utils/validacion');
const { hoy } = require('../utils/fechas');

const MESES_ANTERIORES = 5;   // serie mensual: 5 meses atrás, el actual y 2 próximos
const MESES_POSTERIORES = 2;

/** Primer día del mes desplazado `meses` respecto de AAAA-MM. */
function primerDiaMes(anio, mes, meses) {
    const fecha = new Date(Date.UTC(anio, mes - 1 + meses, 1));
    return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1, iso: fecha.toISOString().slice(0, 10) };
}

/** GET /api/admin/resumen */
async function obtenerResumen(req, res) {
    const [anio, mes] = hoy().split('-').map(Number);
    const desde = primerDiaMes(anio, mes, -MESES_ANTERIORES);
    const hasta = primerDiaMes(anio, mes, MESES_POSTERIORES + 1);
    const datos = await adminRepo.resumen(desde.iso, hasta.iso);

    // Serie completa, con ceros en los meses sin reservas.
    const serie = [];
    for (let i = -MESES_ANTERIORES; i <= MESES_POSTERIORES; i++) {
        const m = primerDiaMes(anio, mes, i);
        const fila = datos.meses.find((x) => x.anio === m.anio && x.mes === m.mes);
        serie.push({ anio: m.anio, mes: m.mes, actual: i === 0, reservas: fila ? fila.reservas : 0, ingresos: fila ? fila.ingresos : 0 });
    }
    res.json({ totales: datos.totales, meses: serie, categorias: datos.categorias, empresas: datos.empresas });
}

/** GET /api/admin/usuarios?rol=cliente|empresa&q= */
async function listarUsuarios(req, res) {
    const rol = ['cliente', 'empresa'].includes(req.query.rol) ? req.query.rol : null;
    const texto = textoLimpio(req.query.q).slice(0, 100);
    res.json({ usuarios: await adminRepo.listarUsuarios({ rol, texto }) });
}

/** PATCH /api/admin/usuarios/:id/estado  body: { activo } */
async function cambiarEstadoUsuario(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (typeof req.body.activo !== 'boolean') throw solicitudInvalida('Indica si la cuenta queda activa.');
    if (!id || !(await adminRepo.cambiarEstadoUsuario(id, req.body.activo))) {
        throw noEncontrado('La cuenta no existe o no puede modificarse.');
    }
    res.json({ activo: req.body.activo });
}

/** GET /api/admin/empresas */
async function listarEmpresas(req, res) {
    res.json({ empresas: await adminRepo.listarEmpresas() });
}

/** GET /api/admin/publicaciones?tipo=hotel|actividad|vehiculo&q= (incluye ocultas y de empresas suspendidas) */
async function listarPublicaciones(req, res) {
    const tipo = ['actividad', 'vehiculo'].includes(req.query.tipo) ? req.query.tipo : 'hotel';
    const { total, publicaciones } = await publicacionesRepo.listar(tipo, {
        texto: textoLimpio(req.query.q).slice(0, 100) || null,
        incluirInactivas: true,
        orden: 'recientes',
        pagina: 1,
        porPagina: 300
    });
    res.json({ tipo, total, publicaciones });
}

/** PATCH /api/admin/publicaciones/:tipo/:id  body: { activo?, destacado? } */
async function moderarPublicacion(req, res) {
    const id = aEnteroPositivo(req.params.id);
    const { activo, destacado } = req.body || {};
    const valido = (v) => v === undefined || typeof v === 'boolean';
    if (!valido(activo) || !valido(destacado) || (activo === undefined && destacado === undefined)) {
        throw solicitudInvalida('Indica el estado de publicación o de destacado.');
    }
    const cambios = { activo: activo === undefined ? null : activo, destacado: destacado === undefined ? null : destacado };
    if (!id || !(await adminRepo.moderarPublicacion(req.params.tipo, id, cambios))) {
        throw noEncontrado('La publicación no existe.');
    }
    res.json(cambios);
}

/** GET /api/admin/reservas?estado=confirmada|cancelada */
async function listarReservas(req, res) {
    const estado = ['confirmada', 'cancelada'].includes(req.query.estado) ? req.query.estado : null;
    res.json({ reservas: await adminRepo.listarReservas({ estado }) });
}

/** GET /api/admin/mensajes */
async function listarMensajes(req, res) {
    res.json({ mensajes: await adminRepo.listarMensajes() });
}

/** PATCH /api/admin/mensajes/:id  body: { atendido } */
async function marcarMensaje(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (typeof req.body.atendido !== 'boolean') throw solicitudInvalida('Indica si el mensaje fue atendido.');
    if (!id || !(await adminRepo.marcarMensaje(id, req.body.atendido))) throw noEncontrado('El mensaje no existe.');
    res.json({ atendido: req.body.atendido });
}

/** GET /api/admin/resenas?visible=true|false */
async function listarResenas(req, res) {
    const visible = req.query.visible === 'true' ? true : req.query.visible === 'false' ? false : null;
    res.json({ resenas: await resenasRepo.listarTodas({ visible }) });
}

/** PATCH /api/admin/resenas/:id  body: { visible } */
async function moderarResena(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (typeof (req.body || {}).visible !== 'boolean') throw solicitudInvalida('Indica si la reseña queda visible.');
    if (!id || !(await resenasRepo.cambiarVisibilidad(id, req.body.visible))) throw noEncontrado('La reseña no existe.');
    res.json({ visible: req.body.visible });
}

module.exports = {
    obtenerResumen,
    listarUsuarios,
    cambiarEstadoUsuario,
    listarEmpresas,
    listarPublicaciones,
    moderarPublicacion,
    listarReservas,
    listarMensajes,
    marcarMensaje,
    listarResenas,
    moderarResena
};
