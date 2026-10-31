/**
 * @file scripts/configurar-azure.js
 * @description Asistente de configuración para la base compartida en Azure SQL
 *   Database. Ejecución: `npm run configurar`.
 *
 * Pasos:
 *   1. Solicita servidor, base de datos, usuario y contraseña.
 *   2. Genera .env (con JWT_SECRET aleatorio si no existe uno previo).
 *   3. Prueba la conexión. Si el firewall de Azure rechaza la IP del equipo,
 *      muestra la IP que debe autorizarse en el portal.
 *   4. Opcionalmente ejecuta la instalación del esquema (npm run bd:instalar).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_ENV = path.join(RAIZ, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Cola de líneas: evita perder respuestas cuando la entrada llega antes de la
// pregunta (por ejemplo, al pegar varios valores a la vez).
const lineasPendientes = [];
const esperas = [];
rl.on('line', (linea) => {
    if (esperas.length) esperas.shift()(linea);
    else lineasPendientes.push(linea);
});

/** Pregunta con valor por defecto opcional. */
function preguntar(texto, porDefecto = '') {
    const sufijo = porDefecto ? ` [${porDefecto}]` : '';
    process.stdout.write(`${texto}${sufijo}: `);
    return new Promise((resolver) => {
        const responder = (respuesta) => resolver(respuesta.trim() || porDefecto);
        if (lineasPendientes.length) responder(lineasPendientes.shift());
        else esperas.push(responder);
    });
}

/** Lee una variable de un .env existente (para conservar JWT_SECRET). */
function leerVariableExistente(nombre) {
    if (!fs.existsSync(ARCHIVO_ENV)) return null;
    const coincidencia = fs.readFileSync(ARCHIVO_ENV, 'utf8').match(new RegExp(`^${nombre}=(.*)$`, 'm'));
    return coincidencia ? coincidencia[1].trim() : null;
}

/** Servidor Azure configurado previamente en .env (se ignoran servidores locales). */
function servidorAzureExistente() {
    const servidor = leerVariableExistente('DB_SERVER') || '';
    return servidor.endsWith('.database.windows.net') ? servidor : '';
}

/**
 * Normaliza el nombre del servidor: acepta "miservidor" o
 * "miservidor.database.windows.net" (y elimina "tcp:" y ",1433" si se pegan
 * desde la cadena de conexión del portal).
 */
function normalizarServidor(valor) {
    let servidor = valor.replace(/^tcp:/i, '').replace(/,\d+$/, '').trim();
    if (servidor && !servidor.includes('.')) servidor += '.database.windows.net';
    return servidor;
}

/** Variables de correo que se conservan al regenerar .env, con su valor por defecto. */
const VARIABLES_CORREO = [
    ['SMTP_HOST', ''], ['SMTP_PORT', '587'], ['SMTP_USUARIO', ''], ['SMTP_CLAVE', ''],
    ['CORREO_REMITENTE', 'BookingRD <no-responder@bookingrd.com>'], ['URL_SITIO', 'http://localhost:3000']
];

function escribirEnv(datos) {
    const jwtExistente = leerVariableExistente('JWT_SECRET');
    const jwtSecret = jwtExistente && !jwtExistente.startsWith('reemplazar') ? jwtExistente : crypto.randomBytes(48).toString('hex');

    const contenido = `# BookingRD - generado por npm run configurar (base compartida en Azure SQL).
# No versionar este archivo. Compartirlo con el equipo solo por un canal privado.

DB_SERVER=${datos.servidor}
DB_DATABASE=${datos.base}
DB_USER=${datos.usuario}
DB_PASSWORD=${datos.password}
DB_PORT=1433
DB_INSTANCE=
DB_TRUST_CERT=false

PORT=3000

JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d

# Correo (bienvenida y confirmación de reservas). Sin SMTP_HOST se guardan en
# correos-enviados/. Ver .env.example para Gmail u Outlook.
${VARIABLES_CORREO.map(([nombre, defecto]) => `${nombre}=${leerVariableExistente(nombre) ?? defecto}`).join('\n')}
`;
    fs.writeFileSync(ARCHIVO_ENV, contenido, 'utf8');
}

/** Intenta conectar; devuelve null si conecta o el mensaje de error. */
async function probarConexion(datos) {
    const sql = require('mssql');
    try {
        const pool = await new sql.ConnectionPool({
            server: datos.servidor,
            database: datos.base,
            user: datos.usuario,
            password: datos.password,
            port: 1433,
            options: { encrypt: true, trustServerCertificate: false },
            connectionTimeout: 60000   // la base serverless puede estar reanudándose
        }).connect();
        await pool.close();
        return null;
    } catch (error) {
        return error.message;
    }
}

async function main() {
    console.log('\nBookingRD | Configuración de la base compartida (Azure SQL Database)\n');
    console.log('Datos disponibles en el portal de Azure: SQL database > Overview (nombre del servidor)');
    console.log('y en la creación del servidor (usuario y contraseña de administrador).\n');

    const datos = {
        servidor: normalizarServidor(await preguntar('Nombre del servidor', servidorAzureExistente())),
        base: await preguntar('Nombre de la base de datos', 'BookingRD'),
        usuario: await preguntar('Usuario administrador del servidor', servidorAzureExistente() ? leerVariableExistente('DB_USER') || '' : ''),
        password: await preguntar('Contraseña')
    };

    if (!datos.servidor || !datos.usuario || !datos.password) {
        console.error('\nServidor, usuario y contraseña son obligatorios.');
        process.exit(1);
    }

    escribirEnv(datos);
    console.log('\n.env generado. Probando conexión (puede tardar hasta un minuto si la base estaba pausada)...');

    const error = await probarConexion(datos);
    if (error) {
        console.error(`\nNo se pudo conectar: ${error}`);
        const ip = error.match(/IP address '([\d.]+)'/);
        if (ip) {
            console.error(`\nEl firewall de Azure no permite la IP ${ip[1]}.`);
            console.error('Portal de Azure > SQL server > Networking > Firewall rules > Add a firewall rule');
            console.error(`  Inicio: ${ip[1]}   Fin: ${ip[1]}   > Save. Luego ejecutar de nuevo: npm run configurar`);
        } else if (/ENOTFOUND/i.test(error)) {
            console.error('\nEl servidor no existe. Copiar el nombre exacto desde el portal: SQL database > Overview > Server name.');
        } else if (/Login failed/i.test(error)) {
            console.error('\nUsuario o contraseña incorrectos. Verificar los datos del administrador del servidor.');
        }
        rl.close();
        process.exit(1);
    }

    console.log('Conexión correcta.\n');
    const instalar = (await preguntar('¿Crear o actualizar las tablas ahora? (s/n)', 's')).toLowerCase();
    rl.close();

    if (instalar.startsWith('s')) {
        const resultado = spawnSync(process.execPath, [path.join(__dirname, 'bd.js'), 'instalar'], { stdio: 'inherit', cwd: RAIZ });
        if (resultado.status !== 0) process.exit(resultado.status);
    }

    console.log('\nConfiguración terminada. Iniciar el servidor con: npm run dev  ->  http://localhost:3000');
    console.log('Para el resto del equipo: compartir el archivo .env por un canal privado (o que cada integrante ejecute npm run configurar).');
}

main().catch((error) => {
    console.error('Error inesperado:', error.message);
    process.exit(1);
});
