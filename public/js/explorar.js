/**
 * @file public/js/explorar.js
 * @description Catálogo de publicaciones (explorar.html).
 *
 * Parámetros de URL (todos opcionales):
 *   tipo       hotel | actividad | vehiculo
 *   categoria  código de categoría (ver CATALOGOS.categorias); define el tipo
 *   ciudad     destino
 *   personas   capacidad mínima (pasajeros, en autos)
 *   transmision  automatica | manual (solo autos)
 *   precioMin, precioMax  rango de precio por noche, por persona o por día
 *   puntuacionMin  valoración media mínima (7, 8 o 9)
 *   q          texto de búsqueda
 *   orden      destacados | valoracion | populares | recientes | precio-asc | precio-desc | nombre
 *   vista      lista | mapa
 *   entrada, salida (alojamiento), fecha (actividad) o recogida, horaRecogida,
 *              devolucion, horaDevolucion (autos): datos del viaje que se
 *              llevan al formulario de reserva del detalle (contextoViaje).
 *
 * Los filtros se aplican al cambiar (el texto, con retardo), se reflejan en
 * la URL y los resultados se cargan por páginas ("Mostrar más"). La vista de
 * mapa carga hasta 48 resultados y los muestra con su precio.
 *
 * API: GET /api/publicaciones, GET /api/publicaciones/precios (histograma)
 */

const POR_PAGINA = 12;
const POR_PAGINA_MAPA = 48;

const TEXTOS_TIPO = {
    hotel: {
        titulo: 'Alojamiento en República Dominicana',
        texto: 'Resorts todo incluido, hoteles de ciudad, villas privadas y cabañas en los mejores destinos del país.',
        todas: 'Todo el alojamiento'
    },
    actividad: {
        titulo: 'Actividades y excursiones',
        texto: 'Tours de playa y de montaña, cultura, gastronomía y aventura con operadores locales.',
        todas: 'Todas las actividades'
    },
    vehiculo: {
        titulo: 'Alquiler de autos',
        texto: 'Económicos, SUV, pickups 4x4, lujo y convertibles con recogida en aeropuertos y en las principales ciudades.',
        todas: 'Todos los autos'
    }
};

const DESCRIPCIONES_CATEGORIA = {
    'hoteles-resorts': 'Resorts todo incluido, hoteles boutique y hoteles de ciudad frente al mar Caribe y al Atlántico.',
    'villas-cabanas': 'Villas privadas con piscina y cabañas entre montañas para grupos y familias.',
    'tour-playa': 'Islas, bahías vírgenes, cabalgatas y playas de arena blanca con guías locales.',
    'tour-montana': 'Cascadas, ríos y senderos de la Cordillera Central y la península de Samaná.',
    'tour-gastronomico': 'Café de altura, cacao orgánico y cocina criolla en su lugar de origen.',
    cultural: 'La primera ciudad del Nuevo Mundo, fortalezas, monumentos y arte rupestre taíno.',
    'zip-line': 'Tirolesas sobre el bosque tropical y vuelos en parapente sobre los valles de la cordillera.',
    motocross: 'Buggies y cuatrimotos por caminos rurales, ríos y playas.',
    acuaticas: 'Snorkel en arrecifes, charcos naturales y paseos en el mar Caribe.',
    golf: 'Campos de golf de clase mundial junto al mar Caribe, con green fee, carrito y caddie.',
    economico: 'Autos de bajo consumo para moverte por la ciudad y entre destinos sin gastar de más.',
    compacto: 'Autos ágiles y fáciles de estacionar, ideales para la Zona Colonial y las ciudades.',
    sedan: 'Sedanes cómodos con buen espacio para maletas en la autopista.',
    suv: 'Vehículos altos y espaciosos para familias, grupos y caminos de playa.',
    minivan: 'Hasta siete u ocho pasajeros con todo el equipaje.',
    lujo: 'Sedanes y SUV ejecutivos para viajes de negocios u ocasiones especiales.',
    convertible: 'Descapotables para recorrer la costa con la capota abajo.',
    pickup: 'Pickups 4x4 para la montaña, Samaná y los caminos sin asfaltar.'
};

