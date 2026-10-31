/**
 * @file public/js/buscador.js
 * @description Buscador de la página de inicio y de la de autos: tipo
 *   (alojamiento, actividad o auto), destino con autocompletado (sin importar
 *   tildes y con el número de publicaciones de cada destino), fechas de
 *   llegada y salida, de la actividad o de recogida y devolución con hora, y
 *   personas. Al enviar abre explorar.html con esos datos en la URL.
 *
 *   Cada página llama a iniciarBuscador() y, cuando recibe las estadísticas,
 *   asigna publicacionesPorDestino y estadisticasCargadas.
 */

/** Publicaciones por destino (GET /api/estadisticas), para el autocompletado. */
let publicacionesPorDestino = {};
let estadisticasCargadas = false;

/** Texto sin tildes y en minúsculas, para comparar búsquedas. */
const normalizar = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Tipo elegido en el buscador: pestaña marcada o campo oculto (página de autos). */
function tipoBuscado() {
    const campo = document.querySelector('#form-busqueda input[name="tipo"]:checked')
        || document.querySelector('#form-busqueda input[name="tipo"]');
    return campo ? campo.value : 'hotel';
}

/** Elemento por id, o null si la página no lo tiene. */
const campoBusqueda = (id) => document.getElementById(id);

function iniciarBuscador() {
    const formulario = document.getElementById('form-busqueda');
    const hoy = hoyIso();
    if (!formulario) return;
    ['busqueda-entrada', 'busqueda-salida', 'busqueda-fecha', 'busqueda-recogida', 'busqueda-devolucion'].forEach((id) => {
        const campo = campoBusqueda(id);
        if (!campo) return;
        campo.min = hoy;
        campo.max = sumarDiasIso(hoy, 365);
    });
    document.getElementById('busqueda-hora-recogida').innerHTML = opcionesHoraAlquiler('10:00');
    document.getElementById('busqueda-hora-devolucion').innerHTML = opcionesHoraAlquiler('10:00');

    // Campos según el tipo: estancia (hotel), día (actividad) o recogida y
    // devolución con hora (auto). data-busqueda-tipo admite varios tipos.
    formulario.querySelectorAll('input[name="tipo"]').forEach((opcion) => {
        opcion.addEventListener('change', () => {
            const tipo = tipoBuscado();
            formulario.dataset.tipo = tipo;
            formulario.querySelectorAll('[data-busqueda-tipo]').forEach((campo) => {
                campo.hidden = !campo.dataset.busquedaTipo.split(' ').includes(tipo);
            });
            document.getElementById('etiqueta-destino').textContent = tipo === 'vehiculo' ? 'Recoger en' : 'Destino';
            document.getElementById('busqueda-destino').placeholder = tipo === 'vehiculo' ? 'Ciudad o aeropuerto' : '¿A dónde vas?';
            actualizarResumenBusqueda();
        });
    });

    const recogida = document.getElementById('busqueda-recogida');
    const devolucion = document.getElementById('busqueda-devolucion');
    recogida.addEventListener('change', () => {
        if (!recogida.value) return;
        devolucion.min = recogida.value;
        if (!devolucion.value || devolucion.value <= recogida.value) devolucion.value = sumarDiasIso(recogida.value, 3);
        actualizarResumenBusqueda();
    });
    ['busqueda-devolucion', 'busqueda-hora-recogida', 'busqueda-hora-devolucion']
        .forEach((id) => document.getElementById(id).addEventListener('change', actualizarResumenBusqueda));

    const entrada = campoBusqueda('busqueda-entrada');
    const salida = campoBusqueda('busqueda-salida');
    if (entrada && salida) {
        entrada.addEventListener('change', () => {
            if (!entrada.value) return;
            salida.min = sumarDiasIso(entrada.value, 1);
            if (!salida.value || salida.value <= entrada.value) salida.value = sumarDiasIso(entrada.value, 2);
            actualizarResumenBusqueda();
        });
        salida.addEventListener('change', actualizarResumenBusqueda);
    }
    actualizarResumenBusqueda();

    iniciarAutocompletado();
    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        window.location.href = urlBusqueda();
    });
}

