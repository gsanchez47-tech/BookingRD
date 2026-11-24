/**
 * @file public/js/preferencias.js
 * @description Idioma y moneda (RD$, US$ o €) elegidos por el visitante,
 *   guardados en este navegador.
 *
 *   Moneda
 *     Los precios públicos (tarjetas, filtros, detalle) se convierten con las
 *     tasas de GET /api/monedas, guardadas en el navegador durante seis horas.
 *     Los pagos se hacen en pesos dominicanos o en dólares (se elige en la
 *     ventana de pago); el euro y las demás monedas son solo una referencia.
 *     Los paneles y Mis reservas muestran los importes en RD$.
 *
 *   Idioma
 *     El sitio está escrito en español. Con inglés se carga idioma-en.js
 *     (catálogo de traducciones) y se traducen los textos de la página y los
 *     atributos visibles (placeholder, aria-label, title, alt), también los
 *     que se agregan después (MutationObserver). Los textos escritos por
 *     usuarios y empresas (nombres, descripciones, reseñas) no se traducen:
 *     se marcan con translate="no".
 *     Cualquier otro idioma (IDIOMAS_AUTOMATICOS en comun.js) usa la
 *     traducción automática de Google Translate, que se carga solo al
 *     elegirlo, respeta translate="no" y traduce también el contenido que se
 *     agrega después. Requiere conexión a internet; si no carga, se avisa y
 *     se vuelve al español.
 *
 *   El idioma predeterminado es siempre el español. Al cambiar una
 *   preferencia la página se vuelve a cargar en la misma posición.
 */

const CLAVE_TASAS = 'bookingrd_tasas';
const CLAVE_POSICION = 'bookingrd_posicion';
const VIGENCIA_TASAS_MS = 6 * 60 * 60 * 1000;
const TASAS_RESPALDO = { USD: 61, EUR: 71 };

const NOMBRES_MONEDA = { DOP: 'Peso dominicano', USD: 'Dólar estadounidense', EUR: 'Euro' };

/* ----------------------------------------------------------------------------
   Tasas de cambio
   ------------------------------------------------------------------------- */

function leerTasas() {
    try {
        const guardadas = JSON.parse(localStorage.getItem(CLAVE_TASAS));
        if (guardadas && guardadas.tasas && guardadas.tasas.USD && guardadas.tasas.EUR) return guardadas;
    } catch (_) {
        /* sin almacenamiento */
    }
    return null;
}

/** Pide las tasas al servidor y las guarda. @returns {Promise<object|null>} */
async function actualizarTasas() {
    try {
        const datos = await apiFetch('/monedas');
        const registro = { tasas: datos.tasas, fecha: datos.fecha, actualizado: datos.actualizado, momento: Date.now() };
        localStorage.setItem(CLAVE_TASAS, JSON.stringify(registro));
        return registro;
    } catch (_) {
        return null;
    }
}

const tasasGuardadas = leerTasas();
const TASAS = (tasasGuardadas && tasasGuardadas.tasas) || TASAS_RESPALDO;

if (PREFERENCIAS.moneda !== 'DOP') {
    // Precio convertido; la conversión es aproximada y se indica en el pago.
    formatearPrecio = (pesos) => formatearMonto(pesos / TASAS[PREFERENCIAS.moneda], PREFERENCIAS.moneda);
    if (!tasasGuardadas || Date.now() - tasasGuardadas.momento > VIGENCIA_TASAS_MS) actualizarTasas();
}

/**
 * Nota para los importes a pagar cuando la moneda elegida no es el peso.
 * @returns {string} HTML vacío si la moneda es RD$.
 */
function notaMonedaPago(pesos) {
    if (PREFERENCIAS.moneda === 'DOP') return '';
    return `<small class="nota-moneda">Importe aproximado. Se paga en pesos o en dólares: ${formatoMoneda.format(pesos)}</small>`;
}

/* ----------------------------------------------------------------------------
   Selector del encabezado
   ------------------------------------------------------------------------- */

function guardarPreferencias(cambios) {
    // Al dejar la traducción automática se borra su cookie para que no siga traduciendo.
    if (cambios.idioma && !Object.hasOwn(IDIOMAS_AUTOMATICOS, cambios.idioma)) borrarCookieTraductor();
    try {
        localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(Object.assign({}, PREFERENCIAS, cambios)));
        sessionStorage.setItem(CLAVE_POSICION, JSON.stringify({ ruta: location.pathname + location.search, y: window.scrollY }));
    } catch (_) {
        /* sin almacenamiento la preferencia no se conserva */
    }
}

