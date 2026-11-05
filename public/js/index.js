/**
 * @file public/js/index.js
 * @description Página de inicio: buscador y cifras, accesos por tipo,
 *   mapa de destinos con su ficha (fotografía, oferta y clima),
 *   recomendados por tipo, vistos recientemente, opiniones y contacto.
 */

const RECOMENDADOS_POR_TIPO = 4;

/** Fotografía de la ficha de cada destino que la tiene (cada foto se usa solo aquí). */
const FOTOS_DESTINO = [
    { ciudad: 'Santo Domingo', foto: 'img/destinos/santo-domingo.jpg', alt: 'Fachada de piedra del Alcázar de Colón en la Ciudad Colonial' },
    { ciudad: 'Punta Cana', foto: 'img/destinos/punta-cana.jpg', alt: 'Playa de arena blanca con cocoteros vista desde el aire' },
    { ciudad: 'Samaná', foto: 'img/destinos/samana.jpg', alt: 'Puente peatonal sobre el mar hacia los cayos de Samaná' },
    { ciudad: 'Puerto Plata', foto: 'img/destinos/puerto-plata.jpg', alt: 'Cañones de la Fortaleza San Felipe frente al Atlántico' },
    { ciudad: 'Juan Dolio', foto: 'img/destinos/juan-dolio.jpg', alt: 'Costa de Juan Dolio iluminada de noche' },
    { ciudad: 'La Romana', foto: 'img/destinos/la-romana.jpg', alt: 'Iglesia de piedra de Altos de Chavón' },
    { ciudad: 'Jarabacoa', foto: 'img/destinos/jarabacoa.jpg', alt: 'Casa de campo y vacas en las montañas de Jarabacoa' },
    { ciudad: 'Constanza', foto: 'img/destinos/constanza.jpg', alt: 'Agricultores en los campos de cultivo del valle de Constanza' },
    { ciudad: 'Pedernales', foto: 'img/destinos/pedernales.jpg', alt: 'Costa de Pedernales con flores amarillas frente al mar' }
];

/**
 * Posición de la etiqueta de cada destino en el mapa respecto a su punto,
 * para que no se superpongan en las zonas con varios destinos cercanos.
 *   [desplazamiento x, desplazamiento y, alineación]
 */
const ETIQUETAS_MAPA = {
    'Santo Domingo': [-14, 6, 'end'],
    'Boca Chica': [-4, 32, 'middle'],
    'Juan Dolio': [12, -12, 'start'],
    'La Romana': [0, 32, 'middle'],
    'Punta Cana': [-14, -14, 'end'],
    'Puerto Plata': [-14, -10, 'end'],
    'Sosúa': [-2, 30, 'middle'],
    'Cabarete': [10, -14, 'start'],
    'Río San Juan': [14, 6, 'start'],
    'Las Terrenas': [-12, -14, 'end'],
    'Samaná': [0, 32, 'middle'],
    'Las Galeras': [12, -12, 'start'],
    'Jarabacoa': [14, -6, 'start'],
    'Constanza': [14, 14, 'start'],
    'Pedernales': [14, 6, 'start']
};

const estado = {
    estadisticas: null,
    destinoElegido: 'Punta Cana',
    recomendados: { tipo: 'hotel', solicitud: 0 }
};

document.addEventListener('DOMContentLoaded', () => {
    iniciarBuscador();
    dibujarMapa();
    cargarEstadisticas();
    iniciarRecomendados();
    pintarVistos();
    cargarOpiniones();
    iniciarContacto();
});

/* ----------------------------------------------------------------------------
   Estadísticas: cifras, conteos de categorías, destinos y buscador
   ------------------------------------------------------------------------- */

