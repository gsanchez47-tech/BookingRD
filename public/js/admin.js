/**
 * @file public/js/admin.js
 * @description Administración de la plataforma (admin.html). Solo cuentas
 *   con rol "admin" (equipo de desarrollo).
 *
 *   - Resumen:            GET   /api/admin/resumen
 *   - Empresas:           GET   /api/admin/empresas
 *   - Usuarios:           GET   /api/admin/usuarios?rol=&q=
 *   - Suspender cuenta:   PATCH /api/admin/usuarios/:id/estado
 *   - Publicaciones:      GET   /api/admin/publicaciones?tipo=&q=
 *   - Moderar:            PATCH /api/admin/publicaciones/:tipo/:id
 *   - Reservas:           GET   /api/admin/reservas?estado=
 *   - Reseñas:            GET   /api/admin/resenas · PATCH /api/admin/resenas/:id
 *   - Mensajes:           GET   /api/admin/mensajes · PATCH /api/admin/mensajes/:id
 *
 * Cada sección se carga la primera vez que se abre y se vuelve a pedir
 * después de cada cambio que afecta a sus datos.
 */

const NOMBRES_SERVICIO = { alojamiento: 'Alojamiento', actividades: 'Actividades', mixto: 'Mixto', vehiculos: 'Autos' };
const NOMBRES_ASUNTO = { viajero: 'Viajero', empresa: 'Empresa', cuenta: 'Cuenta', otro: 'Otro' };

const admin = {
    cargadas: new Set(),
    empresas: [],
    usuarios: [],
    publicaciones: [],
    tipoPublicacion: 'hotel',
    reservas: [],
    mensajes: [],
    resenas: [],
    filtroResenas: 'todas',
    resenasVisibles: 12,     // reseñas mostradas; "Mostrar más" suma otras 12
    cuentaPendiente: null   // { idUsuario, activo, nombre, recargar }
};

document.addEventListener('DOMContentLoaded', () => {
    if (!exigirSesion('admin')) return;
    iniciarPestanas();
    iniciarFiltros();
    iniciarAcciones();
    abrirSeccion('resumen');
});

/* ----------------------------------------------------------------------------
   NAVEGACIÓN
   ---------------------------------------------------------------------------- */

const CARGADORES = {
    resumen: cargarResumen,
    empresas: cargarEmpresas,
    usuarios: cargarUsuarios,
    publicaciones: cargarPublicaciones,
    reservas: cargarReservas,
    resenas: cargarResenas,
    mensajes: cargarMensajes
};

function iniciarPestanas() {
    document.querySelectorAll('.pestana').forEach((pestana) => {
        pestana.addEventListener('click', () => abrirSeccion(pestana.dataset.seccion));
    });
}

