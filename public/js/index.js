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
    { ciudad: 'Pedernales', foto: 'img/destinos/pedernales.jpg', alt: 'Costa de Pedernales con flores amarillas frente al mar' },
    { ciudad: 'Boca Chica', foto: 'img/destinos/boca-chica.jpg', alt: 'Vista aérea de la laguna de Boca Chica, su islote y la marina' },
    { ciudad: 'Las Galeras', foto: 'img/destinos/las-galeras.jpg', alt: 'Playa Rincón con cocoteros, un bote y las montañas de Samaná' },
    { ciudad: 'Río San Juan', foto: 'img/destinos/rio-san-juan.jpg', alt: 'Botes de colores en la laguna Gri-Gri vista desde el aire' },
    { ciudad: 'Sosúa', foto: 'img/destinos/sosua.jpg', alt: 'Terraza con balaustrada blanca sobre el mar de Sosúa' },
    { ciudad: 'Cabarete', foto: 'img/destinos/cabarete.jpg', alt: 'Bahía de Cabarete desde el aire con cometas de kitesurf' },
    { ciudad: 'Miches', foto: 'img/destinos/miches.jpg', alt: 'Bahía de Miches vista desde Montaña Redonda' },
    { ciudad: 'Las Terrenas', foto: 'img/destinos/las-terrenas.jpg', alt: 'Playa de arena dorada con cocoteros en Las Terrenas' },
    { ciudad: 'Barahona', foto: 'img/destinos/barahona.jpg', alt: 'Letras de colores frente al mar Caribe en el malecón de Barahona' },
    { ciudad: 'Montecristi', foto: 'img/destinos/montecristi.jpg', alt: 'El Morro de Montecristi y su bahía turquesa desde el aire' },
    { ciudad: 'Baní', foto: 'img/destinos/bani.jpg', alt: 'Muelle de madera y bote azul en la bahía de Las Salinas, Baní' }
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
    'Pedernales': [14, 6, 'start'],
    'Miches': [12, 14, 'start'],
    'Barahona': [12, 6, 'start'],
    'Montecristi': [12, 6, 'start'],
    'Baní': [0, 30, 'middle']
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
    cargarCombos();
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

