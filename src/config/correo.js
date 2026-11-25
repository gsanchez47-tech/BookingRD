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

/*
 * La configuración del correo se puede cambiar con la aplicación abierta
 * (npm run correo / CONFIGURAR CORREO): antes de cada envío se vuelve a leer
 * .env si cambió, sin reiniciar el servidor.
 */
const ARCHIVO_ENV = path.resolve(__dirname, '..', '..', '.env');
const CLAVES_CORREO = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SEGURO', 'SMTP_USUARIO', 'SMTP_CLAVE', 'CORREO_REMITENTE', 'URL_SITIO', 'ANTHROPIC_API_KEY', 'ASISTENTE_MODELO', 'ANTHROPIC_BASE_URL'];
let marcaEnv = null;

function recargarConfiguracion() {
    let marca;
    try {
        marca = fs.statSync(ARCHIVO_ENV).mtimeMs;
    } catch {
        return;
    }
    if (marcaEnv === null) {
        marcaEnv = marca;
        return;
    }
    if (marca === marcaEnv) return;
    marcaEnv = marca;
    try {
        const valores = require('dotenv').parse(fs.readFileSync(ARCHIVO_ENV));
        for (const clave of CLAVES_CORREO) {
            if (valores[clave] !== undefined) process.env[clave] = valores[clave];
            else delete process.env[clave];
        }
        transporte = null;
        console.log('  Configuración de correo actualizada desde .env.');
    } catch (error) {
        console.error(`No se pudo leer .env: ${error.message}`);
    }
}

/** true si hay un servidor SMTP configurado. */
const smtpConfigurado = () => {
    recargarConfiguracion();
    return Boolean(process.env.SMTP_HOST);
};

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
/**
 * Dominios de las cuentas de ejemplo (database/datos-demo.js): no existen, así
 * que sus correos se guardan en la PC aunque haya SMTP, para no generar rebotes.
 */
const DOMINIOS_DEMO = ['bookingrd.com', 'correo.com', 'ejemplo.com'];
const esCorreoDeEjemplo = (para) => DOMINIOS_DEMO.includes(String(para).split('@').pop().toLowerCase());

async function enviar({ para, asunto, html, texto, adjuntos = [] }) {
    if (smtpConfigurado() && !esCorreoDeEjemplo(para)) {
        const info = await obtenerTransporte().sendMail({ from: remitente(), to: para, subject: asunto, html, text: texto, attachments: adjuntos });
        return { modo: 'smtp', id: info.messageId };
    }
    return guardarEnArchivo({ para, asunto, html, adjuntos });
}

/**
 * Guarda el correo como HTML (sin SMTP, o como respaldo si el servidor de
 * correo falla). Las imágenes incrustadas (cid:) se convierten en data: URI
 * para que se vean al abrir el archivo.
 */
async function guardarEnArchivo({ para, asunto, html, adjuntos = [] }) {
    for (const a of adjuntos) {
        if (!a.cid || !a.path) continue;
        try {
            const datos = await fs.promises.readFile(a.path);
            const tipo = /\.png$/i.test(a.path) ? 'image/png' : 'image/jpeg';
            html = html.split(`cid:${a.cid}`).join(`data:${tipo};base64,${datos.toString('base64')}`);
        } catch {
            /* imagen no disponible: el correo se guarda sin ella */
        }
    }
    const carpeta = carpetaCorreos();
    await fs.promises.mkdir(carpeta, { recursive: true });
    const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${para.replace(/[^a-z0-9]+/gi, '_')}.html`;
    const archivo = path.join(carpeta, nombre);
    const encabezado = `<!-- Para: ${para}\n     Asunto: ${asunto}\n     (correo guardado porque SMTP_HOST no está configurado) -->\n`;
    await fs.promises.writeFile(archivo, encabezado + html, 'utf8');
    return { modo: 'archivo', archivo };
}

/** Comprueba la conexión y el usuario con el servidor SMTP. */
async function verificarSmtp() {
    if (!smtpConfigurado()) return false;
    await obtenerTransporte().verify();
    return true;
}

module.exports = { enviar, esCorreoDeEjemplo, guardarEnArchivo, verificarSmtp, smtpConfigurado, urlSitio, carpetaCorreos, remitente };
