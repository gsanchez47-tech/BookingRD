/**
 * @file public/js/combos.js
 * @description Página de combos: lista con filtros a la izquierda, ventana
 *   para armar el combo (fechas, personas y desglose con el descuento) y
 *   reserva con el pago simulado.
 *
 *   GET  /api/combos
 *   GET  /api/combos/:id/cotizacion?entrada&noches&personas&habitaciones
 *   POST /api/combos/:id/reservar
 */

const estadoCombos = {
    combos: [],
    destino: '',
    orden: 'destacados',
    elegido: null,
    cotizacion: null,
    solicitud: 0,
    checkout: null,
    recibo: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const parametros = new URLSearchParams(window.location.search);
    estadoCombos.destino = parametros.get('ciudad') || '';
    document.querySelectorAll('input[name="orden-combo"]').forEach((radio) => radio.addEventListener('change', () => {
        estadoCombos.orden = radio.value;
        pintarCombos();
    }));
    document.getElementById('lista-combos').addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-armar-combo]');
        if (!boton) return;
        evento.preventDefault();
        abrirArmado(Number(boton.dataset.armarCombo));
    });
    prepararFormulario();
    document.getElementById('boton-recibo-combo').addEventListener('click', () => {
        if (estadoCombos.recibo) abrirRecibo(estadoCombos.recibo);
    });

    try {
        const { combos } = await apiFetch('/combos');
        estadoCombos.combos = combos;
        pintarDestinos();
        pintarCombos();
        const pedido = Number(parametros.get('combo'));
        if (pedido && combos.some((c) => c.id === pedido)) abrirArmado(pedido);
    } catch (error) {
        document.getElementById('lista-combos').innerHTML = `<li class="estado-vacio">${escaparHtml(error.message)}</li>`;
    }
});

/** Destinos con combos, con su conteo. */
function pintarDestinos() {
    const conteo = new Map();
    for (const c of estadoCombos.combos) conteo.set(c.ciudad, (conteo.get(c.ciudad) || 0) + 1);
    const opciones = [['', 'Todos', estadoCombos.combos.length]].concat([...conteo.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([c, n]) => [c, c, n]));
    const contenedor = document.getElementById('filtro-destino-combo');
    contenedor.innerHTML = opciones.map(([valor, texto, n]) => `
        <label><input type="radio" name="destino-combo" value="${escaparHtml(valor)}"${valor === estadoCombos.destino ? ' checked' : ''}>
            <span><span${valor ? ' translate="no"' : ''}>${escaparHtml(texto)}</span><small>${n}</small></span></label>`).join('');
    if (!contenedor.querySelector('input:checked')) contenedor.querySelector('input').checked = true;
    contenedor.addEventListener('change', (evento) => {
        estadoCombos.destino = evento.target.value;
        const url = new URL(window.location.href);
        if (estadoCombos.destino) url.searchParams.set('ciudad', estadoCombos.destino);
        else url.searchParams.delete('ciudad');
        url.searchParams.delete('combo');
        history.replaceState(null, '', url);
        pintarCombos();
    });
}

function pintarCombos() {
    let lista = estadoCombos.combos.filter((c) => !estadoCombos.destino || c.ciudad === estadoCombos.destino);
    if (estadoCombos.orden === 'ahorro') lista = lista.slice().sort((a, b) => b.referencia.ahorro - a.referencia.ahorro);
    if (estadoCombos.orden === 'precio') lista = lista.slice().sort((a, b) => a.referencia.total - b.referencia.total);
    document.getElementById('conteo-combos').textContent = `${lista.length} ${lista.length === 1 ? 'combo disponible' : 'combos disponibles'}`;
    document.getElementById('lista-combos').innerHTML = lista.length
        ? lista.map((c) => `<li>${tarjetaCombo(c, { titulo: 'h2' })}</li>`).join('')
        : '<li class="estado-vacio">No hay combos en este destino por ahora.</li>';
}

/* ----------------------------------------------------------------------------
   Armar el combo
   ---------------------------------------------------------------------------- */

function prepararFormulario() {
    const formulario = document.getElementById('form-combo');
    const actualizar = conRetardo(cotizar, 250);
    ['combo-entrada', 'combo-noches', 'combo-personas', 'combo-habitaciones'].forEach((id) => {
        document.getElementById(id).addEventListener('input', actualizar);
        document.getElementById(id).addEventListener('change', actualizar);
    });
    retirarMarcasAlEditar(formulario);
    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (!estadoCombos.cotizacion || !estadoCombos.cotizacion.disponible) return;
        const usuario = obtenerUsuario();
        if (!usuario) {
            irAlLogin();
            return;
        }
        if (usuario.rol !== 'cliente') {
            mostrarErrorCombo('Los combos se reservan con una cuenta de viajero.');
            return;
        }
        if (!estadoCombos.checkout) estadoCombos.checkout = prepararPago({ alPagar: enviarCombo });
        const c = estadoCombos.elegido;
        const q = estadoCombos.cotizacion;
        cerrarModal('modal-combo');
        setTimeout(() => estadoCombos.checkout.abrir({
            imagen: c.imagen,
            publicacion: `Combo ${c.nombre}`,
            fechas: `${formatearFecha(q.entrada)} al ${formatearFecha(q.salida)}, ${q.noches} ${q.noches === 1 ? 'noche' : 'noches'}`,
            total: q.total,
            destino: ['Pagar en el destino', 'Pagas cada parte al llegar, directamente a cada empresa.']
        }), 200);
    });
}

