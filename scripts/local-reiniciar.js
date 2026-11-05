/**
 * @file scripts/local-reiniciar.js
 * @description Borra la base local en archivo (database/local/) para que el
 *   próximo arranque vuelva a los datos de ejemplo. Uso: `npm run local:reiniciar`.
 *   No toca SQL Server; para reinstalar esa base: `npm run bd:reiniciar`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, '..', 'database', 'local', 'bookingrd-local.json');

if (fs.existsSync(ARCHIVO)) {
    fs.rmSync(ARCHIVO);
    console.log('Base local borrada. Al iniciar BookingRD se cargan de nuevo los datos de ejemplo.');
} else {
    console.log('No hay base local que borrar.');
}
