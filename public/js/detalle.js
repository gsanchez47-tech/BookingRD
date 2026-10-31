/**
 * @file public/js/detalle.js
 * @description Detalle y reserva de una publicación (detalle.html?tipo=&id=).
 *
 *   - Datos:            GET  /api/publicaciones/:tipo/:id
 *   - Disponibilidad:   GET  /api/publicaciones/:tipo/:id/disponibilidad
 *                       (se consulta al cambiar fechas o cantidades)
 *   - Reserva:          POST /api/reservas (cuenta de viajero)
 *   - Reseñas:          GET  /api/publicaciones/:tipo/:id/resenas
 *   - Relacionadas:     GET  /api/publicaciones?categoria=
 *
 * Parámetros de URL opcionales (desde explorar.html): entrada y salida
 * (alojamiento), fecha (actividad) y personas, o recogida, horaRecogida,
 * devolucion y horaDevolucion (autos); completan el formulario.
 *
 * Autos: el precio se calcula en el servidor por bloques de 24 horas desde la
 * recogida (con una hora de cortesía) e incluye extras, cargo por conductor
 * joven y devolución en otra ciudad; el desglose se muestra tal cual llega.
 * La publicación se agrega a "Vistos recientemente" (js/comun.js).
 */

const parametrosUrl = new URLSearchParams(window.location.search);
const TIPO = ['actividad', 'vehiculo'].includes(parametrosUrl.get('tipo')) ? parametrosUrl.get('tipo') : 'hotel';
const ES_AUTO = TIPO === 'vehiculo';
const ID = parseInt(parametrosUrl.get('id'), 10);

let publicacion = null;
let consultaDisponibilidad = 0;
let ultimaEvaluacion = null;

/** Estado del listado de reseñas. */
const resenas = { pagina: 1, orden: 'recientes', total: 0, mostradas: 0 };

document.addEventListener('DOMContentLoaded', () => {
    if (!Number.isInteger(ID) || ID < 1) {
        mostrarNoEncontrada();
        return;
    }
    prepararFormulario();
    cargarPublicacion();
});

/* ----------------------------------------------------------------------------
   DATOS DE LA PUBLICACIÓN
   ---------------------------------------------------------------------------- */

async function cargarPublicacion() {
    try {
        publicacion = await apiFetch(`/publicaciones/${TIPO}/${ID}`);
    } catch (error) {
        if (error.status === 404) mostrarNoEncontrada();
        else mostrarError(error.message);
        return;
    }
    pintarPortada();
    pintarInformacion();
    pintarVentajas();
    pintarPoliticas();
    document.getElementById('detalle-contenido').hidden = false;
    document.getElementById('nav-secciones').hidden = false;
    iniciarRevelado();
    iniciarNavegacionSecciones();
    pintarUbicacion();
    actualizarResumen();
    cargarResenas(true);
    cargarRelacionadas();
    registrarVisto(publicacion);
}

function mostrarNoEncontrada() {
    document.getElementById('portada-titulo').textContent = 'Publicación no disponible';
    document.getElementById('portada-categoria').textContent = 'BookingRD';
    document.getElementById('portada-media').classList.add('sin-foto');
    document.getElementById('detalle-error').innerHTML = crearEstado({
        titulo: 'Esta publicación no existe o ya no está disponible',
        texto: 'Puede que la empresa la haya ocultado temporalmente.',
        accion: '<a href="explorar.html" class="btn-primario">Explorar otras opciones</a>'
    });
}

function mostrarError(mensaje) {
    document.getElementById('portada-titulo').textContent = 'No se pudo cargar la publicación';
    document.getElementById('portada-media').classList.add('sin-foto');
    document.getElementById('detalle-error').innerHTML = crearEstado({
        titulo: 'No se pudo cargar la publicación',
        texto: mensaje,
        accion: '<button type="button" class="btn-outline" onclick="location.reload()">Reintentar</button>',
        esError: true
    });
}

