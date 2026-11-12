/**
 * @file public/js/ruta.js
 * @description Ruta del Parador: paradas para comer en las principales
 *   carreteras del país (filtros a la izquierda) y asistencia vial con
 *   llamadas directas, grúas por provincia y enlace con la ubicación.
 *   Contenido informativo sin base de datos.
 */

const ANTOJOS = {
    chicharron: 'Chicharrón',
    empanadas: 'Empanadas y catibías',
    dulces: 'Dulces criollos',
    quesos: 'Quesos de campo',
    frutas: 'Frutas y café'
};

const SERVICIOS_PARADA = { comida: 'Comida', banos: 'Baños', combustible: 'Combustible', parqueo: 'Parqueo amplio' };

const CARRETERAS = [
    {
        id: 'duarte',
        nombre: 'Autopista Duarte',
        tramo: 'Santo Domingo, Bonao, La Vega y Santiago',
        paradas: [
            { lugar: 'Villa Altagracia', antojo: 'chicharron', titulo: 'Chicharrón de la autopista', texto: 'La primera parada clásica al salir de la capital: chicharrón de cerdo crocante con yuca o casabe, y longaniza recién frita.', servicios: ['comida', 'banos', 'combustible', 'parqueo'] },
            { lugar: 'Bonao', antojo: 'chicharron', titulo: 'Chicharrón y queso de hoja', texto: 'Paradores grandes a la orilla de la autopista con chicharrón, morcilla y queso de hoja para llevar. Buen punto para estirar las piernas a mitad de camino.', servicios: ['comida', 'banos', 'combustible', 'parqueo'] },
            { lugar: 'Kilómetro 71', antojo: null, titulo: 'Puesto de asistencia vial', texto: 'Puesto del programa de asistencia en carretera de Obras Públicas: ayuda con averías, gomas y primeros auxilios.', servicios: ['banos', 'parqueo'] },
            { lugar: 'Desvío a Jarabacoa', antojo: 'frutas', titulo: 'Frutas y café de montaña', texto: 'Puestos de frutas de temporada, café de la Cordillera y dulces de leche antes de subir a la montaña.', servicios: ['comida', 'parqueo'] }
        ]
    },
    {
        id: 'este',
        nombre: 'Autovía del Este',
        tramo: 'Santo Domingo, San Pedro de Macorís, La Romana y Punta Cana',
        paradas: [
            { lugar: 'San Pedro de Macorís', antojo: 'empanadas', titulo: 'Catibías y empanadas de yuca', texto: 'Empanadas de masa de yuca rellenas de queso o carne, fritas al momento. Pídelas con salsa de ajo.', servicios: ['comida', 'banos', 'combustible'] },
            { lugar: 'La Romana', antojo: 'empanadas', titulo: 'Empanadas de yuca y queso', texto: 'Antes de seguir a Bayahíbe o a Punta Cana, una parada rápida para empanadas de yuca con queso y jugo de chinola.', servicios: ['comida', 'banos', 'combustible', 'parqueo'] },
            { lugar: 'Higüey', antojo: 'dulces', titulo: 'Dulces de coco y de leche', texto: 'Dulcerías cerca de la Basílica con dulce de coco, de leche y de batata. Buen regalo para llevar.', servicios: ['comida', 'parqueo'] }
        ]
    },
    {
        id: 'sanchez',
        nombre: 'Carretera Sánchez',
        tramo: 'Santo Domingo, Baní, Azua, Barahona y Neyba',
        paradas: [
            { lugar: 'Baní', antojo: 'dulces', titulo: 'Dulces de Baní', texto: 'La parada dulce del sur: dulce de leche cortada, de coco tierno y de mango de Baní, en cajitas para el camino.', servicios: ['comida', 'banos', 'combustible', 'parqueo'] },
            { lugar: 'Azua', antojo: 'chicharron', titulo: 'Chivo y chicharrón del sur', texto: 'Comedores de carretera con chivo guisado y chicharrón, antes de entrar a la zona más seca del sur.', servicios: ['comida', 'banos', 'combustible'] },
            { lugar: 'Neyba', antojo: 'dulces', titulo: 'Dulces y uvas de Neyba', texto: 'En el valle del lago Enriquillo: dulces caseros, uvas de temporada y vino artesanal de la zona.', servicios: ['comida', 'parqueo'] }
        ]
    },
    {
        id: 'norte',
        nombre: 'Costa Norte',
        tramo: 'Santiago, Imbert, Puerto Plata, Sosúa y Nagua',
        paradas: [
            { lugar: 'Imbert', antojo: 'quesos', titulo: 'Queseras de montaña', texto: 'Quesos frescos y de freír de las fincas de la zona, de camino a los 27 Charcos de Damajagua.', servicios: ['comida', 'parqueo'] },
            { lugar: 'Sosúa', antojo: 'quesos', titulo: 'Quesos y embutidos de Sosúa', texto: 'Herederos de la tradición lechera del pueblo: quesos maduros, yogur y embutidos para el picnic en la playa.', servicios: ['comida', 'banos', 'combustible'] },
            { lugar: 'Nagua', antojo: 'quesos', titulo: 'Queso de hoja y pescado frito', texto: 'Queso de hoja para llevar y pescado frito con tostones frente al mar, entre Río San Juan y Samaná.', servicios: ['comida', 'banos', 'parqueo'] }
        ]
    }
];

