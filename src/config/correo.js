/**
 * @file src/config/correo.js
 * @description Transporte de correo electrónico (nodemailer).
 *
 *   Con SMTP_HOST definido en .env se envía por ese servidor SMTP (Gmail,
 *   Outlook, SendGrid, Mailgun, Brevo...). Sin SMTP_HOST, el correo no sale:
 *   se guarda como página HTML en CORREO_CARPETA (por defecto
 *   correos-enviados/) para revisarlo durante el desarrollo.
 *
 *   Variables: SMTP_HOST, SMTP_PORT (587 o 465), SMTP_SEGURO (true con 465),
 *   SMTP_USUARIO, SMTP_CLAVE, CORREO_REMITENTE, URL_SITIO, CORREO_CARPETA.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

let transporte = null;

/** true si hay un servidor SMTP configurado. */
const smtpConfigurado = () => Boolean(process.env.SMTP_HOST);

/** Remitente de los correos ("BookingRD <no-responder@...>"). */
function remitente() {
    return process.env.CORREO_REMITENTE || `BookingRD <${process.env.SMTP_USUARIO || 'no-responder@bookingrd.com'}>`;
}

/** Dirección pública del sitio, para los enlaces de los correos. */
function urlSitio() {
    return (process.env.URL_SITIO || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function obtenerTransporte() {
    if (transporte) return transporte;
    const puerto = Number(process.env.SMTP_PORT) || 587;
    transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: puerto,
        secure: process.env.SMTP_SEGURO ? process.env.SMTP_SEGURO === 'true' : puerto === 465,
        auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE } : undefined,
        // Un servidor de correo lento no debe retener la respuesta de la API.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
    return transporte;
}

/** Carpeta donde se guardan los correos cuando no hay SMTP. */
function carpetaCorreos() {
    return path.resolve(__dirname, '..', '..', process.env.CORREO_CARPETA || 'correos-enviados');
}

/**
 * Envía un correo, o lo guarda en la carpeta de desarrollo si no hay SMTP.
 * @param {{para: string, asunto: string, html: string, texto: string}} mensaje
 * @returns {Promise<{modo: 'smtp'|'archivo', id?: string, archivo?: string}>}
 */
async function enviar({ para, asunto, html, texto }) {
    if (smtpConfigurado()) {
        const info = await obtenerTransporte().sendMail({ from: remitente(), to: para, subject: asunto, html, text: texto });
        return { modo: 'smtp', id: info.messageId };
    }
    const carpeta = carpetaCorreos();
    await fs.promises.mkdir(carpeta, { recursive: true });
    const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${para.replace(/[^a-z0-9]+/gi, '_')}.html`;
    const archivo = path.join(carpeta, nombre);
    const encabezado = `<!-- Para: ${para}\n     Asunto: ${asunto}\n     (correo guardado porque SMTP_HOST no está configurado) -->\n`;
    await fs.promises.writeFile(archivo, encabezado + html, 'utf8');
    return { modo: 'archivo', archivo };
}

module.exports = { enviar, smtpConfigurado, urlSitio, carpetaCorreos };
