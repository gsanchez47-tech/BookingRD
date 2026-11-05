/**
 * @file src/repositories/memoria/combos.js
 * @description Versión en memoria de src/repositories/combos.repo.js.
 */

'use strict';

const A = require('./almacen');

const imagen = (p) => (p.id_imagen ? `/api/imagenes/${p.id_imagen}` : p.imagen_url || null);

function aFilaCombo(cb) {
    const h = A.publicacion('hotel', cb.id_hotel);
    const actividad = (id, dia) => {
        const a = A.publicacion('actividad', id);
        return { id, nombre: a.nombre, precio: Number(a.precio_persona), duracion: Number(a.duracion_horas), categoria: a.categoria, imagen: imagen(a), dia };
    };
    return {
        id: cb.id_combo,
        nombre: cb.nombre,
        lema: cb.lema,
        descripcion: cb.descripcion,
        ciudad: cb.ciudad,
        nochesSugeridas: cb.noches_sugeridas,
        descuento: cb.descuento_pct,
        destacado: Boolean(cb.destacado),
        hotel: { id: h.id_hotel, nombre: h.nombre, precio: Number(h.precio_noche), capacidad: h.capacidad_personas, tipoAlojamiento: h.tipo_alojamiento, imagen: imagen(h) },
        actividades: [actividad(cb.id_actividad, cb.dia_actividad)].concat(cb.id_actividad2 ? [actividad(cb.id_actividad2, cb.dia_actividad2)] : [])
    };
}

function esVisible(cb) {
    if (!cb.activo) return false;
    const partes = [A.publicacion('hotel', cb.id_hotel), A.publicacion('actividad', cb.id_actividad)];
    if (cb.id_actividad2) partes.push(A.publicacion('actividad', cb.id_actividad2));
    return partes.every((p) => p && A.esVisible(p));
}

async function listar() {
    return A.bd.combos
        .filter(esVisible)
        .sort(A.ordenarPor([[(c) => c.destacado, 'desc'], [(c) => c.id_combo, 'asc']]))
        .map(aFilaCombo);
}

async function obtener(id) {
    const cb = A.bd.combos.find((c) => c.id_combo === id);
    return cb && esVisible(cb) ? aFilaCombo(cb) : null;
}

module.exports = { listar, obtener };
