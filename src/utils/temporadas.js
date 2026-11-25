/**
 * @file src/utils/temporadas.js
 * @description Precio por noche de los alojamientos según la temporada
 *   turística de República Dominicana y el día de la semana.
 *
 *   El precio que publica la empresa es el de temporada media entre semana.
 *   Cada noche se multiplica por el factor de su temporada y, las noches de
 *   viernes y sábado, por el recargo de fin de semana; el resultado se
 *   redondea a múltiplos de RD$50.
 *
 *   Temporadas (de mayor a menor prioridad):
 *     fiestas       20 dic - 6 ene                       x1.35
 *     semana-santa  domingo de Ramos al sábado de Gloria  x1.30
 *     alta          15 dic - 15 abr (invierno del norte)  x1.15
 *     verano        1 jul - 31 ago (vacaciones escolares) x1.10
 *     baja          1 sep - 15 nov (lluvias y huracanes)   x0.85
 *     media         el resto del año                       x1.00
 *   Fin de semana (noches de viernes y sábado): x1.08, salvo en fiestas.
 */

const TEMPORADAS = {
    fiestas: { nombre: 'Navidad y Año Nuevo', factor: 1.35 },
    'semana-santa': { nombre: 'Semana Santa', factor: 1.3 },
    alta: { nombre: 'Temporada alta', factor: 1.15 },
    verano: { nombre: 'Verano', factor: 1.1 },
    baja: { nombre: 'Temporada baja', factor: 0.85 },
    media: { nombre: 'Temporada media', factor: 1 }
};
const RECARGO_FIN_DE_SEMANA = 1.08;

/** Domingo de Pascua (algoritmo anónimo gregoriano) como "AAAA-MM-DD". */
function domingoPascua(anio) {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const aUtc = (iso) => new Date(`${iso}T00:00:00Z`);
const aIsoUtc = (fecha) => fecha.toISOString().slice(0, 10);
const sumar = (iso, dias) => aIsoUtc(new Date(aUtc(iso).getTime() + dias * 86400000));

/** Clave de la temporada de una noche ("AAAA-MM-DD" es la fecha de entrada de esa noche). */
function temporadaDe(iso) {
    const mesDia = iso.slice(5);
    const anio = Number(iso.slice(0, 4));
    if (mesDia >= '12-20' || mesDia <= '01-06') return 'fiestas';
    const pascua = domingoPascua(anio);
    if (iso >= sumar(pascua, -7) && iso < pascua) return 'semana-santa';
    if (mesDia >= '12-15' || mesDia <= '04-15') return 'alta';
    if (mesDia >= '07-01' && mesDia <= '08-31') return 'verano';
    if (mesDia >= '09-01' && mesDia <= '11-15') return 'baja';
    return 'media';
}

const esFinDeSemana = (iso) => [5, 6].includes(aUtc(iso).getUTCDay());

/** Precio de una noche a partir del precio base publicado. */
function precioNoche(base, iso) {
    const clave = temporadaDe(iso);
    let factor = TEMPORADAS[clave].factor;
    if (clave !== 'fiestas' && esFinDeSemana(iso)) factor *= RECARGO_FIN_DE_SEMANA;
    return Math.max(50, Math.round((Number(base) * factor) / 50) * 50);
}

/**
 * Precio de una estancia por habitación, noche por noche.
 * @returns {{total: number, noches: Array<{fecha: string, precio: number, temporada: string}>}}
 */
function precioEstancia(base, entrada, noches) {
    const detalle = [];
    for (let i = 0; i < noches; i++) {
        const fecha = sumar(entrada, i);
        detalle.push({ fecha, precio: precioNoche(base, fecha), temporada: temporadaDe(fecha) });
    }
    return { total: detalle.reduce((suma, n) => suma + n.precio, 0), noches: detalle };
}

module.exports = { TEMPORADAS, RECARGO_FIN_DE_SEMANA, domingoPascua, temporadaDe, esFinDeSemana, precioNoche, precioEstancia, sumar };
