/**
 * @file src/services/avisos.service.js
 * @description Correos programados: recordatorio un día antes de cada reserva
 *   (con el pronóstico del destino) y solicitud de reseña al terminar.
 *
 *   Se revisa al arrancar el servidor y cada 30 minutos. Cada reserva recibe
 *   cada correo una sola vez (columnas recordatorio_enviado y resena_pedida).
 */

const { notificacionesRepo } = require('../repositories');
const correoService = require('./correo.service');
const externos = require('./externos.service');
const { hoy, sumarDias } = require('../utils/fechas');

const INTERVALO_MS = 30 * 60 * 1000;
let temporizador = null;
let revisando = false;

/** Pronóstico de mañana en una línea ("Parcialmente nublado, 24 a 31 °C"). */
async function pronosticoDeManana(ciudad, fecha) {
    try {
        const datos = await externos.clima(ciudad);
        const dia = (datos.pronostico || []).find((d) => d.fecha === fecha);
        if (!dia) return null;
        const lluvia = dia.lluvia ? `, ${dia.lluvia} % de probabilidad de lluvia` : '';
        return `${dia.descripcion || dia.estado || 'Pronóstico'}, ${dia.minima} a ${dia.maxima} °C${lluvia}`;
    } catch {
        return null;
    }
}

async function revisar() {
    if (revisando) return;
    revisando = true;
    try {
        const fechaHoy = hoy();
        const manana = sumarDias(fechaHoy, 1);
        for (const aviso of await notificacionesRepo.paraRecordatorio(manana)) {
            await notificacionesRepo.marcarRecordatorio(aviso.id);
            await correoService.recordatorio(aviso, await pronosticoDeManana(aviso.ciudad, manana));
        }
        for (const aviso of await notificacionesRepo.paraResena(sumarDias(fechaHoy, -7), sumarDias(fechaHoy, -1))) {
            await notificacionesRepo.marcarResenaPedida(aviso.id);
            await correoService.solicitudResena(aviso);
        }
    } catch (error) {
        console.error(`No se pudieron revisar los avisos programados: ${error.message}`);
    } finally {
        revisando = false;
    }
}

function iniciar() {
    if (temporizador || process.env.AVISOS_DESACTIVADOS === '1') return;
    setTimeout(revisar, 15000).unref();
    temporizador = setInterval(revisar, INTERVALO_MS);
    temporizador.unref();
}

module.exports = { iniciar, revisar };
