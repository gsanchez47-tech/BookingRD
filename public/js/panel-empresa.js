/**
 * @file public/js/panel-empresa.js
 * @description Panel de empresa (panel-empresa.html).
 *
 *   - Perfil e indicadores:    GET    /api/empresa/perfil
 *   - Publicaciones propias:   GET    /api/empresa/publicaciones?tipo=
 *   - Detalle para editar:     GET    /api/empresa/publicaciones/:tipo/:id
 *   - Crear / actualizar:      POST   /api/empresa/publicaciones
 *                              PUT    /api/empresa/publicaciones/:tipo/:id
 *   - Publicar u ocultar:      PATCH  /api/empresa/publicaciones/:tipo/:id/estado
 *   - Eliminar:                DELETE /api/empresa/publicaciones/:tipo/:id
 *   - Fotografía:              POST   /api/empresa/imagenes
 *   - Reservas recibidas:      GET    /api/empresa/reservas (también alimenta el resumen)
 *   - Perfil público:          PUT    /api/empresa/perfil
 *   - Reseñas:                 GET    /api/empresa/resenas
 *                              PUT    /api/empresa/resenas/:id/respuesta
 *
 * Los tipos de publicación disponibles dependen del servicio registrado por
 * la empresa (alojamiento, actividades, mixto o alquiler de vehículos).
 */

const LADO_MAXIMO_IMAGEN = 1600;        // px del lado mayor tras reducir
const CALIDAD_JPEG = 0.85;
const TIPOS_PERMITIDOS = {
    alojamiento: ['hotel'],
    actividades: ['actividad'],
    mixto: ['hotel', 'actividad'],
    vehiculos: ['vehiculo']
};

const estado = {
    empresa: null,
    tiposPermitidos: ['hotel'],
    tipoListado: 'hotel',
    publicaciones: [],
    edicion: null,          // { tipo, id } en edición, o null al crear
    idImagen: null,         // fotografía subida en el formulario abierto
    subiendoImagen: false,
    porEliminar: null,
    reservas: [],
    resenas: [],
    valoracion: null,       // { promedio, total, sinRespuesta } de GET /api/empresa/perfil
    filtroResenas: 'todas'
};

document.addEventListener('DOMContentLoaded', () => {
    if (!exigirSesion('empresa')) return;
    llenarCatalogosFormulario();
    iniciarPestanas();
    iniciarListado();
    iniciarFormulario();
    iniciarFormularioPerfil();
    iniciarReservas();
    iniciarResenas();
    cargarPerfil();
});

/* ----------------------------------------------------------------------------
   PERFIL E INDICADORES
   ---------------------------------------------------------------------------- */

async function cargarPerfil() {
    let datos;
    try {
        datos = await apiFetch('/empresa/perfil');
    } catch (error) {
        document.getElementById('lista-publicaciones').innerHTML = crearEstado({
            titulo: 'No se pudo cargar el panel',
            texto: error.message,
            accion: '<button type="button" class="btn-outline" onclick="location.reload()">Reintentar</button>',
            esError: true
        });
        return;
    }
    estado.empresa = datos.empresa;
    estado.tiposPermitidos = TIPOS_PERMITIDOS[datos.empresa.tipoServicio] || ['hotel'];
    estado.tipoListado = estado.tiposPermitidos[0];

    document.getElementById('panel-empresa-nombre').textContent = datos.empresa.nombreComercial;
    document.getElementById('panel-servicio').textContent = NOMBRES_SERVICIO[datos.empresa.tipoServicio] || 'Panel de empresa';
    estado.valoracion = datos.resumen.resenas || null;
    pintarIndicadores(datos.resumen);
    pintarPerfil(datos.empresa);
    prepararSelectorTipo();
    cargarPublicaciones();
    cargarReservas();
    cargarResenas();
}

function pintarIndicadores(resumen) {
    animarNumero(document.getElementById('cifra-publicaciones'), resumen.hoteles + resumen.actividades + (resumen.vehiculos || 0));
    animarNumero(document.getElementById('cifra-proximas'), resumen.proximas);
    animarNumero(document.getElementById('cifra-ingresos'), resumen.ingresos, (n) => formatoMoneda.format(n));
}

async function refrescarIndicadores() {
    try {
        const datos = await apiFetch('/empresa/perfil');
        pintarIndicadores(datos.resumen);
    } catch (_) {
        /* los indicadores se actualizan en la siguiente carga */
    }
}

const NOMBRES_SERVICIO = { alojamiento: 'Alojamiento', actividades: 'Actividades y tours', mixto: 'Alojamiento y actividades', vehiculos: 'Alquiler de vehículos' };

/** Datos registrados (solo lectura) y formulario de información pública. */
function pintarPerfil(empresa) {
    const filas = [
        ['Razón social', empresa.razonSocial],
        ['RNC', empresa.rnc],
        ['Tipo de servicio', NOMBRES_SERVICIO[empresa.tipoServicio]],
        ['Correo de acceso', empresa.correo],
        ['Representante', [empresa.representante, empresa.cargo].filter(Boolean).join(', ')],
        ['Categorías de actividad', empresa.categoriasActividad.map((c) => (CATALOGOS.categorias[c] ? CATALOGOS.categorias[c].nombre : c)).join(', ')]
    ].filter(([, valor]) => valor);
    document.getElementById('datos-perfil').innerHTML = filas
        .map(([titulo, valor]) => `<div><dt>${escaparHtml(titulo)}</dt><dd>${escaparHtml(valor)}</dd></div>`)
        .join('');

    const asignar = (id, valor) => { document.getElementById(id).value = valor || ''; };
    asignar('perfil-nombre', empresa.nombreComercial);
    asignar('perfil-telefono', empresa.telefono);
    asignar('perfil-licencia', empresa.licenciaMitur);
    asignar('perfil-provincia', empresa.provincia);
    asignar('perfil-ciudad', empresa.ciudad);
    asignar('perfil-direccion', empresa.direccion);
    asignar('perfil-sitio', empresa.sitioWeb);
    asignar('perfil-descripcion', empresa.descripcion);
}

