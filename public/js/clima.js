/**
 * @file public/js/clima.js
 * @description Clima de los destinos (GET /api/clima, datos de Open-Meteo).
 *
 *   pintarClimaCompacto(contenedor, ciudad)  temperatura y estado actual
 *                                            (ficha del mapa de inicio y explorar).
 *   pintarClima(contenedor, ciudad)          condición actual y pronóstico de
 *                                            cuatro días (página de detalle).
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
        <p class="clima-fuente">${clima.actualizado ? 'Datos de' : 'Último dato disponible de'} <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>.</p>`;
    contenedor.hidden = false;
}
