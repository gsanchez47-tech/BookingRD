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
 *   7. Catálogos, formatos y componentes compartidos (tarjetas de
 *      publicación, esqueletos de carga, ventanas modales, control de acceso).
 *   8. Gráficos del panel de empresa y de la administración.
 *   9. Valoraciones, favoritos, vistos recientemente y compartir.
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
        mostrarAvisoServidor();
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

    // Token vencido o inválido en una petición autenticada: se cierra la sesión
    // local y se envía al usuario al inicio de sesión.
    if (respuesta.status === 401 && token && !ruta.startsWith('/auth/')) {
        cerrarSesionLocal();
        irAlLogin('sesion-expirada');
    }

    if (!respuesta.ok) {
        const error = new Error(datos && datos.error ? datos.error : 'Ocurrió un error al comunicarse con el servidor.');
        error.status = respuesta.status;
        error.campo = datos && datos.campo ? datos.campo : null;   // campo del formulario que originó el error
        throw error;
    }
    return datos;
}

/**
 * Franja fija que explica cómo arrancar el servidor cuando la API no
 * responde (por ejemplo, al abrir los HTML desde la carpeta sin `npm start`).
 * Se muestra una sola vez por página y puede cerrarse.
 */
function mostrarAvisoServidor() {
    if (document.getElementById('aviso-servidor')) return;
    const desdeArchivo = window.location.protocol === 'file:';
    const aviso = document.createElement('div');
    aviso.id = 'aviso-servidor';
    aviso.className = 'aviso-servidor';
    aviso.setAttribute('role', 'alert');
    aviso.innerHTML = `
        <div>
            <strong>El servidor de BookingRD no está en ejecución.</strong>
            <span>Abre una terminal en la carpeta del proyecto, ejecuta <code>npm start</code>
            ${desdeArchivo ? 'y entra a <a href="http://localhost:3000">http://localhost:3000</a> en lugar de abrir el archivo.' : 'y vuelve a cargar la página.'}</span>
        </div>
        <button type="button" aria-label="Cerrar aviso">Entendido</button>`;
    aviso.querySelector('button').addEventListener('click', () => aviso.remove());
    const insertar = () => document.body.appendChild(aviso);
    if (document.body) insertar(); else document.addEventListener('DOMContentLoaded', insertar);
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
   7. CATÁLOGOS, FORMATOS Y COMPONENTES
   ============================================================================ */

/**
 * Valores de los catálogos del sistema. Deben coincidir con
 * src/utils/catalogos.js (backend) y con los CHECK del script SQL.
 */
const CATALOGOS = {
    destinos: ['Santo Domingo', 'Punta Cana', 'Puerto Plata', 'Las Terrenas', 'Samaná', 'Las Galeras',
        'La Romana', 'Sosúa', 'Cabarete', 'Jarabacoa', 'Constanza', 'Juan Dolio', 'Boca Chica',
        'Río San Juan', 'Pedernales'],
    categorias: {
        'hoteles-resorts': { nombre: 'Hoteles y resorts', tipo: 'hotel', grupo: 'Alojamiento' },
        'villas-cabanas': { nombre: 'Villas y cabañas', tipo: 'hotel', grupo: 'Alojamiento' },
        'tour-playa': { nombre: 'Tours de playa', tipo: 'actividad', grupo: 'Tours' },
        'tour-montana': { nombre: 'Tours de montaña', tipo: 'actividad', grupo: 'Tours' },
        'tour-gastronomico': { nombre: 'Tours gastronómicos', tipo: 'actividad', grupo: 'Tours' },
        cultural: { nombre: 'Tours culturales e históricos', tipo: 'actividad', grupo: 'Tours' },
        'zip-line': { nombre: 'Zip line y parapente', tipo: 'actividad', grupo: 'Aventura' },
        motocross: { nombre: 'Motocross y buggies', tipo: 'actividad', grupo: 'Aventura' },
        acuaticas: { nombre: 'Actividades acuáticas', tipo: 'actividad', grupo: 'Aventura' },
        golf: { nombre: 'Golf', tipo: 'actividad', grupo: 'Aventura' },
        economico: { nombre: 'Económico', tipo: 'vehiculo', grupo: 'Autos' },
        compacto: { nombre: 'Compacto', tipo: 'vehiculo', grupo: 'Autos' },
        sedan: { nombre: 'Sedán', tipo: 'vehiculo', grupo: 'Autos' },
        suv: { nombre: 'SUV', tipo: 'vehiculo', grupo: 'Autos' },
        minivan: { nombre: 'Minivan', tipo: 'vehiculo', grupo: 'Autos' },
        lujo: { nombre: 'Lujo', tipo: 'vehiculo', grupo: 'Autos' },
        convertible: { nombre: 'Convertible', tipo: 'vehiculo', grupo: 'Autos' },
        pickup: { nombre: 'Pickup 4x4', tipo: 'vehiculo', grupo: 'Autos' }
    },
    transmisiones: { automatica: 'Automática', manual: 'Manual' },
    combustibles: { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico' },
    // Mismos precios que EXTRAS_VEHICULO del servidor (que es quien calcula el total).
    extrasVehiculo: {
        'proteccion-total': { nombre: 'Protección total sin deducible', precio: 950, porDia: true, detalle: 'Elimina el deducible por daños y robo.' },
        'conductor-adicional': { nombre: 'Conductor adicional', precio: 450, porDia: true, detalle: 'Un segundo conductor autorizado.' },
        'silla-infantil': { nombre: 'Silla infantil', precio: 300, porDia: true, detalle: 'Para niños de 9 a 36 kg.' },
        gps: { nombre: 'Navegador GPS', precio: 350, porDia: true, detalle: 'Mapas del país sin conexión.' },
        'wifi-portatil': { nombre: 'Wi-Fi portátil', precio: 400, porDia: true, detalle: 'Datos ilimitados para 5 dispositivos.' },
        'entrega-hotel': { nombre: 'Entrega y recogida en tu hotel', precio: 1500, porDia: false, detalle: 'Te llevamos el auto donde te hospedas.' }
    },
    horarioAlquiler: { apertura: '06:00', cierre: '22:00' },
    tiposAlojamiento: {
        hotel: 'Hotel', resort: 'Resort todo incluido', boutique: 'Hotel boutique', villa: 'Villa',
        cabana: 'Cabañas', apartamento: 'Apartamentos turísticos', hostal: 'Hostal o posada'
    },
    serviciosHotel: {
        wifi: 'Wi-Fi', piscina: 'Piscina', playa: 'Acceso a la playa', 'todo-incluido': 'Todo incluido',
        desayuno: 'Desayuno incluido', restaurante: 'Restaurante', spa: 'Spa', gimnasio: 'Gimnasio',
        aire: 'Aire acondicionado', estacionamiento: 'Estacionamiento', traslado: 'Traslado al aeropuerto',
        mascotas: 'Admite mascotas'
    }
};

/** Origen del servidor para recursos servidos por la API (imágenes subidas). */
const ORIGEN_SERVIDOR = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

/**
 * Resuelve la ruta de una imagen: las subidas (/api/imagenes/...) se piden al
 * servidor; las estáticas (img/...) son relativas a la página.
 */
function urlRecurso(ruta) {
    if (!ruta) return '';
    return ruta.startsWith('/api/') ? `${ORIGEN_SERVIDOR}${ruta}` : ruta;
}

const formatoMoneda = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 });
const formatoFechaLarga = new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Fecha AAAA-MM-DD a texto legible ("sáb, 14 nov 2026"). */
function formatearFecha(iso) {
    return iso ? formatoFechaLarga.format(new Date(`${iso}T00:00:00Z`)) : '';
}