function iniciarFormularioPerfil() {
    const formulario = document.getElementById('form-perfil');
    retirarMarcasAlEditar(formulario);
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const mensaje = document.getElementById('perfil-error');
        const boton = document.getElementById('boton-perfil');
        mensaje.classList.remove('visible');
        formulario.querySelectorAll('.invalido').forEach((campo) => campo.classList.remove('invalido'));
        const valor = (id) => document.getElementById(id).value.trim();
        botonCargando(boton, 'Guardando...');
        try {
            const respuesta = await apiFetch('/empresa/perfil', {
                method: 'PUT',
                body: {
                    nombreComercial: valor('perfil-nombre'),
                    telefono: valor('perfil-telefono'),
                    licenciaMitur: valor('perfil-licencia'),
                    provincia: valor('perfil-provincia'),
                    ciudad: valor('perfil-ciudad'),
                    direccion: valor('perfil-direccion'),
                    sitioWeb: valor('perfil-sitio'),
                    descripcion: valor('perfil-descripcion')
                }
            });
            estado.empresa = respuesta.empresa;
            pintarPerfil(respuesta.empresa);
            document.getElementById('panel-empresa-nombre').textContent = respuesta.empresa.nombreComercial;
            const usuario = obtenerUsuario();
            if (usuario) actualizarUsuarioSesion(Object.assign(usuario, { nombreEmpresa: respuesta.empresa.nombreComercial }));
            mostrarAviso('Perfil actualizado. Los viajeros ya ven los nuevos datos.', 'exito');
        } catch (error) {
            mensaje.textContent = error.message;
            mensaje.classList.add('visible');
            if (error.campo) marcarCampo(error.campo);
        } finally {
            botonNormal(boton, 'Guardar cambios');
        }
    });
}

/* ----------------------------------------------------------------------------
   PESTAÑAS
   ---------------------------------------------------------------------------- */

function iniciarPestanas() {
    document.querySelectorAll('.pestana').forEach((pestana) => {
        pestana.addEventListener('click', () => {
            document.querySelectorAll('.pestana').forEach((otra) => {
                const activa = otra === pestana;
                otra.classList.toggle('activo', activa);
                otra.setAttribute('aria-selected', String(activa));
            });
            document.querySelectorAll('.panel-seccion').forEach((seccion) => {
                seccion.hidden = seccion.id !== `seccion-${pestana.dataset.seccion}`;
            });
        });
    });
}

/* ----------------------------------------------------------------------------
   LISTADO DE PUBLICACIONES
   ---------------------------------------------------------------------------- */

function prepararSelectorTipo() {
    const grupo = document.getElementById('filtros-tipo-panel');
    grupo.hidden = estado.tiposPermitidos.length < 2;
    grupo.querySelectorAll('.tipo-boton').forEach((boton) => {
        boton.hidden = !estado.tiposPermitidos.includes(boton.dataset.tipo);
        boton.classList.toggle('activo', boton.dataset.tipo === estado.tipoListado);
    });
}

function iniciarListado() {
    document.getElementById('filtros-tipo-panel').addEventListener('click', (evento) => {
        const boton = evento.target.closest('.tipo-boton');
        if (!boton || boton.dataset.tipo === estado.tipoListado) return;
        estado.tipoListado = boton.dataset.tipo;
        prepararSelectorTipo();
        cargarPublicaciones();
    });

    document.getElementById('boton-nueva').addEventListener('click', () => abrirFormulario(null));

    // Acciones de cada fila por delegación.
    document.getElementById('lista-publicaciones').addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-accion]');
        if (!boton) return;
        const id = Number(boton.closest('[data-id]').dataset.id);
        const publicacion = estado.publicaciones.find((p) => p.id === id);
        if (!publicacion) return;
        if (boton.dataset.accion === 'editar') abrirFormulario(publicacion);
        if (boton.dataset.accion === 'eliminar') pedirEliminacion(publicacion);
    });
    document.getElementById('lista-publicaciones').addEventListener('change', (evento) => {
        if (!evento.target.matches('[data-accion="estado"]')) return;
        const id = Number(evento.target.closest('[data-id]').dataset.id);
        cambiarEstado(estado.publicaciones.find((p) => p.id === id), evento.target);
    });

    document.getElementById('boton-confirmar-eliminar').addEventListener('click', confirmarEliminacion);
}

async function cargarPublicaciones() {
    const lista = document.getElementById('lista-publicaciones');
    const tipo = estado.tipoListado;
    lista.innerHTML = Array.from({ length: 3 }, () => '<div class="fila-publicacion fila-esqueleto esqueleto" aria-hidden="true"></div>').join('');
    try {
        const respuesta = await apiFetch(`/empresa/publicaciones?tipo=${tipo}`);
        if (tipo !== estado.tipoListado) return;
        estado.publicaciones = respuesta.publicaciones;
    } catch (error) {
        lista.innerHTML = crearEstado({ titulo: 'No se pudieron cargar las publicaciones', texto: error.message, esError: true });
        return;
    }
    pintarPublicaciones();
}

function pintarPublicaciones() {
    const lista = document.getElementById('lista-publicaciones');
    if (!estado.publicaciones.length) {
        lista.innerHTML = crearEstado({
            titulo: { hotel: 'Aún no has publicado alojamientos', actividad: 'Aún no has publicado actividades', vehiculo: 'Aún no has publicado vehículos' }[estado.tipoListado],
            texto: 'Crea tu primera publicación: aparecerá de inmediato en el catálogo de BookingRD.',
            accion: '<button type="button" class="btn-primario" onclick="abrirFormulario(null)">Crear publicación</button>'
        });
        return;
    }
    lista.innerHTML = estado.publicaciones.map(crearFilaPublicacion).join('');
}

