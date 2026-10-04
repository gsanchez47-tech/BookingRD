/**
 * @file public/js/index.js
 * @description Lógica de la página de inicio (index.html).
 *
 *   - Indicadores y destinos:  GET /api/estadisticas
 *   - Listado destacado:       GET /api/hoteles | GET /api/actividades
 *                              filtros opcionales ?ciudad=&personas=
 *   - Buscador del hero y chips de destino: aplican los filtros al listado
 *     destacado y desplazan la vista hasta él.
 *   - Navegación: marca en el menú la sección visible y resalta la tarjeta
 *     de servicio elegida en el menú "Servicios".
 *   - Contacto:                POST /api/contacto
 *
 * Estados del listado: carga, sin publicaciones (general o con filtros) y
 * error de conexión con opción de reintento.
 */

/** Textos dependientes de la pestaña activa. */
const TIPOS = {
    hoteles: {
        ruta: '/hoteles',
        plural: 'hoteles',
        vacio: 'No se ha publicado ningún hotel por el momento',
        vacioFiltro: 'No hay hoteles publicados con esos filtros',
        badge: 'Hotel'
    },
    actividades: {
        ruta: '/actividades',
        plural: 'actividades',
        vacio: 'No se ha publicado ninguna actividad por el momento',
        vacioFiltro: 'No hay actividades publicadas con esos filtros',
        badge: 'Actividad'
    }
};

/** Estado de la sección "Destacados". */
const estado = {
    tipo: 'hoteles',
    ciudad: '',
    personas: null,
    solicitud: 0   // identificador para descartar respuestas obsoletas
};

const formatoMoneda = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 });

document.addEventListener('DOMContentLoaded', () => {
    cargarEstadisticas();
    cargarDestacados();
    iniciarPestanas();
    iniciarBuscador();
    iniciarNavegacionActiva();
    iniciarResaltadoServicios();
    iniciarContacto();

    document.getElementById('boton-quitar-filtro').addEventListener('click', () => {
        estado.ciudad = '';
        estado.personas = null;
        document.getElementById('busqueda-ciudad').value = '';
        cargarDestacados();
    });
});

/* ----------------------------------------------------------------------------
   INDICADORES Y DESTINOS
   ---------------------------------------------------------------------------- */

async function cargarEstadisticas() {
    const contenedorChips = document.getElementById('chips-destinos');
    try {
        const datos = await apiFetch('/estadisticas');
        animarNumero('stat-hoteles', datos.totalHoteles);
        animarNumero('stat-actividades', datos.totalActividades);
        animarNumero('stat-ciudades', datos.ciudades.length);
        animarNumero('stat-empresas', datos.totalEmpresas);
        pintarDestinos(datos.ciudades);
        llenarSelectorCiudades(datos.ciudades);
    } catch (error) {
        contenedorChips.innerHTML = '<span class="chip chip-informativo">Destinos no disponibles por el momento</span>';
    }
}

/** Anima un indicador numérico desde 0 hasta el valor final. */
function animarNumero(id, valorFinal) {
    const elemento = document.getElementById(id);
    const duracion = 700;
    const inicio = performance.now();
    const paso = (ahora) => {
        const progreso = Math.min((ahora - inicio) / duracion, 1);
        elemento.textContent = Math.round(valorFinal * (1 - Math.pow(1 - progreso, 3)));
        if (progreso < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
}

/** Chips de destino: uno por ciudad con publicaciones activas. */
function pintarDestinos(ciudades) {
    const contenedor = document.getElementById('chips-destinos');
    if (!ciudades.length) {
        contenedor.innerHTML = '<span class="chip chip-informativo">Aún no hay destinos publicados</span>';
        return;
    }
    contenedor.innerHTML = ciudades
        .map((ciudad) => `<button type="button" class="chip" data-ciudad="${escaparHtml(ciudad)}">${escaparHtml(ciudad)}</button>`)
        .join('');
    contenedor.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            estado.ciudad = chip.dataset.ciudad;
            document.getElementById('busqueda-ciudad').value = estado.ciudad;
            cargarDestacados();
            irADestacados();
        });
    });
}

