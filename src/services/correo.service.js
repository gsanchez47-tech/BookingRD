/**
 * @file src/services/correo.service.js
 * @description Correos automáticos de BookingRD: bienvenida al registrarse
 *   (viajero o empresa) y confirmación de cada reserva.
 *
 *   Los envíos no bloquean la respuesta de la API ni la hacen fallar: si el
 *   servidor de correo no responde, el registro o la reserva siguen siendo
 *   válidos y el error queda en la consola del servidor.
 */

const fs = require('fs');
const path = require('path');
const correo = require('../config/correo');
const plantillas = require('../correos/plantillas');
const { EXTRAS_VEHICULO } = require('../utils/catalogos');
const { notificacionesRepo } = require('../repositories');

const CARPETA_PUBLICA = path.join(__dirname, '..', '..', 'public');

/** Envía en segundo plano y registra el resultado en la consola. */
function enviarSinEsperar(para, mensaje, motivo) {
    return correo.enviar({ para, ...mensaje })
        .then((resultado) => {
            if (resultado.modo === 'archivo') console.log(`Correo (${motivo}) guardado en ${resultado.archivo}`);
            else console.log(`Correo (${motivo}) enviado a ${para}`);
        })
        .catch((error) => {
            console.error(`No se pudo enviar el correo (${motivo}) a ${para}: ${error.message}`);
            return correo.guardarEnArchivo({ para, ...mensaje }).catch(() => {});
        });
}

/**
 * Foto de la publicación para incrustarla en el correo (solo las fotografías
 * guardadas en public/img; las subidas por empresas viven en la base).
 */
function fotoDe(imagenUrl) {
    if (!imagenUrl || !/^img\/[\w/.-]+\.(jpe?g|png)$/i.test(imagenUrl)) return { foto: false, adjuntos: [] };
    const ruta = path.join(CARPETA_PUBLICA, imagenUrl);
    if (!ruta.startsWith(CARPETA_PUBLICA) || !fs.existsSync(ruta)) return { foto: false, adjuntos: [] };
    return { foto: true, adjuntos: [{ filename: path.basename(ruta), path: ruta, cid: 'foto' }] };
}

/** Aviso en la campana del encabezado (no bloquea ni falla la operación). */
function avisoEnCampana(idUsuario, tipo, titulo, mensaje, enlace) {
    if (!idUsuario) return;
    notificacionesRepo.crear({ idUsuario, tipo, titulo, mensaje, enlace })
        .catch((error) => console.error(`No se pudo guardar el aviso (${tipo}): ${error.message}`));
}

const formatoFecha = (iso) => new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

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
async function confirmacionReserva(cliente, reserva, publicacion) {
    const fecha = formatoFecha;
    const empresa = await notificacionesRepo.empresaDePublicacion(reserva.tipo, reserva.idPublicacion).catch(() => null);
    const { foto, adjuntos } = fotoDe(empresa && empresa.imagenUrl);
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
    if (reserva.comboNombre) detalle.unshift(['Combo', `${reserva.comboNombre} (precio con descuento)`]);
    if (reserva.pago && reserva.pago.metodo === 'tarjeta') {
        detalle.push(['Pago', `${reserva.pago.marca} terminada en ${reserva.pago.ultimos4} (simulado)`], ['Referencia del pago', reserva.pago.referencia]);
        if (reserva.pago.moneda === 'USD') {
            const dolares = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
            detalle.push(['Cobrado en dólares', `${dolares.format(reserva.pago.montoCobrado)} (1 US$ = RD$${reserva.pago.tasa.toFixed(2)})`]);
        }
    } else if (reserva.pago) {
        detalle.push(['Pago', 'En el destino, al llegar (en pesos o en dólares a la tasa del día)']);
    }
    const pagado = Boolean(reserva.pago && reserva.pago.metodo === 'tarjeta');
    const mensaje = plantillas.confirmacionReserva({
        nombre: cliente.nombre, codigo: reserva.codigo, publicacion: publicacion.nombre,
        fechas, detalle, total: reserva.total, avisos, urlSitio: correo.urlSitio(), foto, pagado
    });
    enviarSinEsperar(cliente.correo, { ...mensaje, adjuntos }, `reserva ${reserva.codigo}`);
    avisoEnCampana(cliente.idUsuario, 'reserva', `Reserva confirmada ${reserva.codigo}`,
        `${publicacion.nombre}, ${fechas}. Te enviamos la confirmación a ${cliente.correo}.`, 'mis-reservas.html');

    // Aviso a la empresa dueña de la publicación.
    if (empresa) {
        const detalleEmpresa = detalle.filter(([etiqueta]) => !/^(Pago|Referencia del pago|Cobrado en dólares)$/.test(etiqueta));
        const pago = pagado ? `Pagado con tarjeta (${reserva.pago.marca} •••• ${reserva.pago.ultimos4})` : 'Por cobrar en el destino';
        const aviso = plantillas.reservaRecibida({
            nombreEmpresa: empresa.nombreComercial, cliente: cliente.nombre, codigo: reserva.codigo, publicacion: publicacion.nombre,
            fechas, detalle: detalleEmpresa, total: reserva.total, pago, urlSitio: correo.urlSitio(), foto
        });
        enviarSinEsperar(empresa.correo, { ...aviso, adjuntos }, `aviso a la empresa ${reserva.codigo}`);
        avisoEnCampana(empresa.idUsuario, 'reserva-recibida', `Reserva nueva ${reserva.codigo}`,
            `${cliente.nombre} reservó ${publicacion.nombre} (${fechas}).`, 'panel-empresa.html#reservas');
    }
}

/** Recordatorio un día antes (lo envía el programador de avisos). */
function recordatorio(aviso, clima) {
    const fechas = aviso.fechaFin && aviso.fechaFin !== aviso.fechaInicio
        ? `${formatoFecha(aviso.fechaInicio)} al ${formatoFecha(aviso.fechaFin)}` : formatoFecha(aviso.fechaInicio);
    const { foto, adjuntos } = fotoDe(aviso.imagenUrl);
    const mensaje = plantillas.recordatorioReserva({
        nombre: aviso.cliente, codigo: aviso.codigo, publicacion: aviso.publicacion, ciudad: aviso.ciudad,
        fechas, lugar: aviso.lugar, clima, urlSitio: correo.urlSitio(), foto
    });
    avisoEnCampana(aviso.idUsuario, 'recordatorio', `Mañana: ${aviso.publicacion}`,
        `Tu reserva ${aviso.codigo} en ${aviso.ciudad} empieza mañana.${clima ? ` Pronóstico: ${clima}.` : ''}`, 'mis-reservas.html');
    return enviarSinEsperar(aviso.correo, { ...mensaje, adjuntos }, `recordatorio ${aviso.codigo}`);
}

/** Solicitud de reseña al terminar (la envía el programador de avisos). */
function solicitudResena(aviso) {
    const { foto, adjuntos } = fotoDe(aviso.imagenUrl);
    const mensaje = plantillas.pedirResena({ nombre: aviso.cliente, publicacion: aviso.publicacion, urlSitio: correo.urlSitio(), foto });
    avisoEnCampana(aviso.idUsuario, 'resena', `¿Qué tal ${aviso.publicacion}?`,
        'Cuéntanos cómo te fue: tu reseña ayuda a otros viajeros.', 'mis-reservas.html#resenas');
    return enviarSinEsperar(aviso.correo, { ...mensaje, adjuntos }, `reseña ${aviso.codigo}`);
}

module.exports = { bienvenida, confirmacionReserva, recordatorio, solicitudResena, avisoEnCampana, enviarSinEsperar };