/** Fechas y horas válidas del contexto de viaje. */
const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor || '') && valor >= hoyIso();
const horaValida = (valor) => /^([01]\d|2[0-3]):(00|30)$/.test(valor || '');

/** Estado de la búsqueda. */
const estado = {
    tipo: 'hotel',
    categoria: null,
    ciudad: '',
    personas: '',
    precioMin: '',
    precioMax: '',
    puntuacionMin: '',
    transmision: '',
    texto: '',
    orden: 'destacados',
    vista: 'lista',
    pagina: 1,
    total: 0,
    solicitud: 0
};

document.addEventListener('DOMContentLoaded', () => {
    llenarDestinos();
    leerUrl();
    sincronizarControles();
    iniciarControles();
    pintarCategorias();
    actualizarBanner();
    cargarRangoPrecio();
    cargar(true);
});

/* ----------------------------------------------------------------------------
   ESTADO Y URL
   ---------------------------------------------------------------------------- */

function leerUrl() {
    const parametros = new URLSearchParams(window.location.search);
    const categoria = parametros.get('categoria');
    if (categoria && CATALOGOS.categorias[categoria]) {
        estado.categoria = categoria;
        estado.tipo = CATALOGOS.categorias[categoria].tipo;
    } else if (['actividad', 'vehiculo'].includes(parametros.get('tipo'))) {
        estado.tipo = parametros.get('tipo');
    }
    const ciudad = parametros.get('ciudad');
    estado.ciudad = CATALOGOS.destinos.includes(ciudad) ? ciudad : '';
    estado.personas = parametros.get('personas') || '';
    const entero = (valor) => (/^\d+$/.test(valor || '') ? valor : '');
    estado.precioMin = entero(parametros.get('precioMin'));
    estado.precioMax = entero(parametros.get('precioMax'));
    estado.puntuacionMin = ['7', '8', '9'].includes(parametros.get('puntuacionMin')) ? parametros.get('puntuacionMin') : '';
    estado.transmision = estado.tipo === 'vehiculo' && ['automatica', 'manual'].includes(parametros.get('transmision')) ? parametros.get('transmision') : '';
    estado.texto = parametros.get('q') || '';
    estado.orden = parametros.get('orden') || 'destacados';
    estado.vista = parametros.get('vista') === 'mapa' ? 'mapa' : 'lista';

    // Fechas del viaje: solo valores AAAA-MM-DD desde hoy.
    const recogida = parametros.get('recogida');
    const devolucion = parametros.get('devolucion');
    if (fechaValida(recogida) && fechaValida(devolucion) && devolucion >= recogida
        && horaValida(parametros.get('horaRecogida')) && horaValida(parametros.get('horaDevolucion'))) {
        Object.assign(contextoViaje, { recogida, devolucion, horaRecogida: parametros.get('horaRecogida'), horaDevolucion: parametros.get('horaDevolucion') });
    }
    const entrada = parametros.get('entrada');
    const salida = parametros.get('salida');
    if (fechaValida(entrada) && fechaValida(salida) && salida > entrada) {
        contextoViaje.entrada = entrada;
        contextoViaje.salida = salida;
    }
    if (fechaValida(parametros.get('fecha'))) contextoViaje.fecha = parametros.get('fecha');
    contextoViaje.personas = estado.personas;
}

/** Refleja los filtros en la URL sin recargar la página. */
function escribirUrl() {
    const parametros = new URLSearchParams();
    if (estado.categoria) parametros.set('categoria', estado.categoria);
    else parametros.set('tipo', estado.tipo);
    if (estado.ciudad) parametros.set('ciudad', estado.ciudad);
    if (estado.personas) parametros.set('personas', estado.personas);
    if (estado.precioMin) parametros.set('precioMin', estado.precioMin);
    if (estado.precioMax) parametros.set('precioMax', estado.precioMax);
    if (estado.puntuacionMin) parametros.set('puntuacionMin', estado.puntuacionMin);
    if (estado.transmision) parametros.set('transmision', estado.transmision);
    if (estado.texto) parametros.set('q', estado.texto);
    if (estado.orden !== 'destacados') parametros.set('orden', estado.orden);
    if (estado.vista === 'mapa') parametros.set('vista', 'mapa');
    if (contextoViaje.entrada) {
        parametros.set('entrada', contextoViaje.entrada);
        parametros.set('salida', contextoViaje.salida);
    }
    if (contextoViaje.fecha) parametros.set('fecha', contextoViaje.fecha);
    if (contextoViaje.recogida) {
        for (const clave of ['recogida', 'horaRecogida', 'devolucion', 'horaDevolucion']) parametros.set(clave, contextoViaje[clave]);
    }
    history.replaceState(null, '', `${window.location.pathname}?${parametros}`);
}

