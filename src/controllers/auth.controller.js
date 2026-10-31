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
 * El cierre de sesión se resuelve en el cliente (eliminación del token en
 * public/js/comun.js); no requiere endpoint.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { conTransaccion } = require('../config/db');
const correoService = require('../services/correo.service');
const cuentasRepo = require('../repositories/cuentas.repo');
const { esCorreoValido, esTextoNoVacio, aEnteroPositivo, textoLimpio } = require('../utils/validacion');
const { TIPOS_SERVICIO, TIPOS_ALOJAMIENTO, CATEGORIAS_ACTIVIDAD, PROVINCIAS } = require('../utils/catalogos');

const RONDAS_BCRYPT = 10;
const LONGITUD_MINIMA_PASSWORD = 8;
const MAXIMO_HABITACIONES = 5000;
const ERRORES_SQL_DUPLICADO = [2627, 2601];   // violación de UNIQUE / índice único

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
 * Respuestas: 201 { token, usuario } | 400 { error, campo } | 409 { error, campo }.
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

    try {
        // Usuario y empresa se insertan en una única transacción (atomicidad).
        const usuario = await conTransaccion(async (transaccion) => {
            const nuevo = await cuentasRepo.crearUsuario(transaccion, {
                nombre: textoLimpio(body.nombre),
                correo,
                telefono: esEmpresa ? textoLimpio(body.telefono) : null,
                passwordHash,
                rol: tipoCuenta
            });
            if (empresa) {
                nuevo.id_empresa = await cuentasRepo.crearEmpresa(transaccion, nuevo.id_usuario,
                    Object.assign({ cargo: textoLimpio(body.cargo) }, empresa));
                nuevo.nombre_comercial = empresa.nombreComercial;
                nuevo.tipo_servicio = empresa.tipoServicio;
            }
            return nuevo;
        });
        res.status(201).json({ token: generarToken(usuario), usuario: usuarioPublico(usuario) });
        // Correo de bienvenida en segundo plano: no retrasa ni afecta el registro.
        correoService.bienvenida({ nombre: usuario.nombre, correo, rol: tipoCuenta }, empresa);
    } catch (error) {
        if (ERRORES_SQL_DUPLICADO.includes(error.number)) {
            return res.status(409).json({ error: 'Ese correo o ese RNC ya están registrados.' });
        }
        throw error;
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

module.exports = { registrar, iniciarSesion, obtenerSesion };