function abrirArmado(id) {
    const combo = estadoCombos.combos.find((c) => c.id === id);
    if (!combo) return;
    estadoCombos.elegido = combo;
    estadoCombos.cotizacion = null;
    document.getElementById('combo-imagen').src = combo.imagen || '';
    document.getElementById('combo-titulo').textContent = combo.nombre;
    document.getElementById('combo-lema').textContent = combo.lema;

    const minimo = Math.max(...combo.actividades.map((a) => a.dia)) + 1;
    const noches = document.getElementById('combo-noches');
    noches.innerHTML = Array.from({ length: 15 - minimo }, (_, i) => minimo + i)
        .map((n) => `<option value="${n}"${n === combo.nochesSugeridas ? ' selected' : ''}>${n} ${n === 1 ? 'noche' : 'noches'}</option>`).join('');
    const entrada = document.getElementById('combo-entrada');
    entrada.min = sumarDiasIso(hoyIso(), 1);
    if (!entrada.value || entrada.value < entrada.min) entrada.value = sumarDiasIso(hoyIso(), 21);
    const personas = document.getElementById('combo-personas');
    personas.value = Math.min(Number(personas.value) || 2, combo.hotel.capacidad * 10);
    mostrarErrorCombo('');
    abrirModal('modal-combo');
    cotizar();
}

function leerSolicitudCombo() {
    return {
        entrada: document.getElementById('combo-entrada').value,
        noches: document.getElementById('combo-noches').value,
        personas: document.getElementById('combo-personas').value,
        habitaciones: document.getElementById('combo-habitaciones').value
    };
}

function mostrarErrorCombo(texto) {
    const error = document.getElementById('combo-error');
    error.textContent = texto;
    error.hidden = !texto;
    error.classList.toggle('visible', Boolean(texto));
}

async function cotizar() {
    const combo = estadoCombos.elegido;
    if (!combo) return;
    const numero = ++estadoCombos.solicitud;
    const boton = document.getElementById('boton-reservar-combo');
    const desglose = document.getElementById('combo-desglose');
    boton.disabled = true;
    desglose.classList.add('cargando');
    try {
        const q = await apiFetch(`/combos/${combo.id}/cotizacion?${new URLSearchParams(leerSolicitudCombo())}`);
        if (numero !== estadoCombos.solicitud) return;
        estadoCombos.cotizacion = q;
        mostrarErrorCombo(q.disponible ? '' : q.mensaje);
        desglose.innerHTML = `
            <ol class="desglose-lineas">
                ${q.lineas.map((l) => `
                    <li>
                        <span class="desglose-fecha">${escaparHtml(formatearFecha(l.fecha))}</span>
                        <span class="desglose-nombre" translate="no">${escaparHtml(l.nombre)}</span>
                        <small>${escaparHtml(l.detalle)}</small>
                        <span class="desglose-importe"><s>${escaparHtml(formatearPrecio(l.normal))}</s>${escaparHtml(formatearPrecio(l.total))}</span>
                    </li>`).join('')}
            </ol>
            <p class="desglose-total"><span>Total del combo</span><strong>${escaparHtml(formatearPrecio(q.total))}</strong></p>
            <p class="desglose-ahorro">Ahorras ${escaparHtml(formatearPrecio(q.ahorro))} (${combo.descuento} %) frente a reservar por separado.</p>`;
        boton.disabled = !q.disponible;
        boton.textContent = q.disponible ? `Reservar combo por ${formatoMoneda.format(q.total)}` : 'Sin disponibilidad para esas fechas';
    } catch (error) {
        if (numero !== estadoCombos.solicitud) return;
        estadoCombos.cotizacion = null;
        desglose.innerHTML = '';
        mostrarErrorCombo(error.message);
        if (error.campo) document.getElementById(error.campo)?.closest('.campo')?.classList.add('invalido');
        boton.textContent = 'Reservar combo';
    } finally {
        if (numero === estadoCombos.solicitud) desglose.classList.remove('cargando');
    }
}

/** Envía la reserva del combo con el pago; devuelve la apertura de la confirmación. */
async function enviarCombo(pago) {
    const combo = estadoCombos.elegido;
    const respuesta = await apiFetch(`/combos/${combo.id}/reservar`, {
        method: 'POST',
        body: Object.assign(leerSolicitudCombo(), { pago })
    });
    const usuario = obtenerUsuario();
    const q = estadoCombos.cotizacion;
    estadoCombos.recibo = {
        codigo: respuesta.reservas.map((r) => r.codigo).join(', '),
        publicacion: `Combo ${respuesta.combo.nombre}`,
        fechas: `${formatearFecha(q.entrada)} al ${formatearFecha(q.salida)}`,
        cliente: usuario ? usuario.nombre : '',
        total: respuesta.total,
        pago: respuesta.pago
    };
    document.getElementById('confirmacion-texto').textContent =
        `${respuesta.combo.nombre}. Total: ${formatoMoneda.format(respuesta.total)}, ahorraste ${formatoMoneda.format(respuesta.ahorro)}.`;
    document.getElementById('confirmacion-reservas').innerHTML = respuesta.reservas.map((r) => `
        <li><span translate="no">${escaparHtml(r.publicacion)}</span><small>${escaparHtml(formatearFecha(r.fecha))}</small><strong translate="no">${escaparHtml(r.codigo)}</strong></li>`).join('');
    document.getElementById('confirmacion-pago').innerHTML = chipPago(respuesta.pago);
    return () => abrirModal('modal-confirmacion');
}