async function cargarEstadisticas() {
    try {
        const datos = await apiFetch('/estadisticas');
        estado.estadisticas = datos;
        publicacionesPorDestino = datos.porCiudad;
        estadisticasCargadas = true;

        animarNumero(document.getElementById('stat-hoteles'), datos.totalHoteles);
        animarNumero(document.getElementById('stat-actividades'), datos.totalActividades);
        animarNumero(document.getElementById('stat-vehiculos'), datos.totalVehiculos);
        if (datos.puntuacionMedia !== null) {
            document.getElementById('stat-valoracion').textContent = formatoPuntuacion(datos.puntuacionMedia);
            document.getElementById('stat-valoracion-texto').textContent = `Valoración media (${textoResenas(datos.totalResenas)})`;
        }

        const totales = { hotel: datos.totalHoteles, actividad: datos.totalActividades, vehiculo: datos.totalVehiculos };
        document.querySelectorAll('[data-conteo]').forEach((elemento) => {
            elemento.textContent = textoPublicaciones(totales[elemento.dataset.conteo] || 0);
        });

        pintarExperiencias(datos.porCategoria);
        pintarFicha(estado.destinoElegido);
    } catch (_) {
        document.querySelectorAll('[data-conteo]').forEach((elemento) => { elemento.textContent = ''; });
        pintarFicha(estado.destinoElegido);
    }
}

/** Oferta de un destino por tipo: { hotel, actividad, vehiculo }. */
function ofertaDestino(ciudad) {
    const datos = estado.estadisticas;
    return (datos && datos.porCiudadTipo && datos.porCiudadTipo[ciudad]) || { hotel: 0, actividad: 0, vehiculo: 0 };
}

/* ----------------------------------------------------------------------------
   Mapa de destinos (SVG con el contorno de la isla)
   ------------------------------------------------------------------------- */

function dibujarMapa() {
    const lienzo = document.getElementById('mapa-lienzo');
    const { ancho, alto } = ISLA;

    // Paralelos 18°, 19° y 20° N como referencia.
    const paralelos = [18, 19].map((latitud) => {
        const { y } = ISLA.proyectar(latitud, -72);
        return `<line class="mapa-paralelo" x1="0" x2="${ancho}" y1="${y}" y2="${y}"></line>
                <text class="mapa-paralelo-texto" x="${ancho - 12}" y="${y - 6}" text-anchor="end">${latitud}° N</text>`;
    }).join('');

    const puntos = CATALOGOS.destinos.map((ciudad, orden) => {
        const [latitud, longitud] = CATALOGOS.coordenadas[ciudad];
        const { x, y } = ISLA.proyectar(latitud, longitud);
        const [dx, dy, alineacion] = ETIQUETAS_MAPA[ciudad] || [12, 5, 'start'];
        return `
            <g class="mapa-punto" role="button" tabindex="0" data-ciudad="${escaparHtml(ciudad)}" aria-pressed="false"
               aria-label="${escaparHtml(ciudad)}" style="--orden:${orden}">
                <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"></circle>
                <text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${alineacion}">${escaparHtml(ciudad)}</text>
            </g>`;
    }).join('');

    lienzo.innerHTML = `
        <svg viewBox="0 0 ${ancho} ${alto}" role="group" aria-label="Destinos en el mapa de República Dominicana">
            ${paralelos}
            <text class="mapa-mar-texto" x="${ancho * 0.5}" y="${ISLA.proyectar(19.92, 0).y}" text-anchor="middle">Océano Atlántico</text>
            <text class="mapa-mar-texto" x="${ancho * 0.52}" y="${ISLA.proyectar(17.72, 0).y}" text-anchor="middle">Mar Caribe</text>
            <path class="mapa-vecino" d="${ISLA.haiti}"></path>
            <path class="mapa-tierra" d="${ISLA.republicaDominicana}"></path>
            ${puntos}
        </svg>`;

    const elegir = (punto) => {
        estado.destinoElegido = punto.dataset.ciudad;
        pintarFicha(estado.destinoElegido);
    };

    // Tamaño de puntos y rótulos constante en pantalla, sea cual sea el ancho del mapa.
    const ajustarEscala = () => {
        const escala = ancho / Math.max(lienzo.clientWidth, 1);
        lienzo.style.setProperty('--texto-mapa', `${Math.round(13 * escala)}px`);
        lienzo.style.setProperty('--punto-mapa', `${Math.max(7, Math.round(6 * escala))}px`);
        lienzo.classList.toggle('compacto', lienzo.clientWidth < 620);
    };
    ajustarEscala();
    window.addEventListener('resize', conRetardo(ajustarEscala, 120));

    const selector = document.getElementById('selector-destino');
    selector.innerHTML = CATALOGOS.destinos.map((ciudad) => `<option value="${escaparHtml(ciudad)}">${escaparHtml(ciudad)}</option>`).join('');
    selector.value = estado.destinoElegido;
    selector.addEventListener('change', () => {
        estado.destinoElegido = selector.value;
        pintarFicha(selector.value);
    });
    lienzo.querySelectorAll('.mapa-punto').forEach((punto) => {
        punto.addEventListener('click', () => elegir(punto));
        punto.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter' || evento.key === ' ') {
                evento.preventDefault();
                elegir(punto);
            }
        });
    });
    marcarPunto(estado.destinoElegido);
}

