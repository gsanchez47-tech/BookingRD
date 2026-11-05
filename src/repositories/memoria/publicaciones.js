/**
 * @file src/repositories/memoria/publicaciones.js
 * @description Versión en memoria de src/repositories/publicaciones.repo.js
 *   (modo de demostración). Misma interfaz y mismos resultados.
 */

'use strict';

const sqlRepo = require('../publicaciones.repo');
const A = require('./almacen');

const { TIPOS, ORDENES, aPublicacion } = sqlRepo;

/** Valoración media y popularidad de una publicación (OUTER APPLY val / pop). */
function indicadores(tipo, id) {
    const columna = TIPOS[tipo].id;
    const reservas = A.bd.reservas.filter((r) => r[columna] === id);
    const puntuaciones = A.bd.resenas
        .filter((rs) => rs.visible && reservas.some((r) => r.id_reserva === rs.id_reserva))
        .map((rs) => rs.puntuacion);
    return {
        promedio_resenas: A.media(puntuaciones),
        total_resenas: puntuaciones.length,
        total_reservas: reservas.filter((r) => r.estado === 'confirmada').length
    };
}

/** Fila con las columnas que devuelve la consulta SQL (alias p, e, val, pop). */
function filaCompleta(tipo, p) {
    const e = A.empresa(p.id_empresa);
    return Object.assign({}, p, {
        categoria: A.categoriaDe(tipo, p),
        precio: p[TIPOS[tipo].precio],
        proveedor: e.nombre_comercial
    }, indicadores(tipo, p[TIPOS[tipo].id]));
}

/** Comparadores equivalentes a la lista blanca ORDENES. */
const COMPARADORES = {
    destacados: [[(f) => f.destacado, 'desc'], [(f) => A.tiempo(f.fecha_creacion), 'desc']],
    valoracion: [[(f) => f.promedio_resenas || 0, 'desc'], [(f) => f.total_resenas, 'desc'], [(f) => A.tiempo(f.fecha_creacion), 'desc']],
    populares: [[(f) => f.total_reservas, 'desc'], [(f) => f.destacado, 'desc'], [(f) => A.tiempo(f.fecha_creacion), 'desc']],
    recientes: [[(f) => A.tiempo(f.fecha_creacion), 'desc']],
    'precio-asc': [[(f) => Number(f.precio), 'asc']],
    'precio-desc': [[(f) => Number(f.precio), 'desc']],
    nombre: [[(f) => f.nombre, 'asc']]
};

/** Capacidad comparada con el número de personas pedido, según el tipo. */
const capacidad = {
    hotel: (p) => p.capacidad_personas * p.habitaciones,
    actividad: (p) => p.cupo_diario,
    vehiculo: (p) => p.pasajeros
};

async function listar(tipo, filtros) {
    const texto = filtros.texto || null;
    const filas = A.bd[A.TABLAS[tipo].tabla]
        .filter((p) => filtros.incluirInactivas || A.esVisible(p))
        .filter((p) => !filtros.idEmpresa || p.id_empresa === filtros.idEmpresa)
        .filter((p) => !filtros.categoria || A.categoriaDe(tipo, p) === filtros.categoria)
        .filter((p) => !filtros.ciudad || p.ciudad === filtros.ciudad)
        .filter((p) => !filtros.personas || capacidad[tipo](p) >= filtros.personas)
        .filter((p) => !filtros.precioMin || Number(p[TIPOS[tipo].precio]) >= filtros.precioMin)
        .filter((p) => !filtros.precioMax || Number(p[TIPOS[tipo].precio]) <= filtros.precioMax)
        .filter((p) => !texto || A.contiene(p.nombre, texto) || A.contiene(p.ciudad, texto) || A.contiene(p.descripcion, texto))
        .filter((p) => tipo !== 'vehiculo' || !filtros.transmision || p.transmision === filtros.transmision)
        .map((p) => filaCompleta(tipo, p))
        .filter((f) => !filtros.puntuacionMin || (f.promedio_resenas !== null && f.promedio_resenas >= filtros.puntuacionMin));

    filas.sort(A.ordenarPor(COMPARADORES[filtros.orden] || COMPARADORES.destacados));
    const desde = (filtros.pagina - 1) * filtros.porPagina;
    return {
        total: filas.length,
        publicaciones: filas.slice(desde, desde + filtros.porPagina).map((fila) => aPublicacion(tipo, fila))
    };
}

async function precios(tipo, { categoria = null, ciudad = null } = {}) {
    return A.bd[A.TABLAS[tipo].tabla]
        .filter(A.esVisible)
        .filter((p) => !categoria || A.categoriaDe(tipo, p) === categoria)
        .filter((p) => !ciudad || p.ciudad === ciudad)
        .map((p) => Number(p[TIPOS[tipo].precio]))
        .sort((a, b) => a - b);
}

async function obtener(tipo, id, { incluirInactiva = false } = {}) {
    const p = A.publicacion(tipo, id);
    if (!p || (!incluirInactiva && !A.esVisible(p))) return null;
    const e = A.empresa(p.id_empresa);
    return Object.assign(aPublicacion(tipo, filaCompleta(tipo, p)), {
        empresa: {
            nombre: e.nombre_comercial,
            telefono: e.telefono,
            sitioWeb: e.sitio_web,
            ciudad: e.ciudad,
            descripcion: e.descripcion,
            licenciaMitur: e.licencia_mitur
        }
    });
}

async function listarFavoritas(tipo, idUsuario) {
    const columna = TIPOS[tipo].id;
    return A.bd.favoritos
        .filter((f) => f.id_usuario === idUsuario && f[columna])
        .map((f) => ({ f, p: A.publicacion(tipo, f[columna]) }))
        .filter(({ p }) => p && A.esVisible(p))
        .sort((x, y) => A.tiempo(y.f.fecha_creacion) - A.tiempo(x.f.fecha_creacion))
        .map(({ f, p }) => Object.assign(aPublicacion(tipo, filaCompleta(tipo, p)), { fechaGuardado: f.fecha_creacion }));
}