function hayFiltros() {
    return Boolean(estado.categoria || estado.ciudad || estado.personas || estado.precioMin || estado.precioMax || estado.puntuacionMin || estado.transmision || estado.texto || estado.orden !== 'destacados');
}

/* ----------------------------------------------------------------------------
   CONTROLES
   ---------------------------------------------------------------------------- */

function llenarDestinos() {
    const selector = document.getElementById('filtro-ciudad');
    CATALOGOS.destinos.forEach((destino) => selector.add(new Option(destino, destino)));
}

function sincronizarControles() {
    document.getElementById('filtro-ciudad').value = estado.ciudad;
    document.getElementById('filtro-personas').value = estado.personas;
    sincronizarRangoPrecio();
    marcarRadio('puntuacionMin', estado.puntuacionMin);
    marcarRadio('transmision', estado.transmision);
    document.getElementById('unidad-precio').textContent = unidadPrecio(estado.tipo);
    const esAuto = estado.tipo === 'vehiculo';
    document.querySelectorAll('[data-filtro-tipo]').forEach((grupo) => { grupo.hidden = grupo.dataset.filtroTipo !== estado.tipo; });
    document.getElementById('etiqueta-personas').textContent = esAuto ? 'Pasajeros' : 'Personas';
    document.getElementById('etiqueta-ciudad').textContent = esAuto ? 'Lugar de recogida' : 'Destino';
    document.getElementById('filtro-personas').max = esAuto ? 9 : 60;
    document.getElementById('texto-garantias').textContent = esAuto
        ? 'Seguro básico y asistencia 24 horas incluidos. Cancelación gratuita hasta un día antes de la recogida.'
        : 'Cancelación gratuita hasta un día antes y confirmación inmediata.';
    document.getElementById('filtro-texto').value = estado.texto;
    document.getElementById('filtro-orden').value = estado.orden;
    document.querySelectorAll('.tipo-boton').forEach((boton) => {
        const activo = boton.dataset.tipo === estado.tipo;
        boton.classList.toggle('activo', activo);
        boton.setAttribute('aria-selected', String(activo));
    });
    document.querySelectorAll('.vista-boton').forEach((boton) => {
        const activo = boton.dataset.vista === estado.vista;
        boton.classList.toggle('activo', activo);
        boton.setAttribute('aria-pressed', String(activo));
    });
    pintarContextoViaje();
    pintarFiltrosActivos();
}

/** Selecciona la opción de un grupo de radio; si el valor no existe, la primera (sin filtro). */
function marcarRadio(nombre, valor) {
    const opciones = [...document.querySelectorAll(`input[name="${nombre}"]`)];
    const elegida = opciones.find((o) => o.value === String(valor || '')) || opciones[0];
    elegida.checked = true;
}

/**
 * Etiquetas de los filtros aplicados sobre los resultados; al pulsar una se
 * quita ese filtro. También actualiza el contador del botón "Filtros".
 */
