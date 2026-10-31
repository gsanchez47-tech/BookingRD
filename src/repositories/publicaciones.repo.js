/**
 * @file src/repositories/publicaciones.repo.js
 * @description Acceso a datos de hoteles y actividades.
 *
 * Los dos tipos de publicación se exponen con una forma común
 * (ver aPublicacion) para que el frontend los trate de manera uniforme:
 *   { tipo, id, nombre, categoria, ciudad, descripcion, precio, imagen,
 *     destacado, activo, proveedor, ...campos propios del tipo }
 *
 * Todas las consultas son parametrizadas. Los únicos fragmentos SQL
 * dinámicos (ORDER BY) provienen de listas blancas definidas en este módulo.
 */

const { peticion, sql } = require('../config/db');

/** Tipos de publicación y su tabla. */
const TIPOS = {
    hotel: { tabla: 'dbo.hoteles', id: 'id_hotel', precio: 'precio_noche' },
    actividad: { tabla: 'dbo.actividades', id: 'id_actividad', precio: 'precio_persona' },
    vehiculo: { tabla: 'dbo.vehiculos', id: 'id_vehiculo', precio: 'precio_dia' }
};

/** Órdenes permitidos del listado (lista blanca). */
const ORDENES = {
    destacados: 'p.destacado DESC, p.fecha_creacion DESC',
    valoracion: 'COALESCE(val.promedio_resenas, 0) DESC, val.total_resenas DESC, p.fecha_creacion DESC',
    populares: 'pop.total_reservas DESC, p.destacado DESC, p.fecha_creacion DESC',
    recientes: 'p.fecha_creacion DESC',
    'precio-asc': 'precio ASC',
    'precio-desc': 'precio DESC',
    nombre: 'p.nombre ASC'
};

/**
 * Valoración (alias val) y popularidad (alias pop) de cada publicación:
 *   promedio_resenas  media de las reseñas visibles (1 a 10), NULL sin reseñas
 *   total_resenas     reseñas visibles
 *   total_reservas    reservas confirmadas
 * La reseña se enlaza con la publicación a través de su reserva.
 */
const valoracionSql = (columna) => `OUTER APPLY (
                SELECT CAST(AVG(CAST(rs.puntuacion AS DECIMAL(5, 2))) AS DECIMAL(4, 2)) AS promedio_resenas,
                       COUNT(rs.id_resena) AS total_resenas
                FROM dbo.reservas rv
                INNER JOIN dbo.resenas rs ON rs.id_reserva = rv.id_reserva AND rs.visible = 1
                WHERE rv.${columna} = p.${columna}
            ) val
            OUTER APPLY (
                SELECT COUNT(*) AS total_reservas
                FROM dbo.reservas r2
                WHERE r2.${columna} = p.${columna} AND r2.estado = 'confirmada'
            ) pop`;
const VALORACION_SQL = {
    hotel: valoracionSql('id_hotel'),
    actividad: valoracionSql('id_actividad'),
    vehiculo: valoracionSql('id_vehiculo')
};

/** Grupo público de un tipo de alojamiento (mismo criterio que TIPOS_ALOJAMIENTO). */
const CATEGORIA_HOTEL_SQL = `CASE WHEN p.tipo_alojamiento IN ('hotel', 'resort', 'boutique')
                                  THEN 'hoteles-resorts' ELSE 'villas-cabanas' END`;

/** Escapa los comodines de LIKE para buscar el texto literal. */
const patronBusqueda = (texto) => `%${texto.replace(/[[%_]/g, '[$&]')}%`;

/** Ruta pública de la imagen: la subida por la empresa tiene prioridad sobre la estática. */
const rutaImagen = (fila) => (fila.id_imagen ? `/api/imagenes/${fila.id_imagen}` : fila.imagen_url || null);

