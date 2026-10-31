/**
 * @file scripts/bd.js
 * @description Utilidades de base de datos por línea de comandos. Usan las
 *   credenciales de .env, por lo que operan sobre la misma base que el
 *   servidor (local o compartida en Azure SQL).
 *
 * Comandos:
 *   npm run bd:probar    Verifica la conexión y muestra el conteo de registros por tabla.
 *   npm run bd:instalar  Ejecuta database/instalacion-completa.sql desde el marcador
 *                        "@inicio-esquema" (tablas, índices y datos de demostración).
 *                        Idempotente: puede ejecutarse varias veces.
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { obtenerPool, configuracionDB } = require('../src/config/db');

const ARCHIVO_SQL = path.join(__dirname, '..', 'database', 'instalacion-completa.sql');
const MARCADOR = '-- @inicio-esquema';
const TABLAS = ['usuarios', 'empresas', 'imagenes', 'hoteles', 'actividades', 'reservas', 'mensajes_contacto'];

/**
 * Extrae los lotes (batches) a ejecutar: contenido posterior al marcador,
 * dividido por las líneas "GO" (separador de lotes de SSMS/sqlcmd, no es T-SQL).
 * @returns {string[]}
 */
function leerLotes() {
    const contenido = fs.readFileSync(ARCHIVO_SQL, 'utf8').replace(/^﻿/, '');
    const inicio = contenido.indexOf(MARCADOR);
    if (inicio === -1) {
        throw new Error(`No se encontró el marcador "${MARCADOR}" en database/instalacion-completa.sql.`);
    }
    return contenido
        .slice(inicio)
        .split(/^\s*GO\s*$/im)
        .map((lote) => lote.trim())
        .filter((lote) => lote.replace(/--.*$/gm, '').trim().length > 0);
}

/** Ejecuta los lotes del esquema en orden y detiene el proceso ante el primer error. */
async function instalar() {
    const pool = await obtenerPool();
    const lotes = leerLotes();
    console.log(`Ejecutando ${lotes.length} lotes en ${configuracionDB.server} / ${configuracionDB.database}...`);

    for (let i = 0; i < lotes.length; i++) {
        try {
            await pool.request().batch(lotes[i]);
        } catch (error) {
            console.error(`Error en el lote ${i + 1} de ${lotes.length}: ${error.message}`);
            console.error(lotes[i].split('\n').slice(0, 6).join('\n'));
            throw error;
        }
    }
    console.log('Esquema y datos de demostración instalados.');
    console.log('Cuentas: admin@bookingrd.com (Admin123!), cliente@bookingrd.com (Cliente123!), empresa@bookingrd.com (Empresa123!).');
    await probar();
}

/** Muestra servidor, base de datos y cantidad de registros por tabla. */
async function probar() {
    const pool = await obtenerPool();
    const info = await pool.request().query('SELECT DB_NAME() AS base, @@VERSION AS version');
    console.log(`Base de datos: ${info.recordset[0].base}`);
    console.log(info.recordset[0].version.split('\n')[0]);

    for (const tabla of TABLAS) {
        const existe = await pool.request()
            .input('tabla', `dbo.${tabla}`)
            .query("SELECT OBJECT_ID(@tabla, 'U') AS id");
        if (!existe.recordset[0].id) {
            console.log(`  ${tabla.padEnd(16)} (no existe; ejecutar npm run bd:instalar)`);
            continue;
        }
        const conteo = await pool.request().query(`SELECT COUNT(*) AS total FROM dbo.${tabla}`);
        console.log(`  ${tabla.padEnd(16)} ${conteo.recordset[0].total} registros`);
    }
}

const COMANDOS = { instalar, probar };
const comando = COMANDOS[process.argv[2]];

if (!comando) {
    console.error('Uso: node scripts/bd.js <instalar|probar>');
    process.exit(1);
}

comando()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Operación fallida:', error.message);
        process.exit(1);
    });