function pintarPortada() {
    const categoria = CATALOGOS.categorias[publicacion.categoria];
    const foto = document.getElementById('portada-foto');
    if (publicacion.imagen) {
        foto.src = urlRecurso(publicacion.imagen);
        foto.alt = publicacion.nombre;
        foto.onerror = () => document.getElementById('portada-media').classList.add('sin-foto');
    } else {
        document.getElementById('portada-media').classList.add('sin-foto');
    }
    document.getElementById('portada-sin-foto').textContent = categoria.nombre;
    document.getElementById('portada-categoria').textContent = categoria.nombre;
    document.getElementById('portada-titulo').textContent = publicacion.nombre;
    document.getElementById('portada-datos').textContent = `${publicacion.ciudad}, ofrecido por ${publicacion.proveedor}`;

    // Valoración, guardar y compartir.
    const valoracion = document.getElementById('portada-valoracion');
    valoracion.innerHTML = publicacion.totalResenas
        ? `<span class="nota">${formatoPuntuacion(publicacion.puntuacion)}</span><strong>${etiquetaPuntuacion(publicacion.puntuacion)}</strong><span>${textoResenas(publicacion.totalResenas)}</span>`
        : '<strong>Nuevo en BookingRD</strong><span>Aún sin reseñas</span>';
    document.getElementById('portada-favorito').innerHTML = botonFavorito(publicacion, true);
    document.getElementById('boton-compartir').addEventListener('click', () => {
        compartirEnlace(publicacion.nombre, `${publicacion.nombre} en ${publicacion.ciudad}, en BookingRD`);
    });
    document.getElementById('portada-pie').hidden = false;
    const enTarjeta = document.getElementById('reserva-valoracion');
    if (publicacion.totalResenas) {
        enTarjeta.innerHTML = `<span class="nota">${formatoPuntuacion(publicacion.puntuacion)}</span> ${textoResenas(publicacion.totalResenas)}`;
        enTarjeta.hidden = false;
    }
    const migas = document.getElementById('migas-categoria');
    migas.textContent = categoria.nombre;
    migas.href = `explorar.html?categoria=${publicacion.categoria}`;
    document.title = `${publicacion.nombre} | BookingRD`;
}

function pintarInformacion() {
    const esHotel = TIPO === 'hotel';
    document.getElementById('detalle-descripcion').textContent = publicacion.descripcion;

    const datos = ES_AUTO
        ? [
            ['Categoría', CATALOGOS.categorias[publicacion.categoria].nombre],
            ['Modelo', `${publicacion.marca} ${publicacion.modelo} ${publicacion.anio} o similar`],
            ['Lugar de recogida', publicacion.lugarRecogida],
            ['Horario del mostrador', `${formatearHora(CATALOGOS.horarioAlquiler.apertura)} a ${formatearHora(CATALOGOS.horarioAlquiler.cierre)}, todos los días`],
            ['Devolución', publicacion.cargoOtraCiudad === null ? `En ${publicacion.ciudad}` : `En ${publicacion.ciudad} o en otro destino (${formatoMoneda.format(publicacion.cargoOtraCiudad)})`]
        ]
        : esHotel
        ? [
            ['Tipo', CATALOGOS.tiposAlojamiento[publicacion.tipoAlojamiento]],
            ['Destino', publicacion.ciudad],
            ['Dirección', publicacion.direccion],
            ['Capacidad', `Hasta ${publicacion.capacidadPersonas} personas por habitación`],
            ['Unidades', `${publicacion.habitaciones} ${publicacion.habitaciones === 1 ? 'unidad disponible' : 'habitaciones o unidades'}`]
        ]
        : [
            ['Categoría', CATALOGOS.categorias[publicacion.categoria].nombre],
            ['Destino', publicacion.ciudad],
            ['Duración', formatearDuracion(publicacion.duracionHoras)],
            ['Punto de encuentro', publicacion.puntoEncuentro],
            ['Cupo diario', `${publicacion.cupoDiario} personas`]
        ];
    document.getElementById('detalle-datos').innerHTML = datos
        .map(([titulo, valor]) => `<div><dt>${escaparHtml(titulo)}</dt><dd>${escaparHtml(valor)}</dd></div>`)
        .join('');

    if (ES_AUTO) pintarFichaVehiculo();

    const lista = esHotel
        ? publicacion.servicios.map((codigo) => CATALOGOS.serviciosHotel[codigo]).filter(Boolean)
        : (publicacion.incluye || '').split(',').map((texto) => texto.trim()).filter(Boolean);
    if (lista.length) {
        document.getElementById('titulo-servicios').textContent = esHotel ? 'Servicios' : 'Incluye';
        document.getElementById('detalle-servicios').innerHTML = lista.map((texto) => `<li>${escaparHtml(texto)}</li>`).join('');
        document.getElementById('bloque-servicios').hidden = false;
    }

    const empresa = publicacion.empresa;
    document.getElementById('empresa-nombre').textContent = empresa.nombre;
    document.getElementById('empresa-descripcion').textContent = empresa.descripcion || '';
    const datosEmpresa = [
        ['Ubicación', empresa.ciudad],
        ['Teléfono', empresa.telefono],
        ['Licencia MITUR', empresa.licenciaMitur]
    ].filter(([, valor]) => valor);
    let html = datosEmpresa.map(([t, v]) => `<div><dt>${escaparHtml(t)}</dt><dd>${escaparHtml(v)}</dd></div>`).join('');
    if (empresa.sitioWeb && /^https?:\/\//i.test(empresa.sitioWeb)) {
        html += `<div><dt>Sitio web</dt><dd><a href="${escaparHtml(empresa.sitioWeb)}" target="_blank" rel="noopener noreferrer">${escaparHtml(empresa.sitioWeb.replace(/^https?:\/\//, ''))}</a></dd></div>`;
    }
    document.getElementById('empresa-datos').innerHTML = html;

    document.getElementById('reserva-precio').textContent = formatoMoneda.format(publicacion.precio);
    document.getElementById('reserva-unidad').textContent = unidadPrecio(TIPO);

    prepararBarraMovil();
}