function abrirSeccion(seccion) {
    document.querySelectorAll('.pestana').forEach((pestana) => {
        const activa = pestana.dataset.seccion === seccion;
        pestana.classList.toggle('activo', activa);
        pestana.setAttribute('aria-selected', String(activa));
        if (activa) pestana.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    document.querySelectorAll('.panel-seccion').forEach((bloque) => {
        bloque.hidden = bloque.id !== `seccion-${seccion}`;
    });
    if (!admin.cargadas.has(seccion)) {
        admin.cargadas.add(seccion);
        CARGADORES[seccion]();
    }
}

/** Marca una sección para recargarla la próxima vez que se abra. */
function invalidar(...secciones) {
    secciones.forEach((seccion) => admin.cargadas.delete(seccion));
}

function errorDeCarga(contenedor, error) {
    contenedor.innerHTML = crearEstado({
        titulo: 'No se pudieron cargar los datos',
        texto: error.message,
        accion: '<button type="button" class="btn-outline" onclick="location.reload()">Reintentar</button>',
        esError: true
    });
}

/** Fecha y hora de la base (UTC) como fecha corta local. */
function fechaCorta(valor) {
    return valor ? formatearFecha(String(valor).slice(0, 10)) : '';
}

/** Correo con un punto de corte antes de la arroba para tablas angostas. */
function correoCortable(correo) {
    return escaparHtml(correo).replace('@', '<wbr>@');
}

/** Interruptor reutilizable para estados booleanos. */
function interruptor({ accion, activo, textoSi, textoNo, datos = '' }) {
    return `<label class="interruptor">
            <input type="checkbox" data-accion="${accion}" ${datos}${activo ? ' checked' : ''}>
            <span class="interruptor-pista" aria-hidden="true"></span>
            <span class="interruptor-texto">${activo ? textoSi : textoNo}</span>
        </label>`;
}

/* ----------------------------------------------------------------------------
   RESUMEN
   ---------------------------------------------------------------------------- */

async function cargarResumen() {
    let datos;
    try {
        datos = await apiFetch('/admin/resumen');
    } catch (error) {
        errorDeCarga(document.getElementById('indicadores-admin'), error);
        return;
    }
    const t = datos.totales;
    animarNumero(document.getElementById('cifra-ingresos'), t.ingresos, (n) => formatoMoneda.format(n));
    animarNumero(document.getElementById('cifra-reservas'), t.confirmadas);
    animarNumero(document.getElementById('cifra-cuentas'), t.viajeros + t.empresas);
    document.getElementById('conteo-mensajes').textContent = t.mensajesPendientes;

    const totalReservas = t.confirmadas + t.canceladas;
    document.getElementById('indicadores-admin').innerHTML = [
        ['Viajeros', t.viajeros, 'Cuentas registradas', ''],
        ['Empresas', t.empresas, `${t.suspendidas} ${t.suspendidas === 1 ? 'cuenta suspendida' : 'cuentas suspendidas'}`, t.suspendidas ? 'es-alerta' : ''],
        ['Publicaciones', t.hoteles + t.actividades + (t.vehiculos || 0), `${t.hoteles} alojamientos, ${t.actividades} actividades, ${t.vehiculos || 0} autos`, ''],
        ['Ingresos confirmados', formatoMoneda.format(t.ingresos), `${t.confirmadas} reservas vigentes`, 'es-positivo'],
        ['Ticket promedio', formatoMoneda.format(t.confirmadas ? t.ingresos / t.confirmadas : 0), 'Por reserva confirmada', ''],
        ['Cancelaciones', `${totalReservas ? Math.round((t.canceladas / totalReservas) * 100) : 0}%`, `${t.canceladas} de ${totalReservas} reservas`, ''],
        ['Mensajes pendientes', t.mensajesPendientes, 'Formulario de contacto', t.mensajesPendientes ? 'es-alerta' : 'es-positivo'],
        ['Valoración media', t.puntuacionMedia ? formatoPuntuacion(t.puntuacionMedia) : 'Sin datos', `${textoResenas(t.resenas)}, ${t.resenasOcultas} ${t.resenasOcultas === 1 ? 'oculta' : 'ocultas'}`, t.puntuacionMedia >= 8 ? 'es-positivo' : '']
    ].map(([titulo, valor, detalle, clase]) => `
        <div class="indicador ${clase}"><dt>${escaparHtml(titulo)}</dt><dd>${escaparHtml(String(valor))}</dd><small>${escaparHtml(detalle)}</small></div>`).join('');

    document.getElementById('grafico-meses').innerHTML = crearGraficoColumnas(
        'Ingresos por mes de servicio',
        datos.meses.map((m) => ({
            etiqueta: etiquetaMes(m.anio, m.mes),
            valor: m.ingresos,
            resaltado: m.actual,
            detalle: `${m.reservas} ${m.reservas === 1 ? 'reserva' : 'reservas'}`
        })),
        (n) => formatoMoneda.format(n)
    );

    const categorias = datos.categorias
        .map((c) => ({ etiqueta: CATALOGOS.categorias[c.categoria] ? CATALOGOS.categorias[c.categoria].nombre : c.categoria, valor: c.reservas }))
        .sort((a, b) => b.valor - a.valor);
    document.getElementById('grafico-categorias').innerHTML = crearBarrasHorizontales(
        'Reservas por categoría', categorias, (n) => `${n} ${n === 1 ? 'reserva' : 'reservas'}`);

    document.getElementById('grafico-empresas').innerHTML = crearBarrasHorizontales(
        'Empresas con más ingresos',
        datos.empresas.map((e) => ({ etiqueta: e.nombre, valor: e.ingresos, detalle: `${e.reservas} ${e.reservas === 1 ? 'reserva' : 'reservas'}` })),
        (n) => formatoMoneda.format(n)
    );

    // Mensajes pendientes (la lista completa está en su pestaña).
    try {
        admin.mensajes = (await apiFetch('/admin/mensajes')).mensajes;
        admin.cargadas.add('mensajes');
        pintarMensajes();
    } catch (_) {
        document.getElementById('lista-mensajes-pendientes').innerHTML = '<li class="grafico-vacio">No se pudieron cargar los mensajes.</li>';
    }
}

/* ----------------------------------------------------------------------------
   FILTROS Y ACCIONES
   ---------------------------------------------------------------------------- */

function iniciarFiltros() {
    const conRetardoCorto = (funcion) => conRetardo(funcion, 200);
    document.getElementById('buscar-empresas').addEventListener('input', conRetardoCorto(pintarEmpresas));
    document.getElementById('estado-empresas').addEventListener('change', pintarEmpresas);
    document.getElementById('buscar-usuarios').addEventListener('input', conRetardoCorto(pintarUsuarios));
    document.getElementById('rol-usuarios').addEventListener('change', pintarUsuarios);
    document.getElementById('buscar-publicaciones').addEventListener('input', conRetardoCorto(pintarPublicaciones));
    document.getElementById('buscar-reservas-admin').addEventListener('input', conRetardoCorto(pintarReservas));
    document.getElementById('estado-reservas-admin').addEventListener('change', pintarReservas);
    document.getElementById('filtros-tipo-admin').addEventListener('click', (evento) => {
        const boton = evento.target.closest('.tipo-boton');
        if (!boton || boton.dataset.tipo === admin.tipoPublicacion) return;
        admin.tipoPublicacion = boton.dataset.tipo;
        document.querySelectorAll('#filtros-tipo-admin .tipo-boton').forEach((b) => b.classList.toggle('activo', b === boton));
        cargarPublicaciones();
    });
}

function iniciarAcciones() {
    // Suspender o reactivar cuentas (empresas y usuarios).
    document.querySelector('main').addEventListener('change', (evento) => {
        const casilla = evento.target;
        if (casilla.matches('[data-accion="cuenta"]')) {
            casilla.checked = !casilla.checked;   // el cambio se aplica al confirmar
            pedirCambioCuenta(Number(casilla.dataset.usuario), !casilla.checked, casilla.dataset.nombre);
        }
        if (casilla.matches('[data-accion="visible"], [data-accion="destacada"]')) moderar(casilla);
        if (casilla.matches('[data-accion="resena-visible"]')) moderarResena(casilla);
    });
    document.querySelectorAll('[data-filtro-resenas]').forEach((boton) => {
        boton.addEventListener('click', () => {
            admin.filtroResenas = boton.dataset.filtroResenas;
            admin.resenasVisibles = 12;
            document.querySelectorAll('[data-filtro-resenas]').forEach((otro) => {
                otro.classList.toggle('activo', otro === boton);
                otro.setAttribute('aria-pressed', String(otro === boton));
            });
            pintarResenas();
        });
    });
    document.getElementById('boton-confirmar-cuenta').addEventListener('click', confirmarCambioCuenta);
    document.getElementById('boton-mas-resenas-admin').addEventListener('click', () => {
        admin.resenasVisibles += 12;
        pintarResenas();
    });
    document.getElementById('lista-mensajes').addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-mensaje]');
        if (boton) marcarMensaje(Number(boton.dataset.mensaje), boton.dataset.atendido === 'true');
    });
}