function pintarFiltrosActivos() {
    const activos = [];
    if (estado.texto) activos.push(['texto', `"${estado.texto}"`]);
    if (estado.ciudad) activos.push(['ciudad', estado.ciudad]);
    if (estado.personas) {
        const palabra = estado.tipo === 'vehiculo' ? ['pasajero', 'pasajeros'] : ['persona', 'personas'];
        activos.push(['personas', `${estado.personas} ${estado.personas === '1' ? palabra[0] : palabra[1]}`]);
    }
    if (estado.transmision) activos.push(['transmision', CATALOGOS.transmisiones[estado.transmision]]);
    if (estado.precioMin && estado.precioMax) activos.push(['precio', `${formatoMoneda.format(Number(estado.precioMin))} a ${formatoMoneda.format(Number(estado.precioMax))}`]);
    else if (estado.precioMin) activos.push(['precio', `Desde ${formatoMoneda.format(Number(estado.precioMin))}`]);
    else if (estado.precioMax) activos.push(['precio', `Hasta ${formatoMoneda.format(Number(estado.precioMax))}`]);
    if (estado.puntuacionMin) activos.push(['puntuacionMin', `Valoración ${estado.puntuacionMin}+`]);
    document.getElementById('filtros-activos').innerHTML = activos
        .map(([clave, texto]) => `<button type="button" class="etiqueta-filtro" data-quitar-filtro="${clave}" aria-label="Quitar filtro ${escaparHtml(texto)}">${escaparHtml(texto)}</button>`)
        .join('');
    const contador = document.getElementById('contador-filtros');
    contador.textContent = activos.length;
    contador.hidden = !activos.length;
}

/** Panel de filtros en pantallas angostas (cajón lateral). */
function abrirPanelFiltros(abrir) {
    const panel = document.getElementById('panel-filtros');
    panel.classList.toggle('abierto', abrir);
    document.getElementById('fondo-filtros').hidden = !abrir;
    document.body.classList.toggle('filtros-abiertos', abrir);
    document.getElementById('boton-abrir-filtros').setAttribute('aria-expanded', String(abrir));
    if (abrir) document.getElementById('boton-cerrar-filtros').focus();
}

/** Aviso con las fechas del viaje elegidas en el buscador del inicio. */
function pintarContextoViaje() {
    const contenedor = document.getElementById('contexto-viaje');
    const personas = contextoViaje.personas ? `, ${contextoViaje.personas} ${contextoViaje.personas === '1' ? 'persona' : 'personas'}` : '';
    let texto = '';
    if (estado.tipo === 'hotel' && contextoViaje.entrada) {
        const noches = Math.round((Date.parse(contextoViaje.salida) - Date.parse(contextoViaje.entrada)) / 86400000);
        texto = `Tu viaje: ${formatearFecha(contextoViaje.entrada)} al ${formatearFecha(contextoViaje.salida)} (${noches} ${noches === 1 ? 'noche' : 'noches'})${personas}. Lo verás ya completado al reservar.`;
    } else if (estado.tipo === 'actividad' && contextoViaje.fecha) {
        texto = `Tu fecha: ${formatearFecha(contextoViaje.fecha)}${personas}. La verás ya completada al reservar.`;
    } else if (estado.tipo === 'vehiculo' && contextoViaje.recogida) {
        texto = `Tu alquiler: recogida el ${formatearFecha(contextoViaje.recogida)} a las ${formatearHora(contextoViaje.horaRecogida)}, devolución el ${formatearFecha(contextoViaje.devolucion)} a las ${formatearHora(contextoViaje.horaDevolucion)}; lo verás ya completado al reservar.`;
    }
    contenedor.hidden = !texto;
    document.getElementById('contexto-viaje-texto').textContent = texto;
}