function llenarSelectorCiudades(ciudades) {
    const selector = document.getElementById('busqueda-ciudad');
    ciudades.forEach((ciudad) => selector.add(new Option(ciudad, ciudad)));
}

/** Marca como activo el chip de la ciudad filtrada. */
function actualizarChips() {
    document.querySelectorAll('#chips-destinos .chip[data-ciudad]').forEach((chip) => {
        chip.classList.toggle('activo', chip.dataset.ciudad === estado.ciudad);
    });
}

/* ----------------------------------------------------------------------------
   BUSCADOR Y PESTAÑAS
   ---------------------------------------------------------------------------- */

function iniciarBuscador() {
    document.getElementById('form-busqueda').addEventListener('submit', (evento) => {
        evento.preventDefault();
        const personas = parseInt(document.getElementById('busqueda-personas').value, 10);
        estado.tipo = document.getElementById('busqueda-tipo').value;
        estado.ciudad = document.getElementById('busqueda-ciudad').value;
        estado.personas = Number.isInteger(personas) && personas > 0 ? personas : null;
        marcarPestana(estado.tipo);
        cargarDestacados();
        irADestacados();
    });
}

function iniciarPestanas() {
    document.querySelectorAll('.tab-boton').forEach((boton) => {
        boton.addEventListener('click', () => {
            if (boton.dataset.tab === estado.tipo) return;
            estado.tipo = boton.dataset.tab;
            document.getElementById('busqueda-tipo').value = estado.tipo;
            marcarPestana(estado.tipo);
            cargarDestacados();
        });
    });
}

function marcarPestana(tipo) {
    document.querySelectorAll('.tab-boton').forEach((boton) => {
        const activa = boton.dataset.tab === tipo;
        boton.classList.toggle('activo', activa);
        boton.setAttribute('aria-selected', String(activa));
    });
}

function irADestacados() {
    document.getElementById('destacados').scrollIntoView({ behavior: 'smooth' });
}

/* ----------------------------------------------------------------------------
   LISTADO DESTACADO
   ---------------------------------------------------------------------------- */

async function cargarDestacados() {
    const grid = document.getElementById('grid-destacados');
    const tipo = TIPOS[estado.tipo];
    const numeroSolicitud = ++estado.solicitud;

    actualizarResumenFiltro();
    actualizarChips();
    pintarEnGrid(grid, `
        <div class="estado-listado es-carga">
            <span class="spinner" aria-hidden="true"></span>
            <p>Cargando ${tipo.plural}...</p>
        </div>`);

    const parametros = new URLSearchParams();
    if (estado.ciudad) parametros.set('ciudad', estado.ciudad);
    if (estado.personas) parametros.set('personas', estado.personas);
    const consulta = parametros.toString() ? `?${parametros}` : '';

    try {
        const publicaciones = await apiFetch(`${tipo.ruta}${consulta}`);
        if (numeroSolicitud !== estado.solicitud) return;

        if (publicaciones.length) {
            pintarEnGrid(grid, publicaciones.map((item) => crearTarjeta(item, estado.tipo)).join(''));
        } else {
            pintarEnGrid(grid, crearEstadoVacio(tipo));
        }
    } catch (error) {
        if (numeroSolicitud !== estado.solicitud) return;
        pintarEnGrid(grid, `
            <div class="estado-listado es-error">
                <div class="estado-marca" aria-hidden="true"><span></span><span></span><span></span></div>
                <h3>No se pudo cargar el listado</h3>
                <p>${escaparHtml(error.message)}</p>
                <button type="button" class="btn-outline" id="boton-reintentar">Reintentar</button>
            </div>`);
        document.getElementById('boton-reintentar').addEventListener('click', cargarDestacados);
    }
}