function pedirCambioCuenta(idUsuario, activo, nombre) {
    admin.cuentaPendiente = { idUsuario, activo, nombre };
    document.getElementById('cuenta-titulo').textContent = activo ? 'Reactivar cuenta' : 'Suspender cuenta';
    document.getElementById('cuenta-texto').textContent = activo
        ? `La cuenta de ${nombre} podrá iniciar sesión de nuevo y, si es una empresa, sus publicaciones visibles volverán al catálogo.`
        : `La cuenta de ${nombre} no podrá iniciar sesión y su sesión actual se cerrará. Si es una empresa, sus publicaciones dejarán de mostrarse y de recibir reservas.`;
    const boton = document.getElementById('boton-confirmar-cuenta');
    boton.textContent = activo ? 'Reactivar' : 'Suspender';
    boton.className = activo ? 'btn-primario' : 'btn-secundario';
    document.getElementById('cuenta-error').classList.remove('visible');
    abrirModal('modal-cuenta');
}

async function confirmarCambioCuenta() {
    const pendiente = admin.cuentaPendiente;
    if (!pendiente) return;
    const boton = document.getElementById('boton-confirmar-cuenta');
    const texto = boton.textContent;
    botonCargando(boton, 'Aplicando...');
    try {
        await apiFetch(`/admin/usuarios/${pendiente.idUsuario}/estado`, { method: 'PATCH', body: { activo: pendiente.activo } });
        cerrarModal('modal-cuenta');
        mostrarAviso(pendiente.activo ? `Cuenta de ${pendiente.nombre} reactivada.` : `Cuenta de ${pendiente.nombre} suspendida.`, 'exito');
        for (const lista of [admin.empresas, admin.usuarios]) {
            lista.filter((x) => (x.idUsuario || x.id) === pendiente.idUsuario).forEach((x) => { x.activo = pendiente.activo; });
        }
        pintarEmpresas();
        pintarUsuarios();
        invalidar('resumen', 'publicaciones');
    } catch (error) {
        const mensaje = document.getElementById('cuenta-error');
        mensaje.textContent = error.message;
        mensaje.classList.add('visible');
    } finally {
        botonNormal(boton, texto);
    }
}