function iniciarControles() {
    document.querySelectorAll('.tipo-boton').forEach((boton) => {
        boton.addEventListener('click', () => {
            if (boton.dataset.tipo === estado.tipo && !estado.categoria) return;
            estado.tipo = boton.dataset.tipo;
            estado.categoria = null;
            estado.transmision = '';
            aplicarCambio();
        });
    });

    const enlazar = (id, clave, evento = 'change') => {
        document.getElementById(id).addEventListener(evento, (e) => {
            estado[clave] = e.target.value.trim();
            aplicarCambio(false);
        });
    };
    enlazar('filtro-ciudad', 'ciudad');
    enlazar('filtro-orden', 'orden');
    iniciarRangoPrecio();
    document.querySelectorAll('input[name="puntuacionMin"], input[name="transmision"]').forEach((opcion) => {
        opcion.addEventListener('change', () => {
            estado[opcion.name] = opcion.value;
            aplicarCambio(false);
        });
    });
    document.getElementById('filtros-activos').addEventListener('click', (evento) => {
        const etiqueta = evento.target.closest('[data-quitar-filtro]');
        if (!etiqueta) return;
        if (etiqueta.dataset.quitarFiltro === 'precio') Object.assign(estado, { precioMin: '', precioMax: '' });
        else estado[etiqueta.dataset.quitarFiltro] = '';
        if (etiqueta.dataset.quitarFiltro === 'personas') contextoViaje.personas = '';
        aplicarCambio(false);
    });
    document.getElementById('boton-abrir-filtros').addEventListener('click', () => abrirPanelFiltros(true));
    document.getElementById('boton-cerrar-filtros').addEventListener('click', () => abrirPanelFiltros(false));
    document.getElementById('fondo-filtros').addEventListener('click', () => abrirPanelFiltros(false));
    document.getElementById('boton-ver-resultados').addEventListener('click', () => {
        abrirPanelFiltros(false);
        document.getElementById('resultados-total').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && document.getElementById('panel-filtros').classList.contains('abierto')) abrirPanelFiltros(false);
    });
    document.getElementById('filtro-personas').addEventListener('input', conRetardo((e) => {
        const valor = parseInt(e.target.value, 10);
        estado.personas = valor > 0 ? String(valor) : '';
        contextoViaje.personas = estado.personas;
        aplicarCambio(false);
    }, 400));
    document.getElementById('filtro-texto').addEventListener('input', conRetardo((e) => {
        estado.texto = e.target.value.trim();
        aplicarCambio(false);
    }, 400));
    document.getElementById('form-filtros').addEventListener('submit', (e) => e.preventDefault());

    document.getElementById('boton-limpiar').addEventListener('click', () => {
        Object.assign(estado, { categoria: null, ciudad: '', personas: '', precioMin: '', precioMax: '', puntuacionMin: '', transmision: '', texto: '', orden: 'destacados' });
        contextoViaje.personas = '';
        aplicarCambio();
    });
    document.getElementById('boton-quitar-fechas').addEventListener('click', () => {
        Object.assign(contextoViaje, { entrada: '', salida: '', fecha: '', recogida: '', horaRecogida: '', devolucion: '', horaDevolucion: '' });
        aplicarCambio(false);
    });
    document.querySelectorAll('.vista-boton').forEach((boton) => {
        boton.addEventListener('click', () => {
            if (boton.dataset.vista === estado.vista) return;
            estado.vista = boton.dataset.vista;
            aplicarCambio(false);
        });
    });
    document.getElementById('boton-mas').addEventListener('click', () => {
        estado.pagina += 1;
        cargar(false);
    });
}

/** Aplica un cambio de filtros: URL, controles, categorías, banner y resultados. */
function aplicarCambio(repintarCategorias = true) {
    estado.pagina = 1;
    cargarRangoPrecio();
    sincronizarControles();
    if (repintarCategorias) pintarCategorias();
    else marcarCategoriaActiva();
    actualizarBanner();
    escribirUrl();
    cargar(true);
}

/** Fila de categorías del tipo actual, con la marca de color de su grupo. */
function pintarCategorias() {
    const fila = document.getElementById('categorias-fila');
    const categorias = Object.entries(CATALOGOS.categorias).filter(([, c]) => c.tipo === estado.tipo);
    fila.innerHTML = `<button type="button" class="chip-categoria" data-categoria="">
            <span class="chip-categoria-marca todas" aria-hidden="true"></span>${TEXTOS_TIPO[estado.tipo].todas}
        </button>` + categorias.map(([codigo, categoria]) => `
        <button type="button" class="chip-categoria" data-categoria="${codigo}">
            <span class="chip-categoria-marca grupo-${categoria.grupo.toLowerCase()}" aria-hidden="true"></span>${escaparHtml(categoria.nombre)}
        </button>`).join('');
    fila.querySelectorAll('.chip-categoria').forEach((chip) => {
        chip.addEventListener('click', () => {
            estado.categoria = chip.dataset.categoria || null;
            aplicarCambio(false);
        });
    });
    marcarCategoriaActiva();
}

function marcarCategoriaActiva() {
    document.querySelectorAll('.chip-categoria').forEach((chip) => {
        const activa = (chip.dataset.categoria || null) === estado.categoria;
        chip.classList.toggle('activo', activa);
        chip.setAttribute('aria-pressed', String(activa));
    });
}