/**
 * Días de alquiler con la misma regla del servidor: bloques de 24 horas
 * desde la recogida con una hora de cortesía.
 */
function diasAlquiler(recogida, horaRecogida, devolucion, horaDevolucion) {
    const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    const minutos = Math.round((Date.parse(devolucion) - Date.parse(recogida)) / 60000) + aMin(horaDevolucion) - aMin(horaRecogida);
    return minutos < 120 ? 0 : Math.max(1, Math.ceil((minutos - 60) / 1440));
}

/** Noches de la estancia ("3 noches") o días de alquiler debajo del buscador. */
function actualizarResumenBusqueda() {
    const resumen = document.getElementById('busqueda-resumen');
    if (tipoBuscado() === 'vehiculo') {
        const recogida = document.getElementById('busqueda-recogida').value;
        const devolucion = document.getElementById('busqueda-devolucion').value;
        const horaR = document.getElementById('busqueda-hora-recogida').value;
        const horaD = document.getElementById('busqueda-hora-devolucion').value;
        const dias = recogida && devolucion ? diasAlquiler(recogida, horaR, devolucion, horaD) : 0;
        resumen.textContent = dias
            ? `${dias} ${dias === 1 ? 'día' : 'días'} de alquiler: del ${formatearFecha(recogida)} ${formatearHora(horaR)} al ${formatearFecha(devolucion)} ${formatearHora(horaD)}`
            : 'Recoge tu auto entre las 6:00 a. m. y las 10:00 p. m. Cancelación gratuita hasta un día antes.';
        return;
    }
    if (tipoBuscado() !== 'hotel') {
        resumen.textContent = '';
        return;
    }
    const entrada = campoBusqueda('busqueda-entrada').value;
    const salida = campoBusqueda('busqueda-salida').value;
    if (!entrada || !salida || salida <= entrada) {
        resumen.textContent = '';
        return;
    }
    const noches = Math.round((Date.parse(salida) - Date.parse(entrada)) / 86400000);
    resumen.textContent = `${noches} ${noches === 1 ? 'noche' : 'noches'}: del ${formatearFecha(entrada)} al ${formatearFecha(salida)}`;
}

/**
 * URL de explorar.html con los datos del buscador. El destino escrito se
 * envía como ciudad si coincide con un destino; si no, como texto libre.
 */
function urlBusqueda() {
    const tipo = tipoBuscado();
    const parametros = new URLSearchParams({ tipo });
    const texto = document.getElementById('busqueda-destino').value.trim();
    const destino = CATALOGOS.destinos.find((d) => normalizar(d) === normalizar(texto));
    if (destino) parametros.set('ciudad', destino);
    else if (texto) parametros.set('q', texto);

    if (tipo === 'vehiculo') {
        const recogida = document.getElementById('busqueda-recogida').value;
        const devolucion = document.getElementById('busqueda-devolucion').value;
        if (recogida && devolucion && devolucion >= recogida) {
            parametros.set('recogida', recogida);
            parametros.set('horaRecogida', document.getElementById('busqueda-hora-recogida').value);
            parametros.set('devolucion', devolucion);
            parametros.set('horaDevolucion', document.getElementById('busqueda-hora-devolucion').value);
        }
        return `explorar.html?${parametros}`;
    }
    const personas = parseInt((campoBusqueda('busqueda-personas') || { value: '' }).value, 10);
    if (personas > 0) parametros.set('personas', personas);
    if (tipo === 'hotel') {
        const entrada = document.getElementById('busqueda-entrada').value;
        const salida = document.getElementById('busqueda-salida').value;
        if (entrada && salida && salida > entrada) {
            parametros.set('entrada', entrada);
            parametros.set('salida', salida);
        }
    } else {
        const fecha = document.getElementById('busqueda-fecha').value;
        if (fecha) parametros.set('fecha', fecha);
    }
    return `explorar.html?${parametros}`;
}

