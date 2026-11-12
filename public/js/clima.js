/**
 * @file public/js/clima.js
 * @description Clima de los destinos (GET /api/clima, datos de Open-Meteo).
 *
 *   pintarClimaCompacto(contenedor, ciudad)  temperatura y estado actual
 *                                            (ficha del mapa de inicio y explorar).
 *   pintarClima(contenedor, ciudad)          condición actual y pronóstico de
 *                                            cuatro días (página de detalle).
 *
 *   pintarResumenDestino(contenedor, ciudad) resumen del destino en Wikipedia
 *                                            (ficha del mapa de inicio).
 *
 *   La página de detalle incluye además amanecer, atardecer e índice UV,
 *   el estado del mar en destinos de costa (Open-Meteo Marine) y los próximos
 *   feriados de la República Dominicana (Nager.Date).
 *
 *   Si el servicio no responde, el contenedor queda vacío y oculto: el clima
 *   es información complementaria y nunca bloquea la página.
 */

/** Iconos de trazo simple por estado del cielo. */
const ICONOS_CLIMA = {
    despejado: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    parcial: '<path d="M8 4.5v1.8M3.6 9H5.4M4.9 5.4l1.3 1.3"/><path d="M10.8 8.4A4 4 0 0 0 5 10.5"/><path d="M7.5 19h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 7.5 19z"/>',
    nublado: '<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 18.5z"/>',
    niebla: '<path d="M7 13.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 13.5z"/><path d="M4 17h16M6 20.5h12"/>',
    lluvia: '<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
    tormenta: '<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14.5z"/><path d="M12.5 15.5l-2 3.5h3l-2 3.5"/>'
};

function iconoClima(estadoCielo, tamano = 28) {
    return `<svg class="icono-clima icono-${estadoCielo}" viewBox="0 0 24 24" width="${tamano}" height="${tamano}" aria-hidden="true" focusable="false">${ICONOS_CLIMA[estadoCielo] || ICONOS_CLIMA.nublado}</svg>`;
}

/** Consultas en curso o resueltas, por destino (se reutilizan en la misma página). */
const consultasClima = new Map();

function obtenerClima(ciudad) {
    if (!consultasClima.has(ciudad)) {
        const consulta = apiFetch(`/clima?ciudad=${encodeURIComponent(ciudad)}`).catch(() => null);
        consultasClima.set(ciudad, consulta);
    }
    return consultasClima.get(ciudad);
}

const formatoDiaClima = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Temperatura y estado actuales en una línea.
 * @param {string} [prefijo] texto previo, p. ej. "Ahora en Samaná"
 */
async function pintarClimaCompacto(contenedor, ciudad, prefijo = '') {
    if (!contenedor) return;
    contenedor.hidden = true;
    contenedor.dataset.ciudad = ciudad;
    const clima = await obtenerClima(ciudad);
    if (!clima || contenedor.dataset.ciudad !== ciudad) return;
    contenedor.innerHTML = `
        <div class="clima-compacto" title="Clima actual en ${escaparHtml(ciudad)}">
            ${prefijo ? `<span class="clima-prefijo">${escaparHtml(prefijo)}</span>` : ''}
            ${iconoClima(clima.estado, 30)}
            <span><strong>${clima.temperatura}°C</strong> ${escaparHtml(clima.descripcion)}</span>
        </div>`;
    contenedor.hidden = false;
}

