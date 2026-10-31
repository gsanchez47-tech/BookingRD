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
const rateLimit = require('express-rate-limit');

const rutasAuth = require('./routes/auth.routes');
const rutasCatalogo = require('./routes/catalogo.routes');
const rutasContacto = require('./routes/contacto.routes');
const rutasReservas = require('./routes/reservas.routes');
const rutasEmpresa = require('./routes/empresa.routes');
const rutasAdmin = require('./routes/admin.routes');
const rutasViajero = require('./routes/viajero.routes');
const { ErrorHttp } = require('./utils/errores');

// JWT_SECRET es obligatorio para firmar y verificar sesiones.
if (!process.env.JWT_SECRET) {
    console.error('Configuración incompleta: falta JWT_SECRET en .env (ver .env.example o ejecutar npm run configurar).');
    process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// Encabezados de seguridad. La política CSP se omite porque las páginas
// también se abren con file:// y cargan tipografías de Google Fonts; la
// política de recursos permite mostrar las imágenes de la API en esas páginas.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

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
app.use('/api/empresa', rutasEmpresa);
app.use('/api/admin', rutasAdmin);
app.use('/api', rutasCatalogo);
app.use('/api', rutasContacto);
app.use('/api', rutasViajero);

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
app.listen(PUERTO, () => {
    console.log(`BookingRD disponible en http://localhost:${PUERTO}`);
});
