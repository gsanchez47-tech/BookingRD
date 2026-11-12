/**
 * @file src/services/externos.service.js
 * @description Datos de servicios externos gratuitos y sin clave de acceso:
 *
 *   - Clima: Open-Meteo (https://open-meteo.com). Condición actual y
 *     pronóstico de cuatro días de cada destino.
 *   - Tipos de cambio: ExchangeRate-API, versión abierta
 *     (https://www.exchangerate-api.com/docs/free). Tasas del peso
 *     dominicano frente al dólar y al euro.
 *
 *   - Estado del mar: Open-Meteo Marine (https://open-meteo.com/en/docs/marine-weather-api).
 *     Altura de las olas y temperatura del agua en los destinos de costa.
 *   - Feriados: Nager.Date (https://date.nager.at). Días feriados de la
 *     República Dominicana, con una lista de respaldo si no responde.
 *   - Destinos: resumen de Wikipedia en español (REST API pública).
 *
 *   Las respuestas se guardan en memoria (clima 15 minutos, tasas 6 horas)
 *   para no consultar el servicio en cada visita. Si el servicio no responde
 *   se devuelve el último dato obtenido, marcado como no actualizado; las
 *   tasas tienen además valores de respaldo (TASA_USD y TASA_EUR en .env).
 */

'use strict';

const { COORDENADAS_DESTINOS } = require('../utils/catalogos');

const URL_CLIMA = 'https://api.open-meteo.com/v1/forecast';
const URL_TASAS = 'https://open.er-api.com/v6/latest/DOP';
const TIEMPO_ESPERA_MS = 6000;
const VIGENCIA_CLIMA_MS = 15 * 60 * 1000;
const VIGENCIA_TASAS_MS = 6 * 60 * 60 * 1000;
const URL_MAR = 'https://marine-api.open-meteo.com/v1/marine';
const URL_FERIADOS = 'https://date.nager.at/api/v3/PublicHolidays';
const URL_WIKIPEDIA = 'https://es.wikipedia.org/api/rest_v1/page/summary/';
const VIGENCIA_LARGA_MS = 24 * 60 * 60 * 1000;

/** Nombre en inglés de los feriados de respaldo. */
const NOMBRES_FERIADOS_EN = {
    'Año Nuevo': "New Year's Day", 'Día de los Santos Reyes': 'Epiphany', 'Día de la Altagracia': 'Our Lady of Altagracia',
    'Día de Duarte': 'Duarte Day', 'Día de la Independencia': 'Independence Day', 'Viernes Santo': 'Good Friday',
    'Día del Trabajo': 'Labour Day', 'Corpus Christi': 'Corpus Christi', 'Día de la Restauración': 'Restoration Day',
    'Día de las Mercedes': 'Our Lady of Mercedes', 'Día de la Constitución': 'Constitution Day', 'Navidad': 'Christmas Day'
};

/** Destinos de montaña: no tienen estado del mar. */
const DESTINOS_INTERIOR = new Set(['Jarabacoa', 'Constanza']);

/** Artículo de Wikipedia de cada destino (cuando el nombre es ambiguo). */
const ARTICULOS_WIKIPEDIA = {
    'Santo Domingo': 'Santo Domingo',
    'Punta Cana': 'Punta Cana',
    'Puerto Plata': 'San Felipe de Puerto Plata',
    'Samaná': 'Santa Bárbara de Samaná',
    'La Romana': 'La Romana (República Dominicana)',
    'Sosúa': 'Sosúa',
    'Constanza': 'Constanza (República Dominicana)',
    'Barahona': 'Santa Cruz de Barahona',
    'Montecristi': 'San Fernando de Montecristi',
    'Baní': 'Baní',
    'Pedernales': 'Pedernales (República Dominicana)',
    'Miches': 'Miches'
};

/**
 * Feriados de respaldo (Ley 139-97; los movibles ya trasladados) por si el
 * servicio no responde.
 */
const FERIADOS_RESPALDO = {
    2026: [
        ['2026-01-01', 'Año Nuevo'], ['2026-01-05', 'Día de los Santos Reyes'], ['2026-01-21', 'Día de la Altagracia'],
        ['2026-01-26', 'Día de Duarte'], ['2026-02-27', 'Día de la Independencia'], ['2026-04-03', 'Viernes Santo'],
        ['2026-05-04', 'Día del Trabajo'], ['2026-06-04', 'Corpus Christi'], ['2026-08-16', 'Día de la Restauración'],
        ['2026-09-24', 'Día de las Mercedes'], ['2026-11-09', 'Día de la Constitución'], ['2026-12-25', 'Navidad']
    ],
    2027: [
        ['2027-01-01', 'Año Nuevo'], ['2027-01-04', 'Día de los Santos Reyes'], ['2027-01-21', 'Día de la Altagracia'],
        ['2027-01-25', 'Día de Duarte'], ['2027-02-27', 'Día de la Independencia'], ['2027-03-26', 'Viernes Santo'],
        ['2027-05-03', 'Día del Trabajo'], ['2027-05-27', 'Corpus Christi'], ['2027-08-16', 'Día de la Restauración'],
        ['2027-09-24', 'Día de las Mercedes'], ['2027-11-08', 'Día de la Constitución'], ['2027-12-25', 'Navidad']
    ]
};