/** Convierte una fila de hoteles, actividades o vehículos a la forma común. */
function aPublicacion(tipo, fila) {
    const base = {
        tipo,
        id: fila[TIPOS[tipo].id],
        nombre: fila.nombre,
        categoria: fila.categoria,
        ciudad: fila.ciudad,
        descripcion: fila.descripcion,
        precio: Number(fila.precio),
        imagen: rutaImagen(fila),
        idImagen: fila.id_imagen || null,
        destacado: Boolean(fila.destacado),
        activo: Boolean(fila.activo),
        idEmpresa: fila.id_empresa,
        proveedor: fila.proveedor,
        puntuacion: fila.promedio_resenas === null || fila.promedio_resenas === undefined ? null : Number(fila.promedio_resenas),
        totalResenas: fila.total_resenas || 0,
        totalReservas: fila.total_reservas || 0,
        fechaCreacion: fila.fecha_creacion
    };
    if (tipo === 'hotel') {
        return Object.assign(base, {
            tipoAlojamiento: fila.tipo_alojamiento,
            direccion: fila.direccion,
            servicios: fila.servicios ? fila.servicios.split(',') : [],
            capacidadPersonas: fila.capacidad_personas,
            habitaciones: fila.habitaciones
        });
    }
    if (tipo === 'vehiculo') {
        return Object.assign(base, {
            marca: fila.marca,
            modelo: fila.modelo,
            anio: fila.anio,
            transmision: fila.transmision,
            combustible: fila.combustible,
            pasajeros: fila.pasajeros,
            puertas: fila.puertas,
            maletas: fila.maletas,
            aire: Boolean(fila.aire),
            kmPorDia: fila.km_por_dia,
            lugarRecogida: fila.lugar_recogida,
            incluye: fila.incluye,
            deposito: Number(fila.deposito),
            edadMinima: fila.edad_minima,
            cargoConductorJoven: fila.cargo_conductor_joven === null ? null : Number(fila.cargo_conductor_joven),
            cargoOtraCiudad: fila.cargo_otra_ciudad === null ? null : Number(fila.cargo_otra_ciudad),
            unidades: fila.unidades
        });
    }
    return Object.assign(base, {
        puntoEncuentro: fila.punto_encuentro,
        incluye: fila.incluye,
        duracionHoras: Number(fila.duracion_horas),
        cupoDiario: fila.cupo_diario
    });
}

/** Columnas comunes del SELECT para cada tipo (alias p = publicación, e = empresa). */
const COLUMNAS = {
    hotel: `p.id_hotel, p.id_empresa, p.nombre, ${CATEGORIA_HOTEL_SQL} AS categoria, p.tipo_alojamiento,
            p.ciudad, p.direccion, p.descripcion, p.servicios, p.precio_noche AS precio,
            p.capacidad_personas, p.habitaciones, p.id_imagen, p.imagen_url, p.destacado, p.activo,
            p.fecha_creacion, e.nombre_comercial AS proveedor,
            val.promedio_resenas, val.total_resenas, pop.total_reservas`,
    actividad: `p.id_actividad, p.id_empresa, p.nombre, p.categoria, p.ciudad, p.punto_encuentro,
                p.descripcion, p.incluye, p.duracion_horas, p.precio_persona AS precio, p.cupo_diario,
                p.id_imagen, p.imagen_url, p.destacado, p.activo, p.fecha_creacion,
                e.nombre_comercial AS proveedor,
                val.promedio_resenas, val.total_resenas, pop.total_reservas`,
    vehiculo: `p.id_vehiculo, p.id_empresa, p.nombre, p.categoria, p.ciudad, p.marca, p.modelo, p.anio,
               p.transmision, p.combustible, p.pasajeros, p.puertas, p.maletas, p.aire, p.km_por_dia,
               p.lugar_recogida, p.descripcion, p.incluye, p.precio_dia AS precio, p.deposito, p.edad_minima,
               p.cargo_conductor_joven, p.cargo_otra_ciudad, p.unidades,
               p.id_imagen, p.imagen_url, p.destacado, p.activo, p.fecha_creacion,
               e.nombre_comercial AS proveedor,
               val.promedio_resenas, val.total_resenas, pop.total_reservas`
};

/** Publicación visible al público: activa y de una empresa no suspendida (alias p, e). */
const VISIBLE_SQL = 'p.activo = 1 AND EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id_usuario = e.id_usuario AND u.activo = 1)';

