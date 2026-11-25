/**
 * @file public/js/pagos.js
 * @description Pagos SIMULADOS en el navegador: formulario de tarjeta,
 *   validación previa (la definitiva la hace el servidor, src/services/
 *   pagos.service.js), etiquetas de estado y recibo imprimible.
 *
 *   Usado por detalle.html (pago al reservar), mis-reservas.html (recibos),
 *   panel-empresa.html y admin.html (estado del pago en las tablas).
 *
 *   El número completo de la tarjeta y el CVV solo viajan en la petición de
 *   la reserva; el servidor responde con la marca y los últimos 4 dígitos.
 */

'use strict';

/** Tarjetas de prueba (mismas reglas que el servidor). */
const TARJETAS_PRUEBA = [
    { numero: '4242 4242 4242 4242', marca: 'Visa', resultado: 'Aprobada' },
    { numero: '5555 5555 5555 4444', marca: 'Mastercard', resultado: 'Aprobada' },
    { numero: '3782 822463 10005', marca: 'American Express', resultado: 'Aprobada, CVV de 4 dígitos' },
    { numero: '4000 0000 0000 0002', marca: 'Visa', resultado: 'Rechazada por el banco' },
    { numero: '4000 0000 0000 9995', marca: 'Visa', resultado: 'Fondos insuficientes' }
];

/* ----------------------------------------------------------------------------
   Validación de la tarjeta
   ---------------------------------------------------------------------------- */

const soloDigitos = (texto) => String(texto || '').replace(/\D/g, '');

/** Algoritmo de Luhn. */
function tarjetaPasaLuhn(numero) {
    let suma = 0;
    for (let i = 0; i < numero.length; i++) {
        let digito = Number(numero[numero.length - 1 - i]);
        if (i % 2 === 1) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
    }
    return numero.length > 0 && suma % 10 === 0;
}

/** Marca probable según los primeros dígitos (sirve también con el número incompleto). */
function marcaTarjeta(numero) {
    if (/^4/.test(numero)) return 'Visa';
    if (/^3[47]/.test(numero)) return 'American Express';
    if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(numero)) return 'Mastercard';
    return null;
}