/** Reemplaza el contenido del grid y reinicia su animación de entrada. */
function pintarEnGrid(grid, html) {
    grid.innerHTML = html;
    grid.classList.remove('actualizando');
    void grid.offsetWidth;   // fuerza el reinicio de la animación CSS
    grid.classList.add('actualizando');
}

/** Estado sin resultados: distingue entre catálogo vacío y filtro sin coincidencias. */
function crearEstadoVacio(tipo) {
    const hayFiltro = Boolean(estado.ciudad || estado.personas);
    if (hayFiltro) {
        return `
            <div class="estado-listado">
                <div class="estado-marca" aria-hidden="true"><span></span><span></span><span></span></div>
                <h3>${tipo.vacioFiltro}</h3>
                <p>Prueba con otra ciudad o con menos personas.</p>
            </div>`;
    }
    const accionEmpresa = haySesionActiva()
        ? ''
        : '<a href="registro.html?tipo=empresa" class="btn-primario">Registrar mi empresa</a>';
    return `
        <div class="estado-listado">
            <div class="estado-marca" aria-hidden="true"><span></span><span></span><span></span></div>
            <h3>${tipo.vacio}</h3>
            <p>Cuando las empresas registradas en BookingRD publiquen sus ${tipo.plural}, aparecerán en esta sección.</p>
            ${accionEmpresa}
        </div>`;
}

/**
 * Tarjeta de publicación. Campos recibidos del backend:
 *   hoteles:     id_hotel, nombre, ciudad, descripcion, precio_noche,
 *                capacidad_personas, imagen_url, proveedor
 *   actividades: id_actividad, nombre, ciudad, descripcion, precio_persona,
 *                cupo_maximo, imagen_url, proveedor
 */
function crearTarjeta(item, tipoClave) {
    const esHotel = tipoClave === 'hoteles';
    const precio = esHotel ? item.precio_noche : item.precio_persona;
    const unidad = esHotel ? 'por noche' : 'por persona';
    const capacidad = esHotel
        ? `Hasta ${item.capacidad_personas} personas`
        : `Cupo de ${item.cupo_maximo} personas`;
    const imagen = item.imagen_url
        ? `<img src="${escaparHtml(item.imagen_url)}" alt="" loading="lazy" onerror="this.remove()">`
        : '';

    return `
        <article class="card">
            <div class="card-media${esHotel ? '' : ' es-actividad'}">
                ${imagen}
                <span class="badge">${TIPOS[tipoClave].badge}</span>
            </div>
            <div class="card-cuerpo">
                <span class="card-ubicacion">${escaparHtml(item.ciudad)}</span>
                <h3 class="card-titulo">${escaparHtml(item.nombre)}</h3>
                ${item.proveedor ? `<span class="card-proveedor">${escaparHtml(item.proveedor)}</span>` : ''}
                ${item.descripcion ? `<p class="card-descripcion">${escaparHtml(item.descripcion)}</p>` : ''}
                <div class="card-pie">
                    <div class="card-precio">${formatoMoneda.format(precio)}<small>${unidad}</small></div>
                    <span class="card-capacidad">${capacidad}</span>
                </div>
            </div>
        </article>`;
}

/** Texto descriptivo del filtro aplicado (ciudad y personas). */
function actualizarResumenFiltro() {
    const contenedor = document.getElementById('filtro-activo');
    const partes = [];
    if (estado.ciudad) partes.push(`en ${estado.ciudad}`);
    if (estado.personas) partes.push(`para ${estado.personas} ${estado.personas === 1 ? 'persona' : 'personas'}`);

    contenedor.hidden = partes.length === 0;
    document.getElementById('filtro-activo-texto').textContent =
        `Mostrando ${TIPOS[estado.tipo].plural} ${partes.join(' ')}`;
}

/* ----------------------------------------------------------------------------
   NAVEGACIÓN ACTIVA Y SERVICIOS
   ---------------------------------------------------------------------------- */

/**
 * Resalta en el menú principal la sección visible. La sección #servicios
 * (y las publicaciones #destacados) activan el botón "Servicios".
 */
