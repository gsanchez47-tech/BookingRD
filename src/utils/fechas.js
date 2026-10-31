/**
 * @file src/utils/fechas.js
 * @description Fechas de calendario en formato ISO (AAAA-MM-DD) según la
 *   zona horaria de República Dominicana (UTC-4, sin horario de verano).
 *   Se trabaja con fechas sin hora para que el resultado no dependa de la
 *   zona horaria del equipo que ejecuta el servidor.
 */

const ZONA_HORARIA = 'America/Santo_Domingo';
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** @returns {string} fecha actual en República Dominicana, AAAA-MM-DD. */
function hoy() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date());
}

/** @returns {boolean} true si el valor es una fecha de calendario válida AAAA-MM-DD. */
function esFechaValida(valor) {
    if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) return false;
    const fecha = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/** @returns {number} días de `desde` a `hasta` (positivo si hasta es posterior). */
function diferenciaDias(desde, hasta) {
    return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA);
}

/** @returns {string} fecha resultante de sumar `dias` a `fecha`. */
function sumarDias(fecha, dias) {
    return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/**
 * Normaliza una fecha devuelta por el driver (objeto Date en UTC para
 * columnas DATE) o una cadena a AAAA-MM-DD.
 */
function aIso(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor).slice(0, 10);
}

/** Hora devuelta por el driver (Date en UTC) o cadena, a HH:MM. */
function horaIso(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString().slice(11, 16);
    return String(valor).slice(0, 5);
}

module.exports = { hoy, esFechaValida, diferenciaDias, sumarDias, aIso, horaIso };
