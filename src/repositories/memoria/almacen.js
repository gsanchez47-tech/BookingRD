/**
 * @file src/repositories/memoria/almacen.js
 * @description Almacén en memoria del modo de demostración. Construye las
 *   tablas (mismas columnas que en SQL Server) a partir de
 *   database/datos-demo.js, con las fechas de las reservas relativas al día
 *   de hoy, y ofrece las uniones que los repositorios necesitan.
 *
 *   Los datos viven mientras el servidor esté encendido: al reiniciarlo se
 *   vuelve al estado inicial de la demostración.
 */

'use strict';

const datos = require('../../../database/datos-demo');
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
    reservas: [],
    pagos: [],
    resenas: [],
    favoritos: [],
    mensajes_contacto: []
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
            fecha_cancelacion: r.estado === 'cancelada' ? instante(sumarDias(fechaBase, Math.min(r.inicio - 21, -2) + 1), '10:00') : null
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
}

cargar();

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
