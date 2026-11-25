#!/usr/bin/env node
/**
 * @file scripts/configurar-ia.js
 * @description Activa las respuestas con IA del asistente Caribe.
 *
 *   Uso: npm run ia   (en Windows: "CONFIGURAR BookingRD" > 2)
 *
 *   Pide una clave de la API de Anthropic (console.anthropic.com > API Keys),
 *   hace una consulta de prueba y la guarda en .env (ANTHROPIC_API_KEY). La
 *   aplicación toma el cambio sin reiniciarse. Sin clave, el asistente sigue
 *   funcionando con sus opciones y palabras clave.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ARCHIVO_ENV = path.join(__dirname, '..', '.env');
const CLAVES = ['ANTHROPIC_API_KEY', 'ASISTENTE_MODELO'];
const MODELO = 'claude-haiku-4-5-20251001';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Cola de líneas: funciona igual escribiendo en la ventana o con la entrada redirigida.
const lineas = [];
const esperando = [];
rl.on('line', (l) => (esperando.length ? esperando.shift()(l) : lineas.push(l)));
rl.on('close', () => { while (esperando.length) esperando.shift()(''); });
const leerLinea = () => new Promise((resolver) => (lineas.length ? resolver(lineas.shift()) : esperando.push(resolver)));

async function preguntar(texto) {
    process.stdout.write(texto);
    return (await leerLinea()).trim();
}

/** Pregunta sin mostrar lo que se escribe (para la clave). */
async function preguntarOculto(texto) {
    process.stdout.write(texto);
    const escribir = rl._writeToOutput;
    rl._writeToOutput = (cadena) => escribir.call(rl, cadena.replace(/[^\r\n]/g, '*'));
    const respuesta = await leerLinea();
    rl._writeToOutput = escribir;
    if (process.stdin.isTTY) process.stdout.write('\n');
    return respuesta.trim();
}

function guardarEnv(valores) {
    let lineas = [];
    try { lineas = fs.readFileSync(ARCHIVO_ENV, 'utf8').split(/\r?\n/); } catch { /* .env nuevo */ }
    lineas = lineas.filter((l) => !CLAVES.some((c) => l.startsWith(`${c}=`)) && l !== '# Asistente con IA (npm run ia)');
    while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
    const nuevas = Object.entries(valores).map(([c, v]) => `${c}=${v}`);
    if (nuevas.length) lineas.push('', '# Asistente con IA (npm run ia)', ...nuevas);
    fs.writeFileSync(ARCHIVO_ENV, `${lineas.join('\n')}\n`, 'utf8');
}

async function main() {
    console.log('\n  BookingRD: asistente Caribe con IA');
    console.log('  ==================================\n');
    console.log('  Con una clave de la API de Anthropic, Caribe responde preguntas libres');
    console.log('  ("¿qué hotel me recomiendas en Samaná para una pareja?") usando los datos');
    console.log('  del catálogo. Cada pregunta tiene un costo pequeño en tu cuenta de Anthropic.');
    console.log('  Sin clave, el asistente sigue funcionando con sus opciones.\n');
    console.log('  1. Activar o cambiar la clave');
    console.log('  2. Desactivar la IA\n');
    const opcion = await preguntar('  Elige 1 o 2: ');
    if (opcion === '2') {
        guardarEnv({});
        console.log('\n  Listo: el asistente usa solo sus opciones.\n');
        return;
    }
    console.log('\n  Crea la clave en https://console.anthropic.com > API Keys (empieza con sk-ant-).');
    const clave = (await preguntarOculto('  Clave de la API: ')).replace(/\s+/g, '');
    if (!/^sk-ant-/.test(clave)) {
        console.log('\n  Esa clave no tiene el formato esperado (sk-ant-...). No se cambió nada.\n');
        process.exitCode = 1;
        return;
    }
    console.log('\n  Probando la clave...');
    try {
        const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
        const respuesta = await fetch(`${base}/v1/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: MODELO, max_tokens: 30, messages: [{ role: 'user', content: 'Di "listo" en una palabra.' }] })
        });
        if (!respuesta.ok) {
            const detalle = await respuesta.text();
            console.log(`\n  La API respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
            console.log('  Revisa la clave y que la cuenta tenga saldo. No se cambió nada.\n');
            process.exitCode = 1;
            return;
        }
    } catch (error) {
        console.log(`\n  No se pudo conectar con la API: ${error.message}. Revisa la conexión a internet.\n`);
        process.exitCode = 1;
        return;
    }
    guardarEnv({ ANTHROPIC_API_KEY: clave, ASISTENTE_MODELO: MODELO });
    console.log('\n  Listo. El asistente Caribe ya responde con IA. No hace falta reiniciar BookingRD.\n');
}

main().catch((e) => { console.error(`\n  Error: ${e.message}\n`); process.exitCode = 1; }).finally(() => rl.close());
