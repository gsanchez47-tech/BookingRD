/**
 * @file src/repositories/tienda.repo.js
 * @description Tienda de artesanía: productos y pedidos (SQL Server / Azure).
 *   Las existencias se descuentan y se reponen dentro de la transacción del
 *   pedido (src/services/tienda.service.js), con la fila del producto
 *   bloqueada para que dos compras simultáneas no vendan más de lo que hay.
 */

const { peticion, sql } = require('../config/db');

const COLUMNAS_PRODUCTO = `id_producto, nombre, categoria, descripcion, taller, origen, precio, existencias, imagen_url, destacado`;

function aProducto(f) {
    return {
        id: f.id_producto,
        nombre: f.nombre,
        categoria: f.categoria,
        descripcion: f.descripcion,
        taller: f.taller,
        origen: f.origen,
        precio: Number(f.precio),
        existencias: f.existencias,
        imagen: f.imagen_url || null,
        destacado: Boolean(f.destacado)
    };
}

/** Productos a la venta, los destacados primero. */
async function listarProductos() {
    const consulta = await peticion();
    const resultado = await consulta.query(`
        SELECT ${COLUMNAS_PRODUCTO} FROM dbo.productos
        WHERE activo = 1
        ORDER BY destacado DESC, categoria, nombre`);
    return resultado.recordset.map(aProducto);
}

/** Lee un producto activo y bloquea su fila hasta el final de la transacción. */
async function bloquearProducto(transaccion, id) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('id', sql.Int, id)
        .query(`SELECT ${COLUMNAS_PRODUCTO} FROM dbo.productos WITH (UPDLOCK, HOLDLOCK) WHERE id_producto = @id AND activo = 1`);
    return resultado.recordset[0] ? aProducto(resultado.recordset[0]) : null;
}

/** Inserta el pedido con su detalle y descuenta las existencias. @returns {Promise<number>} id_pedido */
async function crearPedido(transaccion, pedido) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('codigo', sql.Char(10), pedido.codigo)
        .input('idUsuario', sql.Int, pedido.idUsuario)
        .input('entrega', sql.VarChar(10), pedido.entrega)
        .input('destinatario', sql.NVarChar(100), pedido.destinatario)
        .input('direccion', sql.NVarChar(300), pedido.direccion)
        .input('telefono', sql.VarChar(20), pedido.telefono || null)
        .input('subtotal', sql.Decimal(12, 2), pedido.subtotal)
        .input('envio', sql.Decimal(10, 2), pedido.envio)
        .input('total', sql.Decimal(12, 2), pedido.total)
        .input('marca', sql.VarChar(20), pedido.pago.marca)
        .input('ultimos4', sql.Char(4), pedido.pago.ultimos4)
        .input('titular', sql.NVarChar(100), pedido.pago.titular)
        .input('referencia', sql.Char(11), pedido.pago.referencia)
        .input('autorizacion', sql.Char(6), pedido.pago.autorizacion)
        .input('moneda', sql.Char(3), pedido.pago.moneda || 'DOP')
        .input('montoCobrado', sql.Decimal(12, 2), pedido.pago.montoCobrado)
        .input('tasa', sql.Decimal(12, 6), pedido.pago.tasa)
        .query(`
            INSERT INTO dbo.pedidos (codigo, id_usuario, entrega, destinatario, direccion, telefono, subtotal, envio, total,
                                     pago_marca, pago_ultimos4, pago_titular, pago_referencia, pago_autorizacion,
                                     pago_moneda, pago_monto_cobrado, pago_tasa_cambio)
            OUTPUT INSERTED.id_pedido AS id
            VALUES (@codigo, @idUsuario, @entrega, @destinatario, @direccion, @telefono, @subtotal, @envio, @total,
                    @marca, @ultimos4, @titular, @referencia, @autorizacion, @moneda, @montoCobrado, @tasa)`);
    const idPedido = resultado.recordset[0].id;
    for (const linea of pedido.lineas) {
        const detalle = await peticion(transaccion);
        await detalle
            .input('idPedido', sql.Int, idPedido)
            .input('idProducto', sql.Int, linea.idProducto)
            .input('cantidad', sql.Int, linea.cantidad)
            .input('precio', sql.Decimal(10, 2), linea.precio)
            .query(`
                INSERT INTO dbo.pedido_detalle (id_pedido, id_producto, cantidad, precio_unitario)
                VALUES (@idPedido, @idProducto, @cantidad, @precio);
                UPDATE dbo.productos SET existencias = existencias - @cantidad WHERE id_producto = @idProducto;`);
    }
    return idPedido;
}

const COLUMNAS_PEDIDO = `
    pe.id_pedido, pe.codigo, pe.entrega, pe.destinatario, pe.direccion, pe.telefono, pe.subtotal, pe.envio, pe.total,
    pe.estado, pe.pago_marca, pe.pago_ultimos4, pe.pago_titular, pe.pago_referencia, pe.pago_autorizacion, pe.fecha_creacion,
    pe.pago_moneda, pe.pago_monto_cobrado, pe.pago_tasa_cambio, pe.reembolso_monto, pe.cargo_cancelacion,
    u.nombre AS cliente_nombre, u.correo AS cliente_correo`;

/** Pedidos (filas) con sus líneas, en la forma que usa el frontend. */
async function conLineas(filas) {
    if (!filas.length) return [];
    const consulta = await peticion();
    const ids = filas.map((f) => Number(f.id_pedido)).filter(Number.isInteger);
    const resultado = await consulta.query(`
        SELECT d.id_pedido, d.cantidad, d.precio_unitario, p.id_producto, p.nombre, p.imagen_url
        FROM dbo.pedido_detalle d INNER JOIN dbo.productos p ON p.id_producto = d.id_producto
        WHERE d.id_pedido IN (${ids.join(',')})
        ORDER BY d.id_detalle`);
    return filas.map((f) => aPedido(f, resultado.recordset.filter((d) => d.id_pedido === f.id_pedido)));
}