/* ----------------------------------------------------------------------------
   EMPRESAS
   ---------------------------------------------------------------------------- */

async function cargarEmpresas() {
    const cuerpo = document.getElementById('tabla-empresas');
    cuerpo.innerHTML = '<tr><td colspan="7"><span class="resumen-cargando"><span class="spinner" aria-hidden="true"></span>Cargando empresas...</span></td></tr>';
    try {
        admin.empresas = (await apiFetch('/admin/empresas')).empresas;
    } catch (error) {
        cuerpo.innerHTML = '';
        errorDeCarga(document.getElementById('empresas-vacio'), error);
        return;
    }
    pintarEmpresas();
}

function pintarEmpresas() {
    if (!admin.cargadas.has('empresas')) return;
    const texto = document.getElementById('buscar-empresas').value.trim().toLowerCase();
    const filtro = document.getElementById('estado-empresas').value;
    const lista = admin.empresas.filter((e) => (!filtro || (filtro === 'activa') === e.activo)
        && (!texto || [e.nombre, e.razonSocial, e.rnc, e.representante, e.correo].some((v) => v && v.toLowerCase().includes(texto))));
    const vacio = document.getElementById('empresas-vacio');
    vacio.innerHTML = lista.length ? '' : crearEstado({ titulo: 'Ninguna empresa coincide con la búsqueda' });
    document.getElementById('tabla-empresas').innerHTML = lista.map((e) => `
        <tr class="${e.activo ? '' : 'fila-suspendida'}">
            <td data-titulo="Empresa"><strong>${escaparHtml(e.nombre)}</strong>
                <span class="dato-secundario">${escaparHtml(e.razonSocial)}, RNC ${escaparHtml(e.rnc)}</span>
                <span class="dato-secundario">${escaparHtml(e.ubicacion)}${e.licenciaMitur ? `, ${escaparHtml(e.licenciaMitur)}` : ''}</span></td>
            <td data-titulo="Representante">${escaparHtml(e.representante)}
                <span class="dato-secundario"><a href="mailto:${escaparHtml(e.correo)}">${correoCortable(e.correo)}</a></span></td>
            <td data-titulo="Servicio"><span class="etiqueta-servicio servicio-${e.tipoServicio}">${NOMBRES_SERVICIO[e.tipoServicio]}</span></td>
            <td data-titulo="Publicaciones">${e.hoteles + e.actividades + (e.vehiculos || 0)}
                <span class="dato-secundario">${e.tipoServicio === 'vehiculos' ? `${e.vehiculos || 0} autos` : `${e.hoteles} aloj., ${e.actividades} act.`}</span></td>
            <td data-titulo="Reservas">${e.reservas}</td>
            <td data-titulo="Ingresos"><strong>${formatoMoneda.format(e.ingresos)}</strong></td>
            <td data-titulo="Cuenta">${interruptor({ accion: 'cuenta', activo: e.activo, textoSi: 'Activa', textoNo: 'Suspendida', datos: `data-usuario="${e.idUsuario}" data-nombre="${escaparHtml(e.nombre)}"` })}</td>
        </tr>`).join('');
}