/** Textos del banner según la categoría o el tipo, con transición suave. */
function actualizarBanner() {
    const categoria = estado.categoria ? CATALOGOS.categorias[estado.categoria] : null;
    const textos = TEXTOS_TIPO[estado.tipo];
    const titulo = categoria ? categoria.nombre : textos.titulo;
    const contenido = document.querySelector('.banner-contenido');

    const aplicar = () => {
        document.getElementById('banner-titulo').textContent = titulo;
        document.getElementById('banner-texto').textContent = categoria ? DESCRIPCIONES_CATEGORIA[estado.categoria] : textos.texto;
        document.getElementById('migas-actual').textContent = titulo;
        document.getElementById('migas-actual').hidden = false;
        document.getElementById('migas-separador').hidden = false;
        contenido.classList.remove('cambiando');
    };
    document.title = `${titulo} | BookingRD`;
    if (document.getElementById('banner-titulo').textContent === titulo) return aplicar();
    contenido.classList.add('cambiando');
    setTimeout(aplicar, 200);
}

/* ----------------------------------------------------------------------------
   FILTRO DE PRECIO
   Control deslizante de dos extremos sobre el histograma de precios del tipo,
   la categoría y el destino elegidos. Un extremo en su tope equivale a "sin
   límite" por ese lado. Los resultados se actualizan mientras se arrastra,
   con un breve retardo.
   ---------------------------------------------------------------------------- */

const rangoPrecio = { minimo: null, maximo: null, base: null, tramos: [], clave: '', solicitud: 0 };

/** Paso redondo para el control según la amplitud del rango (50, 100, 250, 500...). */
function pasoPrecio(amplitud) {
    const pasos = [50, 100, 250, 500, 1000, 2500, 5000];
    return pasos.find((paso) => amplitud / paso <= 120) || 10000;
}

function iniciarRangoPrecio() {
    const minimo = document.getElementById('precio-min');
    const maximo = document.getElementById('precio-max');
    const aplicar = conRetardo(() => {
        if (rangoPrecio.minimo === null) return;
        const desde = Number(minimo.value);
        const hasta = Number(maximo.value);
        estado.precioMin = desde > rangoPrecio.minimo ? String(desde) : '';
        estado.precioMax = hasta < rangoPrecio.maximo ? String(hasta) : '';
        aplicarCambio(false);
    }, 350);
    const alMover = (evento) => {
        // Los extremos no se cruzan: el que se mueve se detiene en el otro.
        if (Number(minimo.value) > Number(maximo.value)) {
            if (evento.target === minimo) minimo.value = maximo.value;
            else maximo.value = minimo.value;
        }
        pintarRangoPrecio();
        aplicar();
    };
    minimo.addEventListener('input', alMover);
    maximo.addEventListener('input', alMover);
}

/** Pide el rango y el histograma si cambió el tipo, la categoría o el destino. */
async function cargarRangoPrecio() {
    const clave = [estado.tipo, estado.categoria || '', estado.ciudad || ''].join('|');
    if (clave === rangoPrecio.clave) return;
    rangoPrecio.clave = clave;
    const numero = ++rangoPrecio.solicitud;
    const parametros = new URLSearchParams({ tipo: estado.tipo });
    if (estado.categoria) parametros.set('categoria', estado.categoria);
    if (estado.ciudad) parametros.set('ciudad', estado.ciudad);
    try {
        const datos = await apiFetch(`/publicaciones/precios?${parametros}`);
        if (numero !== rangoPrecio.solicitud) return;
        // base: precios reales del histograma; minimo y maximo se redondean al paso del control.
        Object.assign(rangoPrecio, { minimo: datos.minimo, maximo: datos.maximo, base: [datos.minimo, datos.maximo], tramos: datos.tramos });
    } catch (_) {
        if (numero !== rangoPrecio.solicitud) return;
        Object.assign(rangoPrecio, { minimo: null, maximo: null, tramos: [] });
        rangoPrecio.clave = '';
    }
    const alto = Math.max(...rangoPrecio.tramos, 1);
    // Raíz cuadrada: los tramos con pocas publicaciones siguen siendo visibles.
    document.getElementById('histograma-precio').innerHTML = rangoPrecio.tramos
        .map((total) => `<span style="height:${total ? Math.max(8, Math.sqrt(total / alto) * 100) : 4}%"></span>`).join('');
    sincronizarRangoPrecio();
}

