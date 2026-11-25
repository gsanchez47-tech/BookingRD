#!/usr/bin/env node
/**
 * @file scripts/configurar-correo.js
 * @description Configura el envío real de correos (código de verificación,
 *   enlace para recuperar la contraseña, confirmación de reservas y avisos).
 *
 *   Uso: npm run correo   (en Windows: "CONFIGURAR CORREO" del menú Inicio)
 *
 *   Pide la cuenta de Gmail y una contraseña de aplicación, comprueba la
 *   conexión con el servidor de Gmail, manda un correo de prueba y guarda la
 *   configuración en .env. La aplicación toma el cambio sin reiniciarse.
 *   La contraseña solo se guarda en .env de esta computadora.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const nodemailer = require('nodemailer');

const ARCHIVO_ENV = path.join(__dirname, '..', '.env');
const CLAVES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SEGURO', 'SMTP_USUARIO', 'SMTP_CLAVE', 'CORREO_REMITENTE'];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (texto) => new Promise((resolver) => rl.question(texto, (r) => resolver(r.trim())));

/** Pregunta sin mostrar lo que se escribe (para la contraseña). */
function preguntarOculto(texto) {
    return new Promise((resolver) => {
        const escribir = rl._writeToOutput;
        rl._writeToOutput = (cadena) => {
            if (cadena.includes(texto)) escribir.call(rl, cadena);
            else escribir.call(rl, cadena.replace(/[^\r\n]/g, '*'));
        };
        rl.question(texto, (respuesta) => {
            rl._writeToOutput = escribir;
            process.stdout.write('\n');
            resolver(respuesta.trim());
        });
    });
}

function leerEnv() {
    try {
        return fs.readFileSync(ARCHIVO_ENV, 'utf8');
    } catch {
        return '';
    }
}

/** Reemplaza o agrega claves en .env conservando el resto del archivo. */
function guardarEnv(valores) {
    let lineas = leerEnv().split(/\r?\n/).filter((l) => !CLAVES.some((c) => l.startsWith(`${c}=`)));
    while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
    lineas = lineas.filter((l) => l !== '# Correo (npm run correo)');
    const nuevas = Object.entries(valores).filter(([, v]) => v !== undefined).map(([c, v]) => `${c}=${v}`);
    if (nuevas.length) lineas.push('', '# Correo (npm run correo)', ...nuevas);
    fs.writeFileSync(ARCHIVO_ENV, `${lineas.join('\n')}\n`, 'utf8');
}

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

function plantillaPrueba(correo) {
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#EEF3F8;font-family:Segoe UI,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#003087;padding:18px 24px;color:#fff;font-size:22px;font-weight:700;font-family:Georgia,serif;">Booking<span style="color:#FF8C99;">RD</span></td></tr>
<tr><td style="height:4px;background:#CE1126;"></td></tr>
<tr><td style="padding:24px;color:#0F1B33;font-size:15px;line-height:24px;">
<h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:24px;">El correo de BookingRD ya funciona</h1>
Desde ahora los viajeros y las empresas reciben en su bandeja de entrada el código para crear la cuenta, el enlace para recuperar la contraseña y la confirmación de cada reserva.<br><br>
Cuenta que envía: <strong>${correo}</strong>
</td></tr></table></td></tr></table></body></html>`;
    return { html, texto: `El correo de BookingRD ya funciona. Cuenta que envía: ${correo}` };
}

async function main() {
    console.log('\n  BookingRD: configurar el envío de correos');
    console.log('  =========================================\n');
    const actual = leerEnv().match(/^SMTP_USUARIO=(.*)$/m);
    if (actual) console.log(`  Ahora se envía desde: ${actual[1]}\n`);
    console.log('  1. Gmail (recomendado)');
    console.log('  2. Otro servidor de correo (SMTP)');
    console.log('  3. Desactivar el envío real (los correos se guardan en la PC)\n');
    const opcion = await preguntar('  Elige 1, 2 o 3: ');

    if (opcion === '3') {
        guardarEnv({});
        console.log('\n  Listo: los correos se guardan en la PC y la página muestra "Abrir el correo".\n');
        return;
    }

    let host = 'smtp.gmail.com';
    let puerto = 465;
    if (opcion === '2') {
        host = await preguntar('  Servidor SMTP (por ejemplo smtp.office365.com): ');
        puerto = Number(await preguntar('  Puerto (465 o 587): ')) || 587;
    } else {
        console.log('\n  Necesitas una "contraseña de aplicación" de Google (no es tu contraseña normal):');
        console.log('   a) Activa la verificación en dos pasos en https://myaccount.google.com/security');
        console.log('   b) Crea la contraseña en https://myaccount.google.com/apppasswords');
        console.log('      (nombre: BookingRD). Google muestra 16 letras: cópialas.\n');
    }

    let correo = '';
    while (!correoValido(correo)) {
        correo = (await preguntar('  Correo que enviará los mensajes: ')).toLowerCase();
        if (!correoValido(correo)) console.log('  Escribe un correo válido, por ejemplo bookingrd.demo@gmail.com');
    }
    let clave = '';
    while (!clave) clave = (await preguntarOculto('  Contraseña de aplicación: ')).replace(/\s+/g, '');

    console.log('\n  Comprobando la conexión...');
    const transporte = nodemailer.createTransport({
        host, port: puerto, secure: puerto === 465,
        auth: { user: correo, pass: clave },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
    });
    try {
        await transporte.verify();
    } catch (error) {
        console.log(`\n  No se pudo entrar a ${host}: ${error.message}`);
        if (/535|Username and Password|BadCredentials|Invalid login/i.test(error.message)) {
            console.log('  El correo o la contraseña de aplicación no son correctos. Crea una nueva en');
            console.log('  https://myaccount.google.com/apppasswords y vuelve a intentarlo.');
        } else {
            console.log('  Revisa la conexión a internet (o que el antivirus no bloquee el puerto) y vuelve a intentarlo.');
        }
        console.log('  No se cambió nada.\n');
        process.exitCode = 1;
        return;
    }

    const destino = (await preguntar(`  ¿A qué correo mando la prueba? (Enter = ${correo}): `)) || correo;
    try {
        const prueba = plantillaPrueba(correo);
        await transporte.sendMail({ from: `BookingRD <${correo}>`, to: destino, subject: 'BookingRD: el correo ya funciona', html: prueba.html, text: prueba.texto });
    } catch (error) {
        console.log(`\n  La conexión funcionó, pero el correo de prueba no salió: ${error.message}`);
        console.log('  No se cambió nada.\n');
        process.exitCode = 1;
        return;
    }

    guardarEnv({
        SMTP_HOST: host,
        SMTP_PORT: String(puerto),
        SMTP_SEGURO: String(puerto === 465),
        SMTP_USUARIO: correo,
        SMTP_CLAVE: clave,
        CORREO_REMITENTE: `BookingRD <${correo}>`
    });
    console.log(`\n  Listo. Se envió un correo de prueba a ${destino} (mira también en Spam o Promociones).`);
    console.log('  Desde ahora todos los correos de BookingRD salen de verdad. No hace falta reiniciar.\n');
}

main()
    .catch((error) => {
        console.error(`\n  Error: ${error.message}\n`);
        process.exitCode = 1;
    })
    .finally(() => rl.close());
