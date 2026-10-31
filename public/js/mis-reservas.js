/**
 * @file public/js/mis-reservas.js
 * @description Cuenta del viajero (mis-reservas.html).
 *
 *   - Reservas:     GET   /api/reservas
 *   - Cancelación:  PATCH /api/reservas/:id/cancelar
 *   - Guardados:    GET   /api/favoritos (los corazones usan js/comun.js)
 *   - Reseñas:      GET   /api/resenas (propias y pendientes)
 *                   POST  /api/resenas
 *
 * Las reservas se agrupan en próximas, pasadas y canceladas en el cliente.
 * Solo se ofrece cancelar las reservas confirmadas que empiezan después de
 * hoy, y reseñar las confirmadas ya terminadas; el servidor aplica las
 * mismas reglas. ?vista=guardados|resenas abre esa pestaña.
 */

const PESTANAS = ['proximas', 'pasadas', 'canceladas', 'guardados', 'resenas'];

let reservas = [];
let guardados = [];
let misResenas = [];
let pendientes = [];
let filtroActual = 'proximas';
let reservaPorCancelar = null;
let reservaPorResenar = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!exigirSesion('cliente')) return;

    const vista = new URLSearchParams(window.location.search).get('vista');
    if (PESTANAS.includes(vista)) filtroActual = vista;

    document.querySelectorAll('.pestana').forEach((pestana) => {
        pestana.addEventListener('click', () => seleccionarPestana(pestana.dataset.filtro));
    });
    document.getElementById('lista-reservas').addEventListener('click', (evento) => {
        const cancelar = evento.target.closest('[data-cancelar]');
        if (cancelar) pedirCancelacion(Number(cancelar.dataset.cancelar));
        const resenar = evento.target.closest('[data-resenar]');
        if (resenar) abrirFormularioResena(Number(resenar.dataset.resenar));
    });
    document.getElementById('aviso-resenas').addEventListener('click', (evento) => {
        const resenar = evento.target.closest('[data-resenar]');
        if (resenar) abrirFormularioResena(Number(resenar.dataset.resenar));
    });
    document.getElementById('boton-confirmar-cancelar').addEventListener('click', confirmarCancelacion);
    iniciarFormularioResena();

    // Al quitar un guardado desde su tarjeta, la tarjeta sale de la lista.
    document.addEventListener('favoritos:cambio', (evento) => {
        if (evento.detail.guardado) return;
        guardados = guardados.filter((p) => !(p.tipo === evento.detail.tipo && p.id === evento.detail.id));
        pintarConteos();
        if (filtroActual === 'guardados') pintarLista();
    });

    marcarPestana();
    cargarTodo();
});

/** Grupo al que pertenece una reserva. */
function grupoDe(reserva) {
    if (reserva.estado === 'cancelada') return 'canceladas';
    const fin = reserva.fechaFin || reserva.fechaInicio;
    return fin >= hoyIso() ? 'proximas' : 'pasadas';
}

async function cargarTodo() {
    const lista = document.getElementById('lista-reservas');
    lista.innerHTML = Array.from({ length: 3 }, () => '<div class="reserva reserva-esqueleto esqueleto" aria-hidden="true"></div>').join('');
    try {
        const [respuestaReservas, respuestaGuardados, respuestaResenas] = await Promise.all([
            apiFetch('/reservas'),
            apiFetch('/favoritos'),
            apiFetch('/resenas')
        ]);
        reservas = respuestaReservas.reservas;
        guardados = respuestaGuardados.publicaciones;
        misResenas = respuestaResenas.resenas;
        pendientes = respuestaResenas.pendientes;
    } catch (error) {
        lista.innerHTML = crearEstado({
            titulo: 'No se pudo cargar tu cuenta',
            texto: error.message,
            accion: '<button type="button" class="btn-outline" onclick="location.reload()">Reintentar</button>',
            esError: true
        });
        return;
    }
    pintarCifras();
    pintarConteos();
    pintarAvisoResenas();
    pintarLista();
}