/* ----------------------------------------------------------------------------
   USUARIOS
   ---------------------------------------------------------------------------- */

async function cargarUsuarios() {
    const cuerpo = document.getElementById('tabla-usuarios');
    cuerpo.innerHTML = '<tr><td colspan="6"><span class="resumen-cargando"><span class="spinner" aria-hidden="true"></span>Cargando usuarios...</span></td></tr>';
    try {
        admin.usuarios = (await apiFetch('/admin/usuarios')).usuarios;
    } catch (error) {
        cuerpo.innerHTML = '';
        errorDeCarga(document.getElementById('usuarios-vacio'), error);
        return;
    }
    pintarUsuarios();
}

function pintarUsuarios() {
    if (!admin.cargadas.has('usuarios')) return;
    const texto = document.getElementById('buscar-usuarios').value.trim().toLowerCase();
    const rol = document.getElementById('rol-usuarios').value;
    const lista = admin.usuarios.filter((u) => (!rol || u.rol === rol)
        && (!texto || [u.nombre, u.correo, u.empresa && u.empresa.nombre].some((v) => v && v.toLowerCase().includes(texto))));
    document.getElementById('usuarios-vacio').innerHTML = lista.length ? '' : crearEstado({ titulo: 'Ningún usuario coincide con la búsqueda' });
    document.getElementById('tabla-usuarios').innerHTML = lista.map((u) => `
        <tr class="${u.activo ? '' : 'fila-suspendida'}">
            <td data-titulo="Usuario"><strong>${escaparHtml(u.nombre)}</strong>
                <span class="dato-secundario"><a href="mailto:${escaparHtml(u.correo)}">${correoCortable(u.correo)}</a></span></td>
            <td data-titulo="Tipo"><span class="etiqueta-servicio ${u.rol === 'empresa' ? 'servicio-mixto' : 'servicio-viajero'}">${u.rol === 'empresa' ? 'Empresa' : 'Viajero'}</span>
                ${u.empresa ? `<span class="dato-secundario">${escaparHtml(u.empresa.nombre)}</span>` : ''}</td>
            <td data-titulo="Teléfono">${escaparHtml(u.telefono || '—')}</td>
            <td data-titulo="Reservas">${u.rol === 'cliente' ? u.reservas : '—'}</td>
            <td data-titulo="Registro">${escaparHtml(fechaCorta(u.fechaCreacion))}</td>
            <td data-titulo="Cuenta">${interruptor({ accion: 'cuenta', activo: u.activo, textoSi: 'Activa', textoNo: 'Suspendida', datos: `data-usuario="${u.id}" data-nombre="${escaparHtml(u.nombre)}"` })}</td>
        </tr>`).join('');
}

/* ----------------------------------------------------------------------------
   PUBLICACIONES
   ---------------------------------------------------------------------------- */

async function cargarPublicaciones() {
    const lista = document.getElementById('lista-publicaciones-admin');
    const tipo = admin.tipoPublicacion;
    lista.innerHTML = Array.from({ length: 3 }, () => '<div class="fila-publicacion fila-esqueleto esqueleto" aria-hidden="true"></div>').join('');
    try {
        const respuesta = await apiFetch(`/admin/publicaciones?tipo=${tipo}`);
        if (tipo !== admin.tipoPublicacion) return;
        admin.publicaciones = respuesta.publicaciones;
    } catch (error) {
        errorDeCarga(lista, error);
        return;
    }
    admin.cargadas.add('publicaciones');
    pintarPublicaciones();
}

