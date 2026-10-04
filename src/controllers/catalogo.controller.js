/**
 * @file src/controllers/catalogo.controller.js
 * @description Consultas públicas de la página de inicio: indicadores y
 *   listados de hoteles y actividades publicados (activo = 1).
 */

const { obtenerPool, sql } = require('../config/db');
const { aEnteroPositivo } = require('../utils/validacion');

/**
 * GET /api/estadisticas
 * @returns {{totalHoteles: number, totalActividades: number, ciudades: string[], totalEmpresas: number}}
 */
async function obtenerEstadisticas(req, res) {
    const pool = await obtenerPool();

    // Consultas independientes ejecutadas en paralelo.
    const [hoteles, actividades, ciudades, empresas] = await Promise.all([
        pool.request().query('SELECT COUNT(*) AS total FROM dbo.hoteles WHERE activo = 1'),
        pool.request().query('SELECT COUNT(*) AS total FROM dbo.actividades WHERE activo = 1'),
        pool.request().query(`
            SELECT ciudad FROM dbo.hoteles WHERE activo = 1
            UNION
            SELECT ciudad FROM dbo.actividades WHERE activo = 1
            ORDER BY ciudad ASC
        `),
        pool.request().query('SELECT COUNT(*) AS total FROM dbo.empresas')
    ]);

    res.json({
        totalHoteles: hoteles.recordset[0].total,
        totalActividades: actividades.recordset[0].total,
        ciudades: ciudades.recordset.map((fila) => fila.ciudad),
        totalEmpresas: empresas.recordset[0].total
    });
}

/**
 * GET /api/hoteles?ciudad=&personas=
 * Filtros opcionales:
 *   ciudad    coincidencia exacta.
 *   personas  capacidad por reserva >= personas.
 * Patrón (@param IS NULL OR condición): el filtro se omite si no se envía.
 */
async function listarHoteles(req, res) {
    const ciudad = req.query.ciudad ? String(req.query.ciudad) : null;
    const personas = aEnteroPositivo(req.query.personas);

    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input('ciudad', sql.NVarChar(100), ciudad)
        .input('personas', sql.Int, personas)
        .query(`
            SELECT h.id_hotel, h.nombre, h.ciudad, h.descripcion, h.precio_noche,
                   h.capacidad_personas, h.cupo_maximo, h.imagen_url,
                   e.nombre_comercial AS proveedor
            FROM dbo.hoteles h
            LEFT JOIN dbo.empresas e ON e.id_empresa = h.id_empresa
            WHERE h.activo = 1
              AND (@ciudad IS NULL OR h.ciudad = @ciudad)
              AND (@personas IS NULL OR h.capacidad_personas >= @personas)
            ORDER BY h.fecha_creacion DESC
        `);

    res.json(resultado.recordset);
}

/**
 * GET /api/actividades?ciudad=&personas=
 * Filtros opcionales:
 *   ciudad    coincidencia exacta.
 *   personas  cupo máximo >= personas.
 */
async function listarActividades(req, res) {
    const ciudad = req.query.ciudad ? String(req.query.ciudad) : null;
    const personas = aEnteroPositivo(req.query.personas);

    const pool = await obtenerPool();
    const resultado = await pool.request()
        .input('ciudad', sql.NVarChar(100), ciudad)
        .input('personas', sql.Int, personas)
        .query(`
            SELECT a.id_actividad, a.nombre, a.ciudad, a.descripcion, a.precio_persona,
                   a.cupo_maximo, a.imagen_url,
                   e.nombre_comercial AS proveedor
            FROM dbo.actividades a
            LEFT JOIN dbo.empresas e ON e.id_empresa = a.id_empresa
            WHERE a.activo = 1
              AND (@ciudad IS NULL OR a.ciudad = @ciudad)
              AND (@personas IS NULL OR a.cupo_maximo >= @personas)
            ORDER BY a.fecha_creacion DESC
        `);

    res.json(resultado.recordset);
}

module.exports = { obtenerEstadisticas, listarHoteles, listarActividades };