function pintarCifras() {
    const conteo = { proximas: 0, pasadas: 0 };
    let invertido = 0;
    reservas.forEach((reserva) => {
        const grupo = grupoDe(reserva);
        if (grupo !== 'canceladas') {
            conteo[grupo] += 1;
            invertido += reserva.total;
        }
    });
    animarNumero(document.getElementById('cifra-proximas'), conteo.proximas);
    animarNumero(document.getElementById('cifra-pasadas'), conteo.pasadas);
    animarNumero(document.getElementById('cifra-total'), invertido, (n) => formatoMoneda.format(n));
}

function pintarConteos() {
    const conteo = { proximas: 0, pasadas: 0, canceladas: 0, guardados: guardados.length, resenas: pendientes.length };
    reservas.forEach((reserva) => { conteo[grupoDe(reserva)] += 1; });
    Object.entries(conteo).forEach(([grupo, valor]) => {
        document.querySelector(`[data-conteo="${grupo}"]`).textContent = valor;
    });
    document.querySelector('[data-conteo="resenas"]').hidden = !pendientes.length;
}

/** Invitación a reseñar la reserva terminada más reciente. */
function pintarAvisoResenas() {
    const aviso = document.getElementById('aviso-resenas');
    const primera = pendientes[0];
    aviso.hidden = !primera || filtroActual === 'resenas';
    if (!primera) return;
    aviso.innerHTML = `
        <div>
            <strong>¿Qué tal ${escaparHtml(primera.publicacion)}?</strong>
            <span>Tu reseña ayuda a otros viajeros y a la empresa a mejorar.</span>
        </div>
        <button type="button" class="btn-primario btn-chico" data-resenar="${primera.idReserva}">Escribir reseña</button>`;
}

function seleccionarPestana(filtro) {
    filtroActual = filtro;
    marcarPestana();
    const url = new URL(window.location.href);
    if (['guardados', 'resenas'].includes(filtro)) url.searchParams.set('vista', filtro);
    else url.searchParams.delete('vista');
    history.replaceState(null, '', url);
    pintarAvisoResenas();
    pintarLista();
}

function marcarPestana() {
    document.querySelectorAll('.pestana').forEach((pestana) => {
        const activa = pestana.dataset.filtro === filtroActual;
        pestana.classList.toggle('activo', activa);
        pestana.setAttribute('aria-selected', String(activa));
    });
}

function pintarLista() {
    const lista = document.getElementById('lista-reservas');
    lista.classList.toggle('es-rejilla', filtroActual === 'guardados');
    if (filtroActual === 'guardados') return pintarGuardados(lista);
    if (filtroActual === 'resenas') return pintarResenas(lista);

    let visibles = reservas.filter((reserva) => grupoDe(reserva) === filtroActual);
    // Próximas: la más cercana primero. El servidor entrega de la más lejana a la más antigua.
    if (filtroActual === 'proximas') visibles = visibles.slice().reverse();

    if (!visibles.length) {
        const textos = {
            proximas: ['No tienes reservas próximas', 'Encuentra alojamiento o una actividad para tu siguiente viaje.'],
            pasadas: ['Aún no tienes experiencias realizadas', 'Tus reservas aparecerán aquí al terminar.'],
            canceladas: ['No tienes reservas canceladas', '']
        }[filtroActual];
        lista.innerHTML = crearEstado({
            titulo: textos[0],
            texto: textos[1],
            accion: filtroActual === 'proximas' ? '<a href="explorar.html" class="btn-primario">Explorar destinos</a>' : ''
        });
        return;
    }
    lista.innerHTML = visibles.map(crearTarjetaReserva).join('');
}

function pintarGuardados(lista) {
    lista.innerHTML = guardados.length
        ? guardados.map(crearTarjetaPublicacion).join('')
        : crearEstado({
            titulo: 'Aún no has guardado nada',
            texto: 'Toca el corazón de cualquier hotel o actividad para tenerlo a mano aquí.',
            accion: '<a href="explorar.html" class="btn-primario">Explorar destinos</a>'
        });
    Favoritos.pintar(lista);
}