/** Características, requisitos y opciones del formulario propias de un auto. */
function pintarFichaVehiculo() {
    document.getElementById('titulo-detalles').textContent = 'Características';
    document.getElementById('nav-detalles').textContent = 'Características';
    const specs = [
        ['Pasajeros', publicacion.pasajeros],
        ['Puertas', publicacion.puertas],
        ['Maletas', publicacion.maletas],
        ['Transmisión', CATALOGOS.transmisiones[publicacion.transmision]],
        ['Combustible', CATALOGOS.combustibles[publicacion.combustible]],
        ['Aire acondicionado', publicacion.aire ? 'Sí' : 'No'],
        ['Kilometraje', publicacion.kmPorDia ? `${publicacion.kmPorDia} km/día` : 'Ilimitado']
    ];
    const lista = document.getElementById('detalle-specs');
    lista.innerHTML = specs.map(([titulo, valor]) => `<li><strong>${escaparHtml(String(valor))}</strong><span>${escaparHtml(titulo)}</span></li>`).join('');
    lista.hidden = false;

    const requisitos = [
        `Licencia de conducir vigente con al menos un año de antigüedad. Se acepta la licencia del país de origen durante los primeros 90 días de estancia.`,
        `Edad mínima del conductor: ${publicacion.edadMinima} años.${publicacion.cargoConductorJoven ? ` Menores de 25 años pagan ${formatoMoneda.format(publicacion.cargoConductorJoven)} por día.` : ''}`,
        `Tarjeta de crédito a nombre del conductor principal para el depósito reembolsable de ${formatoMoneda.format(publicacion.deposito)}.`,
        'Cédula de identidad o pasaporte vigente.'
    ];
    document.getElementById('detalle-requisitos').innerHTML = requisitos.map((t) => `<li>${escaparHtml(t)}</li>`).join('');
    document.getElementById('bloque-requisitos').hidden = false;

    // Devolución: la ciudad del auto sin cargo y, si se permite, las demás.
    const selector = document.getElementById('reserva-ciudad-devolucion');
    const otras = publicacion.cargoOtraCiudad === null ? [] : CATALOGOS.destinos.filter((d) => d !== publicacion.ciudad);
    selector.innerHTML = `<option value="${escaparHtml(publicacion.ciudad)}">${escaparHtml(publicacion.ciudad)} (mismo lugar)</option>`
        + otras.map((d) => `<option value="${escaparHtml(d)}">${escaparHtml(d)} (+${formatoMoneda.format(publicacion.cargoOtraCiudad)})</option>`).join('');
    selector.disabled = !otras.length;
    const pedida = parametrosUrl.get('ciudadDevolucion');
    if (pedida && otras.includes(pedida)) selector.value = pedida;
    document.getElementById('ayuda-alquiler').textContent = [
        `Conductor de ${publicacion.edadMinima} años o más.`,
        publicacion.cargoOtraCiudad === null ? `Este auto se devuelve en ${publicacion.ciudad}.` : '',
        'Una hora de cortesía en la devolución.'
    ].filter(Boolean).join(' ');
    document.getElementById('reserva-edad').min = 18;
}

/** Barra inferior en móvil: se oculta cuando la tarjeta de reserva es visible. */
function prepararBarraMovil() {
    const barra = document.getElementById('barra-reserva-movil');
    document.getElementById('barra-precio').textContent = formatoMoneda.format(publicacion.precio);
    document.getElementById('barra-unidad').textContent = unidadPrecio(TIPO);
    barra.hidden = false;
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver(([entrada]) => {
        barra.classList.toggle('oculta', entrada.isIntersecting);
    }, { threshold: 0.15 }).observe(document.getElementById('tarjeta-reserva'));
}

async function cargarRelacionadas() {
    try {
        // Autos: otros modelos (la flota de una categoría suele ser corta).
        const consulta = ES_AUTO ? 'tipo=vehiculo&orden=valoracion' : `categoria=${publicacion.categoria}`;
        const respuesta = await apiFetch(`/publicaciones?${consulta}&porPagina=4`);
        const otras = respuesta.publicaciones.filter((p) => p.id !== publicacion.id).slice(0, 3);
        if (!otras.length) return;
        if (ES_AUTO) document.getElementById('titulo-relacionadas').textContent = 'Otros autos disponibles';
        document.getElementById('grid-relacionadas').innerHTML = otras.map(crearTarjetaPublicacion).join('');
        document.getElementById('relacionadas').hidden = false;
    } catch (_) {
        /* sección opcional: se omite si falla */
    }
}

/* ----------------------------------------------------------------------------
   FORMULARIO DE RESERVA
   ---------------------------------------------------------------------------- */

