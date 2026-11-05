/**
 * @file src/repositories/memoria/almacen.js
 * @description Almacén en memoria del modo de demostración. Construye las
 *   tablas (mismas columnas que en SQL Server) a partir de
 *   database/datos-demo.js, con las fechas de las reservas relativas al día
 *   de hoy, y ofrece las uniones que los repositorios necesitan.
 *
 *   Base local: si el modo no es efímero (DB_MODO=demo), las tablas se
 *   guardan en database/local/bookingrd-local.json después de cada cambio y
 *   se recuperan al arrancar. Para volver a los datos de ejemplo basta con
 *   borrar ese archivo (npm run local:reiniciar).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const datos = require('../../../database/datos-demo');
const { MODO_EFIMERO } = require('../../config/modo');
const { hoy, sumarDias } = require('../../utils/fechas');

const TABLAS = {
    hotel: { tabla: 'hoteles', id: 'id_hotel', precio: 'precio_noche' },
    actividad: { tabla: 'actividades', id: 'id_actividad', precio: 'precio_persona' },
    vehiculo: { tabla: 'vehiculos', id: 'id_vehiculo', precio: 'precio_dia' }
};

/** Tablas del almacén. */
const bd = {
    usuarios: [],
    empresas: [],
    imagenes: [],
    hoteles: [],
    actividades: [],
    vehiculos: [],
    combos: [],
    reservas: [],
    pagos: [],
    resenas: [],
    favoritos: [],
    mensajes_contacto: [],
    productos: [],
    pedidos: [],
    pedido_detalle: []
};

/** Último identificador asignado por tabla (equivalente a IDENTITY). */
const secuencias = {};

/** Inserta una fila asignándole el identificador siguiente. */
function insertar(tabla, columnaId, fila) {
    secuencias[tabla] = (secuencias[tabla] || 0) + 1;
    const registro = Object.assign({ [columnaId]: secuencias[tabla] }, fila);
    bd[tabla].push(registro);
    return registro;
}

/** Error equivalente a la violación de una restricción UNIQUE de SQL Server. */
function errorDuplicado(restriccion) {
    const error = new Error(`Violation of UNIQUE KEY constraint '${restriccion}'.`);
    error.number = 2627;
    return error;
}

/** Pago de una reserva (relación 1 a 1). */
const pagoDe = (idReserva) => bd.pagos.find((p) => p.id_reserva === idReserva) || null;

/** Fecha y hora con la precisión de DATETIME2(0). */
const ahora = () => new Date(Math.floor(Date.now() / 1000) * 1000);

/** Fecha y hora a partir de una fecha AAAA-MM-DD y una hora UTC. */
const instante = (fecha, hora = '14:00') => new Date(`${fecha}T${hora}:00Z`);

