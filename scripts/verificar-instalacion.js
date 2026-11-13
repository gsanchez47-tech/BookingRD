/**
 * @file scripts/verificar-instalacion.js
 * @description Comprobación final del instalador de Windows: con el .env que
 *   acaba de escribirse, la aplicación entra a SQL Server con su propio
 *   usuario, lee los datos de ejemplo y puede escribir (dentro de una
 *   transacción que se deshace). Sale con código 1 si algo falla.
 *
 *   Uso: node scripts/verificar-instalacion.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
    if (!process.env.DB_SERVER) throw new Error('El archivo .env no tiene DB_SERVER.');
    const sql = require('mssql');
    const { configuracionDB } = require('../src/config/db');
    const destino = process.env.DB_INSTANCE ? `${process.env.DB_SERVER}\\${process.env.DB_INSTANCE}` : `${process.env.DB_SERVER}:${process.env.DB_PORT || 1433}`;

    const pool = await new sql.ConnectionPool(Object.assign({}, configuracionDB, { connectionTimeout: 20000 })).connect();
    try {
        const { recordset } = await pool.request().query(`
            SELECT
                (SELECT COUNT(*) FROM dbo.usuarios)  AS usuarios,
                (SELECT COUNT(*) FROM dbo.hoteles)   AS hoteles,
                (SELECT COUNT(*) FROM dbo.actividades) AS actividades,
                (SELECT COUNT(*) FROM dbo.reservas)  AS reservas,
                (SELECT COUNT(*) FROM dbo.productos) AS productos,
                (SELECT COUNT(*) FROM dbo.combos)    AS combos`);
        const c = recordset[0];
        if (!c.usuarios || !c.hoteles || !c.actividades) throw new Error('La base está vacía.');

        // Escritura de prueba que se deshace.
        const transaccion = new sql.Transaction(pool);
        await transaccion.begin();
        await new sql.Request(transaccion).query("UPDATE dbo.usuarios SET nombre = nombre WHERE correo = N'cliente@bookingrd.com'");
        await transaccion.rollback();

        console.log(`Conexión correcta con SQL Server (${destino}, base ${process.env.DB_DATABASE}).`);
        console.log(`${c.usuarios} usuarios, ${c.hoteles} alojamientos, ${c.actividades} actividades, ${c.reservas} reservas, ${c.combos} combos, ${c.productos} productos.`);
        console.log('Lectura y escritura comprobadas.');
    } finally {
        await pool.close();
    }
}

main().catch((error) => {
    console.error(`Falló la comprobación: ${error.message}`);
    process.exitCode = 1;
});
