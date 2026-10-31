/**
 * @file public/js/index.js
 * @description Lógica de la página de inicio (index.html).
 *
 *   - Hero:                    presentación de fotografías y destino que
 *                              cambia en el título.
 *   - Buscador:                js/buscador.js.
 *   - Indicadores, destinos y conteo por categoría:  GET /api/estadisticas
 *   - Vistos recientemente:    historial local del navegador (js/comun.js).
 *   - Carrusel de destacados:  GET /api/publicaciones?tipo=hotel|actividad|vehiculo&orden=destacados
 *   - Mapa de la isla:         GET /api/publicaciones (los tres tipos, al acercarse a la sección)
 *   - Opiniones de viajeros:   GET /api/resenas/destacadas
 *   - Navegación:              marca en el menú la sección visible.
 *   - Contacto:                POST /api/contacto
 */

const DESTACADOS_POR_TIPO = 9;
const PUBLICACIONES_MAPA = 48;

/** Estado del carrusel de destacados. */
const destacados = { tipo: 'hotel', solicitud: 0 };

document.addEventListener('DOMContentLoaded', () => {
    iniciarPresentacion();
    iniciarParalaje();
    iniciarDestinoRotativo();
    iniciarBuscador();
    cargarEstadisticas();
    pintarVistos();
    cargarDestacados();
    iniciarPestanas();
    iniciarCarrusel('carrusel-destacados', 'grid-destacados');
    iniciarCarrusel('carrusel-opiniones', 'grid-opiniones');
    iniciarMapaDiferido();
    cargarOpiniones();
    iniciarNavegacionActiva();
    iniciarContacto();
});

/* ----------------------------------------------------------------------------
   HERO: DESTINO ROTATIVO
   ---------------------------------------------------------------------------- */

const DURACION_DIAPOSITIVA = 7000;

/**
 * Presentación de fotografías del hero: fundido cada 7 segundos con barra de
 * progreso en el indicador activo. Los indicadores permiten elegir una
 * fotografía. Se detiene con la pestaña oculta o el hero fuera de la vista, y
 * no avanza sola con "reducir movimiento".
 */
function iniciarPresentacion() {
    const hero = document.querySelector('.hero');
    const fotos = [...document.querySelectorAll('.hero-diapositiva')];
    const indicadores = [...document.querySelectorAll('.hero-indicador')];
    if (fotos.length < 2) return;
    const automatica = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hero.style.setProperty('--duracion-diapositiva', `${DURACION_DIAPOSITIVA / 1000}s`);
    let actual = 0;
    let temporizador = null;
    let visible = true;

    const mostrar = (indice) => {
        actual = (indice + fotos.length) % fotos.length;
        fotos.forEach((foto, i) => foto.classList.toggle('activa', i === actual));
        indicadores.forEach((boton, i) => {
            boton.classList.remove('activo');
            boton.classList.toggle('visto', i < actual);
            boton.setAttribute('aria-current', String(i === actual));
        });
        void indicadores[actual].offsetWidth;   // reinicia la animación de la barra
        indicadores[actual].classList.add('activo');
        programar();
    };
    const programar = () => {
        clearTimeout(temporizador);
        if (automatica && visible && !document.hidden) temporizador = setTimeout(() => mostrar(actual + 1), DURACION_DIAPOSITIVA);
    };
    const pausar = (pausa) => {
        hero.classList.toggle('pausado', pausa);
        if (pausa) clearTimeout(temporizador);
        else programar();
    };

    indicadores.forEach((boton, i) => boton.addEventListener('click', () => mostrar(i)));
    document.addEventListener('visibilitychange', () => pausar(document.hidden));
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entrada]) => {
            visible = entrada.isIntersecting;
            pausar(!visible);
        }, { threshold: 0.1 }).observe(hero);
    }
    if (!automatica) hero.classList.add('pausado');
    mostrar(0);
}

/**
 * Paralaje suave al desplazar: las fotografías de "Sobre nosotros" se mueven
 * a distinta velocidad y el fondo del llamado a empresas se desplaza más
 * lento que la página. Un solo cálculo por cuadro (requestAnimationFrame).
 */
