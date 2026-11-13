/**
 * @file scripts/iniciar.js
 * @description Arranque en un paso (INICIAR-BookingRD.bat o `npm run iniciar`).
 *
 *   1. La primera vez en Windows (sin .env), configura SQL Server y crea la
 *      base BookingRD con scripts/sqlserver-windows.ps1.
 *   2. Si .env apunta a SQL Server, prueba la conexión. Si no responde, avisa
 *      y abre BookingRD con la base local en archivo para que la página
 *      funcione igual (database/local/).
 *   3. Arranca el servidor y abre el navegador en http://localhost:3000.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_ENV = path.join(RAIZ, '.env');
const SCRIPT_SQLSERVER = path.join(__dirname, 'sqlserver-windows.ps1');

/** .env que deja BookingRD con la base local cuando no se pudo configurar SQL Server. */
function escribirEnvLocal() {
    fs.writeFileSync(ARCHIVO_ENV, [
        '# SQL Server no está configurado: BookingRD usa la base local en archivo',
        '# (database/local/bookingrd-local.json), que también guarda los datos.',
        '# Para configurar SQL Server más tarde: npm run sqlserver',
        'DB_SERVER=',
        'PORT=3000',
        ''
    ].join('\n'));
}

/** true si ya hay algo escuchando en el puerto (BookingRD abierto en otra ventana). */
function puertoOcupado(puerto) {
    return new Promise((resolve) => {
        const prueba = require('net').createServer();
        prueba.once('error', () => resolve(true));
        prueba.once('listening', () => prueba.close(() => resolve(false)));
        prueba.listen(puerto);
    });
}

async function main() {
    // 0. Si BookingRD ya está abierto, solo se abre la página.
    const puerto = Number(process.env.PORT || 3000);
    if (await puertoOcupado(puerto)) {
        console.log(`  BookingRD ya está abierto. Abriendo http://localhost:${puerto} ...`);
        if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', `http://localhost:${puerto}`]);
        return;
    }

    // 1. Primera vez en Windows: SQL Server.
    if (!fs.existsSync(ARCHIVO_ENV) && process.platform === 'win32') {
        console.log('\n  Primera vez: se va a configurar SQL Server para guardar los datos de BookingRD.\n');
        // BOOKINGRD_REINSTALAR=1 (instalador final): reemplaza la base anterior sin preguntar.
        const argumentos = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_SQLSERVER];
        if (process.env.BOOKINGRD_REINSTALAR === '1') argumentos.push('-Reinstalar');
        spawnSync('powershell.exe', argumentos,
            { stdio: 'inherit', cwd: RAIZ });
        // Si el script alcanzó a escribir .env con SQL Server, se conserva aunque
        // haya terminado con error después (la conexión se prueba en el paso 2).
        const envSqlServer = fs.existsSync(ARCHIVO_ENV) && /^DB_SERVER=\S+/m.test(fs.readFileSync(ARCHIVO_ENV, 'utf8'));
        if (!envSqlServer) {
            console.log('\n  No se configuró SQL Server. BookingRD usará la base local en archivo, que también guarda los datos.');
            console.log('  Puedes intentarlo de nuevo cuando quieras con: npm run sqlserver\n');
            escribirEnvLocal();
        }
    }

    require('dotenv').config({ path: ARCHIVO_ENV });

    // 2. Conexión con SQL Server.
    if (process.env.DB_SERVER && process.env.DB_MODO !== 'demo') {
        process.stdout.write(`  Conectando con SQL Server (${process.env.DB_SERVER})... `);
        const sql = require('mssql');
        const { configuracionDB } = require('../src/config/db');
        try {
            const pool = await new sql.ConnectionPool(Object.assign({}, configuracionDB, { connectionTimeout: 20000 })).connect();
            const { recordset } = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.usuarios');
            await pool.close();
            console.log(`listo (${recordset[0].total} usuarios).`);
        } catch (error) {
            console.log('no responde.');
            console.log(`  Detalle: ${error.message}`);
            console.log('  Revisa que el servicio de SQL Server esté iniciado (Servicios de Windows) o ejecuta npm run sqlserver.');
            console.log('  Mientras tanto, BookingRD se abre con la base local en archivo.\n');
            process.env.DB_SERVER = '';
        }
    }

    // 3. Servidor y navegador.
    process.env.ABRIR_NAVEGADOR = '1';
    require('../src/server');
}

main().catch((error) => {
    console.error('No se pudo iniciar BookingRD:', error.message);
    process.exitCode = 1;
});
