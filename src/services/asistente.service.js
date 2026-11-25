/**
 * @file src/services/asistente.service.js
 * @description Respuestas con IA para el asistente Caribe (opcional).
 *
 *   Si .env tiene ANTHROPIC_API_KEY, el asistente envía la pregunta del
 *   visitante a la API de Anthropic (modelo ASISTENTE_MODELO, por defecto
 *   claude-haiku-4-5-20251001) junto con datos públicos del catálogo
 *   (destinos, alojamientos con precio y valoración, políticas). La IA
 *   responde en JSON con un texto breve y, si corresponde, una acción que el
 *   asistente ejecuta con sus propios botones (buscar, recuperar contraseña,
 *   cancelar...). La IA nunca hace trámites por sí misma.
 *
 *   Sin clave, la ruta responde 503 y el asistente sigue con sus opciones y
 *   palabras clave. Se configura con "npm run ia" (CONFIGURAR BookingRD).
 */

const { publicacionesRepo } = require('../repositories');
const correoConfig = require('../config/correo');
const { DESTINOS: CATALOGO_DESTINOS } = require('../utils/catalogos');
const DESTINOS = Object.keys(CATALOGO_DESTINOS);
const { TEMPORADAS } = require('../utils/temporadas');
const { CARGO_CANCELACION_PCT } = require('./pagos.service');

const MODELO_PREDETERMINADO = 'claude-haiku-4-5-20251001';
const ACCIONES = ['buscar', 'contrasena', 'codigo', 'reservas', 'cancelar', 'empresa', 'persona', 'emergencia', 'preguntas'];
const VIGENCIA_CONTEXTO_MS = 10 * 60 * 1000;

let contexto = { texto: null, hasta: 0 };