function pintarPublicaciones() {
    const lista = document.getElementById('lista-publicaciones-admin');
    const texto = document.getElementById('buscar-publicaciones').value.trim().toLowerCase();
    const visibles = admin.publicaciones.filter((p) => !texto
        || [p.nombre, p.ciudad, p.proveedor].some((v) => v && v.toLowerCase().includes(texto)));
    if (!visibles.length) {
        lista.innerHTML = crearEstado({ titulo: 'Ninguna publicación coincide con la búsqueda' });
        return;
    }
    lista.innerHTML = visibles.map((p, indice) => {
        const categoria = CATALOGOS.categorias[p.categoria];
        const media = p.imagen
            ? `<img src="${escaparHtml(urlRecurso(p.imagen))}" alt="" loading="lazy" onerror="this.parentElement.classList.add('sin-foto')">`
            : '';
        const datos = `data-tipo="${p.tipo}" data-id="${p.id}"`;
        return `
            <article class="fila-publicacion fila-admin${p.activo ? '' : ' es-oculta'}" style="animation-delay:${Math.min(indice, 8) * 40}ms">
                <div class="fila-media${p.imagen ? '' : ' sin-foto'}">${media}</div>
                <div class="fila-info">
                    <span class="fila-categoria">${escaparHtml(categoria ? categoria.nombre : '')}${p.destacado ? ' (destacada)' : ''}</span>
                    <h3><a href="${enlaceDetalle(p)}" target="_blank" rel="noopener">${escaparHtml(p.nombre)}</a></h3>
                    <p>${escaparHtml(p.ciudad)}, ${escaparHtml(p.proveedor)}</p>
                </div>
                <div class="fila-precio">${formatoMoneda.format(p.precio)}<small>${unidadPrecio(p.tipo)}</small></div>
                <div class="fila-acciones">
                    ${interruptor({ accion: 'destacada', activo: p.destacado, textoSi: 'Destacada', textoNo: 'Normal', datos })}
                    ${interruptor({ accion: 'visible', activo: p.activo, textoSi: 'Visible', textoNo: 'Oculta', datos })}
                </div>
            </article>`;
    }).join('');
}

async function moderar(casilla) {
    const { tipo, id } = casilla.dataset;
    const campo = casilla.dataset.accion === 'visible' ? 'activo' : 'destacado';
    const valor = casilla.checked;
    casilla.disabled = true;
    try {
        await apiFetch(`/admin/publicaciones/${tipo}/${id}`, { method: 'PATCH', body: { [campo]: valor } });
        const publicacion = admin.publicaciones.find((p) => p.tipo === tipo && p.id === Number(id));
        if (publicacion) publicacion[campo] = valor;
        mostrarAviso(campo === 'activo'
            ? (valor ? 'Publicación visible en el catálogo.' : 'Publicación ocultada del catálogo.')
            : (valor ? 'Publicación destacada en la página de inicio.' : 'La publicación ya no aparece como destacada.'), 'exito');
        invalidar('resumen');
        pintarPublicaciones();
    } catch (error) {
        casilla.checked = !valor;
        casilla.disabled = false;
        mostrarAviso(error.message, 'error');
    }
}

/* ----------------------------------------------------------------------------
   RESERVAS
   ---------------------------------------------------------------------------- */

async function cargarReservas() {
    const cuerpo = document.getElementById('tabla-reservas-admin');
    cuerpo.innerHTML = '<tr><td colspan="6"><span class="resumen-cargando"><span class="spinner" aria-hidden="true"></span>Cargando reservas...</span></td></tr>';
    try {
        admin.reservas = (await apiFetch('/admin/reservas')).reservas;
    } catch (error) {
        cuerpo.innerHTML = '';
        errorDeCarga(document.getElementById('reservas-admin-vacio'), error);
        return;
    }
    pintarReservas();
}