function crearFilaPublicacion(publicacion, indice) {
    const categoria = CATALOGOS.categorias[publicacion.categoria];
    const unidad = unidadPrecio(publicacion.tipo);
    const media = publicacion.imagen
        ? `<img src="${escaparHtml(urlRecurso(publicacion.imagen))}" alt="" loading="lazy" onerror="this.parentElement.classList.add('sin-foto')">`
        : '';
    const detalle = publicacion.tipo === 'vehiculo'
        ? `${resumenVehiculo(publicacion)}, ${publicacion.unidades} ${publicacion.unidades === 1 ? 'unidad' : 'unidades'}`
        : publicacion.tipo === 'hotel'
        ? `${publicacion.habitaciones} ${publicacion.habitaciones === 1 ? 'unidad' : 'unidades'}, hasta ${publicacion.capacidadPersonas} por habitación`
        : `${formatearDuracion(publicacion.duracionHoras)}, cupo ${publicacion.cupoDiario} por día`;

    return `
        <article class="fila-publicacion${publicacion.activo ? '' : ' es-oculta'}" data-id="${publicacion.id}" style="animation-delay:${Math.min(indice, 8) * 50}ms">
            <div class="fila-media${publicacion.imagen ? '' : ' sin-foto'}">${media}</div>
            <div class="fila-info">
                <span class="fila-categoria">${escaparHtml(categoria ? categoria.nombre : '')}</span>
                <h3><a href="${enlaceDetalle(publicacion)}">${escaparHtml(publicacion.nombre)}</a></h3>
                <p>${escaparHtml(publicacion.ciudad)}, ${escaparHtml(detalle)}</p>
            </div>
            <div class="fila-precio">${formatoMoneda.format(publicacion.precio)}<small>${unidad}</small></div>
            <div class="fila-acciones">
                <label class="interruptor" title="${publicacion.activo ? 'Visible en el catálogo' : 'Oculta'}">
                    <input type="checkbox" data-accion="estado"${publicacion.activo ? ' checked' : ''}>
                    <span class="interruptor-pista" aria-hidden="true"></span>
                    <span class="interruptor-texto">${publicacion.activo ? 'Publicada' : 'Oculta'}</span>
                </label>
                <button type="button" class="btn-outline btn-chico" data-accion="editar">Editar</button>
                <button type="button" class="boton-eliminar" data-accion="eliminar" aria-label="Eliminar ${escaparHtml(publicacion.nombre)}">Eliminar</button>
            </div>
        </article>`;
}

async function cambiarEstado(publicacion, casilla) {
    if (!publicacion) return;
    const activo = casilla.checked;
    casilla.disabled = true;
    try {
        await apiFetch(`/empresa/publicaciones/${publicacion.tipo}/${publicacion.id}/estado`, {
            method: 'PATCH',
            body: { activo }
        });
        publicacion.activo = activo;
        mostrarAviso(activo ? 'La publicación es visible en el catálogo.' : 'La publicación quedó oculta.', 'exito');
        pintarPublicaciones();
    } catch (error) {
        casilla.checked = !activo;
        casilla.disabled = false;
        mostrarAviso(error.message, 'error');
    }
}

function pedirEliminacion(publicacion) {
    estado.porEliminar = publicacion;
    document.getElementById('eliminar-nombre').textContent = publicacion.nombre;
    document.getElementById('eliminar-error').classList.remove('visible');
    abrirModal('modal-eliminar');
}

async function confirmarEliminacion() {
    const publicacion = estado.porEliminar;
    if (!publicacion) return;
    const boton = document.getElementById('boton-confirmar-eliminar');
    const mensaje = document.getElementById('eliminar-error');
    botonCargando(boton, 'Eliminando...');
    try {
        await apiFetch(`/empresa/publicaciones/${publicacion.tipo}/${publicacion.id}`, { method: 'DELETE' });
        estado.publicaciones = estado.publicaciones.filter((p) => p !== publicacion);
        cerrarModal('modal-eliminar');
        mostrarAviso('Publicación eliminada.', 'exito');
        pintarPublicaciones();
        refrescarIndicadores();
    } catch (error) {
        mensaje.textContent = error.message;
        mensaje.classList.add('visible');
    } finally {
        botonNormal(boton, 'Eliminar');
    }
}

/* ----------------------------------------------------------------------------
   RESERVAS RECIBIDAS
   ---------------------------------------------------------------------------- */

async function cargarReservas() {
    const vacio = document.getElementById('reservas-vacio');
    try {
        estado.reservas = (await apiFetch('/empresa/reservas')).reservas;
    } catch (error) {
        vacio.innerHTML = crearEstado({ titulo: 'No se pudieron cargar las reservas', texto: error.message, esError: true });
        document.querySelector('#seccion-reservas .tabla-envoltura').hidden = true;
        document.getElementById('grafico-ingresos').innerHTML = '<p class="grafico-vacio">No se pudieron cargar los datos.</p>';
        return;
    }
    document.getElementById('conteo-reservas').textContent = estado.reservas.filter((r) => r.estado === 'confirmada').length;
    pintarResumen();
    pintarTablaReservas();
}

function iniciarReservas() {
    const actualizar = conRetardo(pintarTablaReservas, 200);
    document.getElementById('buscar-reservas').addEventListener('input', actualizar);
    document.getElementById('estado-reservas').addEventListener('change', pintarTablaReservas);
    document.getElementById('boton-exportar').addEventListener('click', exportarReservas);
}

/** Reservas que cumplen la búsqueda y el estado elegidos. */
function reservasFiltradas() {
    const texto = document.getElementById('buscar-reservas').value.trim().toLowerCase();
    const estadoElegido = document.getElementById('estado-reservas').value;
    return estado.reservas.filter((r) => (!estadoElegido || r.estado === estadoElegido)
        && (!texto || [r.codigo, r.publicacion, r.cliente && r.cliente.nombre, r.cliente && r.cliente.correo]
            .some((valor) => valor && valor.toLowerCase().includes(texto))));
}

