/**
 * @file src/services/tienda.service.js
 * @description Tienda de artesanía dominicana: pedidos con entrega en el
 *   hotel (gratis) o a domicilio (ENTREGAS_PEDIDO), pagados con tarjeta en la
 *   pasarela simulada. Las existencias se comprueban y descuentan en la misma
 *   transacción que el cobro: si la tarjeta se rechaza, no se crea el pedido.
 *   El viajero puede cancelar mientras el pedido no se haya enviado (se
 *   reembolsa la tarjeta y se reponen las existencias); la administración
 *   lo marca como enviado y entregado.
 */

const crypto = require('crypto');

const pagosService = require('./pagos.service');
const { conTransaccion, tiendaRepo } = require('../repositories');
const { solicitudInvalida, noEncontrado, conflicto, prohibido } = require('../utils/errores');
const { aEnteroPositivo, textoLimpio } = require('../utils/validacion');
const { ENTREGAS_PEDIDO, enCatalogo } = require('../utils/catalogos');

const MAXIMO_LINEAS = 15;
const MAXIMO_POR_PRODUCTO = 20;
const ERRORES_SQL_DUPLICADO = [2627, 2601];
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de pedido: PED + 7 caracteres. */
function generarCodigo() {
    let codigo = 'PED';
    for (let i = 0; i < 7; i++) codigo += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return codigo;
}

/** Valida el carrito y la entrega. */
function validarPedido(datos) {
    const lista = Array.isArray(datos.productos) ? datos.productos : [];
    if (!lista.length) throw solicitudInvalida('Tu carrito está vacío.', 'carrito');
    if (lista.length > MAXIMO_LINEAS) throw solicitudInvalida(`Puedes pedir hasta ${MAXIMO_LINEAS} productos distintos.`, 'carrito');
    const cantidades = new Map();
    for (const linea of lista) {
        const id = aEnteroPositivo(linea && linea.id);
        const cantidad = aEnteroPositivo(linea && linea.cantidad);
        if (!id || !cantidad) throw solicitudInvalida('Revisa las cantidades del carrito.', 'carrito');
        cantidades.set(id, (cantidades.get(id) || 0) + cantidad);
    }
    for (const cantidad of cantidades.values()) {
        if (cantidad > MAXIMO_POR_PRODUCTO) throw solicitudInvalida(`Puedes pedir hasta ${MAXIMO_POR_PRODUCTO} unidades de cada producto.`, 'carrito');
    }

    const entrega = String(datos.entrega || '');
    if (!enCatalogo(ENTREGAS_PEDIDO, entrega)) throw solicitudInvalida('Elige cómo quieres recibir el pedido.', 'pedido-entrega');
    const destinatario = textoLimpio(datos.destinatario).slice(0, 100);
    if (destinatario.length < 3) throw solicitudInvalida('Escribe el nombre de quien recibe el pedido.', 'pedido-destinatario');
    const direccion = textoLimpio(datos.direccion).slice(0, 300);
    if (direccion.length < 8) {
        throw solicitudInvalida(entrega === 'hotel' ? 'Escribe el nombre del hotel y la ciudad.' : 'Escribe la dirección completa de entrega.', 'pedido-direccion');
    }
    const telefono = textoLimpio(datos.telefono).slice(0, 20);
    if (telefono && !/^[\d\s()+-]{7,20}$/.test(telefono)) throw solicitudInvalida('Revisa el número de teléfono.', 'pedido-telefono');

    return { cantidades, entrega, destinatario, direccion, telefono: telefono || null };
}

/**
 * Crea un pedido pagado.
 * @returns {Promise<object>} pedido con sus líneas y el pago
 */