async function estadisticas() {
    const porCategoria = {};
    const porCiudad = {};
    const porCiudadTipo = {};
    const ciudades = new Set();
    const totales = { hotel: 0, actividad: 0, vehiculo: 0 };
    for (const tipo of Object.keys(TIPOS)) {
        for (const p of A.bd[A.TABLAS[tipo].tabla]) {
            if (!A.esVisible(p)) continue;
            const categoria = A.categoriaDe(tipo, p);
            porCategoria[categoria] = (porCategoria[categoria] || 0) + 1;
            porCiudad[p.ciudad] = (porCiudad[p.ciudad] || 0) + 1;
            porCiudadTipo[p.ciudad] = porCiudadTipo[p.ciudad] || { hotel: 0, actividad: 0, vehiculo: 0 };
            porCiudadTipo[p.ciudad][tipo] += 1;
            ciudades.add(p.ciudad);
            totales[tipo] += 1;
        }
    }
    const visibles = A.bd.resenas.filter((rs) => rs.visible).map((rs) => rs.puntuacion);
    return {
        totalHoteles: totales.hotel,
        totalActividades: totales.actividad,
        totalVehiculos: totales.vehiculo,
        totalEmpresas: A.bd.empresas.filter((e) => { const u = A.usuario(e.id_usuario); return u && u.activo; }).length,
        ciudades: [...ciudades].sort((a, b) => a.localeCompare(b, 'es')),
        porCategoria,
        porCiudad,
        porCiudadTipo,
        puntuacionMedia: A.media(visibles),
        totalResenas: visibles.length
    };
}

/** Columnas de la tabla a partir de los datos validados de la publicación. */
function columnas(tipo, datos) {
    const comunes = {
        nombre: datos.nombre,
        ciudad: datos.ciudad,
        descripcion: datos.descripcion
    };
    if (tipo === 'hotel') {
        return Object.assign(comunes, {
            tipo_alojamiento: datos.tipoAlojamiento,
            direccion: datos.direccion,
            servicios: datos.servicios.length ? datos.servicios.join(',') : null,
            precio_noche: datos.precio,
            capacidad_personas: datos.capacidadPersonas,
            habitaciones: datos.habitaciones
        });
    }
    if (tipo === 'vehiculo') {
        return Object.assign(comunes, {
            categoria: datos.categoria,
            marca: datos.marca,
            modelo: datos.modelo,
            anio: datos.anio,
            transmision: datos.transmision,
            combustible: datos.combustible,
            pasajeros: datos.pasajeros,
            puertas: datos.puertas,
            maletas: datos.maletas,
            aire: datos.aire ? 1 : 0,
            km_por_dia: datos.kmPorDia,
            lugar_recogida: datos.lugarRecogida,
            incluye: datos.incluye || null,
            precio_dia: datos.precio,
            deposito: datos.deposito,
            edad_minima: datos.edadMinima,
            cargo_conductor_joven: datos.cargoConductorJoven,
            cargo_otra_ciudad: datos.cargoOtraCiudad,
            unidades: datos.unidades
        });
    }
    return Object.assign(comunes, {
        categoria: datos.categoria,
        punto_encuentro: datos.puntoEncuentro,
        incluye: datos.incluye || null,
        duracion_horas: datos.duracionHoras,
        precio_persona: datos.precio,
        cupo_diario: datos.cupoDiario
    });
}

async function crear(tipo, idEmpresa, datos) {
    const { tabla, id } = A.TABLAS[tipo];
    const fila = A.insertar(tabla, id, Object.assign(columnas(tipo, datos), {
        id_empresa: idEmpresa,
        id_imagen: datos.idImagen || null,
        imagen_url: null,
        destacado: 0,
        activo: 1,
        fecha_creacion: A.ahora(),
        fecha_actualizacion: null
    }));
    return fila[id];
}

async function actualizar(tipo, id, idEmpresa, datos) {
    const p = A.publicacion(tipo, id);
    if (!p || p.id_empresa !== idEmpresa) return false;
    Object.assign(p, columnas(tipo, datos), {
        id_imagen: datos.idImagen || p.id_imagen,
        fecha_actualizacion: A.ahora()
    });
    return true;
}

async function cambiarEstado(tipo, id, idEmpresa, activo) {
    const p = A.publicacion(tipo, id);
    if (!p || p.id_empresa !== idEmpresa) return false;
    p.activo = activo ? 1 : 0;
    p.fecha_actualizacion = A.ahora();
    return true;
}

async function eliminar(tipo, id, idEmpresa) {
    const { tabla, id: columnaId } = A.TABLAS[tipo];
    const p = A.publicacion(tipo, id);
    if (!p || p.id_empresa !== idEmpresa) return 'no-existe';
    if (A.bd.reservas.some((r) => r[columnaId] === id)) return 'con-reservas';
    if (tipo !== 'vehiculo' && A.bd.combos.some((c) => c[columnaId] === id || (tipo === 'actividad' && c.id_actividad2 === id))) return 'con-reservas';
    A.bd.favoritos = A.bd.favoritos.filter((f) => f[columnaId] !== id);
    A.bd[tabla] = A.bd[tabla].filter((fila) => fila[columnaId] !== id);
    return 'eliminada';
}

module.exports = {
    TIPOS,
    ORDENES,
    aPublicacion,
    listar,
    obtener,
    listarFavoritas,
    estadisticas,
    precios,
    crear,
    actualizar,
    cambiarEstado,
    eliminar
};