function pintarResenas(lista) {
    const pendientesHtml = pendientes.map((p) => `
        <article class="resena-pendiente">
            <div>
                <span class="reserva-estado">Pendiente de reseña</span>
                <h3><a href="${enlaceDetalle({ tipo: p.tipo, id: p.idPublicacion })}">${escaparHtml(p.publicacion)}</a></h3>
                <p>${escaparHtml(p.ciudad)}, ${p.tipo === 'actividad' ? formatearFecha(p.fechaInicio) : `${formatearFecha(p.fechaInicio)} al ${formatearFecha(p.fechaFin)}`}</p>
            </div>
            <button type="button" class="btn-primario btn-chico" data-resenar="${p.idReserva}">Escribir reseña</button>
        </article>`).join('');
    const propiasHtml = misResenas.map((r) => `
        <article class="resena">
            <header>
                <span class="nota">${r.puntuacion}</span>
                <div>
                    <strong><a href="${enlaceDetalle({ tipo: r.tipo, id: r.idPublicacion })}">${escaparHtml(r.publicacion)}</a></strong>
                    <small>${escaparHtml(r.ciudad)}. Publicada el ${formatearFecha(String(r.fecha).slice(0, 10))}${r.visible ? '' : '. Oculta por la administración'}</small>
                </div>
            </header>
            <h3>${escaparHtml(r.titulo)}</h3>
            <p>${escaparHtml(r.comentario)}</p>
            ${r.respuesta ? `<div class="resena-respuesta"><strong>Respuesta de la empresa</strong><p>${escaparHtml(r.respuesta)}</p></div>` : ''}
        </article>`).join('');

    if (!pendientesHtml && !propiasHtml) {
        lista.innerHTML = crearEstado({
            titulo: 'Aún no tienes reseñas',
            texto: 'Cuando termine una estancia, actividad o alquiler reservado, podrás contar aquí cómo te fue.'
        });
        return;
    }
    lista.innerHTML = `
        ${pendientesHtml ? `<h2 class="titulo-grupo">Por reseñar</h2>${pendientesHtml}` : ''}
        ${propiasHtml ? `<h2 class="titulo-grupo">Tus reseñas</h2><div class="lista-resenas">${propiasHtml}</div>` : ''}`;
}