/** Fecha de hoy en República Dominicana (AAAA-MM-DD). */
function hoyIso() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Suma días a una fecha AAAA-MM-DD. */
function sumarDiasIso(iso, dias) {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
}

/** Duración de una actividad en texto ("4 horas", "3 días"). */
function formatearDuracion(horas) {
    if (horas >= 24) {
        const dias = Math.round(horas / 24);
        return `${dias} ${dias === 1 ? 'día' : 'días'}`;
    }
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
}

/** Unidad de precio según el tipo de publicación. */
function unidadPrecio(tipo) {
    return { hotel: 'por noche', actividad: 'por persona', vehiculo: 'por día' }[tipo] || '';
}

/** Nombre del tipo de publicación para listados y tablas. */
const NOMBRE_TIPO = { hotel: 'Alojamiento', actividad: 'Actividad', vehiculo: 'Alquiler de auto' };

/** Hora HH:MM a formato de 12 horas ("10:00 a. m."). */
function formatearHora(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Horas en punto y media hora del horario del mostrador, como opciones de un select. */
function opcionesHoraAlquiler(seleccionada) {
    const { apertura, cierre } = CATALOGOS.horarioAlquiler;
    const aMin = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
    const opciones = [];
    for (let m = aMin(apertura); m <= aMin(cierre); m += 30) {
        const valor = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        opciones.push(`<option value="${valor}"${valor === seleccionada ? ' selected' : ''}>${formatearHora(valor)}</option>`);
    }
    return opciones.join('');
}

/** Fechas de una reserva en texto, con horas para los alquileres de autos. */
function textoFechasReserva(reserva) {
    if (reserva.tipo === 'hotel') return `${formatearFecha(reserva.fechaInicio)} al ${formatearFecha(reserva.fechaFin)}`;
    if (reserva.tipo === 'vehiculo') {
        const a = reserva.alquiler || {};
        return `${formatearFecha(reserva.fechaInicio)} ${formatearHora(a.horaRecogida)} al ${formatearFecha(reserva.fechaFin)} ${formatearHora(a.horaDevolucion)}`.replace(/\s+/g, ' ').trim();
    }
    return formatearFecha(reserva.fechaInicio);
}

/** Kilometraje de un vehículo en texto. */
function textoKilometraje(kmPorDia) {
    return kmPorDia ? `${kmPorDia} km por día` : 'Kilometraje ilimitado';
}

/** Línea corta de características de un vehículo ("5 pasajeros · Automática · 2 maletas"). */
function resumenVehiculo(v) {
    return [`${v.pasajeros} pasajeros`, CATALOGOS.transmisiones[v.transmision] || '', `${v.maletas} ${v.maletas === 1 ? 'maleta' : 'maletas'}`]
        .filter(Boolean).join(' · ');
}

/**
 * Fechas y personas de la búsqueda en curso (explorar.html las fija a partir
 * de su URL). Los enlaces al detalle las conservan para que el formulario de
 * reserva aparezca ya completado.
 */
const contextoViaje = { entrada: '', salida: '', fecha: '', personas: '', recogida: '', horaRecogida: '', devolucion: '', horaDevolucion: '' };

/** Enlace a la página de detalle de una publicación, con el contexto de viaje que aplique. */
function enlaceDetalle(publicacion) {
    const parametros = new URLSearchParams({ tipo: publicacion.tipo, id: publicacion.id });
    if (publicacion.tipo === 'hotel' && contextoViaje.entrada && contextoViaje.salida) {
        parametros.set('entrada', contextoViaje.entrada);
        parametros.set('salida', contextoViaje.salida);
    }
    if (publicacion.tipo === 'actividad' && contextoViaje.fecha) parametros.set('fecha', contextoViaje.fecha);
    if (publicacion.tipo === 'vehiculo') {
        for (const clave of ['recogida', 'horaRecogida', 'devolucion', 'horaDevolucion']) {
            if (contextoViaje[clave]) parametros.set(clave, contextoViaje[clave]);
        }
        return `detalle.html?${parametros}`;
    }
    if (contextoViaje.personas) parametros.set('personas', contextoViaje.personas);
    return `detalle.html?${parametros}`;
}

/**
 * Tarjeta de publicación (inicio, explorar, favoritos).
 *
 * La tarjeta es un <article>; el enlace del título se extiende sobre toda la
 * tarjeta (::after) y el botón de favorito queda por encima, de modo que no
 * hay un control interactivo dentro de otro. Sin fotografía se muestra un
 * fondo de color con el nombre de la categoría.
 */
function crearTarjetaPublicacion(publicacion) {
    const categoria = CATALOGOS.categorias[publicacion.categoria] || { nombre: '' };
    const esHotel = publicacion.tipo === 'hotel';
    const esVehiculo = publicacion.tipo === 'vehiculo';
    const detalleSecundario = esHotel
        ? CATALOGOS.tiposAlojamiento[publicacion.tipoAlojamiento] || ''
        : esVehiculo ? `${publicacion.anio} o similar` : formatearDuracion(publicacion.duracionHoras);
    const especificaciones = esVehiculo ? `
                <ul class="tarjeta-specs" aria-label="Características">
                    <li>${publicacion.pasajeros} pasajeros</li>
                    <li>${escaparHtml(CATALOGOS.transmisiones[publicacion.transmision] || '')}</li>
                    <li>${publicacion.maletas} ${publicacion.maletas === 1 ? 'maleta' : 'maletas'}</li>
                    <li>${escaparHtml(textoKilometraje(publicacion.kmPorDia))}</li>
                </ul>` : '';
    const media = publicacion.imagen
        ? `<img src="${escaparHtml(urlRecurso(publicacion.imagen))}" alt="" loading="lazy" onerror="this.closest('.tarjeta-media').classList.add('sin-foto'); this.remove();">`
        : '';
    const insignia = insigniaPublicacion(publicacion);
    return `
        <article class="tarjeta-publicacion">
            <div class="tarjeta-media${publicacion.imagen ? '' : ' sin-foto'}${esHotel ? '' : esVehiculo ? ' es-vehiculo' : ' es-actividad'}">
                ${media}
                <span class="tarjeta-sin-foto-texto" aria-hidden="true">${escaparHtml(categoria.nombre)}</span>
                <span class="tarjeta-categoria">${escaparHtml(categoria.nombre)}</span>
                ${insignia ? `<span class="tarjeta-insignia insignia-${insignia.clase}">${escaparHtml(insignia.texto)}</span>` : ''}
                ${botonFavorito(publicacion)}
            </div>
            <div class="tarjeta-cuerpo">
                <span class="tarjeta-ubicacion">${escaparHtml(publicacion.ciudad)}, ${escaparHtml(detalleSecundario)}</span>
                <h3 class="tarjeta-titulo"><a class="tarjeta-enlace" href="${enlaceDetalle(publicacion)}">${escaparHtml(publicacion.nombre)}</a></h3>
                ${valoracionCompacta(publicacion)}
                ${esVehiculo ? especificaciones : `<p class="tarjeta-descripcion">${escaparHtml(publicacion.descripcion)}</p>`}
                <p class="tarjeta-politica">${esVehiculo ? 'Cancelación gratuita hasta un día antes de la recogida' : 'Cancelación gratuita hasta un día antes'}</p>
                <div class="tarjeta-pie">
                    <span class="tarjeta-precio"><small class="tarjeta-desde">Desde</small>${formatoMoneda.format(publicacion.precio)}<small>${unidadPrecio(publicacion.tipo)}</small></span>
                    <span class="tarjeta-proveedor">${escaparHtml(publicacion.proveedor || '')}</span>
                </div>
            </div>
        </article>`;
}

/** Tarjetas de carga con efecto de brillo mientras llegan los datos. */
function tarjetasEsqueleto(cantidad) {
    return Array.from({ length: cantidad }, () => `
        <div class="tarjeta-esqueleto" aria-hidden="true">
            <div class="esqueleto esqueleto-media"></div>
            <div class="esqueleto esqueleto-linea corta"></div>
            <div class="esqueleto esqueleto-linea"></div>
            <div class="esqueleto esqueleto-linea"></div>
        </div>`).join('');
}

/** Bloque de estado (vacío o error) con la marca tricolor. */
function crearEstado({ titulo, texto = '', accion = '', esError = false }) {
    return `
        <div class="estado-listado${esError ? ' es-error' : ''}">
            <div class="estado-marca" aria-hidden="true"><span></span><span></span><span></span></div>
            <h3>${escaparHtml(titulo)}</h3>
            ${texto ? `<p>${escaparHtml(texto)}</p>` : ''}
            ${accion}
        </div>`;
}

/**
 * Exige sesión (y opcionalmente un rol) para ver la página. Sin sesión envía
 * al inicio de sesión con regreso a la página actual.
 * @param {string} [rol]
 * @returns {object|null} usuario, o null si se redirigió.
 */
function exigirSesion(rol) {
    const usuario = haySesionActiva() ? obtenerUsuario() : null;
    if (!usuario) {
        irAlLogin();
        return null;
    }
    if (rol && usuario.rol !== rol) {
        window.location.replace('index.html');
        return null;
    }
    return usuario;
}

/** Envía al inicio de sesión, con la página actual como destino de regreso. */
function irAlLogin(motivo) {
    const pagina = window.location.pathname.split('/').pop() || 'index.html';
    const volver = encodeURIComponent(pagina + window.location.search);
    window.location.href = `login.html?volver=${volver}${motivo ? `&motivo=${motivo}` : ''}`;
}

/**
 * Ventanas modales basadas en <dialog>. Se cierran con Escape, con
 * cualquier [data-cerrar-modal] o al hacer clic fuera del contenido.
 */
function abrirModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!modal.dataset.iniciado) {
        modal.dataset.iniciado = '1';
        modal.addEventListener('click', (evento) => {
            if (evento.target === modal || evento.target.closest('[data-cerrar-modal]')) cerrarModal(id);
        });
    }
    modal.showModal();
    document.body.classList.add('modal-abierto');
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (!modal || !modal.open) return;
    modal.classList.add('cerrando');
    setTimeout(() => {
        modal.classList.remove('cerrando');
        modal.close();
        document.body.classList.remove('modal-abierto');
    }, 180);
}

