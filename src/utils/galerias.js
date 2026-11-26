/**
 * @file src/utils/galerias.js
 * @description Fotos adicionales de las publicaciones de demostración.
 *
 *   Cada archivo public/img/galeria/<nombre>-<n>.jpg pertenece a la
 *   publicación cuya foto principal es img/publicaciones/<nombre>.jpg.
 *   La galería se arma una vez al iniciar el servidor y se agrega al detalle
 *   (GET /api/publicaciones/:tipo/:id), igual con SQL Server que con la base
 *   local. Las publicaciones creadas por una empresa muestran su fotografía.
 */

const fs = require('fs');
const path = require('path');

const CARPETA = path.join(__dirname, '..', '..', 'public', 'img', 'galeria');
let indice = null;

function construir() {
    const mapa = new Map();
    let archivos = [];
    try {
        archivos = fs.readdirSync(CARPETA);
    } catch {
        return mapa;
    }
    for (const archivo of archivos) {
        const partes = /^(.+)-(\d+)\.jpg$/.exec(archivo);
        if (!partes) continue;
        const clave = `img/publicaciones/${partes[1]}.jpg`;
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push({ orden: Number(partes[2]), url: `img/galeria/${archivo}` });
    }
    for (const [clave, lista] of mapa) mapa.set(clave, lista.sort((a, b) => a.orden - b.orden).map((f) => f.url));
    return mapa;
}

/** Fotos de la publicación: la principal primero y después las de la galería. */
function galeriaDe(imagen) {
    if (!imagen) return [];
    indice = indice || construir();
    return [imagen, ...(indice.get(String(imagen).replace(/^\//, '')) || [])];
}

module.exports = { galeriaDe };