async function crearPedido(usuario, datos) {
    if (usuario.rol !== 'cliente') throw prohibido('Las compras se realizan con una cuenta de viajero.');
    const solicitud = validarPedido(datos || {});
    const validado = pagosService.validarPago(datos.pago);
    if (validado.metodo !== 'tarjeta') throw solicitudInvalida('Los pedidos de la tienda se pagan con tarjeta.', 'pago-metodo');
    const pagoValidado = await pagosService.prepararCobro(validado);

    for (let intento = 1; ; intento++) {
        try {
            return await conTransaccion(async (transaccion) => {
                const lineas = [];
                for (const [id, cantidad] of solicitud.cantidades) {
                    const producto = await tiendaRepo.bloquearProducto(transaccion, id);
                    if (!producto) throw noEncontrado('Uno de los productos ya no está a la venta.');
                    if (producto.existencias < cantidad) {
                        throw conflicto(producto.existencias
                            ? `Solo quedan ${producto.existencias} de "${producto.nombre}".`
                            : `"${producto.nombre}" está agotado.`, 'carrito');
                    }
                    lineas.push({ idProducto: id, nombre: producto.nombre, imagen: producto.imagen, cantidad, precio: producto.precio });
                }
                const subtotal = Math.round(lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0) * 100) / 100;
                const envio = ENTREGAS_PEDIDO[solicitud.entrega].costo;
                const total = subtotal + envio;
                const pago = pagosService.cobrar(pagoValidado, total);
                const pedido = {
                    codigo: generarCodigo(),
                    idUsuario: usuario.id,
                    entrega: solicitud.entrega,
                    destinatario: solicitud.destinatario,
                    direccion: solicitud.direccion,
                    telefono: solicitud.telefono,
                    subtotal,
                    envio,
                    total,
                    pago,
                    lineas
                };
                const id = await tiendaRepo.crearPedido(transaccion, pedido);
                return {
                    id,
                    codigo: pedido.codigo,
                    entrega: pedido.entrega,
                    destinatario: pedido.destinatario,
                    direccion: pedido.direccion,
                    subtotal,
                    envio,
                    total,
                    estado: 'pagado',
                    lineas,
                    pago: Object.assign({}, pago, { montoCobrado: pago.montoCobrado == null ? pago.monto : pago.montoCobrado, fechaPago: new Date().toISOString() })
                };
            });
        } catch (error) {
            if (ERRORES_SQL_DUPLICADO.includes(error.number) && intento < 3) continue;
            throw error;
        }
    }
}

/** El viajero cancela un pedido que aún no se ha enviado; se reembolsa la tarjeta. */
async function cancelarPedido(usuario, idPedido) {
    const id = aEnteroPositivo(idPedido);
    if (!id) throw noEncontrado('El pedido no existe.');
    return conTransaccion(async (transaccion) => {
        const pedido = await tiendaRepo.bloquearPedido(transaccion, id);
        if (!pedido || pedido.idUsuario !== usuario.id) throw noEncontrado('El pedido no existe.');
        if (pedido.estado !== 'pagado') throw conflicto('Solo se pueden cancelar los pedidos que aún no se han enviado.');
        await tiendaRepo.cambiarEstadoPedido(transaccion, id, 'cancelado');
        return { reembolso: { monto: pedido.total, moneda: pedido.moneda, montoCobrado: pedido.montoCobrado, marca: pedido.marca, ultimos4: pedido.ultimos4 } };
    });
}

const SIGUIENTE_ESTADO = { pagado: 'enviado', enviado: 'entregado' };

/** La administración avanza el pedido: pagado -> enviado -> entregado. */
async function avanzarPedido(idPedido) {
    const id = aEnteroPositivo(idPedido);
    if (!id) throw noEncontrado('El pedido no existe.');
    return conTransaccion(async (transaccion) => {
        const pedido = await tiendaRepo.bloquearPedido(transaccion, id);
        if (!pedido) throw noEncontrado('El pedido no existe.');
        const siguiente = SIGUIENTE_ESTADO[pedido.estado];
        if (!siguiente) throw conflicto('Este pedido ya no puede cambiar de estado.');
        await tiendaRepo.cambiarEstadoPedido(transaccion, id, siguiente);
        return { estado: siguiente };
    });
}

module.exports = { crearPedido, cancelarPedido, avanzarPedido };