/** Anima un número desde 0 hasta su valor final. */
function animarNumero(elemento, valorFinal, formato = (n) => String(n)) {
    if (!elemento) return;
    const duracion = 800;
    const inicio = performance.now();
    const paso = (ahora) => {
        const progreso = Math.min((ahora - inicio) / duracion, 1);
        elemento.textContent = formato(Math.round(valorFinal * (1 - Math.pow(1 - progreso, 3))));
        if (progreso < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
}

/** Ejecuta la función después de que dejen de producirse llamadas durante `espera` ms. */
function conRetardo(funcion, espera = 300) {
    let temporizador = null;
    return (...argumentos) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => funcion(...argumentos), espera);
    };
}

/** Marca un campo de formulario como inválido y le da el foco. */
function marcarCampo(id) {
    const campo = id ? document.getElementById(id) : null;
    if (!campo) return;
    const contenedor = campo.closest('.campo, .casilla') || campo;
    contenedor.classList.add('invalido');
    campo.focus({ preventScroll: true });
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Retira la marca de error al editar un campo (delegación en un formulario). */
function retirarMarcasAlEditar(formulario) {
    const retirar = (evento) => {
        const contenedor = evento.target.closest('.campo, .casilla');
        if (contenedor) contenedor.classList.remove('invalido');
    };
    formulario.addEventListener('input', retirar);
    formulario.addEventListener('change', retirar);
}

/* ============================================================================
   8. GRÁFICOS (panel de empresa y administración)
   Gráficos de una sola serie dibujados con HTML y CSS: columnas y barras
   horizontales. Cada marca muestra su valor al pasar el cursor o al recibir
   el foco, y el gráfico incluye una tabla equivalente para lectores de
   pantalla.
   ============================================================================ */

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Formato compacto para ejes: 950, 12K, 1.2M. */
function formatoCompacto(valor) {
    if (valor >= 1000000) return `${(valor / 1000000).toFixed(valor >= 10000000 ? 0 : 1).replace('.0', '')}M`;
    if (valor >= 1000) return `${Math.round(valor / 1000)}K`;
    return String(Math.round(valor));
}

/** Máximo "redondo" del eje para que las líneas guía caigan en valores limpios. */
function maximoEje(valor) {
    if (valor <= 0) return 1;
    const magnitud = Math.pow(10, Math.floor(Math.log10(valor)));
    const paso = [1, 2, 2.5, 5, 10].find((p) => p * magnitud >= valor);
    return paso * magnitud;
}

/** Tabla accesible con los mismos datos del gráfico. */
function tablaGrafico(titulo, datos, formato) {
    return `<table class="visualmente-oculto"><caption>${escaparHtml(titulo)}</caption>
        <tbody>${datos.map((d) => `<tr><th scope="row">${escaparHtml(d.etiqueta)}</th><td>${escaparHtml(formato(d.valor))}</td></tr>`).join('')}</tbody></table>`;
}

/**
 * Gráfico de columnas.
 * @param {string} titulo  descripción para lectores de pantalla
 * @param {{etiqueta: string, valor: number, resaltado?: boolean, detalle?: string}[]} datos
 * @param {(n: number) => string} formato  formato del valor en el tooltip y la etiqueta
 */
function crearGraficoColumnas(titulo, datos, formato = String) {
    const maximo = maximoEje(Math.max(...datos.map((d) => d.valor), 0));
    const mayor = Math.max(...datos.map((d) => d.valor));
    const guias = [1, 0.5, 0].map((f) => `<span class="grafico-guia" style="bottom:${f * 100}%"><small>${formatoCompacto(maximo * f)}</small></span>`).join('');
    const columnas = datos.map((d, i) => {
        const alto = (d.valor / maximo) * 100;
        // Etiqueta visible solo en el valor máximo y en el periodo resaltado.
        const etiqueta = d.valor > 0 && (d.valor === mayor || d.resaltado)
            ? `<span class="grafico-valor">${escaparHtml(formatoCompacto(d.valor))}</span>` : '';
        const ayuda = `${d.etiqueta}: ${formato(d.valor)}${d.detalle ? `, ${d.detalle}` : ''}`;
        return `
            <div class="grafico-columna${d.resaltado ? ' resaltado' : ''}" tabindex="0" data-ayuda="${escaparHtml(ayuda)}" aria-label="${escaparHtml(ayuda)}">
                <div class="grafico-pista">
                    <span class="grafico-barra" style="--alto:${alto}%; --retardo:${i * 60}ms">${etiqueta}</span>
                </div>
                <span class="grafico-eje">${escaparHtml(d.etiqueta)}</span>
            </div>`;
    }).join('');
    return `<figure class="grafico grafico-columnas" role="group" aria-label="${escaparHtml(titulo)}">
            <div class="grafico-area">${guias}<div class="grafico-columnas-fila">${columnas}</div></div>
            ${tablaGrafico(titulo, datos, formato)}
        </figure>`;
}

/**
 * Barras horizontales ordenadas (ranking). Cada fila muestra su valor al final.
 * @param {{etiqueta: string, valor: number, detalle?: string}[]} datos
 */
function crearBarrasHorizontales(titulo, datos, formato = String) {
    if (!datos.length) return '<p class="grafico-vacio">Aún no hay datos suficientes.</p>';
    const maximo = Math.max(...datos.map((d) => d.valor)) || 1;
    return `<figure class="grafico grafico-barras" role="group" aria-label="${escaparHtml(titulo)}">
            ${datos.map((d, i) => `
                <div class="grafico-fila" tabindex="0" data-ayuda="${escaparHtml(`${d.etiqueta}: ${formato(d.valor)}${d.detalle ? `, ${d.detalle}` : ''}`)}">
                    <span class="grafico-fila-etiqueta">${escaparHtml(d.etiqueta)}</span>
                    <span class="grafico-fila-pista"><span class="grafico-barra" style="--ancho:${(d.valor / maximo) * 100}%; --retardo:${i * 70}ms"></span></span>
                    <span class="grafico-fila-valor">${escaparHtml(formato(d.valor))}</span>
                </div>`).join('')}
            ${tablaGrafico(titulo, datos, formato)}
        </figure>`;
}

/** Etiqueta corta de mes: "oct 26". */
function etiquetaMes(anio, mes) {
    return `${NOMBRES_MES[mes - 1]} ${String(anio).slice(2)}`;
}

/* ============================================================================
   9. VALORACIONES, FAVORITOS, VISTOS RECIENTEMENTE Y COMPARTIR
   ============================================================================ */

/**
 * Calificación verbal de una puntuación media de 1 a 10 (misma escala que
 * las reseñas).
 */
function etiquetaPuntuacion(puntuacion) {
    if (puntuacion === null || puntuacion === undefined) return '';
    if (puntuacion >= 9.5) return 'Excepcional';
    if (puntuacion >= 9) return 'Fantástico';
    if (puntuacion >= 8) return 'Muy bueno';
    if (puntuacion >= 7) return 'Bueno';
    if (puntuacion >= 6) return 'Agradable';
    return 'Regular';
}

/** Puntuación con un decimal y coma decimal: 9,3. Los enteros llevan ",0" solo si se pide. */
function formatoPuntuacion(puntuacion, { decimalFijo = true } = {}) {
    const redondeada = Math.round(puntuacion * 10) / 10;
    return decimalFijo || !Number.isInteger(redondeada)
        ? redondeada.toFixed(1).replace('.', ',')
        : String(redondeada);
}

/** "1 reseña" / "12 reseñas". */
function textoResenas(total) {
    return `${total} ${total === 1 ? 'reseña' : 'reseñas'}`;
}

/** Nota, calificación y número de reseñas de una tarjeta. Sin reseñas: "Nuevo en BookingRD". */
function valoracionCompacta(publicacion) {
    if (!publicacion.totalResenas || publicacion.puntuacion === null || publicacion.puntuacion === undefined) {
        return '<div class="valoracion valoracion-nueva"><span>Nuevo en BookingRD</span></div>';
    }
    const nota = formatoPuntuacion(publicacion.puntuacion);
    return `
        <div class="valoracion" aria-label="Puntuación ${nota} de 10, ${etiquetaPuntuacion(publicacion.puntuacion)}, ${textoResenas(publicacion.totalResenas)}">
            <span class="nota">${nota}</span>
            <strong>${etiquetaPuntuacion(publicacion.puntuacion)}</strong>
            <span class="valoracion-total">${textoResenas(publicacion.totalResenas)}</span>
        </div>`;
}

/**
 * Insignia principal de la tarjeta (solo una, por orden de prioridad):
 * destacada por la plataforma, muy reservada o mejor valorada.
 */
function insigniaPublicacion(publicacion) {
    if (publicacion.destacado) return { clase: 'destacado', texto: 'Destacado' };
    if (publicacion.totalReservas >= 3) return { clase: 'popular', texto: 'Muy reservado' };
    if (publicacion.puntuacion >= 9.5 && publicacion.totalResenas >= 2) return { clase: 'top', texto: 'Favorito de viajeros' };
    return null;
}

/* ---------------------------------------------------------------------------
   Favoritos
   Solo las cuentas de viajero guardan publicaciones. Las claves se cargan una
   vez por página (GET /api/favoritos/claves) y los botones [data-favorito]
   se actualizan al cambiar. Sin sesión, el botón lleva al inicio de sesión.
   --------------------------------------------------------------------------- */

const Favoritos = {
    claves: new Set(),
    cargado: false,

    clave: (tipo, id) => `${tipo}:${id}`,
    tiene(tipo, id) { return this.claves.has(this.clave(tipo, id)); },

    async cargar() {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        if (!usuario || usuario.rol !== 'cliente') return;
        try {
            const { favoritos } = await apiFetch('/favoritos/claves');
            this.claves = new Set(favoritos.map((f) => this.clave(f.tipo, f.id)));
            this.cargado = true;
            this.pintar();
        } catch (_) {
            /* Sin conexión los corazones quedan vacíos; guardar mostrará el error. */
        }
    },

    /** Sincroniza todos los botones de la página y los contadores del header. */
    pintar(raiz = document) {
        raiz.querySelectorAll('[data-favorito]').forEach((boton) => {
            const [tipo, id] = boton.dataset.favorito.split(':');
            const guardado = this.tiene(tipo, id);
            boton.classList.toggle('guardado', guardado);
            boton.setAttribute('aria-pressed', String(guardado));
            const nombre = boton.dataset.nombre || 'esta publicación';
            boton.setAttribute('aria-label', guardado ? `Quitar ${nombre} de guardados` : `Guardar ${nombre}`);
            const texto = boton.querySelector('.boton-favorito-texto');
            if (texto) texto.textContent = guardado ? 'Guardado' : 'Guardar';
        });
        document.querySelectorAll('[data-contador-favoritos]').forEach((contador) => {
            contador.textContent = this.claves.size;
            contador.hidden = this.claves.size === 0;
        });
    },

    async alternar(boton) {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        if (!usuario) {
            programarAviso('Inicia sesión con tu cuenta de viajero para guardar publicaciones.');
            irAlLogin();
            return;
        }
        if (usuario.rol !== 'cliente') {
            mostrarAviso('Los favoritos están disponibles para las cuentas de viajero.', 'error');
            return;
        }
        const [tipo, id] = boton.dataset.favorito.split(':');
        const clave = this.clave(tipo, id);
        const guardar = !this.claves.has(clave);
        // Actualización optimista: el corazón cambia al instante y se revierte si falla.
        if (guardar) this.claves.add(clave); else this.claves.delete(clave);
        this.pintar();
        if (guardar) {
            boton.classList.remove('latido');
            void boton.offsetWidth;   // reinicia la animación
            boton.classList.add('latido');
        }
        try {
            await apiFetch(`/favoritos/${tipo}/${id}`, { method: guardar ? 'PUT' : 'DELETE' });
            mostrarAviso(guardar ? 'Guardado en tus favoritos.' : 'Quitado de tus favoritos.', 'exito', 2500);
            document.dispatchEvent(new CustomEvent('favoritos:cambio', { detail: { tipo, id: Number(id), guardado: guardar } }));
        } catch (error) {
            if (guardar) this.claves.delete(clave); else this.claves.add(clave);
            this.pintar();
            mostrarAviso(error.message, 'error');
        }
    }
};

/** Contorno del corazón (SVG en línea, hereda el color del botón). */
const ICONO_CORAZON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 20.6s-7.6-4.6-9.4-9.3C1.4 8 3.4 4.6 6.9 4.6c2 0 3.6 1.1 4.6 2.7h1c1-1.6 2.6-2.7 4.6-2.7 3.5 0 5.5 3.4 4.3 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/></svg>';

/**
 * Botón de favorito.
 * @param {object} publicacion { tipo, id, nombre }
 * @param {boolean} [conTexto=false] muestra "Guardar"/"Guardado" junto al corazón (detalle)
 */
function botonFavorito(publicacion, conTexto = false) {
    const guardado = Favoritos.tiene(publicacion.tipo, publicacion.id);
    return `<button type="button" class="boton-favorito${conTexto ? ' con-texto' : ''}${guardado ? ' guardado' : ''}"
                data-favorito="${publicacion.tipo}:${publicacion.id}" data-nombre="${escaparHtml(publicacion.nombre)}"
                aria-pressed="${guardado}" aria-label="${guardado ? 'Quitar de guardados' : 'Guardar'} ${escaparHtml(publicacion.nombre)}">
                ${ICONO_CORAZON}${conTexto ? `<span class="boton-favorito-texto">${guardado ? 'Guardado' : 'Guardar'}</span>` : ''}
            </button>`;
}

/* ---------------------------------------------------------------------------
   Vistos recientemente
   El detalle guarda una copia reducida de la publicación en este navegador
   (localStorage) para mostrarla en la página de inicio. No se envía al
   servidor; si el almacenamiento no está disponible la sección no aparece.
   --------------------------------------------------------------------------- */

const CLAVE_VISTOS = 'bookingrd_vistos';
const MAXIMO_VISTOS = 8;
const CAMPOS_VISTO = ['tipo', 'id', 'nombre', 'categoria', 'ciudad', 'descripcion', 'precio', 'imagen', 'destacado',
    'proveedor', 'tipoAlojamiento', 'duracionHoras', 'puntuacion', 'totalResenas', 'totalReservas'];

function leerVistos() {
    try {
        const lista = JSON.parse(localStorage.getItem(CLAVE_VISTOS));
        return Array.isArray(lista) ? lista : [];
    } catch (_) {
        return [];
    }
}

function registrarVisto(publicacion) {
    const copia = Object.fromEntries(CAMPOS_VISTO.map((campo) => [campo, publicacion[campo]]));
    const lista = [copia, ...leerVistos().filter((p) => !(p.tipo === copia.tipo && p.id === copia.id))].slice(0, MAXIMO_VISTOS);
    try {
        localStorage.setItem(CLAVE_VISTOS, JSON.stringify(lista));
    } catch (_) {
        /* almacenamiento no disponible */
    }
}

function borrarVistos() {
    try {
        localStorage.removeItem(CLAVE_VISTOS);
    } catch (_) {
        /* almacenamiento no disponible */
    }
}

/* ---------------------------------------------------------------------------
   Compartir
   Usa la hoja de compartir del sistema cuando existe (móviles) y, si no,
   copia el enlace al portapapeles.
   --------------------------------------------------------------------------- */

async function compartirEnlace(titulo, texto) {
    const url = window.location.href;
    if (navigator.share) {
        try {
            await navigator.share({ title: titulo, text: texto, url });
            return;
        } catch (error) {
            if (error.name === 'AbortError') return;   // el usuario cerró la hoja
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        mostrarAviso('Enlace copiado. Ya puedes pegarlo donde quieras.');
    } catch (_) {
        mostrarAviso('No se pudo copiar el enlace. Cópialo desde la barra de direcciones.', 'error');
    }
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

    // Corazones de favorito: delegación para las tarjetas que se agregan después.
    document.addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-favorito]');
        if (!boton) return;
        evento.preventDefault();
        Favoritos.alternar(boton);
    });
    Favoritos.cargar();
});

