/**
 * @file src/controllers/auth.controller.js
 * @description Registro de cuentas, inicio de sesión y validación de sesión.
 *
 * Tipos de cuenta del registro público:
 *   - cliente: viajero. Datos mínimos: nombre, correo y contraseña.
 *   - empresa: proveedor de alojamiento, de actividades o de ambos (mixto).
 *     Requiere los datos del representante y los datos comerciales
 *     (tabla dbo.empresas); los campos de servicio dependen del tipo.
 * El rol "admin" no puede asignarse desde el registro público.
 *
 * Los errores de validación responden 400 { error, campo }, donde "campo" es
 * el nombre del campo del formulario que originó el error.
 *
 * Verificación del correo: el registro no crea la cuenta de inmediato. Guarda
 * la solicitud (con la contraseña ya cifrada) y envía un código de 6 dígitos;
 * la cuenta se crea al confirmar el código (POST /api/auth/registro/verificar).
 * Restablecer la contraseña: POST /api/auth/recuperar envía un enlace de un
 * solo uso y POST /api/auth/restablecer guarda la contraseña nueva.
 *
 * Sin servidor SMTP configurado los correos se guardan como HTML en
 * correos-enviados/ y la respuesta incluye "vistaPrevia", la dirección para
 * abrir ese correo desde la página (solo en ese modo).
 *
 * El cierre de sesión se resuelve en el cliente (eliminación del token en
 * public/js/comun.js); no requiere endpoint.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { conTransaccion, cuentasRepo } = require('../repositories');
const correoService = require('../services/correo.service');
const correoConfig = require('../config/correo');
const plantillas = require('../correos/plantillas');
const { esCorreoValido, esTextoNoVacio, aEnteroPositivo, textoLimpio } = require('../utils/validacion');
const { TIPOS_SERVICIO, TIPOS_ALOJAMIENTO, CATEGORIAS_ACTIVIDAD, PROVINCIAS } = require('../utils/catalogos');

const RONDAS_BCRYPT = 10;
const LONGITUD_MINIMA_PASSWORD = 8;
const MAXIMO_HABITACIONES = 5000;
const ERRORES_SQL_DUPLICADO = [2627, 2601];   // violación de UNIQUE / índice único
const MINUTOS_CODIGO = 15;          // vigencia del código de verificación
const MINUTOS_ENLACE = 30;          // vigencia del enlace para restablecer la contraseña
const MAXIMO_INTENTOS = 5;          // intentos con un mismo código
const SEGUNDOS_REENVIO = 60;        // espera mínima entre dos correos al mismo destinatario

/** SHA-256 en hexadecimal (64 caracteres). */
const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');
const hashCodigo = (correo, codigo) => sha256(`${correo}:${codigo}`);
/** Código numérico de 6 dígitos, generado con el generador criptográfico. */
const nuevoCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/** Compara dos hash sin filtrar información por el tiempo de respuesta. */
function mismoHash(a, b) {
    const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Envía un correo esperando el resultado. Si se guardó en archivo (sin SMTP),
 * devuelve la dirección para verlo desde la página.
 * @returns {Promise<string|null>} vistaPrevia
 */
async function enviarAhora(para, mensaje) {
    let resultado;
    try {
        resultado = await correoConfig.enviar({ para, ...mensaje });
    } catch (error) {
        // Si el servidor de correo falla, el correo se guarda y la página lo
        // muestra, para que el registro o la recuperación no queden bloqueados.
        console.error(`El servidor de correo no aceptó el mensaje para ${para}: ${error.message}. Se guarda en la carpeta de correos.`);
        resultado = await correoConfig.guardarEnArchivo({ para, ...mensaje });
    }
    return resultado.modo === 'archivo' ? `/api/auth/correo-prueba/${encodeURIComponent(path.basename(resultado.archivo))}` : null;
}

const errorEnvio = { error: 'No pudimos enviar el correo en este momento. Revisa la dirección e inténtalo de nuevo en unos minutos.' };

/** Error de validación asociado a un campo del formulario. */
const errorCampo = (campo, error) => ({ campo, error });

/**
 * Firma el JWT de sesión. Contiene solo datos no sensibles; en cuentas de
 * empresa incluye idEmpresa, nombreEmpresa y tipoServicio.
 *
 * @param {object} usuario  fila de dbo.usuarios (y columnas de dbo.empresas si aplica)
 * @returns {string} token JWT
 */
function generarToken(usuario) {
    return jwt.sign(
        { ...usuarioPublico(usuario), idEmpresa: usuario.id_empresa || undefined },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

/**
 * Representación del usuario devuelta al cliente junto con el token.
 * @returns {{id: number, nombre: string, rol: string, nombreEmpresa?: string, tipoServicio?: string}}
 */
function usuarioPublico(usuario) {
    const datos = { id: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol };
    if (usuario.rol === 'empresa') {
        datos.nombreEmpresa = usuario.nombre_comercial;
        datos.tipoServicio = usuario.tipo_servicio;
    }
    return datos;
}

/**
 * Valida los datos de la persona (viajero o representante de la empresa).
 * El teléfono y el cargo solo son obligatorios para el representante.
 *
 * @returns {{campo: string, error: string}|null}
 */
function validarDatosPersona(body, esEmpresa) {
    const nombre = textoLimpio(body.nombre);
    if (!nombre || nombre.length > 150) return errorCampo('nombre', 'Escribe tu nombre completo.');
    if (!esCorreoValido(body.correo) || body.correo.length > 200) return errorCampo('correo', 'El correo no tiene un formato válido.');
    if (esEmpresa) {
        if (!esTextoNoVacio(body.cargo)) return errorCampo('cargo', 'Indica el cargo del representante en la empresa.');
        if (!esTextoNoVacio(body.telefono)) return errorCampo('telefono', 'Escribe el teléfono del representante.');
    }
    if (typeof body.password !== 'string' || body.password.length < LONGITUD_MINIMA_PASSWORD) {
        return errorCampo('password', `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`);
    }
    if (body.password !== body.confirmarPassword) return errorCampo('confirmarPassword', 'Las contraseñas no coinciden.');
    return null;
}

/**
 * Valida y normaliza los datos de empresa.
 *   RNC: 9 dígitos (persona jurídica) u 11 (cédula). Se admiten guiones y
 *        espacios en la entrada; se almacena solo la secuencia de dígitos.
 *   tipoServicio: alojamiento | actividades | mixto | vehiculos. Determina qué datos de
 *        servicio son obligatorios:
 *          alojamiento -> tipoAlojamiento y numeroHabitaciones
 *          actividades -> categoriasActividad (al menos una)
 *          mixto       -> ambos grupos
 *
 * @returns {{campo: string, error: string}|{empresa: object}}
 */
function validarDatosEmpresa(body) {
    const empresa = {
        nombreComercial: textoLimpio(body.nombreEmpresa),
        razonSocial: textoLimpio(body.razonSocial),
        rnc: String(body.rnc || '').replace(/[\s-]/g, ''),
        telefono: textoLimpio(body.telefonoEmpresa),
        provincia: textoLimpio(body.provincia),
        ciudad: textoLimpio(body.ciudadEmpresa),
        direccion: textoLimpio(body.direccion),
        sitioWeb: textoLimpio(body.sitioWeb) || null,
        licenciaMitur: textoLimpio(body.licenciaMitur) || null,
        tipoServicio: body.tipoServicio,
        tipoAlojamiento: null,
        numeroHabitaciones: null,
        categoriasActividad: null,
        descripcion: textoLimpio(body.descripcionEmpresa) || null
    };

    if (!empresa.nombreComercial || empresa.nombreComercial.length > 150) return errorCampo('nombreEmpresa', 'Escribe el nombre comercial de la empresa.');
    if (!empresa.razonSocial || empresa.razonSocial.length > 150) return errorCampo('razonSocial', 'Escribe la razón social registrada de la empresa.');
    if (!/^(\d{9}|\d{11})$/.test(empresa.rnc)) return errorCampo('rnc', 'El RNC debe tener 9 dígitos, u 11 si es una cédula.');
    if (!empresa.telefono) return errorCampo('telefonoEmpresa', 'Escribe el teléfono de la empresa.');
    if (!PROVINCIAS.includes(empresa.provincia)) return errorCampo('provincia', 'Selecciona la provincia de la empresa.');
    if (!empresa.ciudad) return errorCampo('ciudadEmpresa', 'Escribe la ciudad o el municipio.');
    if (!empresa.direccion) return errorCampo('direccion', 'Escribe la dirección de la empresa.');
    if (empresa.sitioWeb && !/^https?:\/\/\S+\.\S+$/i.test(empresa.sitioWeb)) return errorCampo('sitioWeb', 'El sitio web debe comenzar con http:// o https://');
    if (empresa.licenciaMitur && empresa.licenciaMitur.length > 30) return errorCampo('licenciaMitur', 'El número de licencia admite hasta 30 caracteres.');

    if (!Object.hasOwn(TIPOS_SERVICIO, empresa.tipoServicio)) {
        return errorCampo('tipoServicio', 'Selecciona si la empresa ofrece alojamiento, actividades, ambos o alquiler de vehículos.');
    }

    if (['alojamiento', 'mixto'].includes(empresa.tipoServicio)) {
        if (!Object.hasOwn(TIPOS_ALOJAMIENTO, body.tipoAlojamiento)) return errorCampo('tipoAlojamiento', 'Selecciona el tipo de alojamiento.');
        const habitaciones = aEnteroPositivo(body.numeroHabitaciones);
        if (!habitaciones || habitaciones > MAXIMO_HABITACIONES) return errorCampo('numeroHabitaciones', 'Indica el número de habitaciones o unidades.');
        empresa.tipoAlojamiento = body.tipoAlojamiento;
        empresa.numeroHabitaciones = habitaciones;
    }

    if (['actividades', 'mixto'].includes(empresa.tipoServicio)) {
        const categorias = Array.isArray(body.categoriasActividad) ? body.categoriasActividad : [];
        const validas = [...new Set(categorias)].filter((codigo) => Object.hasOwn(CATEGORIAS_ACTIVIDAD, codigo));
        if (!validas.length || validas.length !== categorias.length) {
            return errorCampo('categoriasActividad', 'Selecciona al menos una categoría de actividades.');
        }
        empresa.categoriasActividad = validas.join(',');
    }

    if (body.confirmaDatos !== true) return errorCampo('confirmaDatos', 'Confirma que los datos de la empresa son verídicos.');
    return { empresa };
}

/**
 * POST /api/auth/registro
 *
 * Body (viajero):  { tipoCuenta: 'cliente', nombre, correo, password, confirmarPassword }
 * Body (empresa):  { tipoCuenta: 'empresa', nombre, cargo, correo, telefono, password,
 *                    confirmarPassword, nombreEmpresa, razonSocial, rnc, telefonoEmpresa,
 *                    provincia, ciudadEmpresa, direccion, sitioWeb?, licenciaMitur?,
 *                    tipoServicio, tipoAlojamiento?, numeroHabitaciones?,
 *                    categoriasActividad?: string[], descripcionEmpresa?, confirmaDatos }
 *
 * Respuestas: 202 { verificacion, correo, minutos, vistaPrevia? } (código enviado al correo)
 *             | 400 { error, campo } | 409 { error, campo } | 502 no se pudo enviar el correo.
 */
async function registrar(req, res) {
    const body = req.body || {};
    const tipoCuenta = body.tipoCuenta === 'empresa' ? 'empresa' : 'cliente';
    const esEmpresa = tipoCuenta === 'empresa';

    const errorPersona = validarDatosPersona(body, esEmpresa);
    if (errorPersona) return res.status(400).json(errorPersona);

    let empresa = null;
    if (esEmpresa) {
        const resultado = validarDatosEmpresa(body);
        if (resultado.error) return res.status(400).json(resultado);
        empresa = resultado.empresa;
    }

    const correo = body.correo.trim().toLowerCase();

    // Verificación previa de duplicados para responder con un mensaje específico.
    // Las restricciones UNIQUE de la base cubren el caso de peticiones concurrentes.
    if (await cuentasRepo.existeCorreo(correo)) {
        return res.status(409).json(errorCampo('correo', 'Ya existe una cuenta registrada con ese correo.'));
    }
    if (empresa && await cuentasRepo.existeRnc(empresa.rnc)) {
        return res.status(409).json(errorCampo('rnc', 'Ya existe una empresa registrada con ese RNC.'));
    }

    const passwordHash = await bcrypt.hash(body.password, RONDAS_BCRYPT);
    const solicitud = {
        tipoCuenta,
        nombre: textoLimpio(body.nombre),
        correo,
        telefono: esEmpresa ? textoLimpio(body.telefono) : null,
        cargo: esEmpresa ? textoLimpio(body.cargo) : null,
        passwordHash,
        empresa
    };
    const codigo = nuevoCodigo();
    await cuentasRepo.crearVerificacion({
        correo, proposito: 'registro', codigoHash: hashCodigo(correo, codigo),
        datos: JSON.stringify(solicitud), minutos: MINUTOS_CODIGO
    });
    let vistaPrevia;
    try {
        vistaPrevia = await enviarAhora(correo, plantillas.codigoVerificacion({ nombre: solicitud.nombre, codigo, minutos: MINUTOS_CODIGO, urlSitio: correoConfig.urlSitio() }));
    } catch (error) {
        console.error(`No se pudo enviar el código de verificación a ${correo}: ${error.message}`);
        return res.status(502).json(errorEnvio);
    }
    res.status(202).json({ verificacion: true, correo, minutos: MINUTOS_CODIGO, vistaPrevia });
}

/** Crea la cuenta de una solicitud de registro ya verificada. */
async function crearCuenta(solicitud) {
    return conTransaccion(async (transaccion) => {
        const nuevo = await cuentasRepo.crearUsuario(transaccion, {
            nombre: solicitud.nombre,
            correo: solicitud.correo,
            telefono: solicitud.telefono,
            passwordHash: solicitud.passwordHash,
            rol: solicitud.tipoCuenta
        });
        if (solicitud.empresa) {
            nuevo.id_empresa = await cuentasRepo.crearEmpresa(transaccion, nuevo.id_usuario,
                Object.assign({ cargo: solicitud.cargo }, solicitud.empresa));
            nuevo.nombre_comercial = solicitud.empresa.nombreComercial;
            nuevo.tipo_servicio = solicitud.empresa.tipoServicio;
        }
        return nuevo;
    });
}

/**
 * POST /api/auth/registro/verificar
 * Body: { correo, codigo }
 * Respuestas: 201 { token, usuario } | 400 { error, campo, intentosRestantes? } | 409 duplicado | 410 vencido.
 */
async function verificarRegistro(req, res) {
    const correo = String((req.body || {}).correo || '').trim().toLowerCase();
    const codigo = String((req.body || {}).codigo || '').replace(/\D/g, '');
    if (!esCorreoValido(correo)) return res.status(400).json(errorCampo('correo', 'El correo no tiene un formato válido.'));
    if (codigo.length !== 6) return res.status(400).json(errorCampo('codigo', 'Escribe los 6 dígitos del código.'));

    const pendiente = await cuentasRepo.verificacionPendiente(correo, 'registro');
    if (!pendiente) return res.status(410).json(errorCampo('codigo', 'No hay un registro pendiente para ese correo. Vuelve a llenar el formulario.'));
    if (!pendiente.vigente) return res.status(410).json(errorCampo('codigo', 'El código venció. Pide uno nuevo.'));
    if (pendiente.intentos >= MAXIMO_INTENTOS) return res.status(429).json(errorCampo('codigo', 'Demasiados intentos con este código. Pide uno nuevo.'));
    if (!mismoHash(pendiente.codigo_hash, hashCodigo(correo, codigo))) {
        await cuentasRepo.sumarIntento(pendiente.id_verificacion);
        const restantes = MAXIMO_INTENTOS - pendiente.intentos - 1;
        return res.status(400).json(Object.assign(errorCampo('codigo', restantes > 0
            ? `El código no es correcto. Te quedan ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}.`
            : 'El código no es correcto. Pide uno nuevo.'), { intentosRestantes: Math.max(restantes, 0) }));
    }
    if (!(await cuentasRepo.usarVerificacion(null, pendiente.id_verificacion))) {
        return res.status(410).json(errorCampo('codigo', 'Este código ya se usó. Inicia sesión.'));
    }

    const solicitud = JSON.parse(pendiente.datos);
    try {
        const usuario = await crearCuenta(solicitud);
        res.status(201).json({ token: generarToken(usuario), usuario: usuarioPublico(usuario) });
        // Correo de bienvenida en segundo plano: no retrasa ni afecta el registro.
        correoService.bienvenida({ nombre: usuario.nombre, correo, rol: solicitud.tipoCuenta }, solicitud.empresa);
    } catch (error) {
        if (ERRORES_SQL_DUPLICADO.includes(error.number)) {
            return res.status(409).json({ error: 'Ese correo o ese RNC ya están registrados.' });
        }
        throw error;
    }
}

/**
 * POST /api/auth/registro/reenviar
 * Body: { correo }. Envía un código nuevo para la misma solicitud de registro.
 * Respuestas: 200 { correo, minutos, vistaPrevia? } | 410 sin registro pendiente | 429 { espera }.
 */
async function reenviarCodigo(req, res) {
    const correo = String((req.body || {}).correo || '').trim().toLowerCase();
    const pendiente = esCorreoValido(correo) ? await cuentasRepo.verificacionPendiente(correo, 'registro') : null;
    if (!pendiente) return res.status(410).json({ error: 'No hay un registro pendiente para ese correo. Vuelve a llenar el formulario.' });
    if (pendiente.segundos < SEGUNDOS_REENVIO) {
        const espera = SEGUNDOS_REENVIO - pendiente.segundos;
        return res.status(429).json({ error: `Espera ${espera} segundos para pedir otro código.`, espera });
    }
    const solicitud = JSON.parse(pendiente.datos);
    const codigo = nuevoCodigo();
    await cuentasRepo.crearVerificacion({ correo, proposito: 'registro', codigoHash: hashCodigo(correo, codigo), datos: pendiente.datos, minutos: MINUTOS_CODIGO });
    try {
        const vistaPrevia = await enviarAhora(correo, plantillas.codigoVerificacion({ nombre: solicitud.nombre, codigo, minutos: MINUTOS_CODIGO, urlSitio: correoConfig.urlSitio() }));
        res.json({ correo, minutos: MINUTOS_CODIGO, vistaPrevia });
    } catch (error) {
        console.error(`No se pudo reenviar el código a ${correo}: ${error.message}`);
        res.status(502).json(errorEnvio);
    }
}

/**
 * POST /api/auth/recuperar
 * Body: { correo }. Si existe una cuenta activa con ese correo, envía un enlace
 * para crear una contraseña nueva. Responde lo mismo exista o no la cuenta,
 * para no revelar qué correos están registrados.
 */
async function solicitarRecuperacion(req, res) {
    const correo = String((req.body || {}).correo || '').trim().toLowerCase();
    if (!esCorreoValido(correo)) return res.status(400).json(errorCampo('correo', 'Escribe el correo de tu cuenta.'));
    const respuesta = { enviado: true, correo, minutos: MINUTOS_ENLACE };

    const usuario = await cuentasRepo.obtenerCredenciales(correo);
    if (!usuario || !usuario.activo) return res.json(respuesta);
    const anterior = await cuentasRepo.verificacionPendiente(correo, 'recuperar');
    if (anterior && anterior.vigente && anterior.segundos < SEGUNDOS_REENVIO) {
        return res.status(429).json({ error: `Ya te enviamos un enlace. Espera ${SEGUNDOS_REENVIO - anterior.segundos} segundos para pedir otro.`, espera: SEGUNDOS_REENVIO - anterior.segundos });
    }

    const clave = crypto.randomBytes(32).toString('base64url');
    await cuentasRepo.crearVerificacion({ correo, proposito: 'recuperar', codigoHash: sha256(clave), minutos: MINUTOS_ENLACE });
    const enlace = `${correoConfig.urlSitio()}/restablecer.html?clave=${encodeURIComponent(clave)}`;
    try {
        respuesta.vistaPrevia = await enviarAhora(correo, plantillas.restablecerPassword({ nombre: usuario.nombre, enlace, minutos: MINUTOS_ENLACE, urlSitio: correoConfig.urlSitio() }));
    } catch (error) {
        console.error(`No se pudo enviar el enlace de recuperación a ${correo}: ${error.message}`);
        return res.status(502).json(errorEnvio);
    }
    res.json(respuesta);
}

/**
 * GET /api/auth/restablecer?clave=...  Comprueba que el enlace sigue vigente.
 * Respuestas: 200 { correo } (parcialmente oculto) | 410 enlace vencido o usado.
 */
async function comprobarEnlace(req, res) {
    const clave = String(req.query.clave || '');
    const v = clave ? await cuentasRepo.verificacionPorHash('recuperar', sha256(clave)) : null;
    if (!v) return res.status(410).json({ error: 'El enlace venció o ya se usó. Pide uno nuevo.' });
    const [usuario, dominio] = v.correo.split('@');
    res.json({ correo: `${usuario.slice(0, 2)}${'•'.repeat(Math.max(usuario.length - 2, 1))}@${dominio}` });
}

/**
 * POST /api/auth/restablecer
 * Body: { clave, password, confirmarPassword }
 * Respuestas: 200 { token, usuario } | 400 { error, campo } | 410 enlace vencido o usado.
 */
async function restablecerPassword(req, res) {
    const body = req.body || {};
    if (typeof body.password !== 'string' || body.password.length < LONGITUD_MINIMA_PASSWORD) {
        return res.status(400).json(errorCampo('password', `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`));
    }
    if (body.password !== body.confirmarPassword) return res.status(400).json(errorCampo('confirmarPassword', 'Las contraseñas no coinciden.'));
    const v = body.clave ? await cuentasRepo.verificacionPorHash('recuperar', sha256(String(body.clave))) : null;
    if (!v) return res.status(410).json({ error: 'El enlace venció o ya se usó. Pide uno nuevo.' });

    const passwordHash = await bcrypt.hash(body.password, RONDAS_BCRYPT);
    const cambiada = await conTransaccion(async (transaccion) => {
        if (!(await cuentasRepo.usarVerificacion(transaccion, v.id_verificacion))) return false;
        return cuentasRepo.cambiarPassword(transaccion, v.correo, passwordHash);
    });
    if (!cambiada) return res.status(410).json({ error: 'El enlace venció o ya se usó. Pide uno nuevo.' });

    const usuario = await cuentasRepo.obtenerCredenciales(v.correo);
    if (!usuario || !usuario.activo) return res.json({ cambiada: true });
    res.json({ cambiada: true, token: generarToken(usuario), usuario: usuarioPublico(usuario) });
}

/**
 * GET /api/auth/correo-prueba/:archivo
 * Muestra un correo guardado en correos-enviados/. Solo existe mientras no hay
 * servidor SMTP configurado (modo de demostración local).
 */
async function verCorreoPrueba(req, res) {
    if (correoConfig.smtpConfigurado()) return res.status(404).json({ error: 'No disponible.' });
    const nombre = path.basename(String(req.params.archivo || ''));
    if (!/^[\w.-]+\.html$/.test(nombre)) return res.status(404).json({ error: 'Correo no encontrado.' });
    const archivo = path.join(correoConfig.carpetaCorreos(), nombre);
    try {
        const html = await fs.promises.readFile(archivo, 'utf8');
        res.set('Cache-Control', 'no-store');
        res.type('html').send(html);
    } catch {
        res.status(404).json({ error: 'Correo no encontrado.' });
    }
}

/**
 * POST /api/auth/login
 *
 * Body: { correo, password }
 * Respuestas: 200 { token, usuario } | 401 credenciales inválidas | 403 cuenta suspendida.
 * El mensaje de error es genérico para no revelar qué correos existen.
 */
async function iniciarSesion(req, res) {
    const { correo, password } = req.body || {};
    const errorGenerico = { error: 'Correo o contraseña incorrectos.' };

    if (!esCorreoValido(correo) || !esTextoNoVacio(password)) {
        return res.status(401).json(errorGenerico);
    }

    const usuario = await cuentasRepo.obtenerCredenciales(correo.trim().toLowerCase());
    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
        return res.status(401).json(errorGenerico);
    }
    // El aviso de suspensión solo se muestra con la contraseña correcta.
    if (!usuario.activo) {
        return res.status(403).json({ error: 'Tu cuenta está suspendida. Escribe a soporte@bookingrd.com para más información.' });
    }

    res.json({ token: generarToken(usuario), usuario: usuarioPublico(usuario) });
}

/**
 * GET /api/auth/sesion  (requiere token)
 * Devuelve los datos públicos del usuario contenidos en el JWT vigente. El
 * frontend lo utiliza al cargar cada página para descartar tokens vencidos.
 */
function obtenerSesion(req, res) {
    const { id, nombre, rol, nombreEmpresa, tipoServicio } = req.usuario;
    const usuario = { id, nombre, rol };
    if (rol === 'empresa') Object.assign(usuario, { nombreEmpresa, tipoServicio });
    res.json({ usuario });
}

module.exports = {
    registrar, verificarRegistro, reenviarCodigo, solicitarRecuperacion, comprobarEnlace,
    restablecerPassword, verCorreoPrueba, iniciarSesion, obtenerSesion
};
