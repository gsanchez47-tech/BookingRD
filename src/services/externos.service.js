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
        const respuesta = await fetch(url, { signal: controlador.signal, headers: { Accept: 'application/json' } });
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
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
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

module.exports = { clima, tasas, estadoClima };