/** Restaura la posición de la página después de cambiar una preferencia. */
function restaurarPosicion() {
    try {
        const posicion = JSON.parse(sessionStorage.getItem(CLAVE_POSICION));
        sessionStorage.removeItem(CLAVE_POSICION);
        if (posicion && posicion.ruta === location.pathname + location.search) {
            window.addEventListener('load', () => window.scrollTo(0, posicion.y), { once: true });
        }
    } catch (_) {
        /* nada que restaurar */
    }
}

/** Idiomas automáticos que se muestran primero (visitantes más frecuentes de la RD). */
const IDIOMAS_FRECUENTES = ['fr', 'pt', 'de', 'it', 'ht', 'zh-CN', 'ru'];

function iniciarSelectorPreferencias() {
    const contenedor = document.querySelector('[data-preferencias]');
    if (!contenedor) return;
    const etiquetaIdioma = PREFERENCIAS.idioma.slice(0, 2).toUpperCase();
    const nombreIdioma = PREFERENCIAS.idioma === 'en' ? 'English' : PREFERENCIAS.idioma === 'es' ? 'Español' : IDIOMAS_AUTOMATICOS[PREFERENCIAS.idioma];
    const automatico = Object.hasOwn(IDIOMAS_AUTOMATICOS, PREFERENCIAS.idioma);
    contenedor.innerHTML = `
        <button type="button" class="preferencias-boton" aria-expanded="false" aria-controls="panel-preferencias"
                aria-label="Idioma y moneda: ${nombreIdioma}, ${SIMBOLOS_MONEDA[PREFERENCIAS.moneda]}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>
            <span translate="no">${etiquetaIdioma} / ${SIMBOLOS_MONEDA[PREFERENCIAS.moneda]}</span>
        </button>
        <div class="preferencias-panel" id="panel-preferencias" hidden>
            <fieldset>
                <legend>Idioma</legend>
                <div class="preferencias-principales">
                    <button type="button" class="preferencias-opcion preferencias-principal" data-idioma="es" aria-pressed="${PREFERENCIAS.idioma === 'es'}" translate="no">
                        <span>Español</span><small>ES</small>
                    </button>
                    <button type="button" class="preferencias-opcion preferencias-principal" data-idioma="en" aria-pressed="${PREFERENCIAS.idioma === 'en'}" translate="no">
                        <span>English</span><small>EN</small>
                    </button>
                </div>
                <details class="preferencias-otro${automatico ? ' activo' : ''}"${automatico ? ' open' : ''}>
                    <summary>Más idiomas <small>traducción automática</small></summary>
                    <select data-idioma-automatico translate="no" aria-label="Otro idioma (traducción automática)">
                        <option value="">${automatico ? '' : 'Elegir idioma...'}</option>
                        <optgroup label="${PREFERENCIAS.idioma === 'en' ? 'Most used' : 'Más usados'}">
                            ${IDIOMAS_FRECUENTES.map((codigo) => `<option value="${codigo}"${codigo === PREFERENCIAS.idioma ? ' selected' : ''}>${IDIOMAS_AUTOMATICOS[codigo]}</option>`).join('')}
                        </optgroup>
                        <optgroup label="${PREFERENCIAS.idioma === 'en' ? 'All' : 'Todos'}">
                            ${Object.entries(IDIOMAS_AUTOMATICOS)
                                .filter(([codigo]) => !IDIOMAS_FRECUENTES.includes(codigo))
                                .sort((a, b) => a[1].localeCompare(b[1]))
                                .map(([codigo, nombre]) => `<option value="${codigo}"${codigo === PREFERENCIAS.idioma ? ' selected' : ''}>${nombre}</option>`).join('')}
                        </optgroup>
                    </select>
                </details>
            </fieldset>
            <fieldset>
                <legend>Moneda de los precios</legend>
                ${Object.keys(SIMBOLOS_MONEDA).map((moneda) => `
                    <button type="button" class="preferencias-opcion" data-moneda="${moneda}" aria-pressed="${PREFERENCIAS.moneda === moneda}">
                        <span>${NOMBRES_MONEDA[moneda]}</span><small translate="no">${SIMBOLOS_MONEDA[moneda]}</small>
                    </button>`).join('')}
            </fieldset>
            <p class="preferencias-nota">Los pagos se realizan en pesos dominicanos o en dólares. El euro es una referencia aproximada.</p>
        </div>`;

    const boton = contenedor.querySelector('.preferencias-boton');
    const panel = contenedor.querySelector('.preferencias-panel');
    const cambiar = (abierto) => {
        panel.hidden = !abierto;
        boton.setAttribute('aria-expanded', String(abierto));
    };
    boton.addEventListener('click', () => cambiar(panel.hidden));
    document.addEventListener('click', (evento) => {
        if (!contenedor.contains(evento.target)) cambiar(false);
    });
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && !panel.hidden) {
            cambiar(false);
            boton.focus();
        }
    });

    panel.querySelector('[data-idioma-automatico]').addEventListener('change', (evento) => {
        const codigo = evento.target.value;
        if (!codigo || codigo === PREFERENCIAS.idioma) return;
        guardarPreferencias({ idioma: codigo });
        location.reload();
    });

    panel.addEventListener('click', async (evento) => {
        const opcion = evento.target.closest('.preferencias-opcion');
        if (!opcion) return;
        if (opcion.dataset.idioma && opcion.dataset.idioma !== PREFERENCIAS.idioma) {
            guardarPreferencias({ idioma: opcion.dataset.idioma });
            location.reload();
        }
        if (opcion.dataset.moneda && opcion.dataset.moneda !== PREFERENCIAS.moneda) {
            opcion.disabled = true;
            if (opcion.dataset.moneda !== 'DOP') await actualizarTasas();
            guardarPreferencias({ moneda: opcion.dataset.moneda });
            location.reload();
        }
    });
}