function iniciarNavegacionActiva() {
    const enlaces = document.querySelectorAll('.nav-principal .nav-enlace');
    const botonServicios = document.querySelector('.nav-desplegable .nav-enlace');
    const secciones = ['inicio', 'servicios', 'destacados', 'nosotros', 'contacto']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    if (!('IntersectionObserver' in window) || !secciones.length) return;

    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            const id = entrada.target.id;
            const destino = id === 'servicios' || id === 'destacados' ? botonServicios : document.querySelector(`.nav-principal a[href="#${id}"]`);
            enlaces.forEach((enlace) => enlace.classList.toggle('activo', enlace === destino));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    secciones.forEach((seccion) => observador.observe(seccion));
}

/**
 * Al elegir una categoría en el menú "Servicios" (o al abrir la página con
 * #servicio-* en la URL), se resalta brevemente la tarjeta correspondiente.
 */
function iniciarResaltadoServicios() {
    const resaltar = () => {
        const tarjeta = window.location.hash.startsWith('#servicio-') ? document.querySelector(window.location.hash) : null;
        if (!tarjeta) return;
        tarjeta.classList.add('revelado');
        tarjeta.classList.remove('resaltado');
        void tarjeta.offsetWidth;   // reinicia la animación si ya estaba resaltada
        tarjeta.classList.add('resaltado');
    };
    window.addEventListener('hashchange', resaltar);
    resaltar();
}

/* ----------------------------------------------------------------------------
   CONTACTO (POST /api/contacto)
   ---------------------------------------------------------------------------- */

function iniciarContacto() {
    const formulario = document.getElementById('form-contacto');
    const estadoEnvio = document.getElementById('contacto-mensaje-estado');
    const boton = document.getElementById('boton-contacto');

    const mostrarEstado = (texto, tipo) => {
        estadoEnvio.textContent = texto;
        estadoEnvio.className = `mensaje-estado es-${tipo}`;
    };

    formulario.addEventListener('input', (evento) => {
        const contenedor = evento.target.closest('.campo');
        if (contenedor) contenedor.classList.remove('invalido');
    });

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        estadoEnvio.className = 'mensaje-estado';
        formulario.querySelectorAll('.invalido').forEach((campo) => campo.classList.remove('invalido'));

        const datos = {
            nombre: document.getElementById('contacto-nombre').value.trim(),
            correo: document.getElementById('contacto-correo').value.trim(),
            asunto: document.getElementById('contacto-asunto').value,
            mensaje: document.getElementById('contacto-mensaje').value.trim()
        };

        const error = validarContacto(datos);
        if (error) {
            mostrarEstado(error.mensaje, 'error');
            marcarCampoInvalido(error.campo);
            return;
        }

        botonCargando(boton, 'Enviando...');
        try {
            const respuesta = await apiFetch('/contacto', { method: 'POST', body: datos });
            formulario.reset();
            mostrarEstado(respuesta.mensaje, 'exito');
        } catch (errorServidor) {
            mostrarEstado(errorServidor.message, 'error');
            if (errorServidor.campo) marcarCampoInvalido(errorServidor.campo);
        } finally {
            botonNormal(boton, 'Enviar mensaje');
        }
    });
}

/** Validación en el navegador; replica src/controllers/contacto.controller.js. */
function validarContacto(datos) {
    if (!datos.nombre) return { campo: 'contacto-nombre', mensaje: 'Escribe tu nombre.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) return { campo: 'contacto-correo', mensaje: 'Escribe un correo con formato válido.' };
    if (!datos.asunto) return { campo: 'contacto-asunto', mensaje: 'Selecciona el asunto del mensaje.' };
    if (datos.mensaje.length < 10) return { campo: 'contacto-mensaje', mensaje: 'El mensaje debe tener al menos 10 caracteres.' };
    return null;
}

function marcarCampoInvalido(id) {
    const campo = document.getElementById(id);
    if (!campo) return;
    campo.closest('.campo').classList.add('invalido');
    campo.focus();
}