/** true si hay una clave de la API configurada (se relee .env si cambió). */
function disponible() {
    correoConfig.smtpConfigurado();   // relee .env (también las claves del asistente)
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Resumen público del catálogo para que la IA no invente nombres ni precios. */
async function contextoCatalogo() {
    if (contexto.texto && Date.now() < contexto.hasta) return contexto.texto;
    const lineas = [];
    for (const [tipo, titulo, unidad] of [['hotel', 'ALOJAMIENTOS', 'noche'], ['actividad', 'ACTIVIDADES', 'persona'], ['vehiculo', 'AUTOS', 'día']]) {
        const { publicaciones } = await publicacionesRepo.listar(tipo, {
            categoria: null, transmision: null, ciudad: null, personas: null, precioMin: null, precioMax: null,
            texto: null, puntuacionMin: null, orden: 'valoracion', pagina: 1, porPagina: 48
        });
        lineas.push(`${titulo}:`);
        for (const p of publicaciones) {
            const nota = p.puntuacion ? `, nota ${p.puntuacion}` : '';
            lineas.push(`- ${p.nombre} (${p.ciudad}): RD$${Math.round(p.precio)} por ${unidad}${nota}`);
        }
    }
    contexto = { texto: lineas.join('\n'), hasta: Date.now() + VIGENCIA_CONTEXTO_MS };
    return contexto.texto;
}

function instrucciones(catalogo, usuario, idioma) {
    const temporadas = Object.values(TEMPORADAS).map((t) => `${t.nombre} x${t.factor}`).join(', ');
    return `Eres Caribe, el asistente de BookingRD, una plataforma para reservar alojamientos, excursiones y autos en República Dominicana (proyecto académico).
Responde ${idioma === 'en' ? 'en inglés' : 'en español dominicano neutro'}, amable y en máximo 80 palabras, sin emojis ni markdown.
Usa solo los datos de abajo: no inventes hoteles, precios, teléfonos ni políticas. Si no sabes algo, dilo y ofrece hablar con una persona.
No digas que hiciste un trámite: los trámites los hace el visitante con los botones. Si la pregunta no tiene que ver con viajes en República Dominicana o con BookingRD, redirige con cortesía.
${usuario ? `El visitante inició sesión como ${usuario.rol === 'empresa' ? 'empresa' : 'viajero'} (${usuario.nombre.split(' ')[0]}).` : 'El visitante no ha iniciado sesión.'}

POLÍTICAS:
- Pago con tarjeta al reservar (simulado; tarjetas de prueba como 4242 4242 4242 4242) o en el destino.
- Cancelación hasta un día antes desde Mis reservas: con tarjeta se reembolsa el ${100 - CARGO_CANCELACION_PCT} % y se retiene el ${CARGO_CANCELACION_PCT} %; si se paga en el destino no hay cargo.
- Precio de alojamiento por temporada sobre el precio publicado: ${temporadas}; viernes y sábado +8 %. El detalle de cada hotel tiene un calendario de precios.
- Cuentas: código de 6 dígitos por correo al registrarse; se puede entrar con un código sin contraseña; la contraseña se recupera con un enlace.
- Empresas: se registran con RNC y publican alojamientos, actividades o autos desde su panel.
- Emergencias en carretera: 911 y *462.
- Destinos: ${DESTINOS.join(', ')}.

CATÁLOGO (los mejor valorados primero):
${catalogo}

Responde SOLO con un objeto JSON, sin texto alrededor:
{"respuesta": "texto para el visitante", "accion": null o una de ${JSON.stringify(ACCIONES)}, "destino": null o un destino de la lista, "personas": null o un número}
Usa "accion": "buscar" con "destino" cuando el visitante quiera ver opciones de alojamiento en un lugar.`;
}

/** Extrae el JSON de la respuesta del modelo (tolera texto alrededor). */
function leerJson(texto) {
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    if (inicio < 0 || fin <= inicio) return { respuesta: texto.trim(), accion: null };
    try {
        return JSON.parse(texto.slice(inicio, fin + 1));
    } catch {
        return { respuesta: texto.trim(), accion: null };
    }
}

/**
 * @param {{mensaje: string, historial: Array<{rol: 'usuario'|'asistente', texto: string}>, usuario: object|null, idioma: string}} datos
 * @returns {Promise<{respuesta: string, accion: string|null, destino: string|null, personas: number|null}>}
 */
async function responder({ mensaje, historial = [], usuario = null, idioma = 'es' }) {
    const catalogo = await contextoCatalogo();
    const mensajes = historial.slice(-6)
        .filter((m) => m && typeof m.texto === 'string' && m.texto.trim())
        .map((m) => ({ role: m.rol === 'asistente' ? 'assistant' : 'user', content: m.texto.slice(0, 600) }));
    // La conversación debe empezar con el visitante y alternar los turnos.
    while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift();
    const alternados = [];
    for (const m of mensajes) {
        if (alternados.length && alternados[alternados.length - 1].role === m.role) alternados[alternados.length - 1].content += `\n${m.content}`;
        else alternados.push(m);
    }
    if (alternados.length && alternados[alternados.length - 1].role === 'user') alternados.pop();
    alternados.push({ role: 'user', content: mensaje.slice(0, 600) });

    const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
    const controlador = new AbortController();
    const tiempo = setTimeout(() => controlador.abort(), 20000);
    let respuesta;
    try {
        respuesta = await fetch(`${base}/v1/messages`, {
            method: 'POST',
            signal: controlador.signal,
            headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: process.env.ASISTENTE_MODELO || MODELO_PREDETERMINADO,
                max_tokens: 400,
                system: instrucciones(catalogo, usuario, idioma),
                messages: alternados
            })
        });
    } finally {
        clearTimeout(tiempo);
    }
    if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '');
        const error = new Error(`La API de IA respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
        error.status = respuesta.status;
        throw error;
    }
    const datos = await respuesta.json();
    const texto = (datos.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const json = leerJson(texto);
    return {
        respuesta: String(json.respuesta || '').slice(0, 1200) || 'No tengo una respuesta para eso. ¿Quieres hablar con una persona?',
        accion: ACCIONES.includes(json.accion) ? json.accion : null,
        destino: DESTINOS.includes(json.destino) ? json.destino : null,
        personas: Number.isInteger(json.personas) && json.personas > 0 && json.personas <= 30 ? json.personas : null
    };
}

module.exports = { disponible, responder, MODELO_PREDETERMINADO };