function prepararFormulario() {
    document.querySelectorAll('[data-solo-tipo]').forEach((elemento) => {
        elemento.hidden = !elemento.dataset.soloTipo.split(' ').includes(TIPO);
    });
    if (ES_AUTO) prepararFormularioAuto();

    // Fechas mínimas y valores iniciales: actividad mañana; hotel en 7 días, 2 noches.
    const hoy = hoyIso();
    const maximo = sumarDiasIso(hoy, 365);
    ['reserva-entrada', 'reserva-salida', 'reserva-fecha'].forEach((id) => {
        const campo = document.getElementById(id);
        campo.min = hoy;
        campo.max = maximo;
    });
    document.getElementById('reserva-fecha').value = sumarDiasIso(hoy, 1);
    document.getElementById('reserva-entrada').value = sumarDiasIso(hoy, 7);
    document.getElementById('reserva-salida').value = sumarDiasIso(hoy, 9);

    // Fechas y personas de la búsqueda (explorar.html), si son válidas.
    const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor || '') && valor >= hoy && valor <= maximo;
    const entrada = parametrosUrl.get('entrada');
    const salida = parametrosUrl.get('salida');
    if (fechaValida(entrada) && fechaValida(salida) && salida > entrada) {
        document.getElementById('reserva-entrada').value = entrada;
        document.getElementById('reserva-salida').value = salida;
        document.getElementById('reserva-salida').min = sumarDiasIso(entrada, 1);
    }
    if (fechaValida(parametrosUrl.get('fecha'))) document.getElementById('reserva-fecha').value = parametrosUrl.get('fecha');
    const personas = parseInt(parametrosUrl.get('personas'), 10);
    if (personas >= 1 && personas <= 60) document.getElementById('reserva-personas').value = personas;

    // Tras iniciar sesión se vuelve a esta misma página, con las fechas elegidas.
    const loginReservar = document.getElementById('boton-login-reservar');
    loginReservar.addEventListener('click', (evento) => {
        evento.preventDefault();
        const datos = new URLSearchParams({ tipo: TIPO, id: ID, ...leerSolicitudUrl() });
        window.location.href = `login.html?volver=${encodeURIComponent(`detalle.html?${datos}`)}`;
    });

    const formulario = document.getElementById('form-reserva');
    retirarMarcasAlEditar(formulario);

    // Botones + / - de las cantidades.
    document.querySelectorAll('.contador-boton').forEach((boton) => {
        boton.addEventListener('click', () => {
            const campo = document.getElementById(boton.dataset.contador);
            const valor = (parseInt(campo.value, 10) || 0) + Number(boton.dataset.paso);
            campo.value = Math.min(Math.max(valor, Number(campo.min)), Number(campo.max));
            campo.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });

    // La salida se ajusta si queda antes de la entrada.
    document.getElementById('reserva-entrada').addEventListener('change', (evento) => {
        const salida = document.getElementById('reserva-salida');
        if (salida.value <= evento.target.value) salida.value = sumarDiasIso(evento.target.value, 1);
        salida.min = sumarDiasIso(evento.target.value, 1);
    });

    const actualizar = conRetardo(actualizarResumen, 350);
    formulario.addEventListener('input', actualizar);
    formulario.addEventListener('change', actualizar);
    formulario.addEventListener('submit', reservar);
}

/**
 * Formulario de alquiler: horas del mostrador, valores iniciales (recogida en
 * 7 días a las 10:00, tres días de alquiler), datos de la búsqueda y extras.
 */
function prepararFormularioAuto() {
    const hoy = hoyIso();
    const maximo = sumarDiasIso(hoy, 365);
    const recogida = document.getElementById('reserva-recogida');
    const devolucion = document.getElementById('reserva-devolucion');
    [recogida, devolucion].forEach((campo) => { campo.min = hoy; campo.max = maximo; });
    const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor || '') && valor >= hoy && valor <= maximo;
    const horaValida = (valor) => /^([01]\d|2[0-3]):(00|30)$/.test(valor || '') && valor >= CATALOGOS.horarioAlquiler.apertura && valor <= CATALOGOS.horarioAlquiler.cierre;

    let fechaR = sumarDiasIso(hoy, 7);
    let fechaD = sumarDiasIso(hoy, 10);
    const pedidaR = parametrosUrl.get('recogida');
    const pedidaD = parametrosUrl.get('devolucion');
    if (fechaValida(pedidaR) && fechaValida(pedidaD) && pedidaD >= pedidaR) {
        fechaR = pedidaR;
        fechaD = pedidaD;
    }
    recogida.value = fechaR;
    devolucion.value = fechaD;
    devolucion.min = fechaR;
    const horaR = horaValida(parametrosUrl.get('horaRecogida')) ? parametrosUrl.get('horaRecogida') : '10:00';
    const horaD = horaValida(parametrosUrl.get('horaDevolucion')) ? parametrosUrl.get('horaDevolucion') : '10:00';
    document.getElementById('reserva-hora-recogida').innerHTML = opcionesHoraAlquiler(horaR);
    document.getElementById('reserva-hora-devolucion').innerHTML = opcionesHoraAlquiler(horaD);
    const edad = parseInt(parametrosUrl.get('edadConductor'), 10);
    if (edad >= 18 && edad <= 99) document.getElementById('reserva-edad').value = edad;

    recogida.addEventListener('change', () => {
        devolucion.min = recogida.value;
        if (!devolucion.value || devolucion.value < recogida.value) devolucion.value = sumarDiasIso(recogida.value, 3);
    });

    const elegidos = (parametrosUrl.get('extras') || '').split(',');
    document.getElementById('lista-extras').innerHTML = Object.entries(CATALOGOS.extrasVehiculo).map(([codigo, extra]) => `
        <label class="extra-opcion">
            <input type="checkbox" name="extras" value="${codigo}"${elegidos.includes(codigo) ? ' checked' : ''}>
            <span class="extra-texto"><strong>${escaparHtml(extra.nombre)}</strong><small>${escaparHtml(extra.detalle)}</small></span>
            <span class="extra-precio">${formatoMoneda.format(extra.precio)}<small>${extra.porDia ? 'por día' : 'por alquiler'}</small></span>
        </label>`).join('');
    document.getElementById('reserva-garantia').textContent = 'Cancelación gratuita hasta un día antes de la recogida. Sin pagos por adelantado.';
    document.getElementById('reserva-comentario').placeholder = 'Número de vuelo, hora estimada de llegada, silla para bebé...';
}