/* ----------------------------------------------------------------------------
   Traducción al inglés
   ------------------------------------------------------------------------- */

const ATRIBUTOS_TRADUCIBLES = ['placeholder', 'aria-label', 'title', 'alt', 'data-ayuda', 'data-titulo'];

/** Valores ya traducidos por nodo, para no volver a procesar el resultado. */
const traducidos = new WeakMap();

/** Espacios internos reducidos a uno, para buscar en el catálogo. */
const normalizarEspacios = (texto) => texto.replace(/\s+/g, ' ').trim();

/** Traducción exacta del catálogo o mediante un patrón. @returns {string|null} */
function traduccionExacta(texto) {
    if (typeof CATALOGO_EN === 'undefined') return null;
    if (Object.hasOwn(CATALOGO_EN, texto)) return CATALOGO_EN[texto];
    for (const [patron, reemplazo] of PATRONES_EN) {
        const coincidencia = texto.match(patron);
        if (!coincidencia) continue;
        const resultado = typeof reemplazo === 'function' ? reemplazo(...coincidencia) : texto.replace(patron, reemplazo);
        if (resultado !== null && resultado !== undefined) return resultado;
    }
    return null;
}

/** Montos, porcentajes y cifras sueltas: no requieren traducción. */
const SOLO_CIFRAS = /^[\s\-+~]*((RD|US)\$|€)?[\d.,\s]*[KM%+]?$/;

/**
 * Traduce textos compuestos: primero intenta por segmentos (separados por
 * ", ", ": " o ". ") y después aplica las sustituciones parciales.
 * @returns {string|null}
 */
function traduccionCompuesta(texto) {
    if (typeof REEMPLAZOS_EN === 'undefined') return null;
    const separador = /(, |: |\. )/;
    let base = texto;
    if (separador.test(texto)) {
        const partes = texto.split(separador);
        let cambio = false;
        const traducidas = partes.map((parte, i) => {
            if (i % 2 === 1 || !parte) return parte;
            const t = traduccionExacta(parte);
            if (t !== null) { cambio = true; return t; }
            return parte;
        });
        if (cambio) base = traducidas.join('');
    }
    // Los segmentos que no tenían traducción exacta pasan por las sustituciones parciales.
    let resultado = base;
    for (const [patron, reemplazo] of REEMPLAZOS_EN) resultado = resultado.replace(patron, reemplazo);
    return resultado !== texto ? resultado : null;
}

/** Traduce un texto conservando los espacios de los extremos. */
function traducirTexto(original) {
    const limpio = normalizarEspacios(original);
    if (!limpio || !/[a-záéíóúñ]/i.test(limpio) || SOLO_CIFRAS.test(limpio)) return null;
    const traduccion = traduccionExacta(limpio) ?? traduccionCompuesta(limpio);
    if (traduccion === null) {
        if (window.__RECOLECTAR_I18N__) window.__RECOLECTAR_I18N__.add(limpio);
        return null;
    }
    const inicio = original.match(/^\s*/)[0];
    const fin = original.match(/\s*$/)[0];
    return `${inicio}${traduccion}${fin}`;
}

/** El nodo está dentro de contenido que no se traduce. */
function esExcluido(elemento) {
    return Boolean(elemento && elemento.closest('script, style, code, [translate="no"], [contenteditable="true"]'));
}

function traducirNodoTexto(nodo) {
    if (traducidos.get(nodo) === nodo.nodeValue) return;
    if (esExcluido(nodo.parentElement)) return;
    const traduccion = traducirTexto(nodo.nodeValue);
    if (traduccion !== null && traduccion !== nodo.nodeValue) nodo.nodeValue = traduccion;
    traducidos.set(nodo, nodo.nodeValue);
}