function marcarPunto(ciudad) {
    const selector = document.getElementById('selector-destino');
    if (selector) selector.value = ciudad;
    document.querySelectorAll('.mapa-punto').forEach((punto) => {
        const elegido = punto.dataset.ciudad === ciudad;
        punto.setAttribute('aria-pressed', String(elegido));
        // El punto elegido se dibuja al final para quedar por encima de los demás.
        if (elegido) punto.parentNode.appendChild(punto);
    });
}

/** Ficha del destino elegido: fotografía, provincia, oferta por tipo y clima actual. */
function pintarFicha(ciudad) {
    marcarPunto(ciudad);
    const ficha = document.getElementById('ficha-destino');
    const oferta = ofertaDestino(ciudad);
    const foto = FOTOS_DESTINO.find((p) => p.ciudad === ciudad);
    const total = oferta.hotel + oferta.actividad + oferta.vehiculo;
    const enlace = (tipo, total, singular, plural) => (total
        ? `<li><a href="explorar.html?tipo=${tipo}&ciudad=${encodeURIComponent(ciudad)}"><strong>${total}</strong> ${total === 1 ? singular : plural}</a></li>`
        : '');
    const enlaces = [
        enlace('hotel', oferta.hotel, 'alojamiento', 'alojamientos'),
        enlace('actividad', oferta.actividad, 'actividad', 'actividades'),
        enlace('vehiculo', oferta.vehiculo, 'auto', 'autos')
    ].join('');

    ficha.innerHTML = `
        <div class="ficha-foto${foto ? '' : ' sin-foto'}">
            ${foto ? `<img src="${foto.foto}" alt="${escaparHtml(foto.alt)}">` : ''}
            <div class="ficha-cabecera">
                <h3 translate="no">${escaparHtml(ciudad)}</h3>
                <span class="ficha-provincia" translate="no">${escaparHtml(CATALOGOS.provincias[ciudad] || '')}</span>
            </div>
        </div>
        <div class="ficha-cuerpo">
            <ul class="ficha-conteos">${enlaces || '<li class="sin-oferta">Pronto habrá publicaciones en este destino.</li>'}</ul>
            <div class="ficha-clima" id="ficha-clima"></div>
            ${total ? `<a class="btn-primario btn-bloque" href="explorar.html?ciudad=${encodeURIComponent(ciudad)}">Ver todo en ${escaparHtml(ciudad)}</a>` : ''}
        </div>`;
    pintarClimaCompacto(document.getElementById('ficha-clima'), ciudad);
}

/* ----------------------------------------------------------------------------
   Experiencias por categoría
   ---------------------------------------------------------------------------- */

/** Categorías de actividad con su conteo; las vacías no se muestran. */
function pintarExperiencias(porCategoria) {
    const lista = document.getElementById('lista-experiencias');
    const categorias = Object.entries(CATALOGOS.categorias)
        .filter(([clave, c]) => c.tipo === 'actividad' && porCategoria[clave]);
    lista.innerHTML = categorias.map(([clave, c]) => `
        <li>
            <a class="experiencia" href="explorar.html?tipo=actividad&categoria=${encodeURIComponent(clave)}">
                <span class="experiencia-grupo">${escaparHtml(c.grupo)}</span>
                <strong>${escaparHtml(c.nombre)}</strong>
                <span class="experiencia-conteo">${escaparHtml(textoPublicaciones(porCategoria[clave]))}</span>
            </a>
        </li>`).join('');
}

/* ----------------------------------------------------------------------------
   Recomendados
   ------------------------------------------------------------------------- */