/**
 * Listado paginado con filtros opcionales.
 *
 * @param {'hotel'|'actividad'|'vehiculo'} tipo
 * @param {object} filtros
 * @param {string|null} filtros.categoria  categoría pública
 * @param {string|null} filtros.ciudad
 * @param {number|null} filtros.personas   capacidad mínima requerida (pasajeros en vehículos)
 * @param {string|null} filtros.transmision  solo vehículos: automatica | manual
 * @param {number|null} filtros.precioMin
 * @param {number|null} filtros.precioMax
 * @param {string|null} filtros.texto      búsqueda en nombre, ciudad y descripción
 * @param {number|null} filtros.puntuacionMin  valoración media mínima (1 a 10)
 * @param {number|null} filtros.idEmpresa  solo publicaciones de esa empresa
 * @param {boolean} filtros.incluirInactivas
 * @param {string} filtros.orden           clave de ORDENES
 * @param {number} filtros.pagina          desde 1
 * @param {number} filtros.porPagina
 * @returns {Promise<{total: number, publicaciones: object[]}>}
 */
async function listar(tipo, filtros) {
    const { tabla } = TIPOS[tipo];
    const orden = ORDENES[filtros.orden] || ORDENES.destacados;
    const condicionCategoria = tipo === 'hotel'
        ? `(@categoria IS NULL OR ${CATEGORIA_HOTEL_SQL} = @categoria)`
        : '(@categoria IS NULL OR p.categoria = @categoria)';
    const condicionPersonas = {
        hotel: '(@personas IS NULL OR p.capacidad_personas * p.habitaciones >= @personas)',
        actividad: '(@personas IS NULL OR p.cupo_diario >= @personas)',
        vehiculo: '(@personas IS NULL OR p.pasajeros >= @personas)'
    }[tipo];
    const condicionTransmision = tipo === 'vehiculo' ? 'AND (@transmision IS NULL OR p.transmision = @transmision)' : '';
    const columnaPrecio = `p.${TIPOS[tipo].precio}`;

    const consulta = await peticion();
    const resultado = await consulta
        .input('categoria', sql.VarChar(30), filtros.categoria || null)
        .input('ciudad', sql.NVarChar(60), filtros.ciudad || null)
        .input('personas', sql.Int, filtros.personas || null)
        .input('precioMin', sql.Decimal(10, 2), filtros.precioMin || null)
        .input('precioMax', sql.Decimal(10, 2), filtros.precioMax || null)
        .input('texto', sql.NVarChar(120), filtros.texto ? patronBusqueda(filtros.texto) : null)
        .input('puntuacionMin', sql.Decimal(4, 2), filtros.puntuacionMin || null)
        .input('transmision', sql.VarChar(12), filtros.transmision || null)
        .input('idEmpresa', sql.Int, filtros.idEmpresa || null)
        .input('incluirInactivas', sql.Bit, filtros.incluirInactivas ? 1 : 0)
        .input('desplazamiento', sql.Int, (filtros.pagina - 1) * filtros.porPagina)
        .input('porPagina', sql.Int, filtros.porPagina)
        .query(`
            SELECT ${COLUMNAS[tipo]}, COUNT(*) OVER () AS total_resultados
            FROM ${tabla} p
            INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
            ${VALORACION_SQL[tipo]}
            WHERE (@incluirInactivas = 1 OR (${VISIBLE_SQL}))
              AND (@idEmpresa IS NULL OR p.id_empresa = @idEmpresa)
              AND ${condicionCategoria}
              AND (@ciudad IS NULL OR p.ciudad = @ciudad)
              AND ${condicionPersonas}
              AND (@precioMin IS NULL OR ${columnaPrecio} >= @precioMin)
              AND (@precioMax IS NULL OR ${columnaPrecio} <= @precioMax)
              AND (@texto IS NULL OR p.nombre LIKE @texto OR p.ciudad LIKE @texto OR p.descripcion LIKE @texto)
              AND (@puntuacionMin IS NULL OR val.promedio_resenas >= @puntuacionMin)
              ${condicionTransmision}
            ORDER BY ${orden}
            OFFSET @desplazamiento ROWS FETCH NEXT @porPagina ROWS ONLY
        `);

    const filas = resultado.recordset;
    return {
        total: filas.length ? filas[0].total_resultados : 0,
        publicaciones: filas.map((fila) => aPublicacion(tipo, fila))
    };
}

