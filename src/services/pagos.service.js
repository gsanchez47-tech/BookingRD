/**
 * @file src/services/pagos.service.js
 * @description Pasarela de pago SIMULADA para la demostración del proyecto.
 *
 *   No se conecta con ningún banco ni procesador y no guarda el número de la
 *   tarjeta ni el CVV: solo la marca, los últimos cuatro dígitos y el titular.
 *   Las reglas imitan a una pasarela real para que la demostración muestre
 *   los mismos casos (aprobado, rechazado, fondos insuficientes):
 *
 *     - Formato: número de 13 a 19 dígitos que supera el algoritmo de Luhn,
 *       marca reconocida (Visa, Mastercard o American Express), vencimiento
 *       MM/AA no vencido y CVV de 3 dígitos (4 en American Express).
 *     - Respuesta del "banco": las tarjetas de TARJETAS_RECHAZADAS se rechazan
 *       con su motivo; cualquier otra tarjeta válida se aprueba y recibe un
 *       número de autorización de 6 dígitos.
 *
 *   Métodos: 'tarjeta' (se cobra al reservar) o 'en_destino' (se paga en el
 *   hotel, al operador o en el mostrador; la empresa lo marca como cobrado).
 *   Monedas del cobro: pesos dominicanos (DOP) o dólares (USD). Los precios
 *   están en pesos; en dólares se cobra el total convertido con la tasa del
 *   día (externos.service.js) y se guardan el importe cobrado y la tasa.
 *   Estados: 'pagado', 'pendiente', 'reembolsado' (tarjeta cancelada) y
 *   'anulado' (pago en destino de una reserva cancelada).
 */

'use strict';

const crypto = require('crypto');
const externos = require('./externos.service');
const { ErrorHttp, solicitudInvalida } = require('../utils/errores');
const { textoLimpio } = require('../utils/validacion');

const METODOS = ['tarjeta', 'en_destino'];

/** Monedas en que se puede pagar. Las demás (euros, etc.) solo son referencia. */
const MONEDAS_PAGO = ['DOP', 'USD'];

/** Tarjetas de prueba que la pasarela rechaza, con el motivo que devuelve. */
const TARJETAS_RECHAZADAS = {
    '4000000000000002': 'El banco emisor rechazó la tarjeta. Prueba con otra tarjeta.',
    '4000000000009995': 'Fondos insuficientes. Prueba con otra tarjeta.',
    '4000000000000127': 'El código de seguridad (CVV) no es correcto.'
};

/** Tarjetas de prueba documentadas para la demostración. */
const TARJETAS_PRUEBA = [
    { numero: '4242 4242 4242 4242', marca: 'Visa', resultado: 'Aprobada' },
    { numero: '5555 5555 5555 4444', marca: 'Mastercard', resultado: 'Aprobada' },
    { numero: '3782 822463 10005', marca: 'American Express', resultado: 'Aprobada (CVV de 4 dígitos)' },
    { numero: '4000 0000 0000 0002', marca: 'Visa', resultado: 'Rechazada por el banco' },
    { numero: '4000 0000 0000 9995', marca: 'Visa', resultado: 'Fondos insuficientes' }
];

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Algoritmo de Luhn (dígito verificador de las tarjetas). */
function pasaLuhn(numero) {
    let suma = 0;
    for (let i = 0; i < numero.length; i++) {
        let digito = Number(numero[numero.length - 1 - i]);
        if (i % 2 === 1) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
    }
    return suma % 10 === 0;
}

/** Marca según los primeros dígitos (rangos IIN publicados por cada red). */
function detectarMarca(numero) {
    if (/^4\d{12}(\d{3}){0,2}$/.test(numero)) return 'Visa';
    if (/^3[47]\d{13}$/.test(numero)) return 'American Express';
    const dos = Number(numero.slice(0, 2));
    const cuatro = Number(numero.slice(0, 4));
    if (numero.length === 16 && ((dos >= 51 && dos <= 55) || (cuatro >= 2221 && cuatro <= 2720))) return 'Mastercard';
    return null;
}