/** Construye las tablas a partir de los datos de demostración. */
function cargar() {
    const fechaBase = hoy();
    const fechaRegistro = instante(sumarDias(fechaBase, -420), '13:00');
    const porCorreo = new Map();
    const porRnc = new Map();
    const publicaciones = { hotel: new Map(), actividad: new Map(), vehiculo: new Map() };

    for (const u of datos.usuarios) {
        const fila = insertar('usuarios', 'id_usuario', {
            nombre: u.nombre,
            correo: u.correo,
            telefono: u.telefono || null,
            password_hash: datos.CLAVES[u.clave],
            rol: u.rol,
            activo: u.activo === false ? 0 : 1,
            fecha_creacion: fechaRegistro
        });
        porCorreo.set(u.correo, fila);
    }

    for (const e of datos.empresas) {
        const usuario = porCorreo.get(e.correo);
        const fila = insertar('empresas', 'id_empresa', {
            id_usuario: usuario.id_usuario,
            cargo_representante: e.cargo_representante,
            nombre_comercial: e.nombre_comercial,
            razon_social: e.razon_social,
            rnc: e.rnc,
            telefono: e.telefono,
            provincia: e.provincia,
            ciudad: e.ciudad,
            direccion: e.direccion,
            sitio_web: e.sitio_web || null,
            licencia_mitur: e.licencia_mitur || null,
            tipo_servicio: e.tipo_servicio,
            tipo_alojamiento: e.tipo_alojamiento || null,
            numero_habitaciones: e.numero_habitaciones || null,
            categorias_actividad: e.categorias_actividad || null,
            descripcion: e.descripcion || null,
            fecha_registro: fechaRegistro
        });
        porRnc.set(e.rnc, fila);
    }

    const COLUMNAS_OPCIONALES = ['servicios', 'incluye', 'km_por_dia', 'cargo_conductor_joven', 'cargo_otra_ciudad'];
    for (const [tipo, { tabla, id }] of Object.entries(TABLAS)) {
        datos[tabla].forEach((p, indice) => {
            const { empresa, destacado, aire, ...columnas } = p;
            for (const columna of COLUMNAS_OPCIONALES) if (!(columna in columnas)) columnas[columna] = null;
            const fila = insertar(tabla, id, Object.assign(columnas, {
                id_empresa: porRnc.get(empresa).id_empresa,
                id_imagen: null,
                destacado: destacado ? 1 : 0,
                activo: p.activo === false ? 0 : 1,
                // Fechas de creación escalonadas: el orden "recientes" refleja el orden de los datos.
                fecha_creacion: instante(sumarDias(fechaBase, -300 + indice * 3), '12:00'),
                fecha_actualizacion: null
            }, tipo === 'vehiculo' ? { aire: aire === false ? 0 : 1 } : {}));
            publicaciones[tipo].set(p.nombre, fila);
        });
    }

    const porNombreCombo = new Map();
    datos.combos.forEach((c, indice) => {
        const fila = insertar('combos', 'id_combo', {
            nombre: c.nombre,
            lema: c.lema,
            descripcion: c.descripcion,
            ciudad: c.ciudad,
            id_hotel: publicaciones.hotel.get(c.hotel).id_hotel,
            id_actividad: publicaciones.actividad.get(c.actividad).id_actividad,
            id_actividad2: c.actividad2 ? publicaciones.actividad.get(c.actividad2).id_actividad : null,
            dia_actividad: c.dia_actividad,
            dia_actividad2: c.actividad2 ? c.dia_actividad2 : null,
            noches_sugeridas: c.noches_sugeridas,
            descuento_pct: c.descuento_pct,
            destacado: c.destacado ? 1 : 0,
            activo: 1,
            fecha_creacion: instante(sumarDias(fechaBase, -90 + indice), '12:00')
        });
        porNombreCombo.set(c.nombre, fila);
    });

    const porCodigo = new Map();
    for (const r of datos.reservas) {
        const publicacion = publicaciones[r.tipo].get(r.publicacion);
        const inicio = sumarDias(fechaBase, r.inicio);
        const fila = insertar('reservas', 'id_reserva', {
            codigo: r.codigo,
            id_usuario: porCorreo.get(r.usuario).id_usuario,
            id_hotel: r.tipo === 'hotel' ? publicacion.id_hotel : null,
            id_actividad: r.tipo === 'actividad' ? publicacion.id_actividad : null,
            id_vehiculo: r.tipo === 'vehiculo' ? publicacion.id_vehiculo : null,
            fecha_inicio: inicio,
            fecha_fin: r.fin === undefined || r.fin === null ? null : sumarDias(fechaBase, r.fin),
            hora_inicio: r.hora_inicio || null,
            hora_fin: r.hora_fin || null,
            ciudad_devolucion: r.ciudad_devolucion || null,
            edad_conductor: r.edad_conductor || null,
            extras: r.extras || null,
            deposito: r.deposito === undefined ? null : r.deposito,
            personas: r.personas,
            habitaciones: r.habitaciones || null,
            precio_unitario: r.precio_unitario,
            total: r.total,
            estado: r.estado || 'confirmada',
            comentario: r.comentario || null,
            // Igual que scripts/generar-sql.js: creada al menos dos días antes de hoy.
            fecha_creacion: instante(sumarDias(fechaBase, Math.min(r.inicio - 21, -2)), '15:00'),
            fecha_cancelacion: r.estado === 'cancelada' ? instante(sumarDias(fechaBase, Math.min(r.inicio - 21, -2) + 1), '10:00') : null,
            id_combo: r.combo ? porNombreCombo.get(r.combo).id_combo : null
        });
        porCodigo.set(r.codigo, fila);

        // Pago de demostración: mismo cálculo que scripts/generar-sql.js.
        const pago = datos.pagoDemo(r);
        insertar('pagos', 'id_pago', Object.assign(pago, {
            id_reserva: fila.id_reserva,
            moneda: 'DOP',
            titular: pago.metodo === 'tarjeta' ? porCorreo.get(r.usuario).nombre : null,
            fecha_pago: fila.fecha_creacion,
            fecha_reembolso: pago.estado === 'reembolsado' ? fila.fecha_cancelacion : null
        }));
    }

    for (const s of datos.resenas) {
        const reserva = porCodigo.get(s.reserva);
        const fecha = instante(sumarDias(reserva.fecha_fin || reserva.fecha_inicio, 2), '10:00');
        insertar('resenas', 'id_resena', {
            id_reserva: reserva.id_reserva,
            puntuacion: s.puntuacion,
            titulo: s.titulo,
            comentario: s.comentario,
            respuesta: s.respuesta || null,
            fecha_respuesta: s.respuesta ? new Date(fecha.getTime() + 86400000) : null,
            visible: s.visible === false ? 0 : 1,
            fecha_creacion: fecha
        });
    }

    datos.favoritos.forEach((f, indice) => {
        const publicacion = publicaciones[f.tipo].get(f.publicacion);
        insertar('favoritos', 'id_favorito', {
            id_usuario: porCorreo.get(f.usuario).id_usuario,
            id_hotel: f.tipo === 'hotel' ? publicacion.id_hotel : null,
            id_actividad: f.tipo === 'actividad' ? publicacion.id_actividad : null,
            id_vehiculo: f.tipo === 'vehiculo' ? publicacion.id_vehiculo : null,
            fecha_creacion: instante(sumarDias(fechaBase, -20 + indice), '18:00')
        });
    });

    datos.mensajes.forEach((m, indice) => {
        insertar('mensajes_contacto', 'id_mensaje', {
            nombre: m.nombre,
            correo: m.correo,
            asunto: m.asunto,
            mensaje: m.mensaje,
            atendido: m.atendido ? 1 : 0,
            fecha_envio: instante(sumarDias(fechaBase, -3 - indice * 2), '16:00')
        });
    });

    const porNombreProducto = new Map();
    for (const p of datos.productos) {
        const fila = insertar('productos', 'id_producto', {
            nombre: p.nombre,
            categoria: p.categoria,
            descripcion: p.descripcion,
            taller: p.taller,
            origen: p.origen,
            precio: p.precio,
            existencias: p.existencias,
            imagen_url: p.imagen_url || null,
            destacado: p.destacado ? 1 : 0,
            activo: 1
        });
        porNombreProducto.set(p.nombre, fila);
    }
    for (const p of datos.pedidos) {
        const usuario = porCorreo.get(p.usuario);
        const pedido = insertar('pedidos', 'id_pedido', Object.assign({
            codigo: p.codigo,
            id_usuario: usuario.id_usuario,
            entrega: p.entrega,
            destinatario: p.destinatario,
            direccion: p.direccion,
            telefono: p.telefono || null,
            estado: p.estado,
            fecha_creacion: instante(sumarDias(fechaBase, p.dias), '16:00')
        }, datos.pedidoDemo(p), { pago_titular: usuario.nombre }));
        for (const [nombre, cantidad] of p.productos) {
            const producto = porNombreProducto.get(nombre);
            insertar('pedido_detalle', 'id_detalle', {
                id_pedido: pedido.id_pedido,
                id_producto: producto.id_producto,
                cantidad,
                precio_unitario: producto.precio
            });
        }
    }
}