/**
 * Precios de las publicaciones visibles de un tipo (con categoría y destino
 * opcionales), para el histograma del filtro de precio.
 * @returns {Promise<number[]>} precios ordenados de menor a mayor.
 */
async function precios(tipo, { categoria = null, ciudad = null } = {}) {
    const { tabla } = TIPOS[tipo];
    const condicionCategoria = tipo === 'hotel'
        ? `(@categoria IS NULL OR ${CATEGORIA_HOTEL_SQL} = @categoria)`
        : '(@categoria IS NULL OR p.categoria = @categoria)';
    const consulta = await peticion();
    const resultado = await consulta
        .input('categoria', sql.VarChar(30), categoria)
        .input('ciudad', sql.NVarChar(60), ciudad)
        .query(`
            SELECT p.${TIPOS[tipo].precio} AS precio
            FROM ${tabla} p
            INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
            WHERE ${VISIBLE_SQL}
              AND ${condicionCategoria}
              AND (@ciudad IS NULL OR p.ciudad = @ciudad)
            ORDER BY p.${TIPOS[tipo].precio}
        `);
    return resultado.recordset.map((fila) => Number(fila.precio));
}

/**
 * Detalle de una publicación con los datos de contacto de la empresa.
 * @param {object} [opciones]
 * @param {boolean} [opciones.incluirInactiva=false]
 * @returns {Promise<object|null>}
 */
async function obtener(tipo, id, { incluirInactiva = false } = {}) {
    const { tabla, id: columnaId } = TIPOS[tipo];
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, id)
        .input('incluirInactiva', sql.Bit, incluirInactiva ? 1 : 0)
        .query(`
            SELECT ${COLUMNAS[tipo]},
                   e.telefono AS telefono_empresa, e.sitio_web, e.ciudad AS ciudad_empresa,
                   e.descripcion AS descripcion_empresa, e.licencia_mitur
            FROM ${tabla} p
            INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
            ${VALORACION_SQL[tipo]}
            WHERE p.${columnaId} = @id
              AND (@incluirInactiva = 1 OR (${VISIBLE_SQL}))
        `);
    const fila = resultado.recordset[0];
    if (!fila) return null;
    return Object.assign(aPublicacion(tipo, fila), {
        empresa: {
            nombre: fila.proveedor,
            telefono: fila.telefono_empresa,
            sitioWeb: fila.sitio_web,
            ciudad: fila.ciudad_empresa,
            descripcion: fila.descripcion_empresa,
            licenciaMitur: fila.licencia_mitur
        }
    });
}

/**
 * Publicaciones visibles que el viajero guardó como favoritas, de la más
 * reciente a la más antigua.
 * @returns {Promise<object[]>} publicaciones con `fechaGuardado`
 */
async function listarFavoritas(tipo, idUsuario) {
    const { tabla, id: columnaId } = TIPOS[tipo];
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query(`
            SELECT ${COLUMNAS[tipo]}, f.fecha_creacion AS fecha_guardado
            FROM dbo.favoritos f
            INNER JOIN ${tabla} p ON p.${columnaId} = f.${columnaId}
            INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
            ${VALORACION_SQL[tipo]}
            WHERE f.id_usuario = @idUsuario AND ${VISIBLE_SQL}
            ORDER BY f.fecha_creacion DESC
        `);
    return resultado.recordset.map((fila) => Object.assign(aPublicacion(tipo, fila), { fechaGuardado: fila.fecha_guardado }));
}

/**
 * Indicadores de la página de inicio: publicaciones activas por tipo, por
 * categoría y por destino, ciudades con publicaciones, empresas registradas
 * y valoración media de las reseñas visibles. Las
 * publicaciones de empresas suspendidas por la administración no se cuentan.
 */