function iniciarParalaje() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const capas = [
        ...[...document.querySelectorAll('.nosotros-foto-principal')].map((e) => ({ e, v: -0.06 })),
        ...[...document.querySelectorAll('.nosotros-foto-secundaria')].map((e) => ({ e, v: 0.1 }))
    ];
    const franja = document.querySelector('.franja-empresas');
    let pendiente = false;
    const aplicar = () => {
        pendiente = false;
        const alto = window.innerHeight;
        capas.forEach(({ e, v }) => {
            const caja = e.getBoundingClientRect();
            const desde = caja.top + caja.height / 2 - alto / 2;
            e.style.translate = `0 ${Math.round(desde * v)}px`;
        });
        if (franja) {
            const caja = franja.getBoundingClientRect();
            if (caja.bottom > 0 && caja.top < alto) franja.style.backgroundPositionY = `${50 + ((caja.top / alto) * 18)}%`;
        }
    };
    window.addEventListener('scroll', () => {
        if (!pendiente) { pendiente = true; requestAnimationFrame(aplicar); }
    }, { passive: true });
    aplicar();
}

/**
 * Cambia el destino del título cada pocos segundos: el actual sale hacia
 * arriba y el siguiente entra desde abajo. Los nombres ya están en el HTML,
 * apilados en la misma celda, por lo que el título conserva su tamaño. El
 * texto para lectores de pantalla es fijo ("la isla"). Se desactiva con la
 * preferencia de movimiento reducido.
 */
