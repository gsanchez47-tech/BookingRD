/**
 * @file src/config/modo.js
 * @description Modo de funcionamiento de la capa de datos.
 *
 *   MODO_DEMO es verdadero cuando no hay un servidor de base de datos
 *   configurado (DB_SERVER vacío) o cuando se fuerza con DB_MODO=demo.
 *   En ese modo los datos se guardan en memoria y se reinician al apagar
 *   el servidor.
 */

'use strict';

const MODO_DEMO = process.env.DB_MODO === 'demo' || !process.env.DB_SERVER;

module.exports = { MODO_DEMO };
