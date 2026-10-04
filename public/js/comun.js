/**
 * @file public/js/comun.js
 * @description Módulo compartido por todas las páginas. Se carga antes del
 *   script propio de cada página y expone funciones globales.
 *
 *   1. Cliente HTTP de la API (apiFetch).
 *   2. Sesión del usuario: JWT y datos públicos en localStorage (sesión
 *      persistente) o sessionStorage (hasta cerrar el navegador).
 *   3. Header: visibilidad por sesión, menú de servicios, menú móvil y
 *      sombra al desplazar.
 *   4. Avisos flotantes, incluidos los diferidos entre páginas.
 *   5. Aparición de secciones al desplazar (IntersectionObserver).
 *   6. Utilidades: escape de HTML y validación de destinos de redirección.
 *
 * Convención de atributos en el HTML:
 *   data-sesion="invitado" | "usuario" | "cliente" | "empresa"
 *       El elemento solo se muestra en ese estado de sesión.
 *   data-nombre-usuario    Recibe el nombre del usuario con sesión.
 *   data-inicial-usuario   Recibe la inicial del nombre.
 *   data-accion="cerrar-sesion"  Cierra la sesión al hacer clic.
 *   data-destino           Página a la que se redirige tras cerrar sesión.
 *   data-revelar           Aparece con animación al entrar en el viewport.
 */

/* ============================================================================
   1. CLIENTE HTTP
   ============================================================================ */

/**
 * Base de la API.
 *   - Página servida por Express (http://localhost:3000/...): ruta relativa.
 *   - Página abierta desde el disco (file://): servidor local en el puerto 3000.
 *     Requiere `npm start` en ejecución; el backend tiene CORS habilitado.
 */
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';

/**
 * Ejecuta una petición JSON contra la API.
 *   - Adjunta el JWT de la sesión en Authorization: Bearer.
 *   - Si la respuesta no es exitosa, lanza un Error con el mensaje { error }
 *     del servidor, la propiedad `status` (código HTTP) y la propiedad
 *     `campo` (campo del formulario asociado, si el servidor lo indica).
 *   - Si no hay respuesta (servidor detenido), lanza un Error con status 0.
 *
 * @param {string} ruta ruta relativa a la API, p. ej. "/auth/login"
 * @param {{method?: string, body?: object}} [opciones]
 * @returns {Promise<any>} cuerpo JSON de la respuesta
 */
async function apiFetch(ruta, opciones = {}) {
    const encabezados = { 'Content-Type': 'application/json' };
    const token = obtenerToken();
    if (token) encabezados.Authorization = `Bearer ${token}`;

    let respuesta;
    try {
        respuesta = await fetch(`${API_BASE}${ruta}`, {
            method: opciones.method || 'GET',
            headers: encabezados,
            body: opciones.body ? JSON.stringify(opciones.body) : undefined
        });
    } catch (_) {
        const error = new Error('No se pudo conectar con el servidor. Verifica que esté en ejecución (npm start) e inténtalo de nuevo.');
        error.status = 0;
        throw error;
    }

    let datos = null;
    try {
        datos = await respuesta.json();
    } catch (_) {
        datos = null;
    }

    if (!respuesta.ok) {
        const error = new Error(datos && datos.error ? datos.error : 'Ocurrió un error al comunicarse con el servidor.');
        error.status = respuesta.status;
        error.campo = datos && datos.campo ? datos.campo : null;   // campo del formulario que originó el error
        throw error;
    }
    return datos;
}

/* ============================================================================
   2. SESIÓN
   ============================================================================ */

const CLAVE_TOKEN = 'bookingrd_token';
const CLAVE_USUARIO = 'bookingrd_usuario';
const CLAVE_AVISO = 'bookingrd_aviso';

/**
 * Almacenes de la sesión:
 *   localStorage    sesión persistente ("Recordarme" activado).
 *   sessionStorage  sesión que termina al cerrar el navegador.
 * El acceso se protege con try/catch: el navegador puede bloquearlos.
 */
function almacenes() {
    const lista = [];
    try { lista.push(window.localStorage); } catch (_) { /* no disponible */ }
    try { lista.push(window.sessionStorage); } catch (_) { /* no disponible */ }
    return lista;
}

/** Devuelve el primer valor encontrado para la clave en cualquiera de los almacenes. */
function leerAlmacen(clave) {
    for (const almacen of almacenes()) {
        try {
            const valor = almacen.getItem(clave);
            if (valor !== null) return valor;
        } catch (_) {
            /* almacén no disponible */
        }
    }
    return null;
}

function obtenerToken() {
    return leerAlmacen(CLAVE_TOKEN);
}

/** @returns {{id:number, nombre:string, rol:string, nombreEmpresa?:string, tipoServicio?:string}|null} */
function obtenerUsuario() {
    try {
        return JSON.parse(leerAlmacen(CLAVE_USUARIO));
    } catch (_) {
        return null;
    }
}