function traducirAtributos(elemento) {
    // Los atributos se traducen también dentro de [translate="no"] salvo en textos de usuarios.
    if (elemento.closest('script, style')) return;
    for (const atributo of ATRIBUTOS_TRADUCIBLES) {
        const valor = elemento.getAttribute(atributo);
        if (!valor) continue;
        const clave = `${atributo}:${valor}`;
        if (elemento.dataset.i18nAtributos && elemento.dataset.i18nAtributos.split('|').includes(clave)) continue;
        const traduccion = traducirTexto(valor);
        if (traduccion !== null) {
            elemento.setAttribute(atributo, traduccion);
            const marcas = (elemento.dataset.i18nAtributos || '').split('|').filter(Boolean);
            marcas.push(`${atributo}:${traduccion}`);
            elemento.dataset.i18nAtributos = marcas.slice(-6).join('|');
        }
    }
}

function traducirArbol(raiz) {
    if (raiz.nodeType === Node.TEXT_NODE) {
        traducirNodoTexto(raiz);
        return;
    }
    if (raiz.nodeType !== Node.ELEMENT_NODE) return;
    traducirAtributos(raiz);
    raiz.querySelectorAll('*').forEach(traducirAtributos);
    const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    let nodo;
    while ((nodo = recorrido.nextNode())) traducirNodoTexto(nodo);
}

function iniciarTraduccion() {
    document.documentElement.lang = 'en';
    const finalizar = () => document.documentElement.classList.remove('idioma-cargando');
    const seguridad = setTimeout(finalizar, 1500);

    const script = document.createElement('script');
    script.src = 'js/idioma-en.js';
    script.onload = () => {
        const aplicar = () => {
            const titulo = traducirTexto(document.title);
            if (titulo) document.title = titulo;
            traducirArbol(document.body);
            new MutationObserver((cambios) => {
                for (const cambio of cambios) {
                    if (cambio.type === 'characterData') traducirNodoTexto(cambio.target);
                    else if (cambio.type === 'attributes') traducirAtributos(cambio.target);
                    else cambio.addedNodes.forEach(traducirArbol);
                }
            }).observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ATRIBUTOS_TRADUCIBLES
            });
            clearTimeout(seguridad);
            finalizar();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar);
        else aplicar();
    };
    script.onerror = finalizar;
    document.head.appendChild(script);
}

/* ----------------------------------------------------------------------------
   Traducción automática (cualquier otro idioma)
   ------------------------------------------------------------------------- */

const URL_TRADUCTOR = 'https://translate.google.com/translate_a/element.js?cb=iniciarTraductorBookingRD';

function borrarCookieTraductor() {
    const vencida = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = vencida;
    document.cookie = `${vencida}; domain=${location.hostname}`;
    document.cookie = `${vencida}; domain=.${location.hostname}`;
}

/** Vuelve al español cuando el traductor no está disponible (sin internet, bloqueado...). */
function traductorNoDisponible() {
    borrarCookieTraductor();
    document.documentElement.lang = 'es';
    document.documentElement.classList.remove('traduccion-automatica');
    const avisar = () => {
        if (typeof mostrarAviso === 'function') {
            mostrarAviso('No se pudo cargar la traducción automática (requiere internet). La página se muestra en español; también puedes usar el traductor de tu navegador.', 'error', 9000);
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avisar);
    else avisar();
}

function iniciarTraduccionAutomatica(codigo) {
    document.documentElement.lang = codigo;
    document.documentElement.classList.add('traduccion-automatica');
    // El traductor lee el idioma de destino de esta cookie y traduce al cargar.
    document.cookie = `googtrans=/es/${codigo}; path=/; SameSite=Lax`;
    window.iniciarTraductorBookingRD = () => {
        try {
            const contenedor = document.createElement('div');
            contenedor.id = 'traductor-google';
            contenedor.hidden = true;
            document.body.appendChild(contenedor);
            new window.google.translate.TranslateElement({ pageLanguage: 'es', autoDisplay: false }, 'traductor-google');
        } catch (_) {
            traductorNoDisponible();
        }
    };
    const script = document.createElement('script');
    script.src = URL_TRADUCTOR;
    script.async = true;
    script.onerror = traductorNoDisponible;
    const cargar = () => document.body.appendChild(script);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargar);
    else cargar();
    setTimeout(() => {
        if (!(window.google && window.google.translate)) traductorNoDisponible();
    }, 12000);
}

/* ----------------------------------------------------------------------------
   Inicio
   ------------------------------------------------------------------------- */

if (Object.hasOwn(IDIOMAS_AUTOMATICOS, PREFERENCIAS.idioma)) {
    iniciarTraduccionAutomatica(PREFERENCIAS.idioma);
} else if (PREFERENCIAS.idioma === 'en') {
    // Oculta la página hasta traducirla para no mostrar primero el español.
    document.documentElement.classList.add('idioma-cargando');
    iniciarTraduccion();
}
restaurarPosicion();
document.addEventListener('DOMContentLoaded', iniciarSelectorPreferencias);