/** Tasas de respaldo (pesos por unidad) si el servicio no está disponible. */
const TASAS_RESPALDO = {
    USD: Number(process.env.TASA_USD) || 61,
    EUR: Number(process.env.TASA_EUR) || 71
};

const cache = new Map();

/** Petición GET con tiempo de espera; devuelve el JSON o lanza un error. */
async function obtenerJson(url) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIEMPO_ESPERA_MS);
    try {
        const respuesta = await fetch(url, { signal: controlador.signal, headers: { Accept: 'application/json', 'User-Agent': 'BookingRD/1.0 (proyecto academico; demo local)' } });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return await respuesta.json();
    } finally {
        clearTimeout(temporizador);
    }
}

/**
 * Devuelve el valor guardado si sigue vigente; si no, lo obtiene. Ante un
 * fallo devuelve el último valor conocido (actualizado: false) o null.
 */
async function conCache(clave, vigencia, obtener) {
    const guardado = cache.get(clave);
    if (guardado && Date.now() - guardado.momento < vigencia) return guardado.valor;
    try {
        const valor = await obtener();
        cache.set(clave, { valor, momento: Date.now() });
        return valor;
    } catch (error) {
        console.warn(`Servicio externo no disponible (${clave}): ${error.message}`);
        return guardado ? Object.assign({}, guardado.valor, { actualizado: false }) : null;
    }
}

/**
 * Estado del cielo a partir del código WMO de Open-Meteo.
 * https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */
function estadoClima(codigo) {
    if (codigo === 0) return { estado: 'despejado', descripcion: 'Despejado' };
    if (codigo <= 2) return { estado: 'parcial', descripcion: 'Parcialmente nublado' };
    if (codigo === 3) return { estado: 'nublado', descripcion: 'Nublado' };
    if (codigo === 45 || codigo === 48) return { estado: 'niebla', descripcion: 'Niebla' };
    if (codigo >= 95) return { estado: 'tormenta', descripcion: 'Tormenta eléctrica' };
    if ((codigo >= 51 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) {
        return { estado: 'lluvia', descripcion: codigo <= 57 ? 'Llovizna' : codigo >= 80 ? 'Aguaceros' : 'Lluvia' };
    }
    return { estado: 'nublado', descripcion: 'Nublado' };
}

/** "2026-11-12T06:41" -> "06:41" */
function horaLocal(valor) {
    return typeof valor === 'string' && valor.includes('T') ? valor.split('T')[1].slice(0, 5) : null;
}

/**
 * Clima actual y pronóstico de cuatro días de un destino.
 * @param {string} ciudad destino del catálogo
 * @returns {Promise<object|null>} null si el servicio no respondió nunca
 */
function clima(ciudad) {
    const [latitud, longitud] = COORDENADAS_DESTINOS[ciudad];
    return conCache(`clima:${ciudad}`, VIGENCIA_CLIMA_MS, async () => {
        const parametros = new URLSearchParams({
            latitude: latitud,
            longitude: longitud,
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
            timezone: 'America/Santo_Domingo',
            forecast_days: '4'
        });
        const datos = await obtenerJson(`${URL_CLIMA}?${parametros}`);
        const actual = datos.current;
        return {
            ciudad,
            actualizado: true,
            hora: actual.time,
            temperatura: Math.round(actual.temperature_2m),
            sensacion: Math.round(actual.apparent_temperature),
            humedad: actual.relative_humidity_2m,
            viento: Math.round(actual.wind_speed_10m),
            ...estadoClima(actual.weather_code),
            pronostico: datos.daily.time.map((fecha, i) => ({
                fecha,
                maxima: Math.round(datos.daily.temperature_2m_max[i]),
                minima: Math.round(datos.daily.temperature_2m_min[i]),
                lluvia: datos.daily.precipitation_probability_max[i],
                amanecer: horaLocal(datos.daily.sunrise && datos.daily.sunrise[i]),
                atardecer: horaLocal(datos.daily.sunset && datos.daily.sunset[i]),
                uv: datos.daily.uv_index_max ? Math.round(datos.daily.uv_index_max[i]) : null,
                ...estadoClima(datos.daily.weather_code[i])
            }))
        };
    });
}

/**
 * Pesos dominicanos por dólar y por euro.
 * @returns {Promise<{base: 'DOP', tasas: {USD: number, EUR: number}, fecha: string|null, fuente: string, actualizado: boolean}>}
 */
async function tasas() {
    const valor = await conCache('tasas', VIGENCIA_TASAS_MS, async () => {
        const datos = await obtenerJson(URL_TASAS);
        if (datos.result !== 'success' || !datos.rates || !datos.rates.USD || !datos.rates.EUR) {
            throw new Error('respuesta sin tasas');
        }
        // La API devuelve unidades de moneda extranjera por peso; se invierten.
        return {
            base: 'DOP',
            tasas: {
                USD: Math.round((1 / datos.rates.USD) * 100) / 100,
                EUR: Math.round((1 / datos.rates.EUR) * 100) / 100
            },
            fecha: datos.time_last_update_utc || null,
            fuente: 'ExchangeRate-API',
            actualizado: true
        };
    });
    return valor || { base: 'DOP', tasas: { ...TASAS_RESPALDO }, fecha: null, fuente: 'respaldo', actualizado: false };
}

/**
 * Estado del mar en un destino de costa: altura de las olas y temperatura
 * del agua. Devuelve null en los destinos de montaña o si no hay datos.
 */
async function mar(ciudad) {
    if (DESTINOS_INTERIOR.has(ciudad)) return null;
    const [latitud, longitud] = COORDENADAS_DESTINOS[ciudad];
    return conCache(`mar:${ciudad}`, VIGENCIA_CLIMA_MS * 2, async () => {
        const parametros = new URLSearchParams({
            latitude: latitud,
            longitude: longitud,
            current: 'wave_height,sea_surface_temperature',
            timezone: 'America/Santo_Domingo',
            cell_selection: 'sea'
        });
        const datos = await obtenerJson(`${URL_MAR}?${parametros}`);
        const actual = datos.current || {};
        if (actual.wave_height == null && actual.sea_surface_temperature == null) throw new Error('sin datos del mar');
        const olas = actual.wave_height == null ? null : Math.round(actual.wave_height * 10) / 10;
        return {
            ciudad,
            actualizado: true,
            olas,
            agua: actual.sea_surface_temperature == null ? null : Math.round(actual.sea_surface_temperature),
            estado: olas == null ? null : olas < 0.5 ? 'Mar en calma' : olas < 1.25 ? 'Oleaje suave' : olas < 2.5 ? 'Oleaje moderado' : 'Mar agitado'
        };
    });
}

/**
 * Próximos feriados de la República Dominicana a partir de hoy.
 * @param {number} [cantidad]
 */
async function feriados(cantidad = 6) {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const anio = Number(hoy.slice(0, 4));
    const delAnio = async (a) => {
        const valor = await conCache(`feriados:${a}`, VIGENCIA_LARGA_MS, async () => {
            const datos = await obtenerJson(`${URL_FERIADOS}/${a}/DO`);
            if (!Array.isArray(datos) || !datos.length) throw new Error('respuesta sin feriados');
            return { lista: datos.map((f) => ({ fecha: f.date, nombre: f.localName || f.name, nombreEn: f.name || null })), fuente: 'Nager.Date', actualizado: true };
        });
        return valor || { lista: (FERIADOS_RESPALDO[a] || []).map(([fecha, nombre]) => ({ fecha, nombre, nombreEn: NOMBRES_FERIADOS_EN[nombre] || null })), fuente: 'respaldo', actualizado: false };
    };
    const [actual, siguiente] = await Promise.all([delAnio(anio), delAnio(anio + 1)]);
    const vistos = new Set();
    const lista = actual.lista.concat(siguiente.lista)
        .filter((f) => f.fecha >= hoy && !vistos.has(f.fecha) && vistos.add(f.fecha))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .slice(0, cantidad);
    return { pais: 'DO', fuente: actual.fuente, actualizado: actual.actualizado, feriados: lista };
}

/** Resumen corto del destino en Wikipedia en español. */
function destino(ciudad) {
    const articulo = ARTICULOS_WIKIPEDIA[ciudad] || ciudad;
    return conCache(`wiki:${ciudad}`, VIGENCIA_LARGA_MS, async () => {
        const datos = await obtenerJson(URL_WIKIPEDIA + encodeURIComponent(articulo.replace(/ /g, '_')));
        if (!datos.extract) throw new Error('artículo sin resumen');
        // Primeras dos oraciones, para la ficha del mapa.
        const oraciones = datos.extract.match(/[^.!?]+[.!?]+(\s|$)/g) || [datos.extract];
        return {
            ciudad,
            actualizado: true,
            resumen: oraciones.slice(0, 2).join('').trim(),
            enlace: (datos.content_urls && datos.content_urls.desktop && datos.content_urls.desktop.page) || `https://es.wikipedia.org/wiki/${encodeURIComponent(articulo)}`
        };
    });
}

module.exports = { clima, tasas, mar, feriados, destino, estadoClima, horaLocal };