/* ---------------------------------------------------------------------------
 * Persistencia en archivo (base local)
 * ------------------------------------------------------------------------- */

const ARCHIVO_LOCAL = process.env.DB_ARCHIVO
    || path.join(__dirname, '..', '..', '..', 'database', 'local', 'bookingrd-local.json');
/** Versión del formato de la base local; si cambia, se vuelven a cargar los datos de ejemplo. */
const VERSION_LOCAL = 2;
const ISO_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Fechas y contenidos binarios a JSON y de vuelta. */
function aJson() {
    return JSON.stringify({ version: VERSION_LOCAL, secuencias, bd }, (clave, valor) => {
        if (valor && valor.type === 'Buffer' && Array.isArray(valor.data)) return { __base64: Buffer.from(valor.data).toString('base64') };
        return valor;
    });
}

function revivir(clave, valor) {
    if (typeof valor === 'string' && ISO_INSTANTE.test(valor)) return new Date(valor);
    if (valor && typeof valor === 'object' && typeof valor.__base64 === 'string') return Buffer.from(valor.__base64, 'base64');
    return valor;
}

/** Recupera las tablas guardadas. @returns {boolean} false si no hay archivo válido */
function recuperar() {
    try {
        const guardado = JSON.parse(fs.readFileSync(ARCHIVO_LOCAL, 'utf8'), revivir);
        if (!guardado || guardado.version !== VERSION_LOCAL) {
            console.log('La base local es de una versión anterior de BookingRD: se cargan los datos de ejemplo nuevos.');
            return false;
        }
        for (const tabla of Object.keys(bd)) bd[tabla] = Array.isArray(guardado.bd[tabla]) ? guardado.bd[tabla] : [];
        Object.assign(secuencias, guardado.secuencias);
        return true;
    } catch (error) {
        if (error.code !== 'ENOENT') console.error(`No se pudo leer la base local (${ARCHIVO_LOCAL}): ${error.message}. Se usan los datos de ejemplo.`);
        return false;
    }
}