/* ---------------------------------------------------------------------------
   Carruseles y opiniones (inicio y autos)
   --------------------------------------------------------------------------- */

/** "3 publicaciones", o "Próximamente" si no hay ninguna. */
const textoPublicaciones = (total) => (total ? `${total} ${total === 1 ? 'publicación' : 'publicaciones'}` : 'Próximamente');

/** Botones anterior / siguiente de un carrusel. */
function iniciarCarrusel(idCarrusel, idPista) {
    const contenedor = document.getElementById(idCarrusel);
    const pista = document.getElementById(idPista);
    const desplazar = (sentido) => pista.scrollBy({ left: sentido * pista.clientWidth * 0.9, behavior: 'smooth' });
    const actualizar = () => actualizarBotonesCarrusel(idCarrusel, idPista);
    contenedor.querySelector('.anterior').addEventListener('click', () => desplazar(-1));
    contenedor.querySelector('.siguiente').addEventListener('click', () => desplazar(1));
    pista.addEventListener('scroll', conRetardo(actualizar, 80), { passive: true });
    window.addEventListener('resize', conRetardo(actualizar, 150));
}

function actualizarBotonesCarrusel(idCarrusel, idPista) {
    const contenedor = document.getElementById(idCarrusel);
    const pista = document.getElementById(idPista);
    const maximo = pista.scrollWidth - pista.clientWidth - 4;
    contenedor.querySelector('.anterior').disabled = pista.scrollLeft <= 4;
    contenedor.querySelector('.siguiente').disabled = pista.scrollLeft >= maximo;
}

/** Tarjeta de una opinión verificada (reseña destacada). */
function crearTarjetaOpinion(resena) {
    const enlace = enlaceDetalle({ tipo: resena.tipo, id: resena.idPublicacion });
    return `
        <figure class="opinion">
            <div class="opinion-encabezado">
                <span class="nota nota-grande">${resena.puntuacion}</span>
                <span class="opinion-etiqueta">${etiquetaPuntuacion(resena.puntuacion)}</span>
            </div>
            <blockquote>
                <p class="opinion-titulo">${escaparHtml(resena.titulo)}</p>
                <p>${escaparHtml(resena.comentario)}</p>
            </blockquote>
            <figcaption>
                <span class="opinion-avatar" aria-hidden="true">${escaparHtml(resena.autor.charAt(0))}</span>
                <span><strong>${escaparHtml(resena.autor)}</strong>
                <a href="${enlace}">${escaparHtml(resena.publicacion)}, ${escaparHtml(resena.ciudad)}</a></span>
            </figcaption>
        </figure>`;
}