/** Mes y año actuales en República Dominicana. */
function mesActualRD() {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit' })
        .formatToParts(new Date());
    return {
        anio: Number(partes.find((p) => p.type === 'year').value),
        mes: Number(partes.find((p) => p.type === 'month').value)
    };
}

/**
 * Valida y normaliza el pago enviado con la reserva. Sin `pago`, la reserva
 * se paga en el destino.
 * @returns {{metodo: 'en_destino'} | {metodo: 'tarjeta', numero: string, marca: string, ultimos4: string, titular: string}}
 */
function validarPago(pago) {
    const metodo = pago && pago.metodo ? String(pago.metodo) : 'en_destino';
    if (!METODOS.includes(metodo)) throw solicitudInvalida('Selecciona cómo quieres pagar.', 'pago-metodo');
    const moneda = pago && pago.moneda ? String(pago.moneda).toUpperCase() : 'DOP';
    if (!MONEDAS_PAGO.includes(moneda)) throw solicitudInvalida('Se puede pagar en pesos dominicanos o en dólares.', 'pago-moneda');
    // En el destino se paga con la tasa del día de llegada: se registra en pesos.
    if (metodo === 'en_destino') return { metodo, moneda: 'DOP' };

    const titular = textoLimpio(pago.titular).slice(0, 100);
    if (titular.length < 3 || !/^[\p{L} .'-]+$/u.test(titular)) {
        throw solicitudInvalida('Escribe el nombre como aparece en la tarjeta.', 'pago-titular');
    }

    const numero = String(pago.numero || '').replace(/[\s-]/g, '');
    if (!/^\d{13,19}$/.test(numero) || !pasaLuhn(numero)) {
        throw solicitudInvalida('El número de tarjeta no es válido. Revisa los dígitos.', 'pago-numero');
    }
    const marca = detectarMarca(numero);
    if (!marca) throw solicitudInvalida('Aceptamos Visa, Mastercard y American Express.', 'pago-numero');

    const vencimiento = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(String(pago.vencimiento || '').trim());
    if (!vencimiento) throw solicitudInvalida('Escribe el vencimiento como MM/AA.', 'pago-vencimiento');
    const mes = Number(vencimiento[1]);
    const anio = 2000 + Number(vencimiento[2]);
    const actual = mesActualRD();
    if (anio < actual.anio || (anio === actual.anio && mes < actual.mes)) {
        throw solicitudInvalida('La tarjeta está vencida.', 'pago-vencimiento');
    }
    if (anio > actual.anio + 20) throw solicitudInvalida('Revisa el año de vencimiento.', 'pago-vencimiento');

    const largoCvv = marca === 'American Express' ? 4 : 3;
    if (!new RegExp(`^\\d{${largoCvv}}$`).test(String(pago.cvv || ''))) {
        throw solicitudInvalida(`El código de seguridad tiene ${largoCvv} dígitos.`, 'pago-cvv');
    }

    return { metodo, moneda, numero, marca, ultimos4: numero.slice(-4), titular };
}

/**
 * Agrega al pago validado la tasa del día (pesos por dólar) cuando se paga en
 * dólares. Se llama antes de abrir la transacción, porque puede consultar el
 * servicio de tasas.
 */
async function prepararCobro(pagoValidado) {
    if (pagoValidado.moneda !== 'USD') return Object.assign({}, pagoValidado, { tasa: null });
    const { tasas } = await externos.tasas();
    const tasa = Number(tasas.USD);
    if (!(tasa > 0)) throw new ErrorHttp(503, 'No hay tasa del dólar disponible. Paga en pesos o inténtalo más tarde.', 'pago-moneda');
    return Object.assign({}, pagoValidado, { tasa: Math.round(tasa * 1e6) / 1e6 });
}

/** Importe en dólares de un total en pesos con la tasa dada (redondeado a centavos). */
const enDolares = (pesos, tasa) => Math.round((pesos / tasa) * 100) / 100;

/** Referencia legible del pago: PAY + 8 caracteres. */
function generarReferencia() {
    let referencia = 'PAY';
    for (let i = 0; i < 8; i++) referencia += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return referencia;
}

/**
 * "Cobra" el importe. Se llama dentro de la transacción de la reserva, después
 * de confirmar la disponibilidad: si la tarjeta se rechaza, la reserva no se crea.
 * @returns {object} registro de pago listo para guardar
 */
function cobrar(pagoValidado, monto) {
    const enUsd = pagoValidado.moneda === 'USD' && pagoValidado.metodo === 'tarjeta';
    if (enUsd && !(pagoValidado.tasa > 0)) throw new Error('Falta la tasa del dólar: llama a prepararCobro antes de cobrar.');
    const base = {
        metodo: pagoValidado.metodo,
        monto,
        moneda: enUsd ? 'USD' : 'DOP',
        montoCobrado: enUsd ? enDolares(monto, pagoValidado.tasa) : null,
        tasa: enUsd ? pagoValidado.tasa : null,
        referencia: generarReferencia()
    };
    if (pagoValidado.metodo === 'en_destino') {
        return Object.assign(base, { estado: 'pendiente', marca: null, ultimos4: null, titular: null, autorizacion: null });
    }
    const motivo = TARJETAS_RECHAZADAS[pagoValidado.numero];
    if (motivo) {
        throw new ErrorHttp(402, motivo, pagoValidado.numero === '4000000000000127' ? 'pago-cvv' : 'pago-numero');
    }
    return Object.assign(base, {
        estado: 'pagado',
        marca: pagoValidado.marca,
        ultimos4: pagoValidado.ultimos4,
        titular: pagoValidado.titular,
        autorizacion: String(crypto.randomInt(1000000)).padStart(6, '0')
    });
}

/** Porcentaje que se retiene al cancelar un pago con tarjeta (el resto se reembolsa). */
const CARGO_CANCELACION_PCT = 10;

/**
 * Reembolso de una cancelación: se devuelve el 90 % de lo cobrado y se retiene
 * el 10 % como cargo. En dólares se aplica la misma proporción al monto cobrado.
 * @returns {{porcentaje: number, cargo: number, monto: number, montoCobrado: number}}
 */
function calcularReembolso(monto, montoCobrado = monto) {
    const centavos = (v) => Math.round(v * 100) / 100;
    const cargo = centavos(monto * CARGO_CANCELACION_PCT / 100);
    const cargoCobrado = centavos(montoCobrado * CARGO_CANCELACION_PCT / 100);
    return { porcentaje: CARGO_CANCELACION_PCT, cargo, monto: centavos(monto - cargo), montoCobrado: centavos(montoCobrado - cargoCobrado) };
}

/** Estado del pago tras cancelar la reserva. */
const estadoTrasCancelar = (metodo) => (metodo === 'tarjeta' ? 'reembolsado' : 'anulado');

/** Fila de dbo.pagos (o columnas pago_* de una consulta) a objeto de la API. */
function aPago(fila, prefijo = '') {
    const c = (nombre) => fila[prefijo + nombre];
    if (!c('referencia')) return null;
    return {
        metodo: c('metodo'),
        estado: c('estado'),
        monto: Number(c('monto')),
        moneda: c('moneda') || 'DOP',
        montoCobrado: c('monto_cobrado') != null ? Number(c('monto_cobrado')) : Number(c('monto')),
        tasa: c('tasa_cambio') != null ? Number(c('tasa_cambio')) : null,
        marca: c('marca') || null,
        ultimos4: c('ultimos4') || null,
        titular: c('titular') || null,
        referencia: c('referencia'),
        autorizacion: c('autorizacion') || null,
        fechaPago: c('fecha_pago') || null,
        fechaReembolso: c('fecha_reembolso') || null,
        montoReembolsado: c('monto_reembolsado') != null ? Number(c('monto_reembolsado')) : null,
        cargoCancelacion: c('cargo_cancelacion') != null ? Number(c('cargo_cancelacion')) : null
    };
}

module.exports = {
    CARGO_CANCELACION_PCT,
    calcularReembolso,
    METODOS,
    MONEDAS_PAGO,
    TARJETAS_PRUEBA,
    validarPago,
    prepararCobro,
    enDolares,
    cobrar,
    estadoTrasCancelar,
    aPago,
    pasaLuhn,
    detectarMarca
};