/** Escribe el archivo de forma atómica (temporal y renombrado). */
function guardarAhora() {
    if (MODO_EFIMERO) return;
    fs.mkdirSync(path.dirname(ARCHIVO_LOCAL), { recursive: true });
    const temporal = `${ARCHIVO_LOCAL}.tmp`;
    fs.writeFileSync(temporal, aJson());
    fs.renameSync(temporal, ARCHIVO_LOCAL);
}

let guardadoPendiente = null;

/** Programa el guardado (agrupa varios cambios seguidos en una escritura). */
function guardar() {
    if (MODO_EFIMERO || guardadoPendiente) return;
    guardadoPendiente = setTimeout(() => {
        guardadoPendiente = null;
        try {
            guardarAhora();
        } catch (error) {
            console.error(`No se pudo guardar la base local: ${error.message}`);
        }
    }, 250);
}

/** Guarda lo pendiente antes de apagar (Ctrl + C). */
function guardarAlSalir() {
    if (guardadoPendiente) {
        clearTimeout(guardadoPendiente);
        guardadoPendiente = null;
        try { guardarAhora(); } catch (error) { /* el proceso termina de todos modos */ }
    }
}

let recuperada = false;
if (!MODO_EFIMERO) recuperada = recuperar();
if (!recuperada) {
    cargar();
    if (!MODO_EFIMERO) {
        try { guardarAhora(); } catch (error) { console.error(`No se pudo crear la base local: ${error.message}`); }
    }
}

