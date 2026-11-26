/**
 * @file public/js/asistente.js
 * @description Asistente de BookingRD: botón flotante con un chat guiado para
 *   los trámites más comunes. Funciona sin servicios externos: entiende
 *   palabras clave y opciones, y usa la misma API que el resto del sitio.
 *
 *   Trámites: recuperar la contraseña, reenviar el código de verificación,
 *   entrar con un código, ver y cancelar reservas, buscar alojamiento por
 *   mensaje, ayuda para empresas, hablar con una persona (mensaje de
 *   contacto), emergencias en carretera y preguntas frecuentes.
 *
 *   Lo carga comun.js en todas las páginas. Requiere apiFetch, escaparHtml,
 *   formatearPrecio, obtenerUsuario, haySesionActiva, CATALOGOS y normalizar.
 */

(function () {
    'use strict';

    const OPCIONES_INICIO = [
        ['buscar', 'Buscar un hotel'],
        ['reservas', 'Mis reservas'],
        ['cancelar', 'Cancelar una reserva'],
        ['contrasena', 'Recuperar mi contraseña'],
        ['codigo', 'No me llegó el código'],
        ['empresa', 'Soy una empresa'],
        ['persona', 'Hablar con una persona'],
        ['emergencia', 'Emergencia en carretera'],
        ['preguntas', 'Preguntas frecuentes']
    ];

    /** Palabras clave de cada trámite (sin tildes, en minúsculas). */
    const INTENCIONES = [
        ['contrasena', /contrase|clave|password|olvid|recuper/],
        ['codigo', /codigo|verific|no me llego|no llego|reenvi/],
        ['cancelar', /cancel|anular|reembols|devolu/],
        ['reservas', /mis reserva|reserva|recibo|comprobante|booking/],
        ['empresa', /empresa|publicar|publico|oferta|negocio|hotel propio|panel/],
        ['emergencia', /emergencia|grua|accidente|goma|carretera|911|auxilio/],
        ['persona', /persona|humano|agente|soporte|ayuda|queja|contacto|hablar/],
        ['preguntas', /pregunta|pago|tarjeta|moneda|dolar|documento|licencia|horario/],
        ['buscar', /hotel|alojamiento|resort|villa|dormir|hosped|buscar|quiero ir|playa|viaje/]
    ];

    const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    let panel;
    let mensajes;
    let entrada;
    let esperando = null;     // función que recibe el próximo texto escrito
    let contexto = {};

    /* ------------------------------------------------------------------ */

    function crear() {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'asistente-boton';
        boton.setAttribute('aria-label', 'Abrir el asistente de BookingRD');
        boton.setAttribute('aria-expanded', 'false');
        boton.setAttribute('aria-controls', 'asistente-panel');
        boton.innerHTML = `
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7h20a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H14l-6 5v-5H6a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3z"/><circle cx="11" cy="15.5" r="1.8"/><circle cx="16" cy="15.5" r="1.8"/><circle cx="21" cy="15.5" r="1.8"/></svg>
            <span>¿Te ayudo?</span>`;

        panel = document.createElement('section');
        panel.className = 'asistente-panel';
        panel.id = 'asistente-panel';
        panel.hidden = true;
        panel.setAttribute('aria-label', 'Asistente de BookingRD');
        panel.innerHTML = `
            <header class="asistente-cabecera">
                <span class="asistente-avatar" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <div><strong>Caribe</strong><small id="asistente-subtitulo">Asistente de BookingRD</small></div>
                <button type="button" class="asistente-cerrar" aria-label="Cerrar el asistente">&times;</button>
            </header>
            <div class="asistente-mensajes" role="log" aria-live="polite"></div>
            <form class="asistente-entrada" autocomplete="off">
                <input type="text" maxlength="300" placeholder="Escribe tu pregunta..." aria-label="Mensaje para el asistente">
                <button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l18-8L3 4l2 7 9 1-9 1z"/></svg></button>
            </form>`;
        document.body.append(boton, panel);
        mensajes = panel.querySelector('.asistente-mensajes');
        entrada = panel.querySelector('input');

        const abrir = (abierto) => {
            panel.hidden = !abierto;
            boton.setAttribute('aria-expanded', String(abierto));
            boton.classList.toggle('abierto', abierto);
            if (abierto) {
                if (!mensajes.childElementCount) saludar();
                setTimeout(() => entrada.focus(), 50);
            }
        };
        boton.addEventListener('click', () => abrir(panel.hidden));
        panel.querySelector('.asistente-cerrar').addEventListener('click', () => {
            abrir(false);
            boton.focus();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) {
                abrir(false);
                boton.focus();
            }
        });
        panel.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            const texto = entrada.value.trim();
            if (!texto) return;
            entrada.value = '';
            escribirUsuario(texto);
            const responder = esperando;
            esperando = null;
            if (responder) responder(texto);
            else interpretar(texto);
        });
        mensajes.addEventListener('click', (e) => {
            const opcion = e.target.closest('[data-opcion]');
            if (!opcion || opcion.disabled) return;
            opcion.closest('.asistente-opciones').querySelectorAll('button').forEach((b) => { b.disabled = true; });
            escribirUsuario(opcion.textContent);
            esperando = null;
            ejecutar(opcion.dataset.opcion, opcion.dataset.valor);
        });
        // Abrir el asistente desde cualquier enlace con data-abrir-asistente.
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-abrir-asistente]')) {
                e.preventDefault();
                abrir(true);
            }
        });
    }

    /* ------------------------------------------------------------------ */

    function burbuja(html, clase) {
        const div = document.createElement('div');
        div.className = `asistente-burbuja ${clase}`;
        div.innerHTML = html;
        mensajes.appendChild(div);
        mensajes.scrollTop = mensajes.scrollHeight;
        return div;
    }

    function escribirUsuario(texto) {
        burbuja(escaparHtml(texto), 'del-usuario');
    }

    /** Respuesta del asistente con una pequeña pausa de "escribiendo". */
    function decir(html, opciones = []) {
        const escribiendo = burbuja('<span class="asistente-escribiendo"><i></i><i></i><i></i></span>', 'del-asistente');
        return new Promise((resolver) => {
            setTimeout(() => {
                escribiendo.innerHTML = html;
                if (opciones.length) {
                    const lista = document.createElement('div');
                    lista.className = 'asistente-opciones';
                    lista.innerHTML = opciones.map(([clave, texto, valor]) =>
                        `<button type="button" data-opcion="${escaparHtml(clave)}"${valor !== undefined ? ` data-valor="${escaparHtml(String(valor))}"` : ''}>${escaparHtml(texto)}</button>`).join('');
                    escribiendo.after(lista);
                }
                mensajes.scrollTop = mensajes.scrollHeight;
                resolver();
            }, 450);
        });
    }

    function preguntar(html, alResponder, opciones = []) {
        esperando = alResponder;
        return decir(html, opciones);
    }

    const volverAlMenu = () => decir('¿Te ayudo con algo más?', [['menu', 'Ver todas las opciones'], ['adios', 'No, gracias']]);

    function saludar() {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        const nombre = usuario ? `, ${escaparHtml(usuario.nombre.split(' ')[0])}` : '';
        decir(`¡Hola${nombre}! Soy Caribe, el asistente de BookingRD. Puedo hacer trámites por ti o llevarte a donde necesitas. Elige una opción o escríbeme tu pregunta.`, OPCIONES_INICIO);
    }

    /** Entiende la pregunta por palabras clave y responde con la opción que corresponde. */
    function interpretar(texto) {
        const limpio = sinTildes(texto);
        if (/^(hola|buenas|saludos|hey)\b/.test(limpio)) return saludar();
        if (/gracias|adios|chao|listo/.test(limpio)) return ejecutar('adios');
        // Un destino en el mensaje ("hotel en Samaná para 2") va directo a la búsqueda.
        const destino = (CATALOGOS.destinos || []).find((d) => limpio.includes(sinTildes(d)));
        if (destino && !/cancel|contrase|codigo/.test(limpio)) return buscarHoteles(texto);
        const intencion = INTENCIONES.find(([, patron]) => patron.test(limpio));
        if (intencion) return ejecutar(intencion[0], texto);
        return decir('No estoy seguro de haber entendido. Estas son las cosas que puedo hacer:', OPCIONES_INICIO);
    }

    /* ------------------------------------------------------------------ */

    async function ejecutar(clave, valor) {
        switch (clave) {
            case 'menu': return decir('Claro, ¿qué necesitas?', OPCIONES_INICIO);
            case 'adios': return decir('¡Con gusto! Si necesitas algo más, aquí estaré. Buen viaje.');
            case 'contrasena': return recuperarContrasena();
            case 'codigo': return reenviarCodigo();
            case 'reservas': return verReservas();
            case 'cancelar': return elegirCancelacion();
            case 'confirmar-cancelacion': return confirmarCancelacion(Number(valor));
            case 'cancelar-de-verdad': return cancelarDeVerdad(Number(valor));
            case 'buscar': return buscarHoteles(valor && valor !== 'buscar' ? valor : null);
            case 'destino': return buscarHoteles(valor);
            case 'empresa': return ayudaEmpresa();
            case 'persona': return hablarConPersona();
            case 'emergencia': return emergencia();
            case 'preguntas': return preguntasFrecuentes();
            case 'faq': return responderFaq(valor);
            case 'entrar-codigo': return decir('En la página de inicio de sesión pulsa <strong>Entrar con un código por correo</strong>, escribe tu correo y te llegará un código de 6 dígitos. <a href="login.html">Ir a iniciar sesión</a>.');
            default: return decir('Elige una opción:', OPCIONES_INICIO);
        }
    }

    const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
    const enlaceDemo = (vistaPrevia) => (vistaPrevia
        ? `<br><small>Modo de demostración: <a href="${escaparHtml(vistaPrevia)}" target="_blank" rel="noopener">abrir el correo</a>.</small>` : '');

    function pedirCorreo(texto, alTener) {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        return preguntar(texto, (respuesta) => {
            const correo = respuesta.trim().toLowerCase();
            if (!correoValido(correo)) return pedirCorreo('Ese correo no parece válido. Escríbelo así: nombre@gmail.com', alTener);
            return alTener(correo);
        }, usuario ? [] : []);
    }

    function recuperarContrasena() {
        return pedirCorreo('Te envío un enlace para crear una contraseña nueva. ¿Cuál es el correo de tu cuenta?', async (correo) => {
            try {
                const r = await apiFetch('/auth/recuperar', { method: 'POST', body: { correo } });
                await decir(`Listo. Si <strong>${escaparHtml(correo)}</strong> tiene una cuenta, te llegó un enlace que vence en ${r.minutos} minutos y solo sirve una vez. Mira también en Spam o Promociones.${enlaceDemo(r.vistaPrevia)}`);
                return decir('También puedes entrar sin contraseña con un código por correo.', [['entrar-codigo', 'Cómo entrar con un código'], ['menu', 'Otra cosa']]);
            } catch (error) {
                await decir(escaparHtml(error.message));
                return volverAlMenu();
            }
        });
    }

    function reenviarCodigo() {
        return pedirCorreo('Te reenvío el código para terminar tu registro. ¿Con qué correo te registraste?', async (correo) => {
            try {
                const r = await apiFetch('/auth/registro/reenviar', { method: 'POST', body: { correo } });
                await decir(`Te envié un código nuevo a <strong>${escaparHtml(correo)}</strong>. Vence en ${r.minutos} minutos. Escríbelo en la página de registro.${enlaceDemo(r.vistaPrevia)}`);
            } catch (error) {
                if (error.status === 410) {
                    await decir('No encuentro un registro pendiente con ese correo. Puede que ya tengas cuenta o que el registro haya vencido.', [['contrasena', 'Recuperar mi contraseña'], ['menu', 'Otra cosa']]);
                    return undefined;
                }
                await decir(escaparHtml(error.message));
            }
            return volverAlMenu();
        });
    }

    function exigirViajero() {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        if (usuario && usuario.rol === 'cliente') return true;
        const volver = encodeURIComponent(location.pathname.split('/').pop() + location.search);
        decir(usuario
            ? 'Las reservas son de las cuentas de viajero. Con tu cuenta de empresa las ves en <a href="panel-empresa.html#reservas">tu panel</a>.'
            : `Para eso necesito que inicies sesión. <a href="login.html?volver=${volver}">Iniciar sesión</a> o <a href="registro.html">crear una cuenta</a>.`);
        return false;
    }

    async function cargarReservas() {
        const datos = await apiFetch('/reservas');
        const hoyIso = new Date().toISOString().slice(0, 10);
        return (datos.reservas || datos || [])
            .filter((r) => r.estado === 'confirmada' && r.fechaInicio >= hoyIso)
            .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
    }

    async function verReservas() {
        if (!exigirViajero()) return undefined;
        try {
            const proximas = await cargarReservas();
            if (!proximas.length) {
                await decir('No tienes reservas próximas. ¿Buscamos algo?', [['buscar', 'Buscar un hotel'], ['menu', 'Otra cosa']]);
                return undefined;
            }
            const lista = proximas.slice(0, 3).map((r) => `
                <li><strong>${escaparHtml(r.publicacion)}</strong><br>
                ${escaparHtml(formatearFecha(r.fechaInicio))}${r.fechaFin ? ` al ${escaparHtml(formatearFecha(r.fechaFin))}` : ''} · Código <span translate="no">${escaparHtml(r.codigo)}</span><br>
                <small>${r.pago && r.pago.metodo === 'tarjeta' ? 'Pagada con tarjeta' : 'Pago en el destino'} · ${escaparHtml(formatearPrecio(r.total))}</small></li>`).join('');
            await decir(`Tienes ${proximas.length} ${proximas.length === 1 ? 'reserva próxima' : 'reservas próximas'}:<ul class="asistente-lista">${lista}</ul><a href="mis-reservas.html">Ver todas en Mis reservas</a>`);
            return decir('¿Quieres hacer algo con alguna?', [['cancelar', 'Cancelar una reserva'], ['menu', 'Otra cosa']]);
        } catch (error) {
            await decir(escaparHtml(error.message));
            return volverAlMenu();
        }
    }

    async function elegirCancelacion() {
        if (!exigirViajero()) return undefined;
        try {
            const proximas = await cargarReservas();
            const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            contexto.cancelables = proximas.filter((r) => r.fechaInicio >= manana);
            if (!contexto.cancelables.length) {
                await decir('No tienes reservas que se puedan cancelar (se cancelan hasta un día antes).');
                return volverAlMenu();
            }
            return decir('¿Cuál quieres cancelar?', contexto.cancelables.slice(0, 5).map((r) =>
                ['confirmar-cancelacion', `${r.publicacion} (${formatearFecha(r.fechaInicio)})`, r.id]).concat([['menu', 'Ninguna']]));
        } catch (error) {
            await decir(escaparHtml(error.message));
            return volverAlMenu();
        }
    }

    function confirmarCancelacion(id) {
        const r = (contexto.cancelables || []).find((x) => x.id === id);
        if (!r) return decir('No encontré esa reserva.', OPCIONES_INICIO);
        let detalle = 'Como pagas en el destino, la cancelación no tiene cargo.';
        if (r.pago && r.pago.metodo === 'tarjeta' && r.pago.estado === 'pagado') {
            const t = typeof textoReembolso === 'function' ? textoReembolso(r.pago) : null;
            detalle = t
                ? `Te reembolsamos <strong>${t.reembolso}</strong> a tu ${escaparHtml(r.pago.marca)} terminada en ${escaparHtml(r.pago.ultimos4)}; se retiene el 10 % (${t.cargo}).`
                : 'Te reembolsamos el 90 % a tu tarjeta; se retiene el 10 % como cargo por cancelación.';
        }
        return decir(`Vas a cancelar <strong>${escaparHtml(r.publicacion)}</strong> (código <span translate="no">${escaparHtml(r.codigo)}</span>). ${detalle} Esta acción no se puede deshacer.`,
            [['cancelar-de-verdad', 'Sí, cancelar la reserva', id], ['menu', 'No, mantenerla']]);
    }

    async function cancelarDeVerdad(id) {
        try {
            const r = await apiFetch(`/reservas/${id}/cancelar`, { method: 'PATCH' });
            const reembolso = r && r.reembolso;
            await decir(reembolso
                ? `Reserva cancelada. Reembolso de ${escaparHtml(importeCobradoAsistente(reembolso))} a ${escaparHtml(reembolso.marca)} •••• ${escaparHtml(reembolso.ultimos4)}. Te llegará la confirmación por correo.`
                : 'Reserva cancelada. No había cobro por adelantado.');
        } catch (error) {
            await decir(escaparHtml(error.message));
        }
        return volverAlMenu();
    }

    function importeCobradoAsistente(r) {
        if (r.moneda === 'USD' && r.montoCobrado) return `US$${Number(r.montoCobrado).toFixed(2)}`;
        return formatearPrecio(r.monto);
    }

    /** Destino, personas y fin de semana a partir de un mensaje libre. */
    function entenderBusqueda(texto) {
        const limpio = sinTildes(texto);
        const destino = (CATALOGOS.destinos || []).find((d) => limpio.includes(sinTildes(d)));
        const numero = limpio.match(/(\d+)\s*(personas|adultos|huespedes|gente|somos)?/);
        const personas = numero ? Math.min(30, Number(numero[1])) : (/pareja|dos\b/.test(limpio) ? 2 : null);
        return { destino, personas, finde: /fin de semana|finde|weekend/.test(limpio) };
    }

    async function buscarHoteles(texto) {
        if (!texto) {
            const populares = ['Punta Cana', 'Samaná', 'Santo Domingo', 'Puerto Plata', 'La Romana', 'Jarabacoa'];
            return preguntar('¿A dónde quieres ir? Puedes escribir algo como "hotel en Samaná para 2 este fin de semana".',
                buscarHoteles, populares.map((d) => ['destino', d, d]));
        }
        const { destino, personas, finde } = entenderBusqueda(texto);
        if (!destino) return preguntar('¿En qué destino? Por ejemplo: Punta Cana, Samaná o Jarabacoa.', (t) => buscarHoteles(`${t} ${texto}`));
        const parametros = new URLSearchParams({ tipo: 'hotel', ciudad: destino, orden: 'valoracion', porPagina: '3' });
        if (personas) parametros.set('personas', personas);
        const enlace = new URLSearchParams({ tipo: 'hotel', ciudad: destino });
        if (personas) enlace.set('personas', personas);
        if (finde) {
            const hoy = new Date();
            const viernes = new Date(hoy.getTime() + (((5 - hoy.getDay() + 7) % 7) || 7) * 86400000);
            const domingo = new Date(viernes.getTime() + 2 * 86400000);
            enlace.set('entrada', viernes.toISOString().slice(0, 10));
            enlace.set('salida', domingo.toISOString().slice(0, 10));
        }
        try {
            const datos = await apiFetch(`/publicaciones?${parametros}`);
            if (!datos.publicaciones.length) {
                await decir(`No encontré alojamiento en ${escaparHtml(destino)}${personas ? ` para ${personas} personas` : ''}. <a href="explorar.html?tipo=hotel">Ver todos los destinos</a>.`);
                return volverAlMenu();
            }
            const tarjetas = datos.publicaciones.map((p) => {
                const detalle = new URLSearchParams({ tipo: 'hotel', id: p.id });
                ['entrada', 'salida', 'personas'].forEach((c) => { if (enlace.get(c)) detalle.set(c, enlace.get(c)); });
                return `<a class="asistente-tarjeta" href="detalle.html?${detalle}">
                    ${p.imagen ? `<img src="${escaparHtml(urlRecurso(urlMiniatura(p.imagen)))}" alt="">` : ''}
                    <span><strong>${escaparHtml(p.nombre)}</strong><small>${p.puntuacion ? `${String(p.puntuacion).replace('.', ',')} · ` : ''}desde ${escaparHtml(formatearPrecio(p.precio))} por noche</small></span>
                </a>`;
            }).join('');
            await decir(`Estos son los mejor valorados en <strong>${escaparHtml(destino)}</strong>${personas ? ` para ${personas} personas` : ''}${finde ? ' este fin de semana' : ''}:<div class="asistente-tarjetas">${tarjetas}</div><a href="explorar.html?${enlace}">${datos.total === 1 ? 'Ver el resultado' : `Ver los ${datos.total} resultados`}</a>`);
            return volverAlMenu();
        } catch (error) {
            await decir(escaparHtml(error.message));
            return volverAlMenu();
        }
    }

    function ayudaEmpresa() {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        if (usuario && usuario.rol === 'empresa') {
            return decir('Para publicar: abre <a href="panel-empresa.html#publicaciones">Mi panel &gt; Publicaciones</a> y pulsa <strong>Nueva publicación</strong>. Completa nombre, destino, precio y descripción, y sube una foto. Aparece al instante en el catálogo. Las reservas nuevas te llegan por correo y en la campana.', [['menu', 'Otra cosa']]);
        }
        return decir('Así funciona para empresas:<ol class="asistente-lista"><li>Crea tu cuenta de empresa (representante, RNC y servicios).</li><li>Confirma tu correo con el código de 6 dígitos.</li><li>En tu panel, publica alojamientos, actividades o autos con foto y precio.</li><li>Recibe reservas y pagos, responde reseñas y ve tus ingresos.</li></ol><a href="registro.html?tipo=empresa">Registrar mi empresa</a>', [['menu', 'Otra cosa']]);
    }

    function hablarConPersona() {
        const usuario = haySesionActiva() ? obtenerUsuario() : null;
        contexto.contacto = { nombre: usuario ? usuario.nombre : '' };
        const pedirMensaje = () => preguntar('Escribe tu mensaje (lo que necesitas, con el código de reserva si aplica):', async (mensaje) => {
            if (mensaje.length < 10) return pedirMensaje();
            try {
                await apiFetch('/contacto', { method: 'POST', body: {
                    nombre: contexto.contacto.nombre, correo: contexto.contacto.correo,
                    asunto: /reserva|brd/i.test(mensaje) ? 'viajero' : /cuenta|contrase|correo/i.test(mensaje) ? 'cuenta' : 'otro', mensaje
                } });
                await decir('Recibimos tu mensaje. El equipo de BookingRD te responde en un día laborable al correo que nos diste.');
            } catch (error) {
                await decir(escaparHtml(error.message));
            }
            return volverAlMenu();
        });
        const pedirCorreoContacto = () => pedirCorreo('¿A qué correo te respondemos?', (correo) => {
            contexto.contacto.correo = correo;
            return pedirMensaje();
        });
        if (contexto.contacto.nombre) return pedirCorreoContacto();
        return preguntar('Te comunico con el equipo. ¿Cómo te llamas?', (nombre) => {
            contexto.contacto.nombre = nombre.slice(0, 100);
            return pedirCorreoContacto();
        });
    }

    function emergencia() {
        return decir('Si hay heridos o peligro, llama ya:<ul class="asistente-lista"><li><a href="tel:911"><strong>911</strong></a>: emergencias, accidentes y asistencia en carretera.</li><li><a href="tel:*462"><strong>*462</strong></a>: línea del Gobierno (orientación y servicios).</li></ul>Para una grúa por provincia o compartir tu ubicación: <a href="ruta.html#asistencia">Asistencia vial</a>.', [['menu', 'Otra cosa']]);
    }

    const FAQ = {
        pago: '¿Cómo se paga?',
        cancelacion: '¿Cuánto me devuelven si cancelo?',
        auto: '¿Qué necesito para alquilar un auto?',
        moneda: '¿Puedo pagar en dólares?',
        tarjetas: '¿Las tarjetas de prueba son reales?'
    };
    const RESPUESTAS = {
        pago: 'Con tarjeta al reservar (Visa, Mastercard o American Express) o en el destino al llegar. Recibes el comprobante al instante y por correo.',
        cancelacion: 'Puedes cancelar hasta un día antes desde Mis reservas. Si pagaste con tarjeta te devolvemos el 90 % y se retiene el 10 % como cargo por cancelación. Si ibas a pagar en el destino, no hay cargo.',
        auto: 'Licencia vigente (la de tu país sirve los primeros 90 días), cédula o pasaporte y una tarjeta de crédito a tu nombre para el depósito. Menores de 25 pueden pagar un cargo por conductor joven.',
        moneda: 'Sí. En la ventana de pago eliges pesos o dólares; usamos la tasa del día y queda en tu recibo. También puedes ver los precios en US$ o € con el botón ES / RD$.',
        tarjetas: 'No. Son números de prueba públicos (como 4242 4242 4242 4242) porque los pagos de BookingRD son una simulación: no se cobra dinero real.'
    };

    function preguntasFrecuentes() {
        return decir('Estas son las preguntas más comunes:', Object.entries(FAQ).map(([c, t]) => ['faq', t, c]).concat([['menu', 'Otra cosa']]));
    }

    function responderFaq(clave) {
        return decir(escaparHtml(RESPUESTAS[clave] || ''), Object.entries(FAQ).filter(([c]) => c !== clave).slice(0, 3).map(([c, t]) => ['faq', t, c]).concat([['menu', 'Otra cosa']]));
    }

    function iniciar() {
        crear();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
}());