async function estadisticas() {
    const consulta = await peticion();
    const resultado = await consulta.query(`
        SELECT 'hotel' AS tipo, ${CATEGORIA_HOTEL_SQL} AS categoria, p.ciudad, COUNT(*) AS total
        FROM dbo.hoteles p INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
        WHERE p.activo = 1 AND EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id_usuario = e.id_usuario AND u.activo = 1)
        GROUP BY ${CATEGORIA_HOTEL_SQL}, p.ciudad
        UNION ALL
        SELECT 'actividad', p.categoria, p.ciudad, COUNT(*)
        FROM dbo.actividades p INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
        WHERE p.activo = 1 AND EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id_usuario = e.id_usuario AND u.activo = 1)
        GROUP BY p.categoria, p.ciudad
        UNION ALL
        SELECT 'vehiculo', p.categoria, p.ciudad, COUNT(*)
        FROM dbo.vehiculos p INNER JOIN dbo.empresas e ON e.id_empresa = p.id_empresa
        WHERE p.activo = 1 AND EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id_usuario = e.id_usuario AND u.activo = 1)
        GROUP BY p.categoria, p.ciudad;

        SELECT COUNT(*) AS total FROM dbo.empresas e WHERE EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id_usuario = e.id_usuario AND u.activo = 1);

        SELECT CAST(AVG(CAST(puntuacion AS DECIMAL(5, 2))) AS DECIMAL(4, 2)) AS promedio, COUNT(*) AS total
        FROM dbo.resenas WHERE visible = 1;
    `);
    const [grupos, empresas, valoracion] = resultado.recordsets;
    const porCategoria = {};
    const porCiudad = {};
    const ciudades = new Set();
    let totalHoteles = 0;
    let totalActividades = 0;
    let totalVehiculos = 0;
    for (const fila of grupos) {
        porCategoria[fila.categoria] = (porCategoria[fila.categoria] || 0) + fila.total;
        porCiudad[fila.ciudad] = (porCiudad[fila.ciudad] || 0) + fila.total;
        ciudades.add(fila.ciudad);
        if (fila.tipo === 'hotel') totalHoteles += fila.total;
        else if (fila.tipo === 'actividad') totalActividades += fila.total;
        else totalVehiculos += fila.total;
    }
    return {
        totalHoteles,
        totalActividades,
        totalVehiculos,
        totalEmpresas: empresas[0].total,
        ciudades: [...ciudades].sort((a, b) => a.localeCompare(b, 'es')),
        porCategoria,
        porCiudad,
        puntuacionMedia: valoracion[0].promedio === null ? null : Number(valoracion[0].promedio),
        totalResenas: valoracion[0].total
    };
}

/** Parámetros comunes de inserción y actualización. */
function agregarParametros(consulta, tipo, datos) {
    consulta
        .input('nombre', sql.NVarChar(150), datos.nombre)
        .input('ciudad', sql.NVarChar(60), datos.ciudad)
        .input('descripcion', sql.NVarChar(2000), datos.descripcion)
        .input('precio', sql.Decimal(10, 2), datos.precio)
        .input('idImagen', sql.Int, datos.idImagen || null);
    if (tipo === 'hotel') {
        consulta
            .input('tipoAlojamiento', sql.VarChar(20), datos.tipoAlojamiento)
            .input('direccion', sql.NVarChar(250), datos.direccion)
            .input('servicios', sql.VarChar(300), datos.servicios.length ? datos.servicios.join(',') : null)
            .input('capacidad', sql.Int, datos.capacidadPersonas)
            .input('habitaciones', sql.Int, datos.habitaciones);
    } else if (tipo === 'vehiculo') {
        consulta
            .input('categoria', sql.VarChar(20), datos.categoria)
            .input('marca', sql.NVarChar(60), datos.marca)
            .input('modelo', sql.NVarChar(60), datos.modelo)
            .input('anio', sql.SmallInt, datos.anio)
            .input('transmision', sql.VarChar(12), datos.transmision)
            .input('combustible', sql.VarChar(12), datos.combustible)
            .input('pasajeros', sql.TinyInt, datos.pasajeros)
            .input('puertas', sql.TinyInt, datos.puertas)
            .input('maletas', sql.TinyInt, datos.maletas)
            .input('aire', sql.Bit, datos.aire ? 1 : 0)
            .input('kmPorDia', sql.Int, datos.kmPorDia)
            .input('lugarRecogida', sql.NVarChar(250), datos.lugarRecogida)
            .input('incluye', sql.NVarChar(500), datos.incluye || null)
            .input('deposito', sql.Decimal(10, 2), datos.deposito)
            .input('edadMinima', sql.TinyInt, datos.edadMinima)
            .input('cargoJoven', sql.Decimal(10, 2), datos.cargoConductorJoven)
            .input('cargoOtraCiudad', sql.Decimal(10, 2), datos.cargoOtraCiudad)
            .input('unidades', sql.Int, datos.unidades);
    } else {
        consulta
            .input('categoria', sql.VarChar(30), datos.categoria)
            .input('puntoEncuentro', sql.NVarChar(250), datos.puntoEncuentro)
            .input('incluye', sql.NVarChar(500), datos.incluye || null)
            .input('duracion', sql.Decimal(5, 1), datos.duracionHoras)
            .input('cupo', sql.Int, datos.cupoDiario);
    }
    return consulta;
}