function pintarReservas() {
    if (!admin.cargadas.has('reservas')) return;
    const texto = document.getElementById('buscar-reservas-admin').value.trim().toLowerCase();
    const estadoElegido = document.getElementById('estado-reservas-admin').value;
    const lista = admin.reservas.filter((r) => (!estadoElegido || r.estado === estadoElegido)
        && (!texto || [r.codigo, r.publicacion, r.proveedor, r.cliente.nombre, r.cliente.correo].some((v) => v && v.toLowerCase().includes(texto))));
    document.getElementById('reservas-admin-vacio').innerHTML = lista.length ? '' : crearEstado({ titulo: 'Ninguna reserva coincide con la búsqueda' });
    document.getElementById('tabla-reservas-admin').innerHTML = lista.map((r) => `
        <tr>
            <td data-titulo="Código"><span class="codigo-reserva">${escaparHtml(r.codigo)}</span></td>
            <td data-titulo="Publicación">${escaparHtml(r.publicacion)}<span class="dato-secundario">${escaparHtml(r.proveedor)}</span></td>
            <td data-titulo="Cliente">${escaparHtml(r.cliente.nombre)}<span class="dato-secundario">${correoCortable(r.cliente.correo)}</span></td>
            <td data-titulo="Fechas">${escaparHtml(textoFechasReserva(r))}
                <span class="dato-secundario">${r.tipo === 'vehiculo' ? `Alquiler de auto, devuelve en ${escaparHtml(r.alquiler.ciudadDevolucion || '')}` : `${r.tipo === 'hotel' ? `${r.habitaciones} hab., ` : ''}${r.personas} pers.`}</span></td>
            <td data-titulo="Total"><strong>${formatoMoneda.format(r.total)}</strong></td>
            <td data-titulo="Estado"><span class="estado-reserva es-${r.estado}">${r.estado === 'confirmada' ? 'Confirmada' : 'Cancelada'}</span></td>
        </tr>`).join('');
}

/* ----------------------------------------------------------------------------
   MENSAJES
   ---------------------------------------------------------------------------- */

async function cargarMensajes() {
    const lista = document.getElementById('lista-mensajes');
    try {
        admin.mensajes = (await apiFetch('/admin/mensajes')).mensajes;
    } catch (error) {
        errorDeCarga(lista, error);
        return;
    }
    pintarMensajes();
}

function pintarMensajes() {
    const pendientes = admin.mensajes.filter((m) => !m.atendido);
    document.getElementById('conteo-mensajes').textContent = pendientes.length;

    document.getElementById('lista-mensajes-pendientes').innerHTML = pendientes.length
        ? pendientes.slice(0, 4).map((m) => `<li>
                <span class="lista-breve-fecha">${escaparHtml(String(m.fechaEnvio).slice(8, 10))}<small>${NOMBRES_MES[Number(String(m.fechaEnvio).slice(5, 7)) - 1]}</small></span>
                <span><strong>${escaparHtml(m.nombre)}</strong><span>${escaparHtml(m.mensaje)}</span></span>
                <span class="etiqueta-servicio servicio-viajero">${NOMBRES_ASUNTO[m.asunto]}</span>
            </li>`).join('')
        : '<li class="grafico-vacio">No hay mensajes pendientes.</li>';

    const lista = document.getElementById('lista-mensajes');
    if (!admin.mensajes.length) {
        lista.innerHTML = crearEstado({ titulo: 'No hay mensajes de contacto', texto: 'Los mensajes enviados desde la página de inicio aparecerán aquí.' });
        return;
    }
    lista.innerHTML = admin.mensajes.map((m, indice) => `
        <article class="mensaje-admin${m.atendido ? ' es-atendido' : ''}" style="animation-delay:${Math.min(indice, 8) * 40}ms">
            <header>
                <span class="etiqueta-servicio servicio-viajero">${NOMBRES_ASUNTO[m.asunto]}</span>
                <time>${escaparHtml(fechaCorta(m.fechaEnvio))}</time>
            </header>
            <h3>${escaparHtml(m.nombre)}</h3>
            <a class="mensaje-correo" href="mailto:${escaparHtml(m.correo)}?subject=${encodeURIComponent('BookingRD: respuesta a tu mensaje')}">${escaparHtml(m.correo)}</a>
            <p>${escaparHtml(m.mensaje)}</p>
            <footer>
                <span class="estado-reserva ${m.atendido ? 'es-confirmada' : 'es-cancelada'}">${m.atendido ? 'Atendido' : 'Pendiente'}</span>
                <button type="button" class="btn-outline btn-chico" data-mensaje="${m.id}" data-atendido="${!m.atendido}">${m.atendido ? 'Marcar como pendiente' : 'Marcar como atendido'}</button>
            </footer>
        </article>`).join('');
}

async function marcarMensaje(id, atendido) {
    try {
        await apiFetch(`/admin/mensajes/${id}`, { method: 'PATCH', body: { atendido } });
        const mensaje = admin.mensajes.find((m) => m.id === id);
        if (mensaje) mensaje.atendido = atendido;
        admin.mensajes.sort((a, b) => a.atendido - b.atendido);
        pintarMensajes();
        invalidar('resumen');
        mostrarAviso(atendido ? 'Mensaje marcado como atendido.' : 'Mensaje marcado como pendiente.', 'exito');
    } catch (error) {
        mostrarAviso(error.message, 'error');
    }
}