function iniciarDestinoRotativo() {
    const opciones = [...document.querySelectorAll('#hero-destino .hero-destino-opcion')];
    if (opciones.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let indice = 0;
    setInterval(() => {
        const actual = opciones[indice];
        indice = (indice + 1) % opciones.length;
        actual.classList.remove('activa');
        actual.classList.add('saliendo');
        opciones[indice].classList.add('activa');
        setTimeout(() => actual.classList.remove('saliendo'), 500);
    }, 2800);
}

/* ----------------------------------------------------------------------------
   INDICADORES, DESTINOS Y CATEGORÍAS
   ---------------------------------------------------------------------------- */

async function cargarEstadisticas() {
    const contenedorChips = document.getElementById('chips-destinos');
    try {
        const datos = await apiFetch('/estadisticas');
        publicacionesPorDestino = datos.porCiudad || {};
        estadisticasCargadas = true;
        animarNumero(document.getElementById('stat-hoteles'), datos.totalHoteles);
        animarNumero(document.getElementById('stat-actividades'), datos.totalActividades);
        animarNumero(document.getElementById('stat-vehiculos'), datos.totalVehiculos || 0);
        animarNumero(document.getElementById('stat-ciudades'), datos.ciudades.length);
        animarNumero(document.getElementById('stat-empresas'), datos.totalEmpresas);
        if (datos.puntuacionMedia) {
            animarNumero(document.getElementById('stat-valoracion'), Math.round(datos.puntuacionMedia * 10), (n) => formatoPuntuacion(n / 10));
            document.getElementById('stat-valoracion-texto').textContent = `Valoración media en ${textoResenas(datos.totalResenas)}`;
        }
        pintarDestinos(datos.ciudades);
        document.querySelectorAll('[data-conteo-destino]').forEach((elemento) => {
            const total = publicacionesPorDestino[elemento.dataset.conteoDestino] || 0;
            elemento.textContent = total ? textoPublicaciones(total) : '';
        });
        pintarConteoCategorias(datos.porCategoria);
        document.querySelectorAll('[data-conteo-tipo="vehiculo"]').forEach((elemento) => {
            const total = datos.totalVehiculos || 0;
            elemento.textContent = total ? `${total} ${total === 1 ? 'modelo disponible' : 'modelos disponibles'}` : 'Ver autos';
        });
        pintarListaMapa();
    } catch (error) {
        contenedorChips.innerHTML = '<span class="chip chip-informativo">Destinos no disponibles por el momento</span>';
    }
}

/** Chips de destino: uno por ciudad con publicaciones activas. */
function pintarDestinos(ciudades) {
    const contenedor = document.getElementById('chips-destinos');
    if (!ciudades.length) {
        contenedor.innerHTML = '<span class="chip chip-informativo">Aún no hay destinos publicados</span>';
        return;
    }
    contenedor.innerHTML = ciudades
        .map((ciudad) => `<a class="chip" href="explorar.html?ciudad=${encodeURIComponent(ciudad)}">${escaparHtml(ciudad)}<span class="chip-conteo">${publicacionesPorDestino[ciudad] || 0}</span></a>`)
        .join('');
}

/** Cantidad de publicaciones en cada tarjeta de la vitrina de servicios. */
function pintarConteoCategorias(porCategoria) {
    document.querySelectorAll('[data-conteo-categoria]').forEach((elemento) => {
        elemento.textContent = textoPublicaciones(porCategoria[elemento.dataset.conteoCategoria] || 0);
    });
    document.querySelectorAll('[data-conteo-chip]').forEach((elemento) => {
        elemento.textContent = porCategoria[elemento.dataset.conteoChip] || 0;
    });
}

/* ----------------------------------------------------------------------------
   VISTOS RECIENTEMENTE
   ---------------------------------------------------------------------------- */

function pintarVistos() {
    const seccion = document.getElementById('vistos');
    const vistos = leerVistos();
    seccion.hidden = !vistos.length;
    if (!vistos.length) return;
    document.getElementById('grid-vistos').innerHTML = vistos.map(crearTarjetaPublicacion).join('');
    const borrar = document.getElementById('boton-borrar-vistos');
    if (!borrar.dataset.iniciado) {
        borrar.dataset.iniciado = '1';
        borrar.addEventListener('click', () => {
            borrarVistos();
            pintarVistos();
            mostrarAviso('Historial de vistos borrado.', 'exito', 2500);
        });
    }
}

/* ----------------------------------------------------------------------------
   DESTACADOS
   ---------------------------------------------------------------------------- */

function iniciarPestanas() {
    document.querySelectorAll('.tab-boton').forEach((boton) => {
        boton.addEventListener('click', () => {
            if (boton.dataset.tab === destacados.tipo) return;
            destacados.tipo = boton.dataset.tab;
            document.querySelectorAll('.tab-boton').forEach((otro) => {
                const activo = otro === boton;
                otro.classList.toggle('activo', activo);
                otro.setAttribute('aria-selected', String(activo));
            });
            const enlace = document.getElementById('enlace-ver-todo');
            enlace.href = `explorar.html?tipo=${destacados.tipo}`;
            enlace.textContent = { hotel: 'Ver todo el alojamiento', actividad: 'Ver todas las actividades', vehiculo: 'Ver todos los autos' }[destacados.tipo];
            cargarDestacados();
        });
    });
}

async function cargarDestacados() {
    const pista = document.getElementById('grid-destacados');
    const numero = ++destacados.solicitud;
    pista.innerHTML = tarjetasEsqueleto(3);
    pista.scrollLeft = 0;

    try {
        const respuesta = await apiFetch(`/publicaciones?tipo=${destacados.tipo}&orden=destacados&porPagina=${DESTACADOS_POR_TIPO}`);
        if (numero !== destacados.solicitud) return;
        pista.innerHTML = respuesta.publicaciones.length
            ? respuesta.publicaciones.map(crearTarjetaPublicacion).join('')
            : crearEstado({
                titulo: {
                    hotel: 'No se ha publicado ningún alojamiento por el momento',
                    actividad: 'No se ha publicado ninguna actividad por el momento',
                    vehiculo: 'No se ha publicado ningún auto por el momento'
                }[destacados.tipo],
                texto: 'Cuando las empresas registradas publiquen sus servicios, aparecerán en esta sección.'
            });
    } catch (error) {
        if (numero !== destacados.solicitud) return;
        pista.innerHTML = crearEstado({
            titulo: 'No se pudieron cargar las publicaciones',
            texto: error.message,
            accion: '<button type="button" class="btn-outline" id="boton-reintentar">Reintentar</button>',
            esError: true
        });
        document.getElementById('boton-reintentar').addEventListener('click', cargarDestacados);
    }
    actualizarBotonesCarrusel('carrusel-destacados', 'grid-destacados');
}

/* ----------------------------------------------------------------------------
   MAPA DE LA ISLA
   Se crea cuando la sección se acerca al viewport, para no cargar los
   mosaicos ni las publicaciones si el visitante no llega hasta ahí.
   ---------------------------------------------------------------------------- */

const mapaIsla = { mapa: null, publicaciones: [], capa: null, filtro: 'todos' };

function iniciarMapaDiferido() {
    document.querySelectorAll('[data-mapa-filtro]').forEach((boton) => {
        boton.addEventListener('click', () => {
            mapaIsla.filtro = boton.dataset.mapaFiltro;
            document.querySelectorAll('[data-mapa-filtro]').forEach((otro) => {
                otro.classList.toggle('activo', otro === boton);
                otro.setAttribute('aria-pressed', String(otro === boton));
            });
            pintarMarcadoresMapa(true);
            pintarListaMapa();
        });
    });

    const seccion = document.getElementById('mapa');
    if (!('IntersectionObserver' in window)) {
        cargarMapa();
        return;
    }
    const observador = new IntersectionObserver((entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        observador.disconnect();
        cargarMapa();
    }, { rootMargin: '400px 0px' });
    observador.observe(seccion);
}

async function cargarMapa() {
    const contenedor = document.getElementById('mapa-isla');
    mapaIsla.mapa = crearMapaRD(contenedor);
    if (!mapaIsla.mapa) return;
    try {
        const respuestas = await Promise.all(['hotel', 'actividad', 'vehiculo']
            .map((tipo) => apiFetch(`/publicaciones?tipo=${tipo}&porPagina=${PUBLICACIONES_MAPA}`)));
        mapaIsla.publicaciones = respuestas.flatMap((r) => r.publicaciones);
        pintarMarcadoresMapa(true);
        pintarListaMapa();
    } catch (_) {
        /* El mapa queda sin marcadores; el resto de la página funciona. */
    }
}

function publicacionesFiltradasMapa() {
    return mapaIsla.publicaciones.filter((p) => mapaIsla.filtro === 'todos' || p.tipo === mapaIsla.filtro);
}

function pintarMarcadoresMapa(ajustar) {
    if (!mapaIsla.mapa) return;
    if (mapaIsla.capa) mapaIsla.capa.remove();
    mapaIsla.capa = agregarMarcadores(mapaIsla.mapa, publicacionesFiltradasMapa(), { ajustar });
}

/** Lista de destinos junto al mapa; al elegir uno, el mapa se acerca a él. */
function pintarListaMapa() {
    const lista = document.getElementById('mapa-destinos');
    const conteo = {};
    const fuente = mapaIsla.publicaciones.length ? publicacionesFiltradasMapa() : null;
    if (fuente) fuente.forEach((p) => { conteo[p.ciudad] = (conteo[p.ciudad] || 0) + 1; });
    else Object.assign(conteo, publicacionesPorDestino);
    const destinos = Object.entries(conteo).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    lista.innerHTML = destinos.map(([ciudad, total]) => `
        <li><button type="button" data-destino-mapa="${escaparHtml(ciudad)}">
            <span>${escaparHtml(ciudad)}</span><small>${total}</small>
        </button></li>`).join('');
    lista.querySelectorAll('[data-destino-mapa]').forEach((boton) => {
        boton.addEventListener('click', () => {
            const centro = COORDENADAS_DESTINOS[boton.dataset.destinoMapa];
            if (mapaIsla.mapa && centro) mapaIsla.mapa.flyTo(centro, 12, { duration: 1.2 });
            lista.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b === boton));
        });
    });
}