const TEXTO_VER_TODO = { hotel: 'Ver todo el alojamiento', actividad: 'Ver todas las actividades', vehiculo: 'Ver todos los autos' };

function iniciarRecomendados() {
    document.querySelectorAll('input[name="tipo-destacados"]').forEach((opcion) => {
        opcion.addEventListener('change', () => {
            estado.recomendados.tipo = opcion.value;
            const enlace = document.getElementById('enlace-ver-todo');
            enlace.href = opcion.value === 'vehiculo' ? 'explorar.html?tipo=vehiculo' : `explorar.html?tipo=${opcion.value}`;
            enlace.textContent = TEXTO_VER_TODO[opcion.value];
            cargarRecomendados();
        });
    });
    cargarRecomendados();
}

async function cargarRecomendados() {
    const rejilla = document.getElementById('grid-destacados');
    const { tipo } = estado.recomendados;
    const numero = ++estado.recomendados.solicitud;
    rejilla.innerHTML = tarjetasEsqueleto(4);
    try {
        const respuesta = await apiFetch(`/publicaciones?tipo=${tipo}&orden=destacados&porPagina=${RECOMENDADOS_POR_TIPO}`);
        if (numero !== estado.recomendados.solicitud) return;
        rejilla.innerHTML = respuesta.publicaciones.length
            ? respuesta.publicaciones.map(crearTarjetaPublicacion).join('')
            : crearEstado({
                titulo: 'Todavía no hay publicaciones de este tipo',
                texto: 'Cuando las empresas registradas publiquen sus servicios, aparecerán aquí.'
            });
        Favoritos.pintar(rejilla);
    } catch (error) {
        if (numero !== estado.recomendados.solicitud) return;
        rejilla.innerHTML = crearEstado({
            titulo: 'No se pudieron cargar las publicaciones',
            texto: error.message,
            accion: '<button type="button" class="btn-outline" id="boton-reintentar">Reintentar</button>',
            esError: true
        });
        document.getElementById('boton-reintentar').addEventListener('click', cargarRecomendados);
    }
}

/* ----------------------------------------------------------------------------
   Vistos recientemente y opiniones
   ------------------------------------------------------------------------- */

function pintarVistos() {
    const seccion = document.getElementById('vistos');
    const vistos = leerVistos().slice(0, 4);
    seccion.hidden = !vistos.length;
    if (!vistos.length) return;
    document.getElementById('grid-vistos').innerHTML = vistos.map(crearTarjetaPublicacion).join('');
    const borrar = document.getElementById('boton-borrar-vistos');
    if (!borrar.dataset.iniciado) {
        borrar.dataset.iniciado = '1';
        borrar.addEventListener('click', () => {
            borrarVistos();
            pintarVistos();
            mostrarAviso('Historial borrado.', 'exito', 2500);
        });
    }
}

async function cargarOpiniones() {
    try {
        const { resenas } = await apiFetch('/resenas/destacadas?limite=3');
        if (!resenas.length) return;
        document.getElementById('grid-opiniones').innerHTML = resenas.slice(0, 3).map(crearTarjetaOpinion).join('');
        document.getElementById('opiniones').hidden = false;
    } catch (_) {
        /* sección opcional */
    }
}

/* ----------------------------------------------------------------------------
   Contacto (POST /api/contacto)
   ------------------------------------------------------------------------- */

function iniciarContacto() {
    const formulario = document.getElementById('form-contacto');
    const estadoEnvio = document.getElementById('contacto-mensaje-estado');
    const boton = document.getElementById('boton-contacto');

    const mostrarEstado = (texto, tipo) => {
        estadoEnvio.textContent = texto;
        estadoEnvio.className = `mensaje-formulario ${tipo}`;
        estadoEnvio.hidden = false;
    };

    retirarMarcasAlEditar(formulario);

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        estadoEnvio.hidden = true;
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
            marcarCampo(error.campo);
            return;
        }

        botonCargando(boton, 'Enviando...');
        try {
            const respuesta = await apiFetch('/contacto', { method: 'POST', body: datos });
            formulario.reset();
            mostrarEstado(respuesta.mensaje, 'exito');
        } catch (errorServidor) {
            mostrarEstado(errorServidor.message, 'error');
            if (errorServidor.campo) marcarCampo(errorServidor.campo);
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