/** Datos del formulario como parámetros de URL (regreso tras iniciar sesión). */
function leerSolicitudUrl() {
    const solicitud = leerSolicitud();
    delete solicitud.habitaciones;
    if (ES_AUTO && !solicitud.extras) delete solicitud.extras;
    return solicitud;
}

/** Parámetros de la solicitud según el tipo. Los extras van separados por coma. */
function leerSolicitud() {
    if (ES_AUTO) {
        return {
            recogida: document.getElementById('reserva-recogida').value,
            horaRecogida: document.getElementById('reserva-hora-recogida').value,
            devolucion: document.getElementById('reserva-devolucion').value,
            horaDevolucion: document.getElementById('reserva-hora-devolucion').value,
            edadConductor: parseInt(document.getElementById('reserva-edad').value, 10) || 0,
            ciudadDevolucion: document.getElementById('reserva-ciudad-devolucion').value,
            extras: [...document.querySelectorAll('input[name="extras"]:checked')].map((c) => c.value).join(',')
        };
    }
    const personas = parseInt(document.getElementById('reserva-personas').value, 10) || 0;
    if (TIPO === 'actividad') {
        return { fecha: document.getElementById('reserva-fecha').value, personas };
    }
    return {
        entrada: document.getElementById('reserva-entrada').value,
        salida: document.getElementById('reserva-salida').value,
        habitaciones: parseInt(document.getElementById('reserva-habitaciones').value, 10) || 0,
        personas
    };
}

/** Consulta la disponibilidad y muestra el desglose del total. */
async function actualizarResumen() {
    if (!publicacion) return;
    const resumen = document.getElementById('reserva-resumen');
    const solicitud = leerSolicitud();
    const numero = ++consultaDisponibilidad;
    resumen.innerHTML = '<span class="resumen-cargando"><span class="spinner" aria-hidden="true"></span>Consultando disponibilidad...</span>';
    ultimaEvaluacion = null;

    try {
        const evaluacion = await apiFetch(`/publicaciones/${TIPO}/${ID}/disponibilidad?${new URLSearchParams(solicitud)}`);
        if (numero !== consultaDisponibilidad) return;
        ultimaEvaluacion = evaluacion;
        if (ES_AUTO) {
            resumen.innerHTML = resumenAlquiler(evaluacion);
            return;
        }
        const detalle = TIPO === 'hotel'
            ? `${formatoMoneda.format(publicacion.precio)} x ${evaluacion.noches} ${evaluacion.noches === 1 ? 'noche' : 'noches'} x ${solicitud.habitaciones} ${solicitud.habitaciones === 1 ? 'habitación' : 'habitaciones'}`
            : `${formatoMoneda.format(publicacion.precio)} x ${solicitud.personas} ${solicitud.personas === 1 ? 'persona' : 'personas'}`;
        resumen.innerHTML = `
            <div class="resumen-linea"><span>${detalle}</span><span>${formatoMoneda.format(evaluacion.total)}</span></div>
            <div class="resumen-total"><span>Total</span><strong>${formatoMoneda.format(evaluacion.total)}</strong></div>
            <p class="resumen-estado ${evaluacion.disponible ? (evaluacion.libres <= 3 ? 'es-ultimas' : 'es-disponible') : 'es-agotado'}">
                ${evaluacion.disponible ? textoDisponibilidad(evaluacion.libres) : escaparHtml(evaluacion.mensaje)}
            </p>`;
    } catch (error) {
        if (numero !== consultaDisponibilidad) return;
        resumen.innerHTML = `<p class="resumen-estado es-agotado">${escaparHtml(error.message)}</p>`;
    }
}