/** Red de grúas de EJEMPLO (nombres y teléfonos ficticios, 555). */
const GRUAS = {
    'Distrito Nacional y Santo Domingo': [['Grúas Ozama 24/7', '809-555-0301', 'Remolque, cambio de goma y paso de corriente']],
    'La Altagracia (Punta Cana, Higüey)': [['Remolques del Este', '809-555-0302', 'Rescate en arena en Macao y Uvero Alto'], ['Asistencia Bávaro', '829-555-0303', 'Cambio de goma y combustible']],
    'La Romana y San Pedro de Macorís': [['Grúas Chavón', '809-555-0304', 'Remolque en la Autovía del Este']],
    'La Vega (Jarabacoa, Constanza)': [['Grúas Cordillera', '809-555-0305', 'Rescate en caminos de montaña y fango'], ['Auxilio Valle Nuevo', '829-555-0306', 'Vehículos 4x4 atascados']],
    'Santiago y Puerto Plata': [['Remolques del Cibao', '809-555-0307', 'Remolque en la Duarte y la costa norte']],
    'Samaná': [['Grúas Península', '809-555-0308', 'Caminos a Las Galeras y Playa Rincón']],
    'Barahona y Pedernales': [['Auxilio Sur Profundo', '809-555-0309', 'Remolque largo hasta Santo Domingo']],
    'Monte Cristi y Línea Noroeste': [['Grúas El Morro', '809-555-0310', 'Remolque y gomas']]
};

const filtrosRuta = { carretera: '', antojo: '' };

document.addEventListener('DOMContentLoaded', () => {
    pintarFiltros();
    pintarRutas();
    pintarGruas();
    document.getElementById('boton-ubicacion').addEventListener('click', compartirUbicacion);
});

function opcionesRadio(nombre, opciones, valor) {
    return opciones.map(([clave, texto, n]) => `
        <label><input type="radio" name="${nombre}" value="${clave}"${clave === valor ? ' checked' : ''}>
            <span>${escaparHtml(texto)}${n === undefined ? '' : `<small>${n}</small>`}</span></label>`).join('');
}

function pintarFiltros() {
    const total = CARRETERAS.reduce((s, c) => s + c.paradas.length, 0);
    const carretera = document.getElementById('filtro-carretera');
    carretera.innerHTML = opcionesRadio('carretera', [['', 'Todas', total]].concat(CARRETERAS.map((c) => [c.id, c.nombre, c.paradas.length])), '');
    carretera.addEventListener('change', (e) => { filtrosRuta.carretera = e.target.value; pintarRutas(); });
    const antojo = document.getElementById('filtro-antojo');
    antojo.innerHTML = opcionesRadio('antojo', [['', 'De todo']].concat(Object.entries(ANTOJOS)), '');
    antojo.addEventListener('change', (e) => { filtrosRuta.antojo = e.target.value; pintarRutas(); });
}

/**
 * Foto del antojo típico de cada carretera (una por carretera, sin repetir).
 * Si una carretera no tiene foto, su encabezado queda solo con texto.
 */