/* ----------------------------------------------------------------------------
   RESEÑAS
   La administración oculta las reseñas que incumplen las normas (lenguaje
   ofensivo, datos personales, publicidad). Una reseña oculta deja de verse
   en el detalle y de contar en la valoración media.
   ---------------------------------------------------------------------------- */

async function cargarResenas() {
    const lista = document.getElementById('lista-resenas-admin');
    lista.innerHTML = '<div class="resena esqueleto resena-esqueleto" aria-hidden="true"></div>'.repeat(2);
    try {
        admin.resenas = (await apiFetch('/admin/resenas')).resenas;
    } catch (error) {
        errorDeCarga(lista, error);
        return;
    }
    pintarResenas();
}

function pintarResenas() {
    const visibles = admin.resenas.filter((r) => r.visible);
    const promedio = visibles.length ? visibles.reduce((suma, r) => suma + r.puntuacion, 0) / visibles.length : null;
    const ocultas = admin.resenas.length - visibles.length;
    document.getElementById('resenas-admin-nota').innerHTML = promedio === null
        ? '<strong>Sin reseñas visibles</strong>'
        : `<span class="nota nota-xl">${formatoPuntuacion(promedio)}</span>
           <div><strong>${etiquetaPuntuacion(promedio)}</strong><span>${textoResenas(admin.resenas.length)}, ${ocultas} ${ocultas === 1 ? 'oculta' : 'ocultas'}</span></div>`;

    const filtros = { todas: () => true, bajas: (r) => r.puntuacion <= 6, ocultas: (r) => !r.visible };
    const filtradas = admin.resenas.filter(filtros[admin.filtroResenas]);
    const lista = document.getElementById('lista-resenas-admin');
    const botonMas = document.getElementById('boton-mas-resenas-admin');
    botonMas.hidden = filtradas.length <= admin.resenasVisibles;
    if (!filtradas.length) {
        lista.innerHTML = crearEstado({ titulo: 'No hay reseñas en esta vista' });
        return;
    }
    lista.innerHTML = filtradas.slice(0, admin.resenasVisibles).map((r) => `
        <article class="resena${r.visible ? '' : ' es-oculta'}">
            <header>
                <span class="opinion-avatar" aria-hidden="true">${escaparHtml(r.autor.charAt(0))}</span>
                <div>
                    <strong>${escaparHtml(r.autorCompleto)}</strong>
                    <small>${escaparHtml(r.publicacion)} (${escaparHtml(r.proveedor)}). ${fechaCorta(r.fecha)}</small>
                </div>
                <span class="nota">${r.puntuacion}</span>
            </header>
            <h3>${escaparHtml(r.titulo)}</h3>
            <p>${escaparHtml(r.comentario)}</p>
            ${r.respuesta ? `<div class="resena-respuesta"><strong>Respuesta de ${escaparHtml(r.proveedor)}</strong><p>${escaparHtml(r.respuesta)}</p></div>` : ''}
            <div class="acciones-moderacion">
                <a href="${enlaceDetalle({ tipo: r.tipo, id: r.idPublicacion })}" target="_blank" rel="noopener">Ver publicación</a>
                ${interruptor({ accion: 'resena-visible', activo: r.visible, textoSi: 'Visible', textoNo: 'Oculta', datos: `data-resena="${r.id}" ` })}
            </div>
        </article>`).join('');
}

async function moderarResena(casilla) {
    const id = Number(casilla.dataset.resena);
    const visible = casilla.checked;
    casilla.disabled = true;
    try {
        await apiFetch(`/admin/resenas/${id}`, { method: 'PATCH', body: { visible } });
        admin.resenas.find((r) => r.id === id).visible = visible;
        mostrarAviso(visible ? 'Reseña visible de nuevo.' : 'Reseña oculta. Ya no cuenta en la valoración.');
        invalidar('resumen');
        pintarResenas();
    } catch (error) {
        casilla.checked = !visible;
        casilla.disabled = false;
        mostrarAviso(error.message, 'error');
    }
}