/** Número con espacios según la marca: 4-4-4-4, o 4-6-5 en American Express. */
function formatearNumeroTarjeta(numero) {
    const digitos = soloDigitos(numero).slice(0, 19);
    if (marcaTarjeta(digitos) === 'American Express') {
        return [digitos.slice(0, 4), digitos.slice(4, 10), digitos.slice(10, 15)].filter(Boolean).join(' ');
    }
    return digitos.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * Valida los datos de la tarjeta antes de enviarlos.
 * @returns {{campo: string, mensaje: string}|null} primer error encontrado
 */
function validarTarjeta({ titular, numero, vencimiento, cvv }) {
    if (titular.trim().length < 3 || !/^[\p{L} .'-]+$/u.test(titular.trim())) {
        return { campo: 'pago-titular', mensaje: 'Escribe el nombre como aparece en la tarjeta.' };
    }
    const digitos = soloDigitos(numero);
    if (digitos.length < 13 || !tarjetaPasaLuhn(digitos)) {
        return { campo: 'pago-numero', mensaje: 'El número de tarjeta no es válido. Revisa los dígitos.' };
    }
    const marca = marcaTarjeta(digitos);
    if (!marca) return { campo: 'pago-numero', mensaje: 'Aceptamos Visa, Mastercard y American Express.' };
    const partes = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(vencimiento.trim());
    if (!partes) return { campo: 'pago-vencimiento', mensaje: 'Escribe el vencimiento como MM/AA.' };
    const [anio, mes] = hoyIso().split('-').map(Number);
    const anioTarjeta = 2000 + Number(partes[2]);
    if (anioTarjeta < anio || (anioTarjeta === anio && Number(partes[1]) < mes)) {
        return { campo: 'pago-vencimiento', mensaje: 'La tarjeta está vencida.' };
    }
    const largo = marca === 'American Express' ? 4 : 3;
    if (!new RegExp(`^\\d{${largo}}$`).test(cvv)) {
        return { campo: 'pago-cvv', mensaje: `El código de seguridad tiene ${largo} dígitos.` };
    }
    return null;
}

/* ----------------------------------------------------------------------------
   Etiquetas de estado
   ---------------------------------------------------------------------------- */

/** Importe cobrado: en dólares con centavos, o en pesos. */
function importeCobrado(pago) {
    if (pago && pago.moneda === 'USD' && pago.montoCobrado) return formatearExacto(pago.montoCobrado, 'USD');
    return formatoMoneda.format((pago && pago.monto) || 0);
}

/** Porcentaje que se retiene al cancelar un pago con tarjeta (igual que en el servidor). */
const CARGO_CANCELACION_PCT = 10;

/**
 * Lo que se devolvería al cancelar: { reembolso, cargo } ya formateados en la
 * moneda del cobro (pesos o dólares).
 */
function textoReembolso(pago) {
    const enDolares = pago.moneda === 'USD' && pago.montoCobrado;
    const base = enDolares ? pago.montoCobrado : pago.monto;
    const cargo = Math.round(base * CARGO_CANCELACION_PCT) / 100;
    const formato = (v) => (enDolares ? formatearExacto(v, 'USD') : formatoMoneda.format(v));
    return { reembolso: formato(base - cargo), cargo: formato(cargo) };
}

/** Tarjeta abreviada: "Visa •••• 4242". */
const tarjetaAbreviada = (pago) => `${pago.marca === 'American Express' ? 'Amex' : pago.marca} •••• ${pago.ultimos4}`;

/**
 * Texto y clase del estado del pago para chips y tablas.
 * @param {object|null} pago
 * @param {'viajero'|'empresa'} [vista]
 * @returns {{texto: string, clase: string}}
 */
function estadoPago(pago, vista = 'viajero') {
    if (!pago) return { texto: 'Sin pago registrado', clase: 'neutro' };
    if (pago.metodo === 'tarjeta') {
        const enDolares = pago.moneda === 'USD' ? ' en US$' : '';
        if (pago.estado === 'reembolsado') return { texto: `Reembolsado a ${tarjetaAbreviada(pago)}${enDolares}`, clase: 'reembolsado' };
        return { texto: `Pagado con ${tarjetaAbreviada(pago)}${enDolares}`, clase: 'pagado' };
    }
    if (pago.estado === 'pagado') return { texto: 'Pagado en el destino', clase: 'pagado' };
    if (pago.estado === 'anulado') return { texto: 'Pago en destino anulado', clase: 'neutro' };
    return { texto: vista === 'empresa' ? 'Por cobrar en destino' : 'Pago pendiente en el destino', clase: 'pendiente' };
}

/** Chip HTML del estado del pago. */
function chipPago(pago, vista) {
    const { texto, clase } = estadoPago(pago, vista);
    return `<span class="chip-pago es-${clase}">${escaparHtml(texto)}</span>`;
}

/* ----------------------------------------------------------------------------
   Recibo
   ---------------------------------------------------------------------------- */

const formatoFechaHoraRecibo = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo'
});

/**
 * Muestra el recibo del pago en una ventana modal con opción de imprimir.
 * @param {{codigo: string, publicacion: string, proveedor?: string, fechas: string,
 *          cliente?: string, total: number, pago: object}} datos
 */
