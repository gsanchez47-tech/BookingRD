/**
 * @file src/config/db.js
 * @description Configuración y acceso al pool de conexiones de SQL Server
 *   (paquete mssql). El pool se crea una sola vez (singleton) y se reutiliza
 *   en todas las peticiones.
 *
 * Compatible con:
 *   - SQL Server local (Express / Developer), por puerto o instancia con nombre.
 *   - Azure SQL Database (base compartida del equipo): DB_SERVER=<servidor>.database.windows.net,
 *     DB_TRUST_CERT=false.
 */

const sql = require('mssql');

// DB_INSTANCE y DB_PORT son excluyentes en el driver (tedious).
const usaInstancia = Boolean(process.env.DB_INSTANCE);

const configuracionDB = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: usaInstancia ? undefined : Number(process.env.DB_PORT || 1433),
    options: {
        encrypt: true,                                              // requerido por Azure SQL y SQL Server 2022
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false', // true solo para certificados autofirmados (local)
        instanceName: usaInstancia ? process.env.DB_INSTANCE : undefined
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    connectionTimeout: 30000   // Azure SQL (nivel gratuito) puede tardar en reanudarse tras inactividad
};

let promesaPool = null;

/**
 * Devuelve el pool de conexiones, creándolo en la primera invocación.
 * Si la conexión falla, se descarta la promesa para permitir reintentos
 * en peticiones posteriores.
 *
 * @returns {Promise<sql.ConnectionPool>}
 */
function obtenerPool() {
    if (!promesaPool) {
        promesaPool = new sql.ConnectionPool(configuracionDB)
            .connect()
            .then((pool) => {
                console.log(`Conectado a SQL Server (${configuracionDB.server} / ${configuracionDB.database}).`);
                return pool;
            })
            .catch((error) => {
                promesaPool = null;
                console.error('No se pudo conectar a SQL Server:', error.message);
                throw error;
            });
    }
    return promesaPool;
}

module.exports = { obtenerPool, sql, configuracionDB };