function crearTarjetaReserva(reserva, indice) {
    const esHotel = reserva.tipo === 'hotel';
    const esAuto = reserva.tipo === 'vehiculo';
    const grupo = grupoDe(reserva);
    const fechas = textoFechasReserva(reserva);
    const cantidad = esHotel
        ? `${reserva.habitaciones} ${reserva.habitaciones === 1 ? 'habitación' : 'habitaciones'}, ${reserva.personas} ${reserva.personas === 1 ? 'persona' : 'personas'}`
        : `${reserva.personas} ${reserva.personas === 1 ? 'persona' : 'personas'}`;
    const puedeCancelar = reserva.estado === 'confirmada' && reserva.fechaInicio > hoyIso();
    const pendiente = pendientes.some((p) => p.idReserva === reserva.id);
    const resena = misResenas.find((r) => r.idReserva === reserva.id);
    const etiquetas = { proximas: 'Confirmada', pasadas: 'Realizada', canceladas: 'Cancelada' };
    const media = reserva.imagen
        ? `<img src="${escaparHtml(urlRecurso(reserva.imagen))}" alt="" loading="lazy" onerror="this.parentElement.classList.add('sin-foto')">`
        : '';

    let accion = '';
    if (puedeCancelar) accion = `<button type="button" class="boton-cancelar" data-cancelar="${reserva.id}">Cancelar reserva</button>`;
    else if (pendiente) accion = `<button type="button" class="btn-primario btn-chico" data-resenar="${reserva.id}">Escribir reseña</button>`;
    else if (resena) accion = `<span class="reserva-resenada"><span class="nota">${resena.puntuacion}</span> Tu reseña: ${escaparHtml(etiquetaPuntuacion(resena.puntuacion))}</span>`;

    return `
        <article class="reserva es-${grupo}" style="animation-delay:${Math.min(indice, 8) * 60}ms">
            <a class="reserva-media${reserva.imagen ? '' : ' sin-foto'}" href="${enlaceDetalle({ tipo: reserva.tipo, id: reserva.idPublicacion })}" tabindex="-1" aria-hidden="true">
                ${media}
            </a>
            <div class="reserva-cuerpo">
                <div class="reserva-encabezado">
                    <span class="reserva-estado">${etiquetas[grupo]}</span>
                    <span class="reserva-codigo">${escaparHtml(reserva.codigo)}</span>
                </div>
                <h3><a href="${enlaceDetalle({ tipo: reserva.tipo, id: reserva.idPublicacion })}">${escaparHtml(reserva.publicacion)}</a></h3>
                <p class="reserva-datos">${escaparHtml(reserva.ciudad)}, con ${escaparHtml(reserva.proveedor)}</p>
                <ul class="reserva-detalles">
                    <li><span>${esHotel ? 'Estancia' : esAuto ? 'Alquiler' : 'Fecha'}</span>${escaparHtml(fechas)}</li>
                    ${esAuto ? detallesAlquiler(reserva) : `<li><span>Grupo</span>${escaparHtml(cantidad)}</li>`}
                    <li><span>Total</span><strong>${formatoMoneda.format(reserva.total)}</strong></li>
                </ul>
                ${accion}
            </div>
        </article>`;
}

/** Recogida, devolución, extras y depósito de un alquiler de auto. */
function detallesAlquiler(reserva) {
    const a = reserva.alquiler || {};
    const extras = (a.extras || []).map((c) => (CATALOGOS.extrasVehiculo[c] || {}).nombre).filter(Boolean);
    return `
                    <li><span>Recogida</span>${escaparHtml(a.lugarRecogida || reserva.ciudad)}</li>
                    <li><span>Devolución</span>${escaparHtml(a.ciudadDevolucion || reserva.ciudad)}</li>
                    <li><span>Conductor</span>${escaparHtml(`${a.edadConductor} años`)}</li>
                    ${extras.length ? `<li><span>Extras</span>${escaparHtml(extras.join(', '))}</li>` : ''}
                    ${a.deposito ? `<li><span>Depósito</span>${formatoMoneda.format(a.deposito)} (reembolsable)</li>` : ''}`;
}

/* ----------------------------------------------------------------------------
   CANCELACIÓN
   ---------------------------------------------------------------------------- */

function pedirCancelacion(id) {
    reservaPorCancelar = reservas.find((reserva) => reserva.id === id);
    if (!reservaPorCancelar) return;
    document.getElementById('cancelar-codigo').textContent = reservaPorCancelar.codigo;
    document.getElementById('cancelar-nombre').textContent = reservaPorCancelar.publicacion;
    document.getElementById('cancelar-error').classList.remove('visible');
    abrirModal('modal-cancelar');
}

async function confirmarCancelacion() {
    if (!reservaPorCancelar) return;
    const boton = document.getElementById('boton-confirmar-cancelar');
    const mensaje = document.getElementById('cancelar-error');
    botonCargando(boton, 'Cancelando...');
    try {
        await apiFetch(`/reservas/${reservaPorCancelar.id}/cancelar`, { method: 'PATCH' });
        reservaPorCancelar.estado = 'cancelada';
        cerrarModal('modal-cancelar');
        mostrarAviso(`Reserva ${reservaPorCancelar.codigo} cancelada.`, 'exito');
        pintarCifras();
        pintarConteos();
        pintarLista();
    } catch (error) {
        mensaje.textContent = error.message;
        mensaje.classList.add('visible');
    } finally {
        botonNormal(boton, 'Sí, cancelar');
    }
}