/** Desglose del alquiler tal como lo calcula el servidor, con el depósito aparte. */
function resumenAlquiler(evaluacion) {
    const lineas = evaluacion.desglose.map((linea) => `
        <div class="resumen-linea"><span>${escaparHtml(linea.concepto)}</span><span>${formatoMoneda.format(linea.importe)}</span></div>`).join('');
    const estadoClase = evaluacion.disponible ? (evaluacion.libres <= 2 ? 'es-ultimas' : 'es-disponible') : 'es-agotado';
    const estadoTexto = evaluacion.disponible
        ? (evaluacion.libres <= 2
            ? `Solo ${evaluacion.libres === 1 ? 'queda 1 auto' : `quedan ${evaluacion.libres} autos`} de este modelo para esas fechas`
            : 'Disponible para esas fechas')
        : escaparHtml(evaluacion.mensaje);
    return `
        ${lineas}
        <div class="resumen-total"><span>Total (${evaluacion.dias} ${evaluacion.dias === 1 ? 'día' : 'días'})</span><strong>${formatoMoneda.format(evaluacion.total)}</strong></div>
        <p class="resumen-nota">Depósito reembolsable al recoger: ${formatoMoneda.format(evaluacion.deposito)} en tarjeta de crédito. No se suma al total.</p>
        <p class="resumen-estado ${estadoClase}">${estadoTexto}</p>`;
}

/** Texto de disponibilidad; con pocas unidades libres se destaca. */
function textoDisponibilidad(libres) {
    const unidad = TIPO === 'hotel'
        ? (libres === 1 ? 'habitación' : 'habitaciones')
        : (libres === 1 ? 'plaza' : 'plazas');
    return libres <= 3
        ? `Solo ${libres === 1 ? 'queda' : 'quedan'} ${libres} ${unidad} para ${TIPO === 'hotel' ? 'estas fechas' : 'esta fecha'}`
        : `Disponible: quedan ${libres} ${unidad}`;
}

async function reservar(evento) {
    evento.preventDefault();
    const mensaje = document.getElementById('mensaje-error');
    mensaje.classList.remove('visible');
    if (!haySesionActiva()) {
        irAlLogin();
        return;
    }

    const boton = document.getElementById('boton-reservar');
    const datos = leerSolicitud();
    if (ES_AUTO) datos.extras = datos.extras ? datos.extras.split(',') : [];
    const solicitud = Object.assign(datos, {
        tipo: TIPO,
        idPublicacion: ID,
        comentario: document.getElementById('reserva-comentario').value.trim()
    });

    botonCargando(boton, 'Confirmando...');
    try {
        const reserva = await apiFetch('/reservas', { method: 'POST', body: solicitud });
        document.getElementById('confirmacion-codigo').textContent = reserva.codigo;
        document.getElementById('confirmacion-texto').textContent =
            `${reserva.publicacion}. Total: ${formatoMoneda.format(reserva.total)}`;
        abrirModal('modal-confirmacion');
        actualizarResumen();
    } catch (error) {
        mensaje.textContent = error.message;
        mensaje.classList.remove('visible');
        void mensaje.offsetWidth;   // reinicia la animación
        mensaje.classList.add('visible');
        if (error.campo) marcarCampo(error.campo);
    } finally {
        botonNormal(boton, 'Reservar ahora');
    }
}

/* ----------------------------------------------------------------------------
   LO MÁS DESTACADO, POLÍTICAS Y UBICACIÓN
   ---------------------------------------------------------------------------- */

/** Ventajas de la publicación a partir de sus datos (sin textos inventados). */
function pintarVentajas() {
    const ventajas = ES_AUTO
        ? [
            ['Cancelación gratuita', 'Hasta un día antes de la recogida, desde Mis reservas.'],
            [publicacion.kmPorDia ? `${publicacion.kmPorDia} km por día` : 'Kilometraje ilimitado', publicacion.kmPorDia ? 'Kilómetros adicionales según la tarifa de la empresa.' : 'Recorre la isla sin contar kilómetros.'],
            ['Seguro y asistencia', 'Seguro básico de colisión y asistencia en carretera 24 horas.']
        ]
        : [
            ['Cancelación gratuita', 'Hasta un día antes de la fecha, desde Mis reservas.'],
            ['Confirmación inmediata', 'El cupo se verifica y se descuenta al reservar.']
        ];
    if (publicacion.empresa.licenciaMitur) ventajas.push(['Empresa con licencia MITUR', publicacion.empresa.licenciaMitur]);
    else ventajas.push(['Empresa identificada', 'Registrada con RNC y razón social.']);
    if (publicacion.totalReservas >= 3) {
        ventajas.push(['Muy reservado', `${publicacion.totalReservas} reservas confirmadas en BookingRD.`]);
    } else if (TIPO === 'hotel' && publicacion.servicios.includes('todo-incluido')) {
        ventajas.push(['Todo incluido', 'Comidas y bebidas incluidas en el precio por noche.']);
    } else if (ES_AUTO && /aeropuerto/i.test(publicacion.lugarRecogida)) {
        ventajas.push(['Recogida en el aeropuerto', 'Mostrador en la terminal de llegadas.']);
    } else if (TIPO === 'actividad') {
        ventajas.push(['Grupos pequeños', `Cupo de ${publicacion.cupoDiario} personas por día.`]);
    }
    document.getElementById('detalle-ventajas').innerHTML = ventajas.map(([titulo, texto]) => `
        <li><span class="ventaja-marca" aria-hidden="true"></span><span><strong>${escaparHtml(titulo)}</strong><small>${escaparHtml(texto)}</small></span></li>`).join('');
}