function haySesionActiva() {
    return Boolean(obtenerToken() && obtenerUsuario());
}

/**
 * Guarda el token y los datos públicos devueltos por /auth/login o /auth/registro.
 * @param {string} token
 * @param {object} usuario
 * @param {boolean} [persistente=true] false: la sesión termina al cerrar el navegador.
 */
function guardarSesion(token, usuario, persistente = true) {
    cerrarSesionLocal();
    try {
        const almacen = persistente ? window.localStorage : window.sessionStorage;
        almacen.setItem(CLAVE_TOKEN, token);
        almacen.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    } catch (_) {
        /* Sin almacenamiento disponible la sesión dura solo esta página. */
    }
}

/** Actualiza los datos del usuario en el almacén donde está la sesión. */
function actualizarUsuarioSesion(usuario) {
    for (const almacen of almacenes()) {
        try {
            if (almacen.getItem(CLAVE_TOKEN) !== null) almacen.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
        } catch (_) {
            /* almacén no disponible */
        }
    }
}

function cerrarSesionLocal() {
    for (const almacen of almacenes()) {
        try {
            almacen.removeItem(CLAVE_TOKEN);
            almacen.removeItem(CLAVE_USUARIO);
        } catch (_) {
            /* almacén no disponible */
        }
    }
}

/**
 * Confirma con el backend que el token sigue vigente (GET /api/auth/sesion).
 * Un 401 elimina la sesión local; otros errores (servidor detenido) la
 * conservan para no cerrar la sesión por una falla de red.
 */
async function validarSesionRemota() {
    if (!obtenerToken()) return;
    try {
        const { usuario } = await apiFetch('/auth/sesion');
        actualizarUsuarioSesion(usuario);
    } catch (error) {
        if (error.status === 401) cerrarSesionLocal();
    }
    aplicarEstadoSesion();
}

/* ============================================================================
   3. HEADER
   ============================================================================ */

/**
 * Muestra u oculta los elementos [data-sesion] según la sesión actual y
 * completa el nombre del usuario donde corresponda.
 */
function aplicarEstadoSesion() {
    const usuario = haySesionActiva() ? obtenerUsuario() : null;

    document.querySelectorAll('[data-sesion]').forEach((elemento) => {
        const requerido = elemento.dataset.sesion;
        let visible;
        if (requerido === 'invitado') visible = !usuario;
        else if (requerido === 'usuario') visible = Boolean(usuario);
        else visible = Boolean(usuario) && usuario.rol === requerido;
        elemento.hidden = !visible;
    });

    if (!usuario) return;
    const nombreCorto = usuario.nombre.split(' ')[0];
    document.querySelectorAll('[data-nombre-usuario]').forEach((elemento) => {
        elemento.textContent = nombreCorto;
    });
    document.querySelectorAll('[data-inicial-usuario]').forEach((elemento) => {
        elemento.textContent = nombreCorto.charAt(0).toUpperCase();
    });
    document.querySelectorAll('[data-nombre-empresa]').forEach((elemento) => {
        elemento.textContent = usuario.nombreEmpresa || '';
    });
}

/** Menú móvil: apertura, cierre al elegir un enlace y cierre con Escape. */
function iniciarMenuMovil() {
    const boton = document.getElementById('boton-menu-movil');
    const menu = document.getElementById('menu-movil');
    if (!boton || !menu) return;

    const cambiarEstado = (abierto) => {
        menu.classList.toggle('abierto', abierto);
        boton.setAttribute('aria-expanded', String(abierto));
        boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    };

    boton.addEventListener('click', () => cambiarEstado(!menu.classList.contains('abierto')));
    menu.querySelectorAll('a').forEach((enlace) => enlace.addEventListener('click', () => cambiarEstado(false)));
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') cambiarEstado(false);
    });
}

/**
 * Menú desplegable "Servicios". En escritorio se abre con el cursor (CSS);
 * el clic lo fija abierto para pantallas táctiles. Se cierra al elegir una
 * opción, al hacer clic fuera o con Escape.
 */
function iniciarMenuServicios() {
    const contenedor = document.querySelector('.nav-desplegable');
    if (!contenedor) return;
    const boton = contenedor.querySelector('button');

    const cambiarEstado = (abierto) => {
        contenedor.classList.toggle('abierto', abierto);
        boton.setAttribute('aria-expanded', String(abierto));
    };

    boton.addEventListener('click', () => cambiarEstado(!contenedor.classList.contains('abierto')));
    contenedor.querySelectorAll('a').forEach((enlace) => enlace.addEventListener('click', () => {
        cambiarEstado(false);
        enlace.blur();   // retira :focus-within para que el panel se cierre
    }));
    document.addEventListener('click', (evento) => {
        if (!contenedor.contains(evento.target)) cambiarEstado(false);
    });
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') {
            cambiarEstado(false);
            if (contenedor.contains(document.activeElement)) document.activeElement.blur();
        }
    });
}