function textoFechas(reserva) {
    return textoFechasReserva(reserva);
}

function pintarTablaReservas() {
    const cuerpo = document.getElementById('tabla-reservas');
    const envoltura = document.querySelector('#seccion-reservas .tabla-envoltura');
    const vacio = document.getElementById('reservas-vacio');
    const lista = reservasFiltradas();
    document.getElementById('boton-exportar').disabled = !lista.length;
    if (!lista.length) {
        envoltura.hidden = true;
        vacio.innerHTML = estado.reservas.length
            ? crearEstado({ titulo: 'Ninguna reserva coincide con la búsqueda', texto: 'Prueba con otro código, cliente o estado.' })
            : crearEstado({ titulo: 'Todavía no has recibido reservas', texto: 'Cuando un viajero reserve una de tus publicaciones aparecerá aquí.' });
        return;
    }
    envoltura.hidden = false;
    vacio.innerHTML = '';
    cuerpo.innerHTML = lista.map((reserva) => {
        const alquiler = reserva.alquiler || {};
        const grupo = reserva.tipo === 'vehiculo'
            ? `Conductor ${alquiler.edadConductor} años. Devuelve en ${alquiler.ciudadDevolucion}${alquiler.extras && alquiler.extras.length ? `. Extras: ${alquiler.extras.map((c) => (CATALOGOS.extrasVehiculo[c] || {}).nombre || c).join(', ')}` : ''}`
            : reserva.tipo === 'hotel'
            ? `${reserva.habitaciones} hab., ${reserva.personas} pers.`
            : `${reserva.personas} pers.`;
        const cliente = reserva.cliente || {};
        return `
            <tr>
                <td data-titulo="Código"><span class="codigo-reserva">${escaparHtml(reserva.codigo)}</span></td>
                <td data-titulo="Publicación">${escaparHtml(reserva.publicacion)}</td>
                <td data-titulo="Cliente">
                    <strong>${escaparHtml(cliente.nombre || '')}</strong>
                    <span class="dato-secundario">${escaparHtml(cliente.correo || '')}${cliente.telefono ? `, ${escaparHtml(cliente.telefono)}` : ''}</span>
                    ${reserva.comentario ? `<span class="dato-comentario">${escaparHtml(reserva.comentario)}</span>` : ''}
                </td>
                <td data-titulo="Fechas">${escaparHtml(textoFechas(reserva))}</td>
                <td data-titulo="Grupo">${escaparHtml(grupo)}</td>
                <td data-titulo="Total"><strong>${formatoMoneda.format(reserva.total)}</strong></td>
                <td data-titulo="Estado"><span class="estado-reserva es-${reserva.estado}">${reserva.estado === 'confirmada' ? 'Confirmada' : 'Cancelada'}</span></td>
            </tr>`;
    }).join('');
}