function pintarPoliticas() {
    const politicas = ES_AUTO
        ? [
            ['Cancelación', 'Gratuita hasta un día antes de la recogida, desde Mis reservas.'],
            ['Pago', 'BookingRD no cobra por adelantado. El alquiler se paga en el mostrador de la empresa.'],
            ['Depósito', `${formatoMoneda.format(publicacion.deposito)} retenidos en la tarjeta de crédito del conductor y liberados al devolver el auto sin daños.`],
            ['Combustible', 'Lleno a lleno: se entrega con el tanque lleno y se devuelve igual. Si falta combustible, se cobra el faltante.'],
            ['Kilometraje', publicacion.kmPorDia ? `${publicacion.kmPorDia} km incluidos por día de alquiler.` : 'Ilimitado.'],
            ['Seguro incluido', publicacion.incluye || 'Seguro básico de colisión con deducible y asistencia 24 horas.'],
            ['Días de alquiler', 'Se cuentan bloques de 24 horas desde la hora de recogida, con una hora de cortesía. Pasada esa hora se cobra un día adicional.'],
            ['Horario', `Recogida y devolución de ${formatearHora(CATALOGOS.horarioAlquiler.apertura)} a ${formatearHora(CATALOGOS.horarioAlquiler.cierre)}.`]
        ]
        : TIPO === 'hotel'
        ? [
            ['Cancelación', 'Gratuita hasta un día antes de la entrada, desde Mis reservas. Después de esa fecha, consulta con la empresa.'],
            ['Pago', 'BookingRD no cobra por adelantado. La empresa te indicará cómo pagar tu estancia.'],
            ['Entrada y salida', 'Coordina la hora de llegada con la empresa; puedes indicarla en el comentario de la reserva.'],
            ['Capacidad', `Hasta ${publicacion.capacidadPersonas} personas por habitación o unidad.`],
            ['Documentos', 'Cédula de identidad o pasaporte vigente del titular de la reserva.']
        ]
        : [
            ['Cancelación', 'Gratuita hasta un día antes de la actividad, desde Mis reservas.'],
            ['Pago', 'BookingRD no cobra por adelantado. La empresa te indicará cómo pagar.'],
            ['Punto de encuentro', publicacion.puntoEncuentro],
            ['Duración', `${formatearDuracion(publicacion.duracionHoras)} aproximadamente.`],
            ['Recomendaciones', 'Llega 15 minutos antes, con protector solar, agua y ropa cómoda.']
        ];
    document.getElementById('detalle-politicas').innerHTML = politicas
        .map(([titulo, texto]) => `<div><dt>${escaparHtml(titulo)}</dt><dd>${escaparHtml(texto)}</dd></div>`).join('');
}

/** Mapa de la zona (centro del destino) y enlace a Google Maps con la dirección. */
function pintarUbicacion() {
    const lugar = ES_AUTO ? publicacion.lugarRecogida : TIPO === 'hotel' ? publicacion.direccion : publicacion.puntoEncuentro;
    document.getElementById('ubicacion-texto').textContent = `${lugar}. El mapa muestra la zona aproximada en ${publicacion.ciudad}.`;
    const consulta = encodeURIComponent(`${lugar}, ${publicacion.ciudad}, República Dominicana`);
    document.getElementById('enlace-como-llegar').href = `https://www.google.com/maps/search/?api=1&query=${consulta}`;

    const posicion = coordenadasPublicacion(publicacion);
    const mapa = crearMapaRD(document.getElementById('mapa-detalle'), { centro: posicion || undefined, zoom: 10 });
    if (!mapa || !posicion) return;
    L.circle(posicion, { radius: 1200, color: '#CE1126', weight: 2, fillColor: '#CE1126', fillOpacity: 0.12 }).addTo(mapa);
    L.marker(posicion, { icon: marcadorPrecio(publicacion), title: publicacion.nombre }).addTo(mapa);
}

/** Resalta en la barra de secciones la que está a la vista. */
function iniciarNavegacionSecciones() {
    const enlaces = [...document.querySelectorAll('.nav-secciones a')];
    const secciones = enlaces.map((enlace) => document.querySelector(enlace.getAttribute('href'))).filter(Boolean);
    if (!('IntersectionObserver' in window)) return;
    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            enlaces.forEach((enlace) => enlace.classList.toggle('activo', enlace.getAttribute('href') === `#${entrada.target.id}`));
        });
    }, { rootMargin: '-35% 0px -60% 0px' });
    secciones.forEach((seccion) => observador.observe(seccion));
}

/* ----------------------------------------------------------------------------
   RESEÑAS
   ---------------------------------------------------------------------------- */

