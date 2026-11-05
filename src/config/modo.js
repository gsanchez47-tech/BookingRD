/**
 * @file src/config/modo.js
 * @description Modo de funcionamiento de la capa de datos.
 *
 *   - SQL Server o Azure SQL: cuando .env tiene DB_SERVER (lo normal).
 *   - Base local en archivo: sin DB_SERVER. Los datos viven en memoria y se
 *     guardan en database/local/bookingrd-local.json después de cada cambio,
 *     así se conservan al reiniciar. Es el respaldo cuando no hay SQL Server.
 *   - Demostración efímera: DB_MODO=demo (npm run demo y las pruebas). Igual
 *     que la local, pero sin archivo: cada arranque vuelve a los datos de ejemplo.
 *
 *   MODO_DEMO indica cualquiera de los dos modos sin servidor SQL.
 */

'use strict';

const MODO_DEMO = process.env.DB_MODO === 'demo' || !process.env.DB_SERVER;
const MODO_EFIMERO = process.env.DB_MODO === 'demo';

module.exports = { MODO_DEMO, MODO_EFIMERO };
