/**
 * @file scripts/demo.js
 * @description Inicia BookingRD en modo de demostración (datos en memoria),
 *   aunque .env tenga una base de datos configurada. Uso: `npm run demo`.
 */

'use strict';

process.env.DB_MODO = 'demo';
require('../src/server');