function abrirRecibo(datos) {
    let modal = document.getElementById('modal-recibo');
    if (!modal) {
        modal = document.createElement('dialog');
        modal.className = 'modal modal-recibo';
        modal.id = 'modal-recibo';
        modal.setAttribute('aria-labelledby', 'recibo-titulo');
        document.body.appendChild(modal);
    }
    const pago = datos.pago || {};
    const esTarjeta = pago.metodo === 'tarjeta';
    // [etiqueta, valor, traducible]: nombres propios y códigos no se traducen.
    const filas = [
        [datos.etiquetaCodigo || 'Código de reserva', datos.codigo, false],
        [datos.etiquetaServicio || 'Servicio', datos.publicacion, false],
        datos.proveedor ? ['Empresa', datos.proveedor, false] : null,
        datos.fechas ? [datos.etiquetaFechas || 'Fechas', datos.fechas, true] : null,
        datos.cliente ? ['Viajero', datos.cliente, false] : null,
        ['Método', esTarjeta ? `${pago.marca} terminada en ${pago.ultimos4}` : 'Pago en el destino', true],
        esTarjeta ? ['Titular', pago.titular, false] : null,
        ['Estado', { pagado: 'Pagado', pendiente: 'Pendiente de pago en el destino', reembolsado: 'Reembolsado', anulado: 'Anulado' }[pago.estado] || '', true],
        pago.moneda === 'USD' ? ['Equivalente en pesos', formatoMoneda.format(pago.monto || datos.total), false] : null,
        pago.moneda === 'USD' && pago.tasa ? ['Tasa aplicada', `1 US$ = ${formatearExacto(pago.tasa, 'DOP')}`, false] : null,
        ['Referencia', pago.referencia, false],
        esTarjeta ? ['Autorización', pago.autorizacion, false] : null,
        pago.fechaPago ? ['Fecha', formatoFechaHoraRecibo.format(new Date(pago.fechaPago)), true] : null,
        pago.fechaReembolso ? ['Reembolso', formatoFechaHoraRecibo.format(new Date(pago.fechaReembolso)), true] : null,
        pago.estado === 'reembolsado' && pago.montoReembolsado != null ? ['Monto reembolsado', importeCobrado({ ...pago, monto: pago.montoReembolsado, montoCobrado: pago.montoReembolsadoCobrado || pago.montoCobrado * (1 - CARGO_CANCELACION_PCT / 100) }), false] : null,
        pago.estado === 'reembolsado' && pago.cargoCancelacion != null ? [`Cargo por cancelación (${CARGO_CANCELACION_PCT} %)`, formatoMoneda.format(pago.cargoCancelacion), false] : null
    ].filter(Boolean);

    modal.innerHTML = `
        <article class="recibo">
            <header class="recibo-cabecera">
                <span class="recibo-marca"><span class="marca-sello" aria-hidden="true"><span></span><span></span><span></span><span></span></span><span>Booking<b>RD</b></span></span>
                <button type="button" class="modal-cerrar" data-cerrar-modal aria-label="Cerrar"></button>
            </header>
            <h2 id="recibo-titulo">${esTarjeta && pago.estado !== 'reembolsado' ? 'Comprobante de pago' : 'Comprobante de reserva'}</h2>
            <p class="recibo-monto" translate="no">${escaparHtml(pago.moneda === 'USD' ? importeCobrado(pago) : formatoMoneda.format(pago.monto || datos.total))}</p>
            <dl class="recibo-datos">
                ${filas.map(([etiqueta, valor, traducible]) => `<div><dt>${escaparHtml(etiqueta)}</dt><dd${traducible ? '' : ' translate="no"'}>${escaparHtml(valor)}</dd></div>`).join('')}
            </dl>
            <p class="recibo-aviso">Documento de una demostración académica. No es un comprobante fiscal ni corresponde a un cargo real.</p>
            <div class="recibo-acciones">
                <button type="button" class="btn-outline" data-cerrar-modal>Cerrar</button>
                <button type="button" class="btn-primario" data-imprimir-recibo>Imprimir o guardar PDF</button>
            </div>
        </article>`;
    modal.querySelector('[data-imprimir-recibo]').addEventListener('click', () => {
        document.body.classList.add('imprimiendo-recibo');
        window.print();
    });
    abrirModal('modal-recibo');
}

