/**
 * @file public/js/combos-comun.js
 * @description Tarjeta de combo (alojamiento + actividades con descuento),
 *   compartida por la página de inicio y la de combos. Se dibuja como un
 *   boleto: fotografía, itinerario por días y talón con el precio.
 */

/** Etiqueta del día del viaje: el día de llegada es el día 1. */
const diaDelViaje = (dia) => (dia === 0 ? 'Día 1' : `Día ${dia + 1}`);

/**
 * @param {object} combo respuesta de /api/combos
 * @param {{titulo?: 'h2'|'h3'}} [opciones]
 * @returns {string} HTML
 */
function tarjetaCombo(combo, { titulo = 'h3' } = {}) {
    const r = combo.referencia;
    const itinerario = [
        `<li><span class="combo-dia">${combo.actividades.some((a) => a.dia === 0) ? 'Llegada' : 'Día 1'}</span><span translate="no">${escaparHtml(combo.hotel.nombre)}</span><small>${r.noches} ${r.noches === 1 ? 'noche' : 'noches'}</small></li>`
    ].concat(combo.actividades.map((a) => `
        <li><span class="combo-dia">${diaDelViaje(a.dia)}</span><span translate="no">${escaparHtml(a.nombre)}</span><small>${escaparHtml(formatearDuracion(a.duracion))}</small></li>`));
    return `
        <article class="combo-boleto">
            <a class="combo-foto" href="combos.html?combo=${combo.id}" tabindex="-1" aria-hidden="true">
                <img src="${escaparHtml(urlMiniatura(combo.imagen || ''))}" alt="" loading="lazy">
                <span class="combo-ahorro">-${combo.descuento} %</span>
                <span class="combo-destino" translate="no">${escaparHtml(combo.ciudad)}</span>
            </a>
            <div class="combo-cuerpo">
                <${titulo} class="combo-nombre"><a href="combos.html?combo=${combo.id}" translate="no">${escaparHtml(combo.nombre)}</a></${titulo}>
                <p class="combo-lema">${escaparHtml(combo.lema)}</p>
                <ol class="combo-itinerario">${itinerario.join('')}</ol>
            </div>
            <div class="combo-talon">
                <small>${r.noches} ${r.noches === 1 ? 'noche' : 'noches'} para ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}</small>
                <s>${escaparHtml(formatearPrecio(r.normal))}</s>
                <strong>${escaparHtml(formatearPrecio(r.total))}</strong>
                <span class="combo-ahorras">Ahorras ${escaparHtml(formatearPrecio(r.ahorro))}</span>
                <a class="btn-rojo btn-bloque" href="combos.html?combo=${combo.id}" data-armar-combo="${combo.id}">Arma tu combo</a>
            </div>
        </article>`;
}