/* ----------------------------------------------------------------------------
   RESEÑAS (POST /api/resenas)
   ---------------------------------------------------------------------------- */

function iniciarFormularioResena() {
    const selector = document.getElementById('resena-puntuacion');
    selector.insertAdjacentHTML('beforeend', Array.from({ length: 10 }, (_, i) => `
        <label><input type="radio" name="puntuacion" value="${i + 1}"><span>${i + 1}</span></label>`).join(''));
    selector.addEventListener('change', (evento) => {
        const valor = Number(evento.target.value);
        document.getElementById('puntuacion-elegida').textContent = `${valor}: ${etiquetaPuntuacion(valor)}`;
    });
    const comentario = document.getElementById('resena-comentario');
    comentario.addEventListener('input', () => {
        document.getElementById('resena-contador').textContent = `${comentario.value.length} / 1500`;
    });
    const formulario = document.getElementById('form-resena');
    retirarMarcasAlEditar(formulario);
    formulario.addEventListener('submit', publicarResena);
}

function abrirFormularioResena(idReserva) {
    reservaPorResenar = pendientes.find((p) => p.idReserva === idReserva);
    if (!reservaPorResenar) return;
    const formulario = document.getElementById('form-resena');
    formulario.reset();
    formulario.querySelectorAll('.invalido').forEach((campo) => campo.classList.remove('invalido'));
    document.getElementById('puntuacion-elegida').textContent = '';
    document.getElementById('resena-contador').textContent = '0 / 1500';
    document.getElementById('resena-error').classList.remove('visible');
    document.getElementById('resena-publicacion').textContent = `${reservaPorResenar.publicacion}, ${reservaPorResenar.ciudad}`;
    abrirModal('modal-resena');
}

/** Validación en el navegador; replica src/validators/resenas.validator.js. */
function validarResena(datos) {
    if (!datos.puntuacion) return { campo: 'resena-puntuacion', mensaje: 'Elige una puntuación del 1 al 10.' };
    if (datos.titulo.length < 3) return { campo: 'resena-titulo', mensaje: 'Escribe un título de al menos 3 caracteres.' };
    if (datos.comentario.length < 20) return { campo: 'resena-comentario', mensaje: 'Cuéntanos tu experiencia en al menos 20 caracteres.' };
    return null;
}

async function publicarResena(evento) {
    evento.preventDefault();
    if (!reservaPorResenar) return;
    const mensaje = document.getElementById('resena-error');
    mensaje.classList.remove('visible');
    const elegida = document.querySelector('input[name="puntuacion"]:checked');
    const datos = {
        idReserva: reservaPorResenar.idReserva,
        puntuacion: elegida ? Number(elegida.value) : 0,
        titulo: document.getElementById('resena-titulo').value.trim(),
        comentario: document.getElementById('resena-comentario').value.trim()
    };
    const error = validarResena(datos);
    if (error) {
        mensaje.textContent = error.mensaje;
        mensaje.classList.add('visible');
        marcarCampo(error.campo);
        return;
    }

    const boton = document.getElementById('boton-publicar-resena');
    botonCargando(boton, 'Publicando...');
    try {
        await apiFetch('/resenas', { method: 'POST', body: datos });
        cerrarModal('modal-resena');
        mostrarAviso('Gracias. Tu reseña ya está publicada.');
        const respuesta = await apiFetch('/resenas');
        misResenas = respuesta.resenas;
        pendientes = respuesta.pendientes;
        pintarConteos();
        pintarAvisoResenas();
        pintarLista();
    } catch (errorServidor) {
        mensaje.textContent = errorServidor.message;
        mensaje.classList.add('visible');
        if (errorServidor.campo) marcarCampo(errorServidor.campo);
    } finally {
        botonNormal(boton, 'Publicar reseña');
    }
}