const FOTOS_CARRETERA = {
    duarte: { foto: 'img/ruta/chicharron.jpg', alt: 'Plato de chicharrón de cerdo con limón' },
    este: { foto: 'img/ruta/empanadas-yuca.jpg', alt: 'Empanadas de yuca con salsa' },
    sanchez: { foto: 'img/ruta/dulces-criollos.jpg', alt: 'Caja de dulces criollos dominicanos' },
    norte: { foto: 'img/ruta/quesos.jpg', alt: 'Quesos de hoja frescos' }
};

function pintarRutas() {
    let total = 0;
    const html = CARRETERAS
        .filter((c) => !filtrosRuta.carretera || c.id === filtrosRuta.carretera)
        .map((c) => {
            const paradas = c.paradas.filter((p) => !filtrosRuta.antojo || p.antojo === filtrosRuta.antojo);
            total += paradas.length;
            if (!paradas.length) return '';
            return `
                <article class="carretera">
                    <header class="${FOTOS_CARRETERA[c.id] ? 'con-foto' : ''}">
                        ${FOTOS_CARRETERA[c.id] ? `<img src="${FOTOS_CARRETERA[c.id].foto}" alt="${escaparHtml(FOTOS_CARRETERA[c.id].alt)}" loading="lazy">` : ''}
                        <div>
                            <h3 translate="no">${escaparHtml(c.nombre)}</h3>
                            <p>${escaparHtml(c.tramo)}</p>
                        </div>
                    </header>
                    <ol class="paradas">
                        ${paradas.map((p) => `
                            <li class="parada">
                                <span class="parada-lugar" translate="no">${escaparHtml(p.lugar)}</span>
                                <div class="parada-tarjeta">
                                    ${p.antojo ? `<span class="parada-antojo">${escaparHtml(ANTOJOS[p.antojo])}</span>` : '<span class="parada-antojo es-asistencia">Asistencia</span>'}
                                    <h4>${escaparHtml(p.titulo)}</h4>
                                    <p>${escaparHtml(p.texto)}</p>
                                    <ul class="parada-servicios">${p.servicios.map((s) => `<li>${escaparHtml(SERVICIOS_PARADA[s])}</li>`).join('')}</ul>
                                </div>
                            </li>`).join('')}
                    </ol>
                </article>`;
        }).join('');
    document.getElementById('lista-rutas').innerHTML = html || '<p class="estado-vacio">No hay paradas con ese antojo en esta carretera.</p>';
    document.getElementById('conteo-paradas').textContent = `${total} ${total === 1 ? 'parada' : 'paradas'}`;
}

function pintarGruas() {
    const selector = document.getElementById('provincia-grua');
    selector.innerHTML = Object.keys(GRUAS).map((p) => `<option value="${escaparHtml(p)}">${escaparHtml(p)}</option>`).join('');
    const pintar = () => {
        document.getElementById('gruas-lista').innerHTML = GRUAS[selector.value].map(([nombre, telefono, servicio]) => `
            <li>
                <span><strong translate="no">${escaparHtml(nombre)}</strong><small>${escaparHtml(servicio)}</small></span>
                <a class="btn-primario btn-chico" href="tel:${telefono.replace(/-/g, '')}">Llamar <span translate="no">${escaparHtml(telefono)}</span></a>
            </li>`).join('');
    };
    selector.addEventListener('change', pintar);
    pintar();
}

/** Copia (o comparte) un enlace del mapa con la posición actual. */
function compartirUbicacion() {
    const texto = document.getElementById('texto-ubicacion');
    if (!navigator.geolocation) {
        texto.textContent = 'Este navegador no puede leer tu ubicación.';
        return;
    }
    texto.textContent = 'Buscando tu ubicación...';
    navigator.geolocation.getCurrentPosition(async (posicion) => {
        const { latitude, longitude } = posicion.coords;
        const enlace = `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        const mensaje = `Necesito asistencia vial. Estoy aquí: ${enlace}`;
        try {
            if (navigator.share) await navigator.share({ text: mensaje });
            else await navigator.clipboard.writeText(mensaje);
            texto.textContent = 'Listo: el enlace con tu ubicación está copiado.';
        } catch (error) {
            texto.textContent = enlace;
        }
    }, () => {
        texto.textContent = 'No se pudo leer tu ubicación. Revisa el permiso del navegador.';
    }, { enableHighAccuracy: true, timeout: 10000 });
}