function aPedido(f, lineas) {
    return {
        id: f.id_pedido,
        codigo: f.codigo,
        entrega: f.entrega,
        destinatario: f.destinatario,
        direccion: f.direccion,
        telefono: f.telefono,
        subtotal: Number(f.subtotal),
        envio: Number(f.envio),
        total: Number(f.total),
        estado: f.estado,
        fecha: f.fecha_creacion,
        pago: {
            metodo: 'tarjeta',
            estado: f.estado === 'cancelado' ? 'reembolsado' : 'pagado',
            monto: Number(f.total),
            moneda: f.pago_moneda || 'DOP',
            montoCobrado: f.pago_monto_cobrado != null ? Number(f.pago_monto_cobrado) : Number(f.total),
            tasa: f.pago_tasa_cambio != null ? Number(f.pago_tasa_cambio) : null,
            marca: f.pago_marca,
            ultimos4: f.pago_ultimos4,
            titular: f.pago_titular,
            referencia: f.pago_referencia,
            autorizacion: f.pago_autorizacion,
            fechaPago: f.fecha_creacion,
            montoReembolsado: f.reembolso_monto != null ? Number(f.reembolso_monto) : null,
            cargoCancelacion: f.cargo_cancelacion != null ? Number(f.cargo_cancelacion) : null
        },
        cliente: f.cliente_nombre ? { nombre: f.cliente_nombre, correo: f.cliente_correo } : undefined,
        lineas: lineas.map((d) => ({
            idProducto: d.id_producto,
            nombre: d.nombre,
            imagen: d.imagen_url || null,
            cantidad: d.cantidad,
            precio: Number(d.precio_unitario)
        }))
    };
}

/** Pedidos de un viajero, del más reciente al más antiguo. */
async function listarPedidosPorUsuario(idUsuario) {
    const consulta = await peticion();
    const resultado = await consulta
        .input('idUsuario', sql.Int, idUsuario)
        .query(`SELECT ${COLUMNAS_PEDIDO} FROM dbo.pedidos pe INNER JOIN dbo.usuarios u ON u.id_usuario = pe.id_usuario
                WHERE pe.id_usuario = @idUsuario ORDER BY pe.fecha_creacion DESC, pe.id_pedido DESC`);
    return conLineas(resultado.recordset);
}

/** Todos los pedidos (administración). */
async function listarPedidos() {
    const consulta = await peticion();
    const resultado = await consulta
        .query(`SELECT ${COLUMNAS_PEDIDO} FROM dbo.pedidos pe INNER JOIN dbo.usuarios u ON u.id_usuario = pe.id_usuario
                ORDER BY pe.fecha_creacion DESC, pe.id_pedido DESC`);
    return conLineas(resultado.recordset);
}

/** Lee un pedido y bloquea su fila. @returns {Promise<{id, idUsuario, estado, total, marca, ultimos4}|null>} */
async function bloquearPedido(transaccion, id) {
    const consulta = await peticion(transaccion);
    const resultado = await consulta
        .input('id', sql.Int, id)
        .query(`SELECT id_pedido, id_usuario, estado, total, pago_marca, pago_ultimos4, pago_moneda,
                       ISNULL(pago_monto_cobrado, total) AS pago_monto_cobrado
                FROM dbo.pedidos WITH (UPDLOCK, HOLDLOCK) WHERE id_pedido = @id`);
    return aPedidoBloqueado(resultado.recordset[0]);
}

/** Fila de un pedido bloqueado a la forma que usa el servicio. */
function aPedidoBloqueado(f) {
    return f
        ? {
            id: f.id_pedido,
            idUsuario: f.id_usuario,
            estado: f.estado,
            total: Number(f.total),
            marca: f.pago_marca,
            ultimos4: f.pago_ultimos4,
            moneda: f.pago_moneda || 'DOP',
            montoCobrado: Number(f.pago_monto_cobrado == null ? f.total : f.pago_monto_cobrado)
        }
        : null;
}

/** Cambia el estado; al cancelar, repone las existencias. */
/** Guarda lo reembolsado y el cargo retenido al cancelar un pedido. */
async function registrarReembolsoPedido(transaccion, id, reembolso) {
    const consulta = await peticion(transaccion);
    await consulta
        .input('id', sql.Int, id)
        .input('monto', sql.Decimal(12, 2), reembolso.monto)
        .input('cargo', sql.Decimal(12, 2), reembolso.cargo)
        .query('UPDATE dbo.pedidos SET reembolso_monto = @monto, cargo_cancelacion = @cargo WHERE id_pedido = @id');
}

async function cambiarEstadoPedido(transaccion, id, estado) {
    const consulta = await peticion(transaccion);
    await consulta
        .input('id', sql.Int, id)
        .input('estado', sql.VarChar(12), estado)
        .query('UPDATE dbo.pedidos SET estado = @estado WHERE id_pedido = @id');
    if (estado !== 'cancelado') return;
    const reponer = await peticion(transaccion);
    await reponer
        .input('id', sql.Int, id)
        .query(`UPDATE p SET existencias = p.existencias + d.cantidad
                FROM dbo.productos p INNER JOIN dbo.pedido_detalle d ON d.id_producto = p.id_producto
                WHERE d.id_pedido = @id`);
}

module.exports = {
    aProducto,
    aPedido,
    aPedidoBloqueado,
    listarProductos,
    bloquearProducto,
    crearPedido,
    listarPedidosPorUsuario,
    listarPedidos,
    bloquearPedido,
    cambiarEstadoPedido, registrarReembolsoPedido
};