/** Coloca los tiradores según el filtro aplicado (o en los extremos). */
function sincronizarRangoPrecio() {
    const contenedor = document.getElementById('filtro-precio');
    const minimo = document.getElementById('precio-min');
    const maximo = document.getElementById('precio-max');
    const sinDatos = rangoPrecio.minimo === null;
    contenedor.classList.toggle('sin-datos', sinDatos);
    minimo.disabled = sinDatos;
    maximo.disabled = sinDatos;
    if (sinDatos) {
        document.getElementById('precio-min-texto').textContent = '-';
        document.getElementById('precio-max-texto').textContent = '-';
        return;
    }
    const paso = pasoPrecio(rangoPrecio.maximo - rangoPrecio.minimo);
    const inferior = Math.floor(rangoPrecio.minimo / paso) * paso;
    const superior = Math.ceil(rangoPrecio.maximo / paso) * paso;
    for (const control of [minimo, maximo]) {
        control.min = inferior;
        control.max = superior;
        control.step = paso;
    }
    rangoPrecio.minimo = inferior;
    rangoPrecio.maximo = superior;
    const limitar = (valor, defecto) => (valor ? Math.min(Math.max(Number(valor), inferior), superior) : defecto);
    minimo.value = limitar(estado.precioMin, inferior);
    maximo.value = limitar(estado.precioMax, superior);
    pintarRangoPrecio();
}

/** Relleno de la pista, textos y tramos del histograma dentro del rango. */
function pintarRangoPrecio() {
    if (rangoPrecio.minimo === null) return;
    const minimo = document.getElementById('precio-min');
    const maximo = document.getElementById('precio-max');
    const desde = Number(minimo.value);
    const hasta = Number(maximo.value);
    const amplitud = rangoPrecio.maximo - rangoPrecio.minimo || 1;
    const porcentaje = (valor) => ((valor - rangoPrecio.minimo) / amplitud) * 100;
    const relleno = document.getElementById('rango-relleno');
    relleno.style.left = `${porcentaje(desde)}%`;
    relleno.style.right = `${100 - porcentaje(hasta)}%`;
    // Con ambos tiradores al final, el mínimo queda encima para poder moverlo.
    minimo.style.zIndex = desde > rangoPrecio.minimo + amplitud / 2 ? 3 : 1;
    maximo.style.zIndex = 2;
    document.getElementById('precio-min-texto').textContent = formatoMoneda.format(desde);
    document.getElementById('precio-max-texto').textContent = hasta >= rangoPrecio.maximo
        ? `${formatoMoneda.format(hasta)}+`
        : formatoMoneda.format(hasta);
    minimo.setAttribute('aria-valuetext', formatoMoneda.format(desde));
    maximo.setAttribute('aria-valuetext', formatoMoneda.format(hasta));
    const barras = document.querySelectorAll('#histograma-precio span');
    const [baseMin, baseMax] = rangoPrecio.base || [rangoPrecio.minimo, rangoPrecio.maximo];
    const anchoTramo = Math.max(baseMax - baseMin, 1) / (barras.length || 1);
    barras.forEach((barra, i) => {
        const inicio = baseMin + i * anchoTramo;
        barra.classList.toggle('en-rango', inicio + anchoTramo > desde && inicio < hasta);
    });
}

/* ----------------------------------------------------------------------------
   RESULTADOS
   ---------------------------------------------------------------------------- */

/**
 * Carga resultados. reiniciar = true reemplaza la rejilla (nuevos filtros);
 * false agrega la página siguiente.
 */