/* ---------------------------------------------------------------------------
 * Consultas comunes
 * ------------------------------------------------------------------------- */

const buscar = (tabla, columna, valor) => bd[tabla].find((fila) => fila[columna] === valor) || null;

const usuario = (id) => buscar('usuarios', 'id_usuario', id);
const empresa = (id) => buscar('empresas', 'id_empresa', id);

/** Publicación (fila de hoteles, actividades o vehiculos). */
const publicacion = (tipo, id) => buscar(TABLAS[tipo].tabla, TABLAS[tipo].id, id);

/** La empresa de la publicación existe y su cuenta no está suspendida. */
const empresaActiva = (fila) => {
    const e = empresa(fila.id_empresa);
    const u = e && usuario(e.id_usuario);
    return Boolean(u && u.activo);
};

/** Publicación visible al público: activa y de una empresa no suspendida. */
const esVisible = (fila) => Boolean(fila.activo) && empresaActiva(fila);

/** Tipo de publicación de una reserva o un favorito. */
const tipoDe = (fila) => (fila.id_hotel ? 'hotel' : fila.id_actividad ? 'actividad' : 'vehiculo');

/** Identificador de la publicación de una reserva o un favorito. */
const idPublicacionDe = (fila) => fila.id_hotel || fila.id_actividad || fila.id_vehiculo;

/** Publicación enlazada a una reserva o un favorito. */
const publicacionDe = (fila) => publicacion(tipoDe(fila), idPublicacionDe(fila));

/** Grupo público de un tipo de alojamiento. */
const categoriaHotel = (tipoAlojamiento) =>
    (['hotel', 'resort', 'boutique'].includes(tipoAlojamiento) ? 'hoteles-resorts' : 'villas-cabanas');

/** Categoría pública de una publicación. */
const categoriaDe = (tipo, fila) => (tipo === 'hotel' ? categoriaHotel(fila.tipo_alojamiento) : fila.categoria);

/** Media con dos decimales (equivalente a CAST(AVG(...) AS DECIMAL(4,2))). */
const media = (valores) => (valores.length
    ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100
    : null);

/** Copia superficial de las filas para que los llamadores no modifiquen el almacén. */
const copia = (fila) => (fila ? Object.assign({}, fila) : null);

/** Coincidencia de LIKE '%texto%' sin distinguir mayúsculas (intercalación CI de SQL Server). */
const contiene = (valor, texto) => String(valor || '').toLocaleLowerCase('es').includes(texto.toLocaleLowerCase('es'));

/** Comparador para ordenar por varias claves: [[valor(fila), 'asc'|'desc'], ...]. */
function ordenarPor(claves) {
    return (a, b) => {
        for (const [valor, sentido] of claves) {
            const x = valor(a);
            const y = valor(b);
            if (x === y) continue;
            if (x === null || x === undefined) return sentido === 'asc' ? -1 : 1;
            if (y === null || y === undefined) return sentido === 'asc' ? 1 : -1;
            const comparacion = typeof x === 'string' ? x.localeCompare(y, 'es') : (x < y ? -1 : 1);
            return sentido === 'asc' ? comparacion : -comparacion;
        }
        return 0;
    };
}

const tiempo = (fecha) => (fecha instanceof Date ? fecha.getTime() : fecha ? Date.parse(fecha) : null);

module.exports = {
    bd,
    ARCHIVO_LOCAL,
    recuperada,
    guardar,
    guardarAlSalir,
    TABLAS,
    insertar,
    errorDuplicado,
    ahora,
    pagoDe,
    usuario,
    empresa,
    publicacion,
    empresaActiva,
    esVisible,
    tipoDe,
    idPublicacionDe,
    publicacionDe,
    categoriaHotel,
    categoriaDe,
    media,
    copia,
    contiene,
    ordenarPor,
    tiempo
};