/* Capas de detalle del mapa del inicio: costa, cordilleras, lago, autopistas, ciudades y aeropuertos. */
function capasDetalleMapa() {
    const P = (la, lo) => ISLA.proyectar(la, lo);
    const linea = (pts) => pts.map(([la, lo], i) => { const { x, y } = P(la, lo); return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); }).join('');
    const suave = (pts) => {
        const q = pts.map(([la, lo]) => P(la, lo));
        let d = `M${q[0].x.toFixed(1)},${q[0].y.toFixed(1)}`;
        for (let i = 1; i < q.length; i++) {
            const a = q[i - 1], b = q[i];
            d += ` Q${a.x.toFixed(1)},${a.y.toFixed(1)} ${((a.x + b.x) / 2).toFixed(1)},${((a.y + b.y) / 2).toFixed(1)}`;
        }
        const z = q[q.length - 1];
        return d + ` L${z.x.toFixed(1)},${z.y.toFixed(1)}`;
    };
    const cordilleras = [
        [[19.25, -71.65], [19.08, -71.15], [18.98, -70.85], [18.80, -70.55], [18.58, -70.25]],
        [[19.78, -71.20], [19.62, -70.85], [19.50, -70.45], [19.38, -70.05]],
        [[18.92, -69.50], [18.88, -69.15], [18.80, -68.90]],
        [[18.22, -71.72], [18.17, -71.40], [18.12, -71.20]],
        [[18.70, -71.72], [18.68, -71.40], [18.62, -71.10]]
    ];
    const rutas = [
        [[18.47, -69.93], [18.94, -70.41], [19.22, -70.53], [19.45, -70.70], [19.56, -70.87], [19.85, -71.65]],
        [[19.45, -70.70], [19.79, -70.69]],
        [[19.79, -70.69], [19.76, -70.52], [19.75, -70.41], [19.64, -70.08], [19.38, -69.85], [19.27, -69.74], [19.21, -69.34]],
        [[18.47, -69.93], [18.80, -69.80], [19.27, -69.74]],
        [[18.47, -69.93], [18.45, -69.61], [18.43, -69.43], [18.46, -69.30], [18.43, -68.97], [18.61, -68.71], [18.58, -68.37]],
        [[18.47, -69.93], [18.28, -70.33], [18.45, -70.73], [18.21, -71.10], [18.04, -71.74]],
        [[19.22, -70.53], [19.12, -70.64]], [[18.94, -70.41], [18.91, -70.75]],
        [[18.61, -68.71], [18.76, -69.04], [18.98, -69.05]]
    ];
    const aeropuertos = [[18.43, -69.67], [18.50, -68.40], [19.74, -70.56], [19.38, -70.56], [19.27, -69.74], [18.49, -68.92]];
    const ciudades = [['Santiago', 19.45, -70.70], ['La Vega', 19.22, -70.53], ['Azua', 18.45, -70.73], ['Nagua', 19.38, -69.85]];

    const debajo = `
        <defs>
            <pattern id="relieve" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.13)" stroke-width="3"></line>
            </pattern>
        </defs>
        <g class="capas-detalle" aria-hidden="true">
            <path d="${ISLA.republicaDominicana}" fill="none" stroke="rgba(0,180,216,.22)" stroke-width="16" stroke-linejoin="round"></path>
            <path d="${ISLA.republicaDominicana}" fill="none" stroke="rgba(0,180,216,.35)" stroke-width="6" stroke-linejoin="round"></path>
        </g>`;

    let encima = '<g class="capas-detalle" aria-hidden="true">';
    for (const pts of cordilleras) {
        encima += `<path d="${suave(pts)}" fill="none" stroke="url(#relieve)" stroke-width="30" stroke-linecap="round" opacity=".9"></path>`;
        encima += `<path d="${suave(pts)}" fill="none" stroke="rgba(10,40,30,.25)" stroke-width="30" stroke-linecap="round"></path>`;
    }
    const lago = P(18.50, -71.58), lagoB = P(18.55, -71.40);
    encima += `<ellipse cx="${((lago.x + lagoB.x) / 2).toFixed(1)}" cy="${((lago.y + lagoB.y) / 2).toFixed(1)}" rx="${(Math.abs(lagoB.x - lago.x) / 1.6).toFixed(1)}" ry="9" fill="#0B4A7A" stroke="rgba(0,180,216,.6)"></ellipse>`;
    for (const r of rutas) encima += `<path class="capa-ruta" d="${linea(r)}"></path>`;
    const pd = P(19.02, -70.99);
    encima += `<path d="M${pd.x.toFixed(1)},${(pd.y - 9).toFixed(1)} l7,12 h-14z" fill="#F6F1E4"></path>
        <text class="capa-rotulo" x="${(pd.x + 10).toFixed(1)}" y="${(pd.y + 4).toFixed(1)}">Pico Duarte · 3 098 m</text>`;
    const lr = P(18.555, -71.58);
    encima += `<text class="capa-rotulo agua" x="${lr.x.toFixed(1)}" y="${(lr.y + 22).toFixed(1)}" text-anchor="middle">Lago Enriquillo</text>`;
    const rotuloCordillera = (texto, la, lo, giro) => {
        const { x, y } = P(la, lo);
        return `<text class="capa-rotulo cord" x="${x.toFixed(1)}" y="${y.toFixed(1)}"${giro ? ` transform="rotate(${giro} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}>${texto}</text>`;
    };
    encima += rotuloCordillera('CORDILLERA CENTRAL', 18.98, -71.28, -22);
    encima += rotuloCordillera('CORD. SEPTENTRIONAL', 19.50, -70.36, -14);
    encima += rotuloCordillera('CORD. ORIENTAL', 18.80, -69.62, 0);
    for (const [nombre, la, lo] of ciudades) {
        const { x, y } = P(la, lo);
        encima += `<rect x="${(x - 3).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="6" height="6" fill="rgba(255,255,255,.55)"></rect>
            <text class="capa-rotulo ciudad" x="${(x + 8).toFixed(1)}" y="${(y + 4).toFixed(1)}">${nombre}</text>`;
    }
    for (const [la, lo] of aeropuertos) {
        const { x, y } = P(la, lo);
        encima += `<g class="capa-aeropuerto" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="8.5"></circle><path transform="rotate(45) scale(0.52) translate(-12,-12.5)" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"></path></g>`;
    }
    encima += '</g>';
    return { debajo, encima };
}

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

    const capas = capasDetalleMapa();
    lienzo.innerHTML = `
        <svg viewBox="0 0 ${ancho} ${alto}" role="group" aria-label="Destinos en el mapa de República Dominicana">
            ${paralelos}
            <text class="mapa-mar-texto" x="${ancho * 0.5}" y="${ISLA.proyectar(19.92, 0).y}" text-anchor="middle">Océano Atlántico</text>
            <text class="mapa-mar-texto" x="${ancho * 0.52}" y="${ISLA.proyectar(17.72, 0).y}" text-anchor="middle">Mar Caribe</text>
            <path class="mapa-vecino" d="${ISLA.haiti}"></path>
            ${capas.debajo}
            <path class="mapa-tierra" d="${ISLA.republicaDominicana}"></path>
            ${capas.encima}
            ${puntos}
        </svg>
        <div class="mapa-leyenda" aria-hidden="true">
            <span><i class="l-ruta"></i>Autopistas</span><span><i class="l-sierra"></i>Montañas</span><span><i class="l-aero">✈</i>Aeropuertos</span><span><i class="l-punto"></i>Destinos BookingRD</span>
        </div>`;

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
            ${foto ? `<img src="${urlMiniatura(foto.foto)}" alt="${escaparHtml(foto.alt)}">` : ''}
            <div class="ficha-cabecera">
                <h3 translate="no">${escaparHtml(ciudad)}</h3>
                <span class="ficha-provincia" translate="no">${escaparHtml(CATALOGOS.provincias[ciudad] || '')}</span>
            </div>
        </div>
        <div class="ficha-cuerpo">
            <p class="ficha-resumen" id="ficha-resumen" hidden></p>
            <ul class="ficha-conteos">${enlaces || '<li class="sin-oferta">Pronto habrá publicaciones en este destino.</li>'}</ul>
            ${lugaresDe(ciudad)}
            <div class="ficha-clima" id="ficha-clima"></div>
            ${total ? `<a class="btn-primario btn-bloque" href="explorar.html?ciudad=${encodeURIComponent(ciudad)}">Ver todo en ${escaparHtml(ciudad)}</a>` : ''}
        </div>`;
    pintarClimaCompacto(document.getElementById('ficha-clima'), ciudad);
    pintarResumenDestino(document.getElementById('ficha-resumen'), ciudad);
}

/** Lugares imperdibles del destino (public/js/lugares.js): los cinco primeros y el resto plegado. */
function lugaresDe(ciudad) {
    const lugares = (typeof LUGARES_DESTINO !== 'undefined' && LUGARES_DESTINO[ciudad]) || [];
    if (!lugares.length) return '';
    const item = (lugar) => `<li translate="no">${escaparHtml(lugar)}</li>`;
    const resto = lugares.slice(5);
    return `
        <div class="ficha-lugares">
            <h4>Imperdibles</h4>
            <ul>${lugares.slice(0, 5).map(item).join('')}</ul>
            ${resto.length ? `<details><summary>${resto.length} ${resto.length === 1 ? 'lugar más' : 'lugares más'}</summary><ul>${resto.map(item).join('')}</ul></details>` : ''}
        </div>`;
}

/* ----------------------------------------------------------------------------
   Combos destacados
   ---------------------------------------------------------------------------- */

async function cargarCombos() {
    const lista = document.getElementById('combos-inicio');
    try {
        const { combos } = await apiFetch('/combos');
        const destacados = combos.filter((c) => c.destacado).slice(0, 3);
        lista.innerHTML = destacados.map((c) => `<li>${tarjetaCombo(c)}</li>`).join('');
        document.getElementById('combos').hidden = !destacados.length;
    } catch (error) {
        document.getElementById('combos').hidden = true;
    }
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


/* ----------------------------------------------------------------------------
   Tasa de hoy: pesos por dólar y por euro (GET /api/monedas) y conversor
   ------------------------------------------------------------------------- */

async function iniciarTasaDia() {
    const usd = document.getElementById('tasa-usd');
    if (!usd) return;
    const eur = document.getElementById('tasa-eur');
    const fuente = document.getElementById('tasa-fuente');
    const monto = document.getElementById('conversor-monto');
    const moneda = document.getElementById('conversor-moneda');
    const resultado = document.getElementById('conversor-resultado');
    const pesos = (valor) => `RD$ ${Number(valor).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    let tasas = null;

    const convertir = () => {
        if (!tasas) return;
        const cantidad = Math.max(0, Number(monto.value) || 0);
        resultado.textContent = pesos(cantidad * tasas[moneda.value]);
    };
    monto.addEventListener('input', convertir);
    moneda.addEventListener('change', convertir);
    document.getElementById('form-conversor').addEventListener('submit', (evento) => evento.preventDefault());

    try {
        const datos = await apiFetch('/monedas');
        tasas = datos.tasas;
        usd.textContent = pesos(tasas.USD);
        eur.textContent = pesos(tasas.EUR);
        if (datos.actualizado) {
            const fecha = datos.fecha ? new Date(datos.fecha) : null;
            fuente.textContent = fecha && !Number.isNaN(fecha.getTime())
                ? `Fuente: ${datos.fuente}, actualizada el ${fecha.toLocaleDateString('es-DO', { day: 'numeric', month: 'long' })}.`
                : `Fuente: ${datos.fuente}.`;
        } else {
            fuente.textContent = 'Tasa de referencia sin conexión al servicio.';
        }
        convertir();
    } catch (error) {
        fuente.textContent = 'No se pudo consultar la tasa ahora.';
    }
}

document.addEventListener('DOMContentLoaded', iniciarTasaDia);