/**
 * Autocompletado del destino (patrón combobox de WAI-ARIA): sugiere los
 * destinos que coinciden, con su cantidad de publicaciones, y una búsqueda
 * por texto libre. Flechas para moverse, Enter para elegir, Escape para cerrar.
 */
function iniciarAutocompletado() {
    const campo = document.getElementById('busqueda-destino');
    const lista = document.getElementById('sugerencias-destino');
    let opciones = [];
    let activa = -1;

    const cerrar = () => {
        lista.hidden = true;
        campo.setAttribute('aria-expanded', 'false');
        campo.removeAttribute('aria-activedescendant');
        activa = -1;
    };
    const marcar = (indice) => {
        activa = indice;
        lista.querySelectorAll('[role="option"]').forEach((opcion, i) => {
            opcion.classList.toggle('activa', i === indice);
            opcion.setAttribute('aria-selected', String(i === indice));
        });
        if (indice >= 0) campo.setAttribute('aria-activedescendant', `sugerencia-${indice}`);
    };
    const elegir = (indice) => {
        const opcion = opciones[indice];
        if (!opcion) return;
        campo.value = opcion.valor;
        cerrar();
    };
    const abrir = () => {
        const texto = normalizar(campo.value);
        const destinos = CATALOGOS.destinos
            .filter((d) => !texto || normalizar(d).includes(texto))
            .sort((a, b) => (publicacionesPorDestino[b] || 0) - (publicacionesPorDestino[a] || 0))
            .slice(0, 7)
            .map((d) => ({ valor: d, titulo: d, detalle: estadisticasCargadas ? textoPublicaciones(publicacionesPorDestino[d] || 0) : 'República Dominicana' }));
        opciones = destinos;
        if (texto && !CATALOGOS.destinos.some((d) => normalizar(d) === texto)) {
            opciones.push({ valor: campo.value.trim(), titulo: `Buscar "${campo.value.trim()}"`, detalle: 'En nombres y descripciones', libre: true });
        }
        if (!opciones.length) return cerrar();
        lista.innerHTML = opciones.map((o, i) => `
            <li id="sugerencia-${i}" role="option" aria-selected="false" class="${o.libre ? 'es-libre' : ''}" data-indice="${i}">
                <span class="sugerencia-icono" aria-hidden="true"></span>
                <span><strong>${escaparHtml(o.titulo)}</strong><small>${escaparHtml(o.detalle)}</small></span>
            </li>`).join('');
        lista.hidden = false;
        campo.setAttribute('aria-expanded', 'true');
        marcar(-1);
    };

    campo.addEventListener('focus', abrir);
    campo.addEventListener('input', abrir);
    campo.addEventListener('keydown', (evento) => {
        if (lista.hidden && evento.key === 'ArrowDown') { abrir(); return; }
        if (lista.hidden) return;
        if (evento.key === 'ArrowDown') { evento.preventDefault(); marcar((activa + 1) % opciones.length); }
        else if (evento.key === 'ArrowUp') { evento.preventDefault(); marcar(activa <= 0 ? opciones.length - 1 : activa - 1); }
        else if (evento.key === 'Enter' && activa >= 0) { evento.preventDefault(); elegir(activa); }
        else if (evento.key === 'Escape') cerrar();
    });
    // mousedown (antes del blur del campo) para que el clic elija la opción.
    lista.addEventListener('mousedown', (evento) => {
        const opcion = evento.target.closest('[data-indice]');
        if (!opcion) return;
        evento.preventDefault();
        elegir(Number(opcion.dataset.indice));
    });
    campo.addEventListener('blur', () => setTimeout(cerrar, 100));
}