/** @returns {Promise<number>} id de la publicación creada. */
async function crear(tipo, idEmpresa, datos) {
    const consulta = agregarParametros(await peticion(), tipo, datos).input('idEmpresa', sql.Int, idEmpresa);
    const texto = tipo === 'vehiculo'
        ? `INSERT INTO dbo.vehiculos
               (id_empresa, nombre, marca, modelo, anio, categoria, transmision, combustible, pasajeros, puertas,
                maletas, aire, km_por_dia, ciudad, lugar_recogida, descripcion, incluye, precio_dia, deposito,
                edad_minima, cargo_conductor_joven, cargo_otra_ciudad, unidades, id_imagen)
           OUTPUT INSERTED.id_vehiculo AS id
           VALUES (@idEmpresa, @nombre, @marca, @modelo, @anio, @categoria, @transmision, @combustible, @pasajeros, @puertas,
                   @maletas, @aire, @kmPorDia, @ciudad, @lugarRecogida, @descripcion, @incluye, @precio, @deposito,
                   @edadMinima, @cargoJoven, @cargoOtraCiudad, @unidades, @idImagen)`
        : tipo === 'hotel'
        ? `INSERT INTO dbo.hoteles
               (id_empresa, nombre, tipo_alojamiento, ciudad, direccion, descripcion, servicios,
                precio_noche, capacidad_personas, habitaciones, id_imagen)
           OUTPUT INSERTED.id_hotel AS id
           VALUES (@idEmpresa, @nombre, @tipoAlojamiento, @ciudad, @direccion, @descripcion, @servicios,
                   @precio, @capacidad, @habitaciones, @idImagen)`
        : `INSERT INTO dbo.actividades
               (id_empresa, nombre, categoria, ciudad, punto_encuentro, descripcion, incluye,
                duracion_horas, precio_persona, cupo_diario, id_imagen)
           OUTPUT INSERTED.id_actividad AS id
           VALUES (@idEmpresa, @nombre, @categoria, @ciudad, @puntoEncuentro, @descripcion, @incluye,
                   @duracion, @precio, @cupo, @idImagen)`;
    const resultado = await consulta.query(texto);
    return resultado.recordset[0].id;
}

/**
 * Actualiza una publicación de la empresa indicada. Si no se envía una
 * imagen nueva (idImagen null) se conserva la actual.
 * @returns {Promise<boolean>} false si la publicación no existe o no pertenece a la empresa.
 */
