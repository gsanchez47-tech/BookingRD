/**
 * @file src/server.js
 * @description Punto de entrada del servidor HTTP de BookingRD (Express).
 *   Registra los middlewares globales (seguridad, CORS, JSON), las rutas de
 *   la API bajo /api, el servicio de archivos estáticos (public/) y el
 *   manejador de errores centralizado.
 *
 * Ejecución: `npm run dev` (reinicio automático) o `npm start`.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const rutasAuth = require('./routes/auth.routes');
const rutasCatalogo = require('./routes/catalogo.routes');
const rutasContacto = require('./routes/contacto.routes');
const rutasReservas = require('./routes/reservas.routes');
const rutasEmpresa = require('./routes/empresa.routes');
const rutasAdmin = require('./routes/admin.routes');
const rutasViajero = require('./routes/viajero.routes');
const rutasExternos = require('./routes/externos.routes');
const { ErrorHttp } = require('./utils/errores');

const crypto = require('crypto');
const { MODO_DEMO, MODO_EFIMERO } = require('./config/modo');

// JWT_SECRET firma las sesiones. Es obligatorio con base de datos; en modo de
// demostración, si falta, se genera uno temporal (las sesiones se cierran al
// reiniciar el servidor).
if (!process.env.JWT_SECRET) {
    if (!MODO_DEMO) {
        console.error('Configuración incompleta: falta JWT_SECRET en .env (ver .env.example o ejecutar npm run configurar).');
        process.exit(1);
    }
    // Base local: la clave se guarda junto a los datos para que las sesiones
    // sigan abiertas después de reiniciar; en la demostración efímera es temporal.
    process.env.JWT_SECRET = MODO_EFIMERO ? crypto.randomBytes(32).toString('hex') : claveLocalDeSesiones();
}

/** Lee o crea database/local/clave-sesiones.txt. */
function claveLocalDeSesiones() {
    const fs = require('fs');
    const archivo = path.join(__dirname, '..', 'database', 'local', 'clave-sesiones.txt');
    try {
        const guardada = fs.readFileSync(archivo, 'utf8').trim();
        if (guardada.length >= 32) return guardada;
    } catch (error) {
        // Primera vez: se crea abajo.
    }
    const nueva = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, nueva);
    return nueva;
}

const app = express();
app.disable('x-powered-by');

// Base local en archivo: guarda después de cada petición que modifica datos
// y antes de apagar el servidor.
const almacenLocal = MODO_DEMO && !MODO_EFIMERO ? require('./repositories/memoria/almacen') : null;
if (almacenLocal) {
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') res.on('finish', almacenLocal.guardar);
        next();
    });
    for (const senal of ['SIGINT', 'SIGTERM']) {
        process.on(senal, () => {
            almacenLocal.guardarAlSalir();
            process.exit(0);
        });
    }
}

// Encabezados de seguridad. La política CSP se omite porque las páginas
// también se abren con file:// y cargan tipografías de Google Fonts; la
// política de recursos permite mostrar las imágenes de la API en esas páginas.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Los mosaicos de OpenStreetMap exigen la cabecera Referer; con la
    // política predeterminada de helmet (no-referrer) responden 403.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Compresión gzip de HTML, CSS, JS y JSON (las fotografías ya van comprimidas).
app.use(compression());

// CORS habilitado: permite consumir la API desde páginas abiertas con file://.
// La autenticación usa el encabezado Authorization (no cookies).
app.use(cors());

// Límite de intentos de inicio de sesión y registro por dirección IP.
const limiteAutenticacion = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.LIMITE_INTENTOS_AUTH || 40),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
});

// Cuerpos JSON: hasta 4 MB para la subida de fotografías (3 MB en base64); 20 KB en el resto.
app.use('/api/empresa/imagenes', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '20kb' }));

app.use('/api/auth', limiteAutenticacion, rutasAuth);
app.use('/api/reservas', rutasReservas);
app.use('/api/combos', require('./routes/combos.routes'));
app.use('/api/tienda', require('./routes/tienda.routes'));
app.use('/api/empresa', rutasEmpresa);
app.use('/api/admin', rutasAdmin);
app.use('/api', rutasCatalogo);
app.use('/api', rutasContacto);
app.use('/api', rutasViajero);
app.use('/api', rutasExternos);

// Estado del servidor (comprobaciones y guía de instalación).
app.get('/api/salud', (req, res) => res.json({ estado: 'ok', modo: !MODO_DEMO ? 'sql-server' : MODO_EFIMERO ? 'demostracion' : 'local' }));

// Rutas /api inexistentes: respuesta JSON uniforme.
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'La ruta solicitada no existe.' });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

/**
 * Manejador de errores centralizado.
 *   ErrorHttp            -> su código y { error, campo }.
 *   JSON inválido/grande -> 400 / 413.
 *   Base no disponible   -> 503.
 *   Otros                -> 500 con mensaje genérico (detalle solo en consola).
 */
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    if (error instanceof ErrorHttp) {
        return res.status(error.status).json(error.campo ? { error: error.message, campo: error.campo } : { error: error.message });
    }
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'El contenido enviado excede el tamaño permitido.' });
    }

    const esErrorDeConexion = ['ESOCKET', 'ELOGIN', 'ETIMEOUT', 'EINSTLOOKUP', 'ECONNCLOSED'].includes(error.code);
    if (esErrorDeConexion) {
        console.error(`Base de datos no disponible (${req.method} ${req.originalUrl}): ${error.message}`);
        return res.status(503).json({ error: 'El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.' });
    }

    console.error(`Error no controlado (${req.method} ${req.originalUrl}):`, error);
    res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

const PUERTO = Number(process.env.PORT || 3000);
const servidor = app.listen(PUERTO, () => {
    const direccion = `http://localhost:${PUERTO}`;
    console.log('');
    console.log(`  BookingRD está funcionando en ${direccion}`);
    if (!MODO_DEMO) {
        const instancia = process.env.DB_INSTANCE ? `\\${process.env.DB_INSTANCE}` : '';
        console.log(`  Base de datos: SQL Server ${process.env.DB_SERVER}${instancia}, base ${process.env.DB_DATABASE || 'BookingRD'}.`);
    } else if (MODO_EFIMERO) {
        console.log('  Modo de demostración: datos de ejemplo en memoria; los cambios se pierden al apagar.');
    } else {
        console.log(`  Base de datos local: ${almacenLocal.ARCHIVO_LOCAL}`);
        console.log('  Los cambios se guardan. Para usar SQL Server: npm run sqlserver (o Azure: npm run configurar).');
    }
    console.log('  Para apagar el servidor, pulsa Ctrl + C.');
    console.log('');
    if (process.env.ABRIR_NAVEGADOR === '1') abrirNavegador(direccion);
});

servidor.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`El puerto ${PUERTO} ya está en uso: probablemente BookingRD ya está abierto en otra ventana.`);
        console.error(`Usa esa ventana o ciérrala y vuelve a intentarlo. La página está en http://localhost:${PUERTO}`);
        if (process.env.ABRIR_NAVEGADOR === '1') abrirNavegador(`http://localhost:${PUERTO}`);
        process.exitCode = 1;
        return;
    }
    throw error;
});

/** Abre la página en el navegador predeterminado (Windows, macOS o Linux). */
function abrirNavegador(direccion) {
    const { spawn } = require('child_process');
    const [comando, argumentos] = process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', direccion]]
        : process.platform === 'darwin' ? ['open', [direccion]] : ['xdg-open', [direccion]];
    try {
        spawn(comando, argumentos, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    } catch (error) {
        // Sin navegador disponible: la dirección ya está en la consola.
    }
}