/** Descarga las reservas filtradas como CSV (separador ";" y BOM para Excel en español). */
function exportarReservas() {
    const celda = (valor) => `"${String(valor == null ? '' : valor).replace(/"/g, '""')}"`;
    const encabezado = ['Código', 'Publicación', 'Tipo', 'Cliente', 'Correo', 'Teléfono', 'Inicio', 'Hora inicio', 'Fin', 'Hora fin', 'Personas', 'Habitaciones', 'Devolución', 'Edad conductor', 'Extras', 'Total RD$', 'Estado', 'Comentario'];
    const filas = reservasFiltradas().map((r) => {
        const a = r.alquiler || {};
        return [
            r.codigo, r.publicacion, NOMBRE_TIPO[r.tipo],
            r.cliente && r.cliente.nombre, r.cliente && r.cliente.correo, r.cliente && r.cliente.telefono,
            r.fechaInicio, a.horaRecogida || '', r.fechaFin || '', a.horaDevolucion || '', r.personas, r.habitaciones || '',
            a.ciudadDevolucion || '', a.edadConductor || '', (a.extras || []).join(', '), r.total, r.estado, r.comentario
        ];
    });
    const contenido = '\ufeff' + [encabezado, ...filas].map((fila) => fila.map(celda).join(';')).join('\r\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    enlace.download = `reservas-bookingrd-${hoyIso()}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

/* ----------------------------------------------------------------------------
   RESUMEN
   ---------------------------------------------------------------------------- */

function pintarResumen() {
    const confirmadas = estado.reservas.filter((r) => r.estado === 'confirmada');
    const canceladas = estado.reservas.length - confirmadas.length;
    const ingresos = confirmadas.reduce((suma, r) => suma + r.total, 0);
    const proximas = confirmadas.filter((r) => r.fechaInicio >= hoyIso())
        .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
    const tasa = estado.reservas.length ? Math.round((canceladas / estado.reservas.length) * 100) : 0;

    document.getElementById('indicadores-empresa').innerHTML = [
        ['Reservas confirmadas', confirmadas.length, `${proximas.length} por realizar`, ''],
        ['Ingresos confirmados', formatoMoneda.format(ingresos), 'Total de reservas vigentes', 'es-positivo'],
        ['Ticket promedio', formatoMoneda.format(confirmadas.length ? ingresos / confirmadas.length : 0), 'Por reserva confirmada', ''],
        ['Cancelaciones', `${tasa}%`, `${canceladas} de ${estado.reservas.length} reservas`, tasa > 25 ? 'es-alerta' : ''],
        estado.valoracion && estado.valoracion.total
            ? ['Valoración media', formatoPuntuacion(estado.valoracion.promedio), `${etiquetaPuntuacion(estado.valoracion.promedio)}, ${textoResenas(estado.valoracion.total)}`, 'es-positivo']
            : ['Valoración media', 'Sin reseñas', 'Llegarán al terminar las reservas', '']
    ].map(([titulo, valor, detalle, clase]) => `
        <div class="indicador ${clase}"><dt>${escaparHtml(titulo)}</dt><dd>${escaparHtml(String(valor))}</dd><small>${escaparHtml(detalle)}</small></div>`).join('');

    // Ingresos por mes: 3 meses anteriores, el actual y 2 próximos.
    const [anio, mes] = hoyIso().split('-').map(Number);
    const meses = [];
    for (let i = -3; i <= 2; i++) {
        const fecha = new Date(Date.UTC(anio, mes - 1 + i, 1));
        const clave = fecha.toISOString().slice(0, 7);
        const delMes = confirmadas.filter((r) => r.fechaInicio.startsWith(clave));
        meses.push({
            etiqueta: etiquetaMes(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1),
            valor: delMes.reduce((suma, r) => suma + r.total, 0),
            resaltado: i === 0,
            detalle: `${delMes.length} ${delMes.length === 1 ? 'reserva' : 'reservas'}`
        });
    }
    document.getElementById('grafico-ingresos').innerHTML = crearGraficoColumnas('Ingresos por mes de servicio', meses, (n) => formatoMoneda.format(n));

    // Publicaciones con más ingresos.
    const porPublicacion = {};
    for (const r of confirmadas) {
        const clave = `${r.tipo}-${r.idPublicacion}`;
        porPublicacion[clave] = porPublicacion[clave] || { etiqueta: r.publicacion, valor: 0, reservas: 0 };
        porPublicacion[clave].valor += r.total;
        porPublicacion[clave].reservas += 1;
    }
    const ranking = Object.values(porPublicacion).sort((a, b) => b.valor - a.valor).slice(0, 5)
        .map((p) => Object.assign(p, { detalle: `${p.reservas} ${p.reservas === 1 ? 'reserva' : 'reservas'}` }));
    document.getElementById('grafico-publicaciones').innerHTML = crearBarrasHorizontales('Publicaciones con más ingresos', ranking, (n) => formatoMoneda.format(n));

    const lista = document.getElementById('lista-llegadas');
    lista.innerHTML = proximas.length
        ? proximas.slice(0, 5).map((r) => {
            const [, m, d] = r.fechaInicio.split('-').map(Number);
            return `<li>
                <span class="lista-breve-fecha">${d}<small>${NOMBRES_MES[m - 1]}</small></span>
                <span><strong>${escaparHtml(r.cliente ? r.cliente.nombre : '')}</strong><span>${escaparHtml(r.publicacion)}</span></span>
                <span class="lista-breve-monto">${formatoMoneda.format(r.total)}</span>
            </li>`;
        }).join('')
        : '<li class="grafico-vacio">No hay llegadas programadas.</li>';
}

/* ----------------------------------------------------------------------------
   FORMULARIO DE PUBLICACIÓN
   ---------------------------------------------------------------------------- */

function llenarCatalogosFormulario() {
    const opciones = (pares) => pares.map(([valor, texto]) => `<option value="${escaparHtml(valor)}">${escaparHtml(texto)}</option>`).join('');
    document.getElementById('pub-ciudad').insertAdjacentHTML('beforeend', opciones(CATALOGOS.destinos.map((d) => [d, d])));
    document.getElementById('pub-tipo-alojamiento').insertAdjacentHTML('beforeend', opciones(Object.entries(CATALOGOS.tiposAlojamiento)));
    document.getElementById('pub-categoria').insertAdjacentHTML('beforeend', opciones(
        Object.entries(CATALOGOS.categorias).filter(([, c]) => c.tipo === 'actividad').map(([codigo, c]) => [codigo, c.nombre])
    ));
    document.getElementById('veh-categoria').insertAdjacentHTML('beforeend', opciones(
        Object.entries(CATALOGOS.categorias).filter(([, c]) => c.tipo === 'vehiculo').map(([codigo, c]) => [codigo, c.nombre])
    ));
    document.getElementById('veh-transmision').innerHTML = opciones(Object.entries(CATALOGOS.transmisiones));
    document.getElementById('veh-combustible').innerHTML = opciones(Object.entries(CATALOGOS.combustibles));
    document.getElementById('opciones-servicios').innerHTML = Object.entries(CATALOGOS.serviciosHotel)
        .map(([codigo, nombre]) => `
            <label class="opcion-servicio">
                <input type="checkbox" value="${codigo}">
                <span>${escaparHtml(nombre)}</span>
            </label>`)
        .join('');
}

function iniciarFormulario() {
    const formulario = document.getElementById('form-publicacion');
    retirarMarcasAlEditar(formulario);
    document.getElementById('pub-tipo').addEventListener('change', (evento) => mostrarCamposDeTipo(evento.target.value));
    document.getElementById('pub-descripcion').addEventListener('input', actualizarContadorDescripcion);
    formulario.addEventListener('submit', guardarPublicacion);

    // Fotografía: selector de archivos y arrastrar y soltar.
    const zona = document.getElementById('zona-imagen');
    const entrada = document.getElementById('pub-imagen');
    entrada.addEventListener('change', () => {
        if (entrada.files[0]) procesarImagen(entrada.files[0]);
        entrada.value = '';
    });
    ['dragenter', 'dragover'].forEach((nombre) => zona.addEventListener(nombre, (evento) => {
        evento.preventDefault();
        zona.classList.add('arrastrando');
    }));
    ['dragleave', 'drop'].forEach((nombre) => zona.addEventListener(nombre, (evento) => {
        evento.preventDefault();
        zona.classList.remove('arrastrando');
    }));
    zona.addEventListener('drop', (evento) => {
        const archivo = evento.dataTransfer.files[0];
        if (archivo) procesarImagen(archivo);
    });
}

function mostrarCamposDeTipo(tipo) {
    document.querySelectorAll('[data-campos-tipo]').forEach((bloque) => {
        bloque.hidden = bloque.dataset.camposTipo !== tipo;
    });
    document.getElementById('etiqueta-precio').textContent = { hotel: 'Precio por noche (RD$)', actividad: 'Precio por persona (RD$)', vehiculo: 'Precio por día (RD$)' }[tipo];
    document.getElementById('pub-nombre').placeholder = { hotel: 'Ej.: Coralia Grand Resort & Spa', actividad: 'Ej.: Excursión en catamarán a Isla Saona', vehiculo: 'Ej.: Toyota Corolla o similar' }[tipo];
    document.getElementById('veh-anio').max = new Date().getFullYear() + 1;
}

function actualizarContadorDescripcion() {
    document.getElementById('contador-descripcion').textContent = document.getElementById('pub-descripcion').value.length;
}

function mostrarVistaImagen(url) {
    const vista = document.getElementById('vista-imagen');
    const zona = document.getElementById('zona-imagen');
    vista.hidden = !url;
    zona.classList.toggle('con-imagen', Boolean(url));
    if (url) vista.src = url;
    else vista.removeAttribute('src');
}

/** Abre el formulario vacío (publicacion null) o con los datos a editar. */
async function abrirFormulario(publicacion) {
    const formulario = document.getElementById('form-publicacion');
    formulario.reset();
    formulario.querySelectorAll('.invalido').forEach((campo) => campo.classList.remove('invalido'));
    document.getElementById('publicacion-error').classList.remove('visible');
    estado.idImagen = null;
    mostrarVistaImagen(null);

    const selectorTipo = document.getElementById('pub-tipo');
    selectorTipo.innerHTML = estado.tiposPermitidos
        .map((tipo) => `<option value="${tipo}">${{ hotel: 'Alojamiento', actividad: 'Actividad o tour', vehiculo: 'Vehículo de alquiler' }[tipo]}</option>`)
        .join('');
    document.getElementById('campo-tipo-publicacion').hidden = Boolean(publicacion) || estado.tiposPermitidos.length < 2;

    if (!publicacion) {
        estado.edicion = null;
        selectorTipo.value = estado.tipoListado;
        mostrarCamposDeTipo(estado.tipoListado);
        if (estado.empresa && estado.empresa.tipoAlojamiento) {
            document.getElementById('pub-tipo-alojamiento').value = estado.empresa.tipoAlojamiento;
        }
        document.getElementById('publicacion-titulo').textContent = 'Nueva publicación';
        document.getElementById('boton-guardar').textContent = 'Publicar';
        actualizarContadorDescripcion();
        abrirModal('modal-publicacion');
        return;
    }

    // Edición: se piden los datos completos (incluye campos que el listado no trae).
    let completa;
    try {
        completa = await apiFetch(`/empresa/publicaciones/${publicacion.tipo}/${publicacion.id}`);
    } catch (error) {
        mostrarAviso(error.message, 'error');
        return;
    }
    estado.edicion = { tipo: completa.tipo, id: completa.id };
    selectorTipo.value = completa.tipo;
    mostrarCamposDeTipo(completa.tipo);
    const asignar = (id, valor) => { document.getElementById(id).value = valor == null ? '' : valor; };
    asignar('pub-nombre', completa.nombre);
    asignar('pub-ciudad', completa.ciudad);
    asignar('pub-precio', completa.precio);
    asignar('pub-descripcion', completa.descripcion);
    if (completa.tipo === 'hotel') {
        asignar('pub-tipo-alojamiento', completa.tipoAlojamiento);
        asignar('pub-direccion', completa.direccion);
        asignar('pub-capacidad', completa.capacidadPersonas);
        asignar('pub-habitaciones', completa.habitaciones);
        document.querySelectorAll('#opciones-servicios input').forEach((casilla) => {
            casilla.checked = completa.servicios.includes(casilla.value);
        });
    } else if (completa.tipo === 'vehiculo') {
        asignar('veh-categoria', completa.categoria);
        asignar('veh-marca', completa.marca);
        asignar('veh-modelo', completa.modelo);
        asignar('veh-anio', completa.anio);
        asignar('veh-transmision', completa.transmision);
        asignar('veh-combustible', completa.combustible);
        asignar('veh-pasajeros', completa.pasajeros);
        asignar('veh-puertas', completa.puertas);
        asignar('veh-maletas', completa.maletas);
        asignar('veh-lugar', completa.lugarRecogida);
        asignar('veh-km', completa.kmPorDia);
        asignar('veh-deposito', completa.deposito);
        asignar('veh-edad', completa.edadMinima);
        asignar('veh-cargo-joven', completa.cargoConductorJoven);
        asignar('veh-cargo-ciudad', completa.cargoOtraCiudad);
        asignar('veh-unidades', completa.unidades);
        asignar('veh-incluye', completa.incluye);
        document.getElementById('veh-aire').checked = completa.aire;
    } else {
        asignar('pub-categoria', completa.categoria);
        asignar('pub-punto', completa.puntoEncuentro);
        asignar('pub-duracion', completa.duracionHoras);
        asignar('pub-cupo', completa.cupoDiario);
        asignar('pub-incluye', completa.incluye);
    }
    if (completa.imagen) mostrarVistaImagen(urlRecurso(completa.imagen));
    document.getElementById('publicacion-titulo').textContent = 'Editar publicación';
    document.getElementById('boton-guardar').textContent = 'Guardar cambios';
    actualizarContadorDescripcion();
    abrirModal('modal-publicacion');
}

/**
 * Reduce la fotografía en el navegador (lado mayor 1600 px, JPEG) y la sube.
 * Así las imágenes ocupan poco en la base de datos y cargan rápido.
 */
async function procesarImagen(archivo) {
    const mensaje = document.getElementById('publicacion-error');
    mensaje.classList.remove('visible');
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) {
        mostrarErrorFormulario('La fotografía debe ser JPG, PNG o WEBP.', 'pub-imagen');
        return;
    }
    if (archivo.size > 15 * 1024 * 1024) {
        mostrarErrorFormulario('La fotografía es demasiado grande (máximo 15 MB antes de reducirla).', 'pub-imagen');
        return;
    }

    const progreso = document.getElementById('zona-imagen-progreso');
    estado.subiendoImagen = true;
    progreso.hidden = false;
    try {
        const dataUrl = await reducirImagen(archivo);
        mostrarVistaImagen(dataUrl);
        const respuesta = await apiFetch('/empresa/imagenes', { method: 'POST', body: { imagen: dataUrl } });
        estado.idImagen = respuesta.id;
    } catch (error) {
        estado.idImagen = null;
        mostrarVistaImagen(null);
        mostrarErrorFormulario(error.message || 'No se pudo procesar la fotografía.', 'pub-imagen');
    } finally {
        estado.subiendoImagen = false;
        progreso.hidden = true;
    }
}

function reducirImagen(archivo) {
    return new Promise((resolver, rechazar) => {
        const url = URL.createObjectURL(archivo);
        const imagen = new Image();
        imagen.onload = () => {
            const escala = Math.min(1, LADO_MAXIMO_IMAGEN / Math.max(imagen.naturalWidth, imagen.naturalHeight));
            const lienzo = document.createElement('canvas');
            lienzo.width = Math.round(imagen.naturalWidth * escala);
            lienzo.height = Math.round(imagen.naturalHeight * escala);
            const contexto = lienzo.getContext('2d');
            contexto.fillStyle = '#FFFFFF';   // fondo para PNG con transparencia
            contexto.fillRect(0, 0, lienzo.width, lienzo.height);
            contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
            URL.revokeObjectURL(url);
            resolver(lienzo.toDataURL('image/jpeg', CALIDAD_JPEG));
        };
        imagen.onerror = () => {
            URL.revokeObjectURL(url);
            rechazar(new Error('El archivo no es una imagen válida.'));
        };
        imagen.src = url;
    });
}

function mostrarErrorFormulario(texto, campo) {
    const mensaje = document.getElementById('publicacion-error');
    mensaje.textContent = texto;
    mensaje.classList.remove('visible');
    void mensaje.offsetWidth;   // reinicia la animación
    mensaje.classList.add('visible');
    if (campo) marcarCampo(campo);
}

/** Datos del formulario con los nombres que espera la API. */
function leerFormulario(tipo) {
    const valor = (id) => document.getElementById(id).value.trim();
    const datos = {
        tipo,
        nombre: valor('pub-nombre'),
        ciudad: valor('pub-ciudad'),
        precio: valor('pub-precio'),
        descripcion: valor('pub-descripcion'),
        idImagen: estado.idImagen
    };
    if (tipo === 'hotel') {
        return Object.assign(datos, {
            tipoAlojamiento: valor('pub-tipo-alojamiento'),
            direccion: valor('pub-direccion'),
            capacidadPersonas: valor('pub-capacidad'),
            habitaciones: valor('pub-habitaciones'),
            servicios: Array.from(document.querySelectorAll('#opciones-servicios input:checked')).map((c) => c.value)
        });
    }
    if (tipo === 'vehiculo') {
        return Object.assign(datos, {
            categoria: valor('veh-categoria'),
            marca: valor('veh-marca'),
            modelo: valor('veh-modelo'),
            anio: valor('veh-anio'),
            transmision: valor('veh-transmision'),
            combustible: valor('veh-combustible'),
            pasajeros: valor('veh-pasajeros'),
            puertas: valor('veh-puertas'),
            maletas: valor('veh-maletas'),
            aire: document.getElementById('veh-aire').checked,
            kmPorDia: valor('veh-km'),
            lugarRecogida: valor('veh-lugar'),
            deposito: valor('veh-deposito'),
            edadMinima: valor('veh-edad'),
            cargoConductorJoven: valor('veh-cargo-joven'),
            cargoOtraCiudad: valor('veh-cargo-ciudad'),
            unidades: valor('veh-unidades'),
            incluye: valor('veh-incluye')
        });
    }
    return Object.assign(datos, {
        categoria: valor('pub-categoria'),
        puntoEncuentro: valor('pub-punto'),
        duracionHoras: valor('pub-duracion'),
        cupoDiario: valor('pub-cupo'),
        incluye: valor('pub-incluye')
    });
}

async function guardarPublicacion(evento) {
    evento.preventDefault();
    if (estado.subiendoImagen) {
        mostrarErrorFormulario('Espera a que termine de subirse la fotografía.');
        return;
    }
    const tipo = estado.edicion ? estado.edicion.tipo : document.getElementById('pub-tipo').value;
    const datos = leerFormulario(tipo);
    const boton = document.getElementById('boton-guardar');
    const textoBoton = boton.textContent;
    botonCargando(boton, 'Guardando...');
    try {
        if (estado.edicion) {
            await apiFetch(`/empresa/publicaciones/${tipo}/${estado.edicion.id}`, { method: 'PUT', body: datos });
        } else {
            await apiFetch('/empresa/publicaciones', { method: 'POST', body: datos });
        }
        cerrarModal('modal-publicacion');
        mostrarAviso(estado.edicion ? 'Cambios guardados.' : 'Publicación creada. Ya aparece en el catálogo.', 'exito');
        estado.tipoListado = tipo;
        prepararSelectorTipo();
        cargarPublicaciones();
        refrescarIndicadores();
    } catch (error) {
        mostrarErrorFormulario(error.message, error.campo);
    } finally {
        botonNormal(boton, textoBoton);
    }
}

/* ----------------------------------------------------------------------------
   RESEÑAS
   La empresa responde públicamente; la respuesta aparece bajo la reseña en
   el detalle de la publicación. Una respuesta vacía la retira.
   ---------------------------------------------------------------------------- */

function iniciarResenas() {
    document.querySelectorAll('[data-filtro-resenas]').forEach((boton) => {
        boton.addEventListener('click', () => {
            estado.filtroResenas = boton.dataset.filtroResenas;
            document.querySelectorAll('[data-filtro-resenas]').forEach((otro) => {
                otro.classList.toggle('activo', otro === boton);
                otro.setAttribute('aria-pressed', String(otro === boton));
            });
            pintarResenas();
        });
    });
    const lista = document.getElementById('lista-resenas-panel');
    lista.addEventListener('submit', (evento) => {
        const formulario = evento.target.closest('[data-responder]');
        if (!formulario) return;
        evento.preventDefault();
        guardarRespuesta(Number(formulario.dataset.responder), formulario);
    });
    lista.addEventListener('click', (evento) => {
        const retirar = evento.target.closest('[data-retirar-respuesta]');
        if (retirar) guardarRespuesta(Number(retirar.dataset.retirarRespuesta), null);
        const editar = evento.target.closest('[data-editar-respuesta]');
        if (editar) {
            const articulo = editar.closest('.resena');
            articulo.classList.add('editando');
            articulo.querySelector('textarea').focus();
        }
    });
}

async function cargarResenas() {
    const lista = document.getElementById('lista-resenas-panel');
    lista.innerHTML = '<div class="resena esqueleto resena-esqueleto" aria-hidden="true"></div>'.repeat(2);
    try {
        const { resenas } = await apiFetch('/empresa/resenas');
        estado.resenas = resenas;
    } catch (error) {
        lista.innerHTML = crearEstado({ titulo: 'No se pudieron cargar las reseñas', texto: error.message, esError: true });
        return;
    }
    pintarResenas();
}

function pintarResenas() {
    const visibles = estado.resenas.filter((r) => r.visible);
    const sinRespuesta = visibles.filter((r) => !r.respuesta).length;
    const conteo = document.getElementById('conteo-resenas');
    conteo.textContent = sinRespuesta;
    conteo.hidden = !sinRespuesta;

    const promedio = visibles.length ? visibles.reduce((suma, r) => suma + r.puntuacion, 0) / visibles.length : null;
    document.getElementById('resenas-panel-nota').innerHTML = promedio === null
        ? '<strong>Aún no tienes reseñas</strong><span>Los viajeros pueden reseñar cuando termina su estancia o actividad.</span>'
        : `<span class="nota nota-xl">${formatoPuntuacion(promedio)}</span>
           <div><strong>${etiquetaPuntuacion(promedio)}</strong><span>${textoResenas(visibles.length)}, ${sinRespuesta} sin responder</span></div>`;

    const lista = document.getElementById('lista-resenas-panel');
    const filtradas = estado.filtroResenas === 'sin-respuesta' ? estado.resenas.filter((r) => !r.respuesta && r.visible) : estado.resenas;
    if (!filtradas.length) {
        lista.innerHTML = crearEstado({
            titulo: estado.filtroResenas === 'sin-respuesta' ? 'Respondiste todas las reseñas' : 'Aún no hay reseñas',
            texto: estado.filtroResenas === 'sin-respuesta' ? 'Responder a tiempo transmite confianza a los próximos viajeros.' : ''
        });
        return;
    }
    lista.innerHTML = filtradas.map(crearResenaPanel).join('');
}

function crearResenaPanel(resena) {
    const fecha = formatearFecha(String(resena.fecha).slice(0, 10));
    const respuesta = resena.respuesta
        ? `<div class="resena-respuesta">
                <strong>Tu respuesta</strong>
                <p>${escaparHtml(resena.respuesta)}</p>
                <div class="resena-respuesta-acciones">
                    <button type="button" class="boton-enlace" data-editar-respuesta="${resena.id}">Editar</button>
                    <button type="button" class="boton-enlace boton-enlace-peligro" data-retirar-respuesta="${resena.id}">Retirar</button>
                </div>
            </div>` : '';
    return `
        <article class="resena${resena.respuesta ? '' : ' editando'}${resena.visible ? '' : ' es-oculta'}">
            <header>
                <span class="opinion-avatar" aria-hidden="true">${escaparHtml(resena.autor.charAt(0))}</span>
                <div>
                    <strong>${escaparHtml(resena.autorCompleto || resena.autor)}</strong>
                    <small>${escaparHtml(resena.publicacion)}. ${fecha}${resena.visible ? '' : '. Oculta por la administración'}</small>
                </div>
                <span class="nota">${resena.puntuacion}</span>
            </header>
            <h3>${escaparHtml(resena.titulo)}</h3>
            <p>${escaparHtml(resena.comentario)}</p>
            ${respuesta}
            <form class="formulario-respuesta" data-responder="${resena.id}">
                <label class="visualmente-oculto" for="respuesta-${resena.id}">Respuesta pública</label>
                <textarea id="respuesta-${resena.id}" maxlength="1000" rows="3" placeholder="Agradece la visita o explica qué harán para mejorar. La respuesta será pública.">${escaparHtml(resena.respuesta || '')}</textarea>
                <button type="submit" class="btn-primario btn-chico">${resena.respuesta ? 'Guardar cambios' : 'Publicar respuesta'}</button>
            </form>
        </article>`;
}

/** Publica, edita o retira (formulario null) la respuesta a una reseña. */
async function guardarRespuesta(id, formulario) {
    const texto = formulario ? formulario.querySelector('textarea').value.trim() : '';
    if (formulario && !texto) {
        mostrarAviso('Escribe la respuesta antes de publicarla.', 'error');
        return;
    }
    const boton = formulario ? formulario.querySelector('button') : null;
    if (boton) botonCargando(boton, 'Guardando...');
    try {
        const { respuesta } = await apiFetch(`/empresa/resenas/${id}/respuesta`, { method: 'PUT', body: { respuesta: texto } });
        const resena = estado.resenas.find((r) => r.id === id);
        resena.respuesta = respuesta;
        mostrarAviso(respuesta ? 'Respuesta publicada.' : 'Respuesta retirada.');
        pintarResenas();
    } catch (error) {
        mostrarAviso(error.message, 'error');
        if (boton) botonNormal(boton);
    }
}
