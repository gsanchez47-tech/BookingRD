/**
 * @file src/repositories/index.js
 * @description Punto único de acceso a la capa de datos.
 *
 *   - Con base de datos configurada (DB_SERVER en .env) se usan los
 *     repositorios de SQL Server / Azure SQL.
 *   - En modo de demostración (sin DB_SERVER, o DB_MODO=demo) se usan
 *     repositorios en memoria con los datos de database/datos-demo.js, de
 *     modo que la aplicación funciona completa sin instalar una base.
 *
 *   Ambas implementaciones exponen la misma interfaz.
 */

'use strict';

const { MODO_DEMO } = require('../config/modo');

/** Transacción en memoria: ejecuta los trabajos de uno en uno (exclusión mutua). */
let cola = Promise.resolve();
function conTransaccionEnMemoria(trabajo) {
    const resultado = cola.then(() => trabajo(null));
    cola = resultado.catch(() => {});
    return resultado;
}

function cargarMemoria() {
    const varios = require('./memoria/varios');
    return {
        publicacionesRepo: require('./memoria/publicaciones'),
        reservasRepo: require('./memoria/reservas'),
        resenasRepo: require('./memoria/resenas'),
        cuentasRepo: require('./memoria/cuentas'),
        adminRepo: require('./memoria/admin'),
        favoritosRepo: varios.favoritos,
        imagenesRepo: varios.imagenes,
        contactoRepo: varios.contacto,
        conTransaccion: conTransaccionEnMemoria
    };
}

function cargarSql() {
    return {
        publicacionesRepo: require('./publicaciones.repo'),
        reservasRepo: require('./reservas.repo'),
        resenasRepo: require('./resenas.repo'),
        cuentasRepo: require('./cuentas.repo'),
        adminRepo: require('./admin.repo'),
        favoritosRepo: require('./favoritos.repo'),
        imagenesRepo: require('./imagenes.repo'),
        contactoRepo: require('./contacto.repo'),
        conTransaccion: require('../config/db').conTransaccion
    };
}

module.exports = MODO_DEMO ? cargarMemoria() : cargarSql();