async function cargar(reiniciar) {
    const grid = document.getElementById('grid-resultados');
    const botonMas = document.getElementById('boton-mas');
    const numero = ++estado.solicitud;

    document.getElementById('boton-limpiar').hidden = !hayFiltros();
    if (reiniciar) {
        grid.innerHTML = tarjetasEsqueleto(6);
        botonMas.hidden = true;
    } else {
        botonCargando(botonMas, 'Cargando...');
    }

    const enMapa = estado.vista === 'mapa';
    document.getElementById('mapa-resultados').hidden = !enMapa;
    const parametros = new URLSearchParams({ tipo: estado.tipo, orden: estado.orden, pagina: enMapa ? 1 : estado.pagina, porPagina: enMapa ? POR_PAGINA_MAPA : POR_PAGINA });
    if (estado.categoria) parametros.set('categoria', estado.categoria);
    if (estado.ciudad) parametros.set('ciudad', estado.ciudad);
    if (estado.personas) parametros.set('personas', estado.personas);
    if (estado.precioMin) parametros.set('precioMin', estado.precioMin);
    if (estado.precioMax) parametros.set('precioMax', estado.precioMax);
    if (estado.puntuacionMin) parametros.set('puntuacionMin', estado.puntuacionMin);
    if (estado.transmision) parametros.set('transmision', estado.transmision);
    if (estado.texto) parametros.set('q', estado.texto);

    try {
        const respuesta = await apiFetch(`/publicaciones?${parametros}`);
        if (numero !== estado.solicitud) return;
        estado.total = respuesta.total;
        const tarjetas = respuesta.publicaciones.map(crearTarjetaPublicacion).join('');
        if (enMapa) pintarMapa(respuesta.publicaciones);

        if (reiniciar) {
            grid.innerHTML = tarjetas || crearEstado({
                titulo: hayFiltros() ? 'No encontramos publicaciones con esos filtros' : 'Aún no hay publicaciones en esta sección',
                texto: hayFiltros() ? `Prueba con otro destino, menos ${estado.tipo === 'vehiculo' ? 'pasajeros' : 'personas'} o un precio mayor.` : 'Las empresas registradas pronto publicarán sus servicios.',
                accion: hayFiltros() ? '<button type="button" class="btn-outline" id="boton-limpiar-vacio">Limpiar filtros</button>' : ''
            });
            const limpiar = document.getElementById('boton-limpiar-vacio');
            if (limpiar) limpiar.addEventListener('click', () => document.getElementById('boton-limpiar').click());
        } else {
            grid.insertAdjacentHTML('beforeend', tarjetas);
        }

        const mostradas = grid.querySelectorAll('.tarjeta-publicacion').length;
        document.getElementById('boton-ver-resultados').textContent = respuesta.total
            ? `Ver ${respuesta.total} ${respuesta.total === 1 ? 'resultado' : 'resultados'}`
            : 'Sin resultados';
        document.getElementById('resultados-total').textContent = respuesta.total
            ? `${respuesta.total} ${respuesta.total === 1 ? 'resultado' : 'resultados'}${enMapa && respuesta.total > POR_PAGINA_MAPA ? ` (el mapa muestra ${POR_PAGINA_MAPA})` : ''}`
            : 'Sin resultados';
        botonMas.hidden = enMapa || mostradas >= respuesta.total;
    } catch (error) {
        if (numero !== estado.solicitud) return;
        document.getElementById('resultados-total').textContent = '';
        grid.innerHTML = crearEstado({
            titulo: 'No se pudieron cargar las publicaciones',
            texto: error.message,
            accion: '<button type="button" class="btn-outline" id="boton-reintentar">Reintentar</button>',
            esError: true
        });
        document.getElementById('boton-reintentar').addEventListener('click', () => cargar(true));
    } finally {
        if (!reiniciar) botonNormal(botonMas, 'Mostrar más');
    }
}

/* ----------------------------------------------------------------------------
   VISTA DE MAPA
   ---------------------------------------------------------------------------- */

const mapaExplorar = { mapa: null, capa: null };

function pintarMapa(publicaciones) {
    const contenedor = document.getElementById('mapa-explorar');
    if (!mapaExplorar.mapa) {
        mapaExplorar.mapa = crearMapaRD(contenedor);
        if (!mapaExplorar.mapa) return;
    }
    // El contenedor acaba de mostrarse: Leaflet recalcula su tamaño.
    mapaExplorar.mapa.invalidateSize();
    if (mapaExplorar.capa) mapaExplorar.capa.remove();
    mapaExplorar.capa = agregarMarcadores(mapaExplorar.mapa, publicaciones);
}