async function actualizar(tipo, id, idEmpresa, datos) {
    const consulta = agregarParametros(await peticion(), tipo, datos)
        .input('id', sql.Int, id)
        .input('idEmpresa', sql.Int, idEmpresa);
    const texto = tipo === 'vehiculo'
        ? `UPDATE dbo.vehiculos
           SET nombre = @nombre, marca = @marca, modelo = @modelo, anio = @anio, categoria = @categoria,
               transmision = @transmision, combustible = @combustible, pasajeros = @pasajeros, puertas = @puertas,
               maletas = @maletas, aire = @aire, km_por_dia = @kmPorDia, ciudad = @ciudad,
               lugar_recogida = @lugarRecogida, descripcion = @descripcion, incluye = @incluye,
               precio_dia = @precio, deposito = @deposito, edad_minima = @edadMinima,
               cargo_conductor_joven = @cargoJoven, cargo_otra_ciudad = @cargoOtraCiudad, unidades = @unidades,
               id_imagen = COALESCE(@idImagen, id_imagen), fecha_actualizacion = SYSUTCDATETIME()
           WHERE id_vehiculo = @id AND id_empresa = @idEmpresa`
        : tipo === 'hotel'
        ? `UPDATE dbo.hoteles
           SET nombre = @nombre, tipo_alojamiento = @tipoAlojamiento, ciudad = @ciudad, direccion = @direccion,
               descripcion = @descripcion, servicios = @servicios, precio_noche = @precio,
               capacidad_personas = @capacidad, habitaciones = @habitaciones,
               id_imagen = COALESCE(@idImagen, id_imagen), fecha_actualizacion = SYSUTCDATETIME()
           WHERE id_hotel = @id AND id_empresa = @idEmpresa`
        : `UPDATE dbo.actividades
           SET nombre = @nombre, categoria = @categoria, ciudad = @ciudad, punto_encuentro = @puntoEncuentro,
               descripcion = @descripcion, incluye = @incluye, duracion_horas = @duracion,
               precio_persona = @precio, cupo_diario = @cupo,
               id_imagen = COALESCE(@idImagen, id_imagen), fecha_actualizacion = SYSUTCDATETIME()
           WHERE id_actividad = @id AND id_empresa = @idEmpresa`;
    const resultado = await consulta.query(texto);
    return resultado.rowsAffected[0] > 0;
}

/** Publica u oculta una publicación de la empresa. @returns {Promise<boolean>} */
async function cambiarEstado(tipo, id, idEmpresa, activo) {
    const { tabla, id: columnaId } = TIPOS[tipo];
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, id)
        .input('idEmpresa', sql.Int, idEmpresa)
        .input('activo', sql.Bit, activo ? 1 : 0)
        .query(`UPDATE ${tabla} SET activo = @activo, fecha_actualizacion = SYSUTCDATETIME()
                WHERE ${columnaId} = @id AND id_empresa = @idEmpresa`);
    return resultado.rowsAffected[0] > 0;
}

/**
 * Elimina una publicación sin reservas. Si tiene reservas (historial que
 * debe conservarse) no se elimina.
 * @returns {Promise<'eliminada'|'con-reservas'|'no-existe'>}
 */
async function eliminar(tipo, id, idEmpresa) {
    const { tabla, id: columnaId } = TIPOS[tipo];
    const columnaReserva = columnaId;   // misma columna en dbo.reservas y dbo.favoritos
    const consulta = await peticion();
    const resultado = await consulta
        .input('id', sql.Int, id)
        .input('idEmpresa', sql.Int, idEmpresa)
        .query(`
            IF NOT EXISTS (SELECT 1 FROM ${tabla} WHERE ${columnaId} = @id AND id_empresa = @idEmpresa)
                SELECT 'no-existe' AS resultado;
            ELSE IF EXISTS (SELECT 1 FROM dbo.reservas WHERE ${columnaReserva} = @id)
                SELECT 'con-reservas' AS resultado;
            ELSE
            BEGIN
                DELETE FROM dbo.favoritos WHERE ${columnaId} = @id;
                DELETE FROM ${tabla} WHERE ${columnaId} = @id AND id_empresa = @idEmpresa;
                SELECT 'eliminada' AS resultado;
            END
        `);
    return resultado.recordset[0].resultado;
}

module.exports = {
    TIPOS,
    ORDENES,
    listar,
    obtener,
    listarFavoritas,
    estadisticas,
    precios,
    crear,
    actualizar,
    cambiarEstado,
    eliminar
};