/* ----------------------------------------------------------------------------
   OPINIONES DE VIAJEROS
   ---------------------------------------------------------------------------- */

async function cargarOpiniones() {
    try {
        const { resenas } = await apiFetch('/resenas/destacadas');
        if (!resenas.length) return;
        document.getElementById('grid-opiniones').innerHTML = resenas.map(crearTarjetaOpinion).join('');
        document.getElementById('opiniones').hidden = false;
        actualizarBotonesCarrusel('carrusel-opiniones', 'grid-opiniones');
    } catch (_) {
        /* sección opcional */
    }
}

/* ----------------------------------------------------------------------------
   NAVEGACIÓN ACTIVA
   ---------------------------------------------------------------------------- */

/** Resalta en el menú la sección visible (Inicio, Nosotros o Contacto). */
function iniciarNavegacionActiva() {
    const enlaces = document.querySelectorAll('.nav-principal .nav-enlace');
    const secciones = ['inicio', 'nosotros', 'contacto'].map((id) => document.getElementById(id)).filter(Boolean);
    if (!('IntersectionObserver' in window)) return;

    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            const destino = entrada.target.id === 'inicio'
                ? document.querySelector('.nav-principal a[href="index.html"]')
                : document.querySelector(`.nav-principal a[href="#${entrada.target.id}"]`);
            enlaces.forEach((enlace) => enlace.classList.toggle('activo', enlace === destino));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    secciones.forEach((seccion) => observador.observe(seccion));
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

    retirarMarcasAlEditar(formulario);

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