window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-recibo'));

/* ----------------------------------------------------------------------------
   Formulario de pago (detalle.html)
   ---------------------------------------------------------------------------- */

/**
 * Prepara el formulario de pago.
 * @param {{alPagar: (pago: object) => Promise<Function|void>}} opciones
 *   alPagar recibe el objeto `pago` para POST /api/reservas y debe lanzar el
 *   error de la API si la reserva o el pago fallan. Si devuelve una función,
 *   se ejecuta al cerrarse la ventana de pago (p. ej. abrir la confirmación).
 * @returns {{abrir: (pedido: {imagen: string, publicacion: string, fechas: string, total: number, destino?: [string, string], soloTarjeta?: boolean}) => void}}
 */
function prepararPago({ alPagar }) {
    const formulario = document.getElementById('form-pago');
    const campos = {
        titular: document.getElementById('pago-titular'),
        numero: document.getElementById('pago-numero'),
        vencimiento: document.getElementById('pago-vencimiento'),
        cvv: document.getElementById('pago-cvv')
    };
    const visual = {
        tarjeta: document.getElementById('tarjeta-visual'),
        marca: document.getElementById('tarjeta-visual-marca'),
        numero: document.getElementById('tarjeta-visual-numero'),
        titular: document.getElementById('tarjeta-visual-titular'),
        vence: document.getElementById('tarjeta-visual-vence')
    };
    const error = document.getElementById('pago-error');
    const boton = document.getElementById('boton-pagar');
    const procesando = document.getElementById('pago-procesando');
    const textoProcesando = document.getElementById('pago-procesando-texto');
    let total = 0;

    /** Tasa del dólar del navegador (preferencias.js); el servidor confirma la del cobro. */
    const tasaDolar = () => (typeof TASAS !== 'undefined' && TASAS.USD) || 61;
    const enDolares = (pesos) => Math.round((pesos / tasaDolar()) * 100) / 100;
    const moneda = () => formulario.querySelector('input[name="pago-moneda"]:checked').value;
    const importe = () => (moneda() === 'USD' ? formatearExacto(enDolares(total), 'USD') : formatoMoneda.format(total));

    function actualizarMoneda() {
        document.getElementById('pago-monto-DOP').textContent = formatoMoneda.format(total);
        document.getElementById('pago-monto-USD').textContent = `${formatearExacto(enDolares(total), 'USD')} aprox.`;
        document.getElementById('pago-moneda-nota').textContent = moneda() === 'USD'
            ? `Tasa del día: 1 US$ = ${formatearExacto(tasaDolar(), 'DOP')}. El importe exacto aparece en el recibo.`
            : 'Los precios están en pesos dominicanos.';
        // Total destacado en la moneda del cobro, con el equivalente debajo.
        const conTarjeta = metodo() === 'tarjeta';
        const enUsd = conTarjeta && moneda() === 'USD';
        const equivalente = enUsd ? formatoMoneda.format(total) : formatearPrecio(total);
        const principal = enUsd ? formatearExacto(enDolares(total), 'USD') : formatoMoneda.format(total);
        document.getElementById('pago-total').innerHTML = escaparHtml(principal)
            + (equivalente !== principal ? `<small>${enUsd ? '' : 'aprox. '}${escaparHtml(equivalente)}</small>` : '');
        if (metodo() === 'tarjeta') boton.textContent = `Pagar ${importe()}`;
    }

    /** Muestra u oculta el mensaje de error del pago. */
    function mostrarErrorPago(texto) {
        error.textContent = texto;
        error.hidden = !texto;
        error.classList.toggle('visible', Boolean(texto));
    }

    const metodo = () => formulario.querySelector('input[name="pago-metodo"]:checked').value;

    function actualizarVista() {
        const digitos = soloDigitos(campos.numero.value);
        const marca = marcaTarjeta(digitos);
        visual.marca.textContent = marca || 'BookingRD';
        visual.tarjeta.dataset.marca = marca ? marca.toLowerCase().replace(/\s+/g, '-') : '';
        const relleno = marca === 'American Express' ? '•••• •••••• •••••' : '•••• •••• •••• ••••';
        const formateado = formatearNumeroTarjeta(digitos);
        visual.numero.textContent = formateado + relleno.slice(formateado.length);
        // La vista previa lleva translate="no": sus textos de ejemplo siguen el idioma elegido.
        const enIngles = LOCALE === 'en-US';
        visual.titular.textContent = campos.titular.value.trim().toUpperCase() || (enIngles ? 'CARDHOLDER NAME' : 'NOMBRE DEL TITULAR');
        visual.vence.textContent = campos.vencimiento.value || (enIngles ? 'MM/YY' : 'MM/AA');
        document.getElementById('pago-marca-texto').textContent = marca
            ? `${marca}${marca === 'American Express' ? ': código de seguridad de 4 dígitos.' : '.'}`
            : 'Visa, Mastercard o American Express.';
        campos.cvv.maxLength = marca === 'American Express' ? 4 : 3;
    }

    function actualizarMetodo() {
        const conTarjeta = metodo() === 'tarjeta';
        document.getElementById('pago-tarjeta').hidden = !conTarjeta;
        boton.textContent = conTarjeta ? `Pagar ${importe()}` : 'Confirmar reserva';
        mostrarErrorPago('');
        if (total) actualizarMoneda();
    }

    // Formato mientras se escribe.
    campos.numero.addEventListener('input', () => {
        campos.numero.value = formatearNumeroTarjeta(campos.numero.value);
        actualizarVista();
    });
    campos.vencimiento.addEventListener('input', (evento) => {
        let digitos = soloDigitos(campos.vencimiento.value).slice(0, 4);
        if (digitos.length === 1 && Number(digitos) > 1) digitos = `0${digitos}`;
        const borrando = evento.inputType && evento.inputType.startsWith('delete');
        campos.vencimiento.value = digitos.length > 2 || (digitos.length === 2 && !borrando)
            ? `${digitos.slice(0, 2)}/${digitos.slice(2)}`
            : digitos;
        actualizarVista();
    });
    campos.cvv.addEventListener('input', () => { campos.cvv.value = soloDigitos(campos.cvv.value); });
    campos.titular.addEventListener('input', actualizarVista);
    formulario.querySelectorAll('input[name="pago-metodo"]').forEach((radio) => radio.addEventListener('change', actualizarMetodo));
    formulario.querySelectorAll('input[name="pago-moneda"]').forEach((radio) => radio.addEventListener('change', actualizarMoneda));
    retirarMarcasAlEditar(formulario);

    // Tarjetas de prueba: un clic completa el formulario.
    document.getElementById('lista-tarjetas-prueba').innerHTML = TARJETAS_PRUEBA.map((t, i) => `
        <li>
            <button type="button" class="tarjeta-prueba" data-tarjeta="${i}">
                <span translate="no">${escaparHtml(t.numero)}</span>
                <small>${escaparHtml(t.marca)}: ${escaparHtml(t.resultado)}</small>
            </button>
        </li>`).join('');
    document.getElementById('lista-tarjetas-prueba').addEventListener('click', (evento) => {
        const elegido = evento.target.closest('[data-tarjeta]');
        if (!elegido) return;
        const tarjeta = TARJETAS_PRUEBA[Number(elegido.dataset.tarjeta)];
        const usuario = obtenerUsuario();
        if (!campos.titular.value.trim()) campos.titular.value = usuario ? usuario.nombre : 'Viajero de prueba';
        campos.numero.value = formatearNumeroTarjeta(tarjeta.numero);
        const [anio, mes] = hoyIso().split('-').map(Number);
        campos.vencimiento.value = `${String(mes).padStart(2, '0')}/${String((anio + 3) % 100).padStart(2, '0')}`;
        campos.cvv.value = tarjeta.marca === 'American Express' ? '1234' : '123';
        formulario.querySelectorAll('.campo.invalido').forEach((c) => c.classList.remove('invalido'));
        mostrarErrorPago('');
        actualizarVista();
    });

    /** Pasos de la animación de procesamiento (la petición corre en paralelo). */
    async function simularProceso(conTarjeta) {
        const pasos = conTarjeta
            ? ['Conectando con el banco...', 'Verificando la tarjeta...', 'Autorizando el pago...']
            : ['Confirmando la disponibilidad...'];
        for (const paso of pasos) {
            textoProcesando.textContent = paso;
            await new Promise((resolver) => setTimeout(resolver, 600));
        }
    }

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErrorPago('');
        const conTarjeta = metodo() === 'tarjeta';
        let pago = { metodo: 'en_destino' };
        if (conTarjeta) {
            const datos = {
                titular: campos.titular.value,
                numero: campos.numero.value,
                vencimiento: campos.vencimiento.value,
                cvv: campos.cvv.value
            };
            const problema = validarTarjeta(datos);
            if (problema) {
                mostrarErrorPago(problema.mensaje);
                marcarCampo(problema.campo);
                return;
            }
            pago = Object.assign({ metodo: 'tarjeta', moneda: moneda() }, datos, { numero: soloDigitos(datos.numero) });
        }

        procesando.hidden = false;
        boton.disabled = true;
        try {
            const [alTerminar] = await Promise.all([alPagar(pago), simularProceso(conTarjeta)]);
            // Por seguridad, los datos de la tarjeta se borran después del pago.
            campos.numero.value = '';
            campos.cvv.value = '';
            actualizarVista();
            cerrarModal('modal-pago');
            if (typeof alTerminar === 'function') setTimeout(alTerminar, 220);
        } catch (fallo) {
            mostrarErrorPago(fallo.message);
            if (fallo.campo && fallo.campo.startsWith('pago-')) marcarCampo(fallo.campo);
            if (fallo.status === 402) campos.cvv.value = '';
        } finally {
            procesando.hidden = true;
            boton.disabled = false;
        }
    });

    return {
        abrir(pedido) {
            total = pedido.total;
            const imagen = document.getElementById('pago-imagen');
            imagen.src = pedido.imagen || '';
            imagen.hidden = !pedido.imagen;
            document.getElementById('pago-publicacion').textContent = pedido.publicacion;
            document.getElementById('pago-fechas').textContent = pedido.fechas;
            // Moneda del cobro: dólares si el visitante ve los precios en dólares.
            formulario.querySelector(`input[name="pago-moneda"][value="${PREFERENCIAS.moneda === 'USD' ? 'USD' : 'DOP'}"]`).checked = true;
            // La tienda solo acepta tarjeta: se oculta el pago en el destino.
            const opcionDestino = formulario.querySelector('input[name="pago-metodo"][value="en_destino"]');
            opcionDestino.closest('label').hidden = Boolean(pedido.soloTarjeta);
            if (pedido.soloTarjeta) formulario.querySelector('input[name="pago-metodo"][value="tarjeta"]').checked = true;
            if (pedido.destino) {
                document.getElementById('pago-destino-titulo').textContent = pedido.destino[0];
                document.getElementById('pago-destino-texto').textContent = pedido.destino[1];
            }
            if (!campos.titular.value) {
                const usuario = obtenerUsuario();
                if (usuario) campos.titular.value = usuario.nombre;
            }
            actualizarMetodo();
            actualizarMoneda();
            actualizarVista();
            abrirModal('modal-pago');
            setTimeout(() => (metodo() === 'tarjeta' ? campos.numero : boton).focus({ preventScroll: true }), 50);
        }
    };
}
