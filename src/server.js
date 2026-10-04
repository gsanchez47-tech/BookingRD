/**
 * @file src/server.js
 * @description Punto de entrada del servidor HTTP de BookingRD (Express).
 *   Registra los middlewares globales, las rutas de la API bajo /api, el
 *   servicio de archivos estáticos (public/) y el manejador de errores
 *   centralizado.
 *
 * Ejecución: `npm run dev` (reinicio automático) o `npm start`.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');

const rutasAuth = require('./routes/auth.routes');
const rutasCatalogo = require('./routes/catalogo.routes');
const rutasContacto = require('./routes/contacto.routes');

// JWT_SECRET es obligatorio para firmar y verificar sesiones.
if (!process.env.JWT_SECRET) {
    console.error('Configuración incompleta: falta JWT_SECRET en .env (ver .env.example o ejecutar npm run configurar).');
    process.exit(1);
}

const app = express();

// CORS habilitado: permite consumir la API desde páginas abiertas con file://.
app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.use('/api/auth', rutasAuth);
app.use('/api', rutasCatalogo);
app.use('/api', rutasContacto);

// Rutas /api inexistentes: respuesta JSON uniforme.
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'La ruta solicitada no existe.' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * Manejador de errores centralizado. Registra el detalle en consola y
 * responde un mensaje genérico. Los errores de conectividad con la base de
 * datos se informan como 503.
 */
app.use((error, req, res, next) => {
    // Cuerpo JSON mal formado o demasiado grande (express.json).
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'El contenido enviado excede el tamaño permitido.' });
    }

    const esErrorDeConexion = ['ESOCKET', 'ELOGIN', 'ETIMEOUT', 'EINSTLOOKUP'].includes(error.code);
    if (esErrorDeConexion) {
        console.error(`Base de datos no disponible (${req.method} ${req.originalUrl}): ${error.message}`);
        return res.status(503).json({ error: 'El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.' });
    }

    console.error(`Error no controlado (${req.method} ${req.originalUrl}):`, error);
    res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
    console.log(`BookingRD disponible en http://localhost:${PUERTO}`);
});