/** Aplica la clase .con-sombra al header cuando la página se ha desplazado. */
function iniciarSombraHeader() {
    const header = document.querySelector('.header-principal');
    if (!header) return;
    const actualizar = () => header.classList.toggle('con-sombra', window.scrollY > 10);
    actualizar();
    window.addEventListener('scroll', actualizar, { passive: true });
}

/**
 * Botones y enlaces [data-accion="cerrar-sesion"]. Tras cerrar la sesión se
 * redirige a data-destino (página local del sitio) o, por defecto, a index.html.
 */
function iniciarCierreSesion() {
    document.querySelectorAll('[data-accion="cerrar-sesion"]').forEach((elemento) => {
        elemento.addEventListener('click', (evento) => {
            evento.preventDefault();
            cerrarSesionLocal();
            programarAviso('Sesión cerrada correctamente.');
            window.location.href = destinoSeguro(elemento.dataset.destino);
        });
    });
}

/* ============================================================================
   4. AVISOS FLOTANTES
   ============================================================================ */

let temporizadorAviso = null;

/**
 * Muestra una notificación temporal en la esquina inferior de la pantalla.
 * @param {string} texto
 * @param {'exito'|'error'} [tipo='exito']
 * @param {number} [duracion=4500] milisegundos visibles
 */
function mostrarAviso(texto, tipo = 'exito', duracion = 4500) {
    let aviso = document.getElementById('aviso-flotante');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'aviso-flotante';
        aviso.className = 'aviso-flotante';
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        document.body.appendChild(aviso);
    }
    aviso.textContent = texto;
    aviso.classList.toggle('es-error', tipo === 'error');

    // El doble requestAnimationFrame garantiza que la transición se ejecute
    // también cuando el elemento acaba de insertarse en el DOM.
    requestAnimationFrame(() => requestAnimationFrame(() => aviso.classList.add('visible')));
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), duracion);
}

/** Registra un aviso para mostrarlo en la siguiente página cargada. */
function programarAviso(texto, tipo = 'exito') {
    try {
        sessionStorage.setItem(CLAVE_AVISO, JSON.stringify({ texto, tipo }));
    } catch (_) {
        /* Sin almacenamiento de sesión el aviso se omite. */
    }
}

/** Muestra y elimina el aviso programado por la página anterior, si existe. */
function mostrarAvisoProgramado() {
    let pendiente = null;
    try {
        pendiente = JSON.parse(sessionStorage.getItem(CLAVE_AVISO));
        sessionStorage.removeItem(CLAVE_AVISO);
    } catch (_) {
        pendiente = null;
    }
    if (pendiente && pendiente.texto) {
        setTimeout(() => mostrarAviso(pendiente.texto, pendiente.tipo, 6000), 400);
    }
}

/* ============================================================================
   5. APARICIÓN AL DESPLAZAR
   ============================================================================ */

/**
 * Agrega la clase .revelado a cada [data-revelar] cuando entra en el
 * viewport. Sin soporte de IntersectionObserver, se muestran de inmediato.
 */
function iniciarRevelado() {
    const elementos = document.querySelectorAll('[data-revelar]');
    if (!('IntersectionObserver' in window)) {
        elementos.forEach((elemento) => elemento.classList.add('revelado'));
        return;
    }
    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            entrada.target.classList.add('revelado');
            observador.unobserve(entrada.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    elementos.forEach((elemento) => observador.observe(elemento));
}

/* ============================================================================
   6. UTILIDADES
   ============================================================================ */

/** Escapa texto para insertarlo de forma segura dentro de HTML. */
function escaparHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Acepta como destino de redirección solo páginas locales del sitio
 * (p. ej. "index.html#destacados"), para impedir redirecciones externas.
 * @returns {string} el destino validado o "index.html".
 */
function destinoSeguro(destino) {
    return /^[a-z0-9-]+\.html([?#][\w\-=&%#.]*)?$/i.test(destino || '') ? destino : 'index.html';
}

/** Coloca un indicador de carga en un botón y lo desactiva. */
function botonCargando(boton, texto) {
    boton.dataset.textoOriginal = boton.dataset.textoOriginal || boton.textContent;
    boton.disabled = true;
    boton.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escaparHtml(texto)}`;
}

/** Restaura un botón modificado por botonCargando. */
function botonNormal(boton, texto) {
    boton.disabled = false;
    boton.textContent = texto || boton.dataset.textoOriginal;
}

/* ============================================================================
   INICIALIZACIÓN COMÚN
   ============================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    aplicarEstadoSesion();
    iniciarMenuMovil();
    iniciarMenuServicios();
    iniciarSombraHeader();
    iniciarCierreSesion();
    iniciarRevelado();
    mostrarAvisoProgramado();
    validarSesionRemota();
});
