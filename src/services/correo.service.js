/**
 * @file src/services/correo.service.js
 * @description Correos automáticos de BookingRD: bienvenida al registrarse
 *   (viajero o empresa) y confirmación de cada reserva.
 *
 *   Los envíos no bloquean la respuesta de la API ni la hacen fallar: si el
 *   servidor de correo no responde, el registro o la reserva siguen siendo
 *   válidos y el error queda en la consola del servidor.
 */

const correo = require('../config/correo');
const plantillas = require('../correos/plantillas');
const { EXTRAS_VEHICULO } = require('../utils/catalogos');

/** Envía en segundo plano y registra el resultado en la consola. */
function enviarSinEsperar(para, mensaje, motivo) {
    correo.enviar({ para, ...mensaje })
        .then((resultado) => {
            if (resultado.modo === 'archivo') console.log(`Correo (${motivo}) guardado en ${resultado.archivo}`);
        })
        .catch((error) => console.error(`No se pudo enviar el correo (${motivo}) a ${para}: ${error.message}`));
}

/**
 * Correo de bienvenida tras el registro.
 * @param {{nombre: string, correo: string, rol: string}} usuario
 * @param {{nombreComercial: string, tipoServicio: string}|null} empresa
 */
function bienvenida(usuario, empresa) {
    const urlSitio = correo.urlSitio();
    const mensaje = empresa
        ? plantillas.bienvenidaEmpresa({ nombre: usuario.nombre, nombreComercial: empresa.nombreComercial, tipoServicio: empresa.tipoServicio, urlSitio })
        : plantillas.bienvenidaViajero({ nombre: usuario.nombre, correo: usuario.correo, urlSitio });
    enviarSinEsperar(usuario.correo, mensaje, 'bienvenida');
}

/**
 * Confirmación de una reserva recién creada.
 * @param {{nombre: string, correo: string}} cliente
 * @param {object} reserva  datos guardados (codigo, tipo, fechas, horas, cantidades, total...)
 * @param {object} publicacion  datos de la publicación bloqueada (nombre, ciudad, deposito...)
 */
function confirmacionReserva(cliente, reserva, publicacion) {
    const fecha = (iso) => new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    const moneda = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 });
    let fechas;
    const detalle = [];
    const avisos = [];
    if (reserva.tipo === 'hotel') {
        fechas = `${fecha(reserva.fechaInicio)} al ${fecha(reserva.fechaFin)}`;
        detalle.push(['Habitaciones', String(reserva.habitaciones)], ['Personas', String(reserva.personas)]);
    } else if (reserva.tipo === 'vehiculo') {
        fechas = `${fecha(reserva.fechaInicio)} ${reserva.horaInicio} al ${fecha(reserva.fechaFin)} ${reserva.horaFin}`;
        detalle.push(['Devolución en', reserva.ciudadDevolucion || publicacion.ciudad], ['Edad del conductor', `${reserva.edadConductor} años`]);
        if (reserva.extras && reserva.extras.length) detalle.push(['Extras', reserva.extras.map((c) => (EXTRAS_VEHICULO[c] || { nombre: c }).nombre).join(', ')]);
        if (publicacion.deposito) avisos.push(`Al recoger el auto se retiene un depósito reembolsable de ${moneda.format(publicacion.deposito)} en tu tarjeta de crédito. Lleva tu licencia de conducir y un documento de identidad.`);
    } else {
        fechas = fecha(reserva.fechaInicio);
        detalle.push(['Personas', String(reserva.personas)]);
    }
    const mensaje = plantillas.confirmacionReserva({
        nombre: cliente.nombre, codigo: reserva.codigo, publicacion: publicacion.nombre,
        fechas, detalle, total: reserva.total, avisos, urlSitio: correo.urlSitio()
    });
    enviarSinEsperar(cliente.correo, mensaje, `reserva ${reserva.codigo}`);
}

module.exports = { bienvenida, confirmacionReserva };