/** Condición actual y pronóstico de cuatro días. */
async function pintarClima(contenedor, ciudad) {
    if (!contenedor) return;
    contenedor.hidden = true;
    const clima = await obtenerClima(ciudad);
    if (!clima) return;
    const dias = clima.pronostico.map((dia, indice) => `
        <li>
            <span class="clima-dia">${indice === 0 ? 'Hoy' : escaparHtml(formatoDiaClima.format(new Date(`${dia.fecha}T00:00:00Z`)))}</span>
            ${iconoClima(dia.estado, 26)}
            <span class="clima-rango"><strong>${dia.maxima}°</strong> ${dia.minima}°</span>
            <span class="clima-lluvia">${dia.lluvia ?? 0}% de lluvia</span>
        </li>`).join('');
    contenedor.innerHTML = `
        <div class="clima-actual">
            ${iconoClima(clima.estado, 44)}
            <div>
                <p class="clima-temperatura">${clima.temperatura}°C</p>
                <p>${escaparHtml(clima.descripcion)}. Sensación de ${clima.sensacion}°C, humedad ${clima.humedad}%, viento ${clima.viento} km/h.</p>
            </div>
        </div>
        <ul class="clima-pronostico" aria-label="Pronóstico de cuatro días">${dias}</ul>
        ${lineaSol(clima.pronostico[0])}
        <div class="clima-mar" data-mar hidden></div>
        <div class="clima-feriados" data-feriados hidden></div>
        <p class="clima-fuente">${clima.actualizado ? 'Datos de' : 'Último dato disponible de'} <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> y <a href="https://date.nager.at" target="_blank" rel="noopener">Nager.Date</a>.</p>`;
    contenedor.hidden = false;
    pintarMar(contenedor.querySelector('[data-mar]'), ciudad);
    pintarFeriados(contenedor.querySelector('[data-feriados]'));
}

/** Amanecer, atardecer e índice UV del día. */
function lineaSol(dia) {
    if (!dia || (!dia.amanecer && !dia.atardecer)) return '';
    const uv = dia.uv == null ? '' : `<li><span>Índice UV</span><strong>${dia.uv}</strong>${dia.uv >= 8 ? ' <em>muy alto, usa protector</em>' : ''}</li>`;
    return `
        <ul class="clima-sol" aria-label="Sol de hoy">
            ${dia.amanecer ? `<li><span>Amanecer</span><strong>${escaparHtml(dia.amanecer)}</strong></li>` : ''}
            ${dia.atardecer ? `<li><span>Atardecer</span><strong>${escaparHtml(dia.atardecer)}</strong></li>` : ''}
            ${uv}
        </ul>`;
}

/** Olas y temperatura del agua (solo destinos de costa). */
async function pintarMar(contenedor, ciudad) {
    if (!contenedor) return;
    const mar = await apiFetch(`/mar?ciudad=${encodeURIComponent(ciudad)}`).catch(() => null);
    if (!mar || (mar.olas == null && mar.agua == null)) return;
    contenedor.innerHTML = `
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/></svg>
        <p><strong>${escaparHtml(mar.estado || 'Estado del mar')}</strong>
        ${mar.olas != null ? ` olas de ${String(mar.olas).replace('.', LOCALE === 'en-US' ? '.' : ',')} m` : ''}${mar.olas != null && mar.agua != null ? ', ' : ''}${mar.agua != null ? `agua a ${mar.agua}°C` : ''}.</p>`;
    contenedor.hidden = false;
}

const formatoFeriado = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Próximos tres feriados nacionales. */
async function pintarFeriados(contenedor) {
    if (!contenedor) return;
    const datos = await apiFetch('/feriados').catch(() => null);
    if (!datos || !datos.feriados || !datos.feriados.length) return;
    contenedor.innerHTML = `
        <h3>Próximos feriados</h3>
        <ul>${datos.feriados.slice(0, 3).map((f) => `
            <li><time datetime="${escaparHtml(f.fecha)}">${escaparHtml(formatoFeriado.format(new Date(`${f.fecha}T00:00:00Z`)))}</time> <span>${escaparHtml(PREFERENCIAS.idioma === 'en' && f.nombreEn ? f.nombreEn : f.nombre)}</span></li>`).join('')}
        </ul>
        <p>En los feriados hay más demanda y tráfico: reserva con tiempo.</p>`;
    contenedor.hidden = false;
}

/** Resumen del destino en Wikipedia (solo en español y traducción automática). */
async function pintarResumenDestino(contenedor, ciudad) {
    if (!contenedor || PREFERENCIAS.idioma === 'en') return;
    contenedor.hidden = true;
    contenedor.dataset.ciudad = ciudad;
    const datos = await apiFetch(`/destinos/resumen?ciudad=${encodeURIComponent(ciudad)}`).catch(() => null);
    if (!datos || !datos.resumen || contenedor.dataset.ciudad !== ciudad) return;
    contenedor.innerHTML = `${escaparHtml(datos.resumen)} <a href="${escaparHtml(datos.enlace)}" target="_blank" rel="noopener">Wikipedia</a>`;
    contenedor.hidden = false;
}