const formatoFechaResena = new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Carga el resumen y la primera página (reiniciar) o la página siguiente. */
async function cargarResenas(reiniciar) {
    const lista = document.getElementById('lista-resenas');
    const botonMas = document.getElementById('boton-mas-resenas');
    if (reiniciar) {
        resenas.pagina = 1;
        resenas.mostradas = 0;
        lista.innerHTML = '<div class="resena esqueleto resena-esqueleto" aria-hidden="true"></div>'.repeat(2);
    } else {
        botonCargando(botonMas, 'Cargando...');
    }
    try {
        const datos = await apiFetch(`/publicaciones/${TIPO}/${ID}/resenas?orden=${resenas.orden}&pagina=${resenas.pagina}`);
        resenas.total = datos.resumen.total;
        if (reiniciar) pintarResumenResenas(datos.resumen);
        const html = datos.resenas.map(crearResena).join('');
        if (reiniciar) lista.innerHTML = html;
        else lista.insertAdjacentHTML('beforeend', html);
        resenas.mostradas += datos.resenas.length;
        if (!resenas.total) {
            lista.innerHTML = '<p class="resenas-vacio">Esta publicación aún no tiene reseñas. Las primeras opiniones aparecerán cuando los viajeros terminen su estancia, actividad o alquiler.</p>';
        }
        botonMas.hidden = resenas.mostradas >= resenas.total;
    } catch (error) {
        lista.innerHTML = `<p class="resenas-vacio">${escaparHtml(error.message)}</p>`;
        botonMas.hidden = true;
    } finally {
        if (!reiniciar) botonNormal(botonMas, 'Ver más reseñas');
    }
}

/** Puntuación media, calificación y distribución por tramos. */
function pintarResumenResenas(resumen) {
    const contenedor = document.getElementById('resenas-resumen');
    document.getElementById('nav-conteo-resenas').textContent = resumen.total ? `(${resumen.total})` : '';
    if (!resumen.total) {
        contenedor.innerHTML = '';
        return;
    }
    const tramos = [
        ['excelente', 'Excelente (9-10)'],
        ['muyBueno', 'Muy bueno (7-8)'],
        ['aceptable', 'Aceptable (5-6)'],
        ['regular', 'Regular (3-4)'],
        ['malo', 'Malo (1-2)']
    ];
    contenedor.innerHTML = `
        <div class="resenas-puntaje">
            <span class="nota nota-xl">${formatoPuntuacion(resumen.promedio)}</span>
            <div><strong>${etiquetaPuntuacion(resumen.promedio)}</strong><span>${textoResenas(resumen.total)} verificadas</span></div>
        </div>
        <ul class="resenas-distribucion">
            ${tramos.map(([clave, etiqueta]) => {
                const cantidad = resumen.distribucion[clave];
                const porcentaje = Math.round((cantidad / resumen.total) * 100);
                return `<li><span>${etiqueta}</span><span class="distribucion-pista"><span style="width:${porcentaje}%"></span></span><span>${cantidad}</span></li>`;
            }).join('')}
        </ul>`;
}

function crearResena(resena) {
    const dias = Math.max(1, Math.round((Date.parse(resena.estancia.fechaFin) - Date.parse(resena.estancia.fechaInicio)) / 86400000));
    const estancia = resena.tipo === 'hotel'
        ? `${dias} ${dias === 1 ? 'noche' : 'noches'}`
        : resena.tipo === 'vehiculo' ? `Alquiler de ${dias} ${dias === 1 ? 'día' : 'días'}` : 'Actividad';
    const grupo = resena.tipo === 'vehiculo' ? '' : `, ${resena.estancia.personas} ${resena.estancia.personas === 1 ? 'persona' : 'personas'}`;
    const respuesta = resena.respuesta ? `
        <div class="resena-respuesta">
            <strong>Respuesta de ${escaparHtml(publicacion.proveedor)}</strong>
            <p>${escaparHtml(resena.respuesta)}</p>
        </div>` : '';
    return `
        <article class="resena">
            <header>
                <span class="opinion-avatar" aria-hidden="true">${escaparHtml(resena.autor.charAt(0))}</span>
                <div>
                    <strong>${escaparHtml(resena.autor)}</strong>
                    <small>${escaparHtml(estancia)}${escaparHtml(grupo)}. Reseña de ${formatoFechaResena.format(new Date(resena.fecha))}</small>
                </div>
                <span class="nota" aria-label="Puntuación ${resena.puntuacion} de 10">${resena.puntuacion}</span>
            </header>
            <h3>${escaparHtml(resena.titulo)}</h3>
            <p>${escaparHtml(resena.comentario)}</p>
            ${respuesta}
        </article>`;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('resenas-orden').addEventListener('change', (evento) => {
        resenas.orden = evento.target.value;
        cargarResenas(true);
    });
    document.getElementById('boton-mas-resenas').addEventListener('click', () => {
        resenas.pagina += 1;
        cargarResenas(false);
    });
});
