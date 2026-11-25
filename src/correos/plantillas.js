/**
 * @file src/correos/plantillas.js
 * @description Plantillas de los correos de BookingRD: bienvenida de viajero,
 *   bienvenida de empresa y confirmación de reserva.
 *
 *   El HTML usa tablas y estilos en línea (lo que leen Gmail, Outlook y Apple
 *   Mail), un ancho máximo de 600 px y la paleta de la marca. Cada plantilla
 *   devuelve también una versión en texto plano.
 */

const COLOR = {
    azul: '#003087', rojo: '#CE1126', crema: '#F8F5EF', caribe: '#00B4D8', caribeProfundo: '#0077A8',
    noche: '#05132B', arena: '#FDEBD0', texto: '#1C2333', gris: '#5B6475', borde: '#E6E1D8'
};
const TITULOS = "Fraunces, Georgia, 'Times New Roman', serif";
const TEXTO = "Nunito, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Escapa texto para insertarlo en el HTML del correo. */
const e = (valor) => String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const moneda = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 });

/** Botón compatible con los clientes de correo (tabla con fondo). */
function boton(texto, url, color = COLOR.rojo) {
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
            <tr><td bgcolor="${color}" style="border-radius:10px;">
                <a href="${e(url)}" style="display:inline-block;padding:14px 28px;font-family:${TEXTO};font-size:15px;font-weight:800;color:#FFFFFF;text-decoration:none;border-radius:10px;">${e(texto)}</a>
            </td></tr>
        </table>`;
}

/** Lista con viñeta cuadrada de color. */
function lista(items) {
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0;">
            ${items.map(([titulo, texto]) => `
            <tr>
                <td width="22" valign="top" style="padding:5px 0 12px;"><div style="width:10px;height:10px;margin-top:4px;border-radius:3px;background-color:${COLOR.caribe};"></div></td>
                <td valign="top" style="padding:0 0 12px;font-family:${TEXTO};font-size:15px;line-height:22px;color:${COLOR.texto};">
                    <strong>${e(titulo)}</strong><br><span style="color:${COLOR.gris};">${e(texto)}</span>
                </td>
            </tr>`).join('')}
        </table>`;
}

/** Tabla de datos (etiqueta y valor) con bordes suaves. */
function datos(filas) {
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 0;border:1px solid ${COLOR.borde};border-radius:12px;border-collapse:separate;">
            ${filas.map(([etiqueta, valor], i) => `
            <tr>
                <td style="padding:12px 16px;${i ? `border-top:1px solid ${COLOR.borde};` : ''}font-family:${TEXTO};font-size:13px;font-weight:700;color:${COLOR.gris};">${e(etiqueta)}</td>
                <td align="right" style="padding:12px 16px;${i ? `border-top:1px solid ${COLOR.borde};` : ''}font-family:${TEXTO};font-size:14px;font-weight:800;color:${COLOR.texto};">${e(valor)}</td>
            </tr>`).join('')}
        </table>`;
}

/**
 * Marco común: encabezado azul con la marca, franja tricolor, tarjeta blanca
 * con el contenido y pie con la dirección del sitio.
 */
function marco({ preencabezado, titulo, cuerpo, urlSitio }) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.crema};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preencabezado)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLOR.crema};">
<tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
        <tr><td bgcolor="${COLOR.azul}" style="padding:26px 32px;border-radius:16px 16px 0 0;">
            <span style="font-family:${TITULOS};font-size:26px;font-weight:800;color:#FFFFFF;">Booking</span><span style="font-family:${TITULOS};font-size:26px;font-weight:800;color:${COLOR.caribe};">RD</span>
        </td></tr>
        <tr><td style="font-size:0;line-height:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td height="5" bgcolor="${COLOR.azul}" width="25%"></td><td height="5" bgcolor="${COLOR.rojo}" width="25%"></td>
                <td height="5" bgcolor="${COLOR.azul}" width="25%"></td><td height="5" bgcolor="${COLOR.rojo}" width="25%"></td>
            </tr></table>
        </td></tr>
        <tr><td bgcolor="#FFFFFF" style="padding:36px 32px 34px;border-radius:0 0 16px 16px;">
            <h1 style="margin:0 0 14px;font-family:${TITULOS};font-size:26px;line-height:32px;font-weight:800;color:${COLOR.noche};">${e(titulo)}</h1>
            ${cuerpo}
        </td></tr>
        <tr><td align="center" style="padding:22px 24px 8px;font-family:${TEXTO};font-size:12px;line-height:18px;color:${COLOR.gris};">
            BookingRD: alojamiento, tours, aventura y alquiler de autos en República Dominicana.<br>
            <a href="${e(urlSitio)}" style="color:${COLOR.caribeProfundo};text-decoration:none;font-weight:700;">${e(urlSitio.replace(/^https?:\/\//, ''))}</a>
            &nbsp;&middot;&nbsp; Este es un correo automático; para escribirnos usa la página de contacto.
        </td></tr>
    </table>
</td></tr>
</table>
</body>
</html>`;
}

const parrafo = (texto) => `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:15px;line-height:24px;color:${COLOR.texto};">${texto}</p>`;
const nombrePila = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || 'viajero';

/** Bienvenida de una cuenta de viajero. */
function bienvenidaViajero({ nombre, correo, urlSitio }) {
    const titulo = `Te damos la bienvenida, ${nombrePila(nombre)}`;
    const cuerpo = parrafo('Tu cuenta de viajero en BookingRD ya está lista. Desde ahora puedes reservar hoteles, excursiones y autos de alquiler de empresas dominicanas identificadas, con disponibilidad real y confirmación inmediata.')
        + lista([
            ['Paga como prefieras', 'Con tarjeta al reservar o en el destino al llegar.'],
            ['Cancelación flexible', 'Hasta un día antes desde Mis reservas: se reembolsa el 90 % de lo pagado con tarjeta.'],
            ['Guarda tus favoritos', 'Toca el corazón en cualquier publicación para tenerla a mano.'],
            ['Comparte tu experiencia', 'Al terminar tu estancia, actividad o alquiler podrás dejar una reseña verificada.']
        ])
        + boton('Explorar destinos', `${urlSitio}/explorar.html`)
        + `<p style="margin:18px 0 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLOR.gris};">Tu cuenta está asociada a ${e(correo)}. Si no la creaste tú, escríbenos desde ${e(urlSitio)}/contacto.html.</p>`;
    const texto = `${titulo}\n\nTu cuenta de viajero en BookingRD ya está lista. Reserva hoteles, excursiones y autos de empresas dominicanas, con pago con tarjeta o en el destino y cancelación hasta un día antes (reembolso del 90 %).\n\nExplorar destinos: ${urlSitio}/explorar.html\n\nSi no creaste esta cuenta, escríbenos: ${urlSitio}/contacto.html`;
    return { asunto: 'Bienvenido a BookingRD', html: marco({ preencabezado: 'Tu cuenta está lista: reserva hoteles, tours y autos en la isla.', titulo, cuerpo, urlSitio }), texto };
}

/** Bienvenida de una cuenta de empresa, con los primeros pasos según el servicio. */
function bienvenidaEmpresa({ nombre, nombreComercial, tipoServicio, urlSitio }) {
    const queEs = { alojamiento: 'tus alojamientos', actividades: 'tus actividades y tours', mixto: 'tus alojamientos y actividades', vehiculos: 'cada modelo de tu flota' }[tipoServicio] || 'tus servicios';
    const titulo = `${nombreComercial} ya está en BookingRD`;
    const cuerpo = parrafo(`Hola, ${e(nombrePila(nombre))}. Registraste <strong>${e(nombreComercial)}</strong> en BookingRD. Ya puedes publicar ${e(queEs)} y recibir reservas de viajeros de todo el país.`)
        + lista([
            ['1. Completa tu perfil público', 'Teléfono, sitio web, licencia MITUR y una descripción de tu empresa.'],
            ['2. Crea tu primera publicación', 'Agrega fotografías, precio y disponibilidad; aparece en el catálogo al instante.'],
            ['3. Atiende tus reservas', 'Las verás en tu panel con los datos de contacto de cada cliente, y podrás exportarlas.'],
            ['4. Responde a las reseñas', 'Una respuesta amable mejora la confianza de los próximos viajeros.']
        ])
        + boton('Ir a mi panel', `${urlSitio}/panel-empresa.html`, COLOR.azul);
    const texto = `${titulo}\n\nHola, ${nombrePila(nombre)}. Ya puedes publicar ${queEs} y recibir reservas.\n1. Completa tu perfil público.\n2. Crea tu primera publicación.\n3. Atiende tus reservas.\n4. Responde a las reseñas.\n\nTu panel: ${urlSitio}/panel-empresa.html`;
    return { asunto: `${nombreComercial} ya está en BookingRD`, html: marco({ preencabezado: 'Publica tus servicios y empieza a recibir reservas.', titulo, cuerpo, urlSitio }), texto };
}

/**
 * Confirmación de una reserva.
 * @param {{nombre, codigo, publicacion, tipo, fechas, detalle: [string, string][], total, urlSitio, avisos?: string[]}} datosReserva
 */
function confirmacionReserva({ nombre, codigo, publicacion, fechas, detalle = [], total, urlSitio, avisos = [], foto = false, pagado = false }) {
    const titulo = 'Tu reserva está confirmada';
    const cuerpo = fotoCorreo(foto, publicacion)
        + parrafo(`Hola, ${e(nombrePila(nombre))}. La empresa ya recibió tu reserva de <strong>${e(publicacion)}</strong>.`)
        + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0;"><tr>
            <td bgcolor="${COLOR.arena}" style="padding:16px 18px;border-radius:12px;font-family:${TEXTO};">
                <span style="display:block;font-size:12px;font-weight:800;letter-spacing:1px;color:#8A4B12;">CÓDIGO DE RESERVA</span>
                <span style="display:block;margin-top:4px;font-family:'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:3px;color:${COLOR.noche};">${e(codigo)}</span>
            </td></tr></table>`
        + datos([['Fechas', fechas], ...detalle, ['Total', moneda.format(total)]])
        + avisos.map((a) => `<p style="margin:14px 0 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLOR.gris};">${e(a)}</p>`).join('')
        + `<p style="margin:14px 0 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLOR.gris};">Puedes cancelar hasta un día antes desde Mis reservas${pagado ? ': se reembolsa el 90 % a tu tarjeta' : ', sin cargo'}. Un día antes te enviaremos un recordatorio con el clima del destino.</p>`
        + boton('Ver mis reservas', `${urlSitio}/mis-reservas.html`);
    const texto = `${titulo}\n\nCódigo: ${codigo}\n${publicacion}\nFechas: ${fechas}\n${detalle.map(([a, b]) => `${a}: ${b}`).join('\n')}\nTotal: ${moneda.format(total)}\n${avisos.join('\n')}\n\nMis reservas: ${urlSitio}/mis-reservas.html`;
    return { asunto: `Reserva confirmada ${codigo}: ${publicacion}`, html: marco({ preencabezado: `Código ${codigo}. Guárdalo para cualquier consulta con la empresa.`, titulo, cuerpo, urlSitio }), texto };
}

/** Fotografía de la publicación incrustada en el correo (adjunto con cid:foto). */
function fotoCorreo(foto, alt) {
    if (!foto) return '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;"><tr><td>
        <img src="cid:foto" alt="${e(alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;border:0;">
    </td></tr></table>`;
}

/** Aviso a la empresa: llegó una reserva nueva. */
function reservaRecibida({ nombreEmpresa, cliente, codigo, publicacion, fechas, detalle = [], total, pago, urlSitio, foto = false }) {
    const titulo = 'Tienes una reserva nueva';
    const cuerpo = fotoCorreo(foto, publicacion)
        + parrafo(`${e(nombreEmpresa)}: <strong>${e(cliente)}</strong> reservó <strong>${e(publicacion)}</strong>.`)
        + datos([['Código', codigo], ['Fechas', fechas], ...detalle, ['Pago', pago], ['Total', moneda.format(total)]])
        + parrafo('<br>Los datos de contacto del cliente están en tu panel, en Reservas recibidas.')
        + boton('Abrir mi panel', `${urlSitio}/panel-empresa.html`, COLOR.azul);
    const texto = `${titulo}\n\n${cliente} reservó ${publicacion}.\nCódigo: ${codigo}\nFechas: ${fechas}\n${detalle.map(([a, b]) => `${a}: ${b}`).join('\n')}\nPago: ${pago}\nTotal: ${moneda.format(total)}\n\nPanel: ${urlSitio}/panel-empresa.html`;
    return { asunto: `Reserva nueva ${codigo}: ${publicacion}`, html: marco({ preencabezado: `${cliente} reservó ${publicacion}.`, titulo, cuerpo, urlSitio }), texto };
}

/** Recordatorio un día antes, con el pronóstico si está disponible. */
function recordatorioReserva({ nombre, codigo, publicacion, ciudad, fechas, lugar, clima, urlSitio, foto = false }) {
    const titulo = `Mañana empieza tu viaje a ${ciudad}`;
    const filas = [['Reserva', publicacion], ['Código', codigo], ['Fechas', fechas]];
    if (lugar) filas.push(['Dónde', lugar]);
    if (clima) filas.push(['Pronóstico para mañana', clima]);
    const cuerpo = fotoCorreo(foto, publicacion)
        + parrafo(`Hola, ${e(nombrePila(nombre))}. Todo está listo para mañana. Lleva tu código de reserva y un documento de identidad.`)
        + datos(filas)
        + boton('Ver mi reserva', `${urlSitio}/mis-reservas.html`);
    const texto = `${titulo}\n\n${filas.map(([a, b]) => `${a}: ${b}`).join('\n')}\n\nMis reservas: ${urlSitio}/mis-reservas.html`;
    return { asunto: `Mañana: ${publicacion} (${codigo})`, html: marco({ preencabezado: `Tu reserva ${codigo} empieza mañana.`, titulo, cuerpo, urlSitio }), texto };
}

/** Pide la reseña al terminar el viaje. */
function pedirResena({ nombre, publicacion, urlSitio, foto = false }) {
    const titulo = '¿Qué tal te fue?';
    const cuerpo = fotoCorreo(foto, publicacion)
        + parrafo(`Hola, ${e(nombrePila(nombre))}. Esperamos que hayas disfrutado <strong>${e(publicacion)}</strong>.`)
        + parrafo('Tu opinión ayuda a otros viajeros a decidir y a la empresa a mejorar. Toma un minuto: puntúa del 1 al 10 y cuenta lo que más te gustó.')
        + boton('Escribir mi reseña', `${urlSitio}/mis-reservas.html#resenas`);
    const texto = `${titulo}\n\nCuéntanos cómo te fue en ${publicacion}: ${urlSitio}/mis-reservas.html#resenas`;
    return { asunto: `¿Qué tal ${publicacion}? Deja tu reseña`, html: marco({ preencabezado: 'Tu opinión ayuda a otros viajeros.', titulo, cuerpo, urlSitio }), texto };
}

/** Código de 6 dígitos destacado, separado en dos grupos para leerlo mejor. */
function codigoGrande(codigo) {
    const visible = `${String(codigo).slice(0, 3)}&nbsp;${String(codigo).slice(3)}`;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 20px;" width="100%"><tr><td align="center" style="padding:16px 8px;background:#E9F7FA;border:1px dashed #8FC9DD;border-radius:12px;font-family:${TITULOS};font-size:38px;line-height:44px;letter-spacing:6px;color:${COLOR.azul};font-weight:700;">${visible}</td></tr></table>`;
}

/** Código para confirmar el correo al crear la cuenta. */
function codigoVerificacion({ nombre, codigo, minutos, urlSitio }) {
    const titulo = `Confirma tu correo, ${nombrePila(nombre)}`;
    const cuerpo = parrafo('Para terminar de crear tu cuenta en BookingRD, escribe este código en la página de registro:')
        + codigoGrande(codigo)
        + parrafo(`El código vence en ${minutos} minutos y solo funciona una vez.`)
        + `<p style="margin:18px 0 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLOR.gris};">Si no intentaste registrarte, ignora este correo: sin el código nadie puede crear una cuenta con tu dirección.</p>`;
    const texto = `${titulo}\n\nTu código de verificación de BookingRD es: ${codigo}\nVence en ${minutos} minutos.\n\nSi no intentaste registrarte, ignora este correo.`;
    return { asunto: `Tu código de BookingRD: ${codigo}`, html: marco({ preencabezado: `Tu código es ${codigo}. Vence en ${minutos} minutos.`, titulo, cuerpo, urlSitio }), texto };
}

/** Código para entrar sin contraseña. */
function codigoAcceso({ nombre, codigo, minutos, urlSitio }) {
    const titulo = `Tu código para entrar, ${nombrePila(nombre)}`;
    const cuerpo = parrafo('Escribe este código en la página de inicio de sesión de BookingRD para entrar sin contraseña:')
        + codigoGrande(codigo)
        + parrafo(`Vence en ${minutos} minutos y solo funciona una vez.`)
        + `<p style="margin:18px 0 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLOR.gris};">Si no lo pediste, ignora este correo: sin el código nadie puede entrar a tu cuenta.</p>`;
    const texto = `${titulo}\n\nTu código para entrar a BookingRD es: ${codigo}\nVence en ${minutos} minutos.`;
    return { asunto: `Tu código para entrar a BookingRD: ${codigo}`, html: marco({ preencabezado: `Código ${codigo}. Vence en ${minutos} minutos.`, titulo, cuerpo, urlSitio }), texto };
}

/** Código para confirmar el correo nuevo de una cuenta. */
function codigoNuevoCorreo({ nombre, codigo, minutos, urlSitio }) {
    const titulo = `Confirma tu correo nuevo, ${nombrePila(nombre)}`;
    const cuerpo = parrafo('Pediste usar esta dirección en tu cuenta de BookingRD. Escribe este código en la página de tu cuenta para confirmarla:')
        + codigoGrande(codigo)
        + parrafo(`Vence en ${minutos} minutos.`);
    const texto = `${titulo}\n\nCódigo para confirmar tu correo nuevo: ${codigo}\nVence en ${minutos} minutos.`;
    return { asunto: `Confirma tu correo nuevo: ${codigo}`, html: marco({ preencabezado: `Código ${codigo}.`, titulo, cuerpo, urlSitio }), texto };
}

/** Aviso de seguridad: cambio de contraseña o de correo. */
function avisoSeguridad({ nombre, cambio, urlSitio }) {
    const titulo = 'Se hizo un cambio en tu cuenta';
    const cuerpo = parrafo(`Hola, ${e(nombrePila(nombre))}. ${e(cambio)}`)
        + parrafo('Si fuiste tú, no tienes que hacer nada. Si no reconoces este cambio, recupera tu cuenta ahora:')
        + boton('Recuperar mi cuenta', `${urlSitio}/restablecer.html`, COLOR.azul);
    const texto = `${titulo}\n\n${cambio}\nSi no fuiste tú: ${urlSitio}/restablecer.html`;
    return { asunto: 'BookingRD: cambio en tu cuenta', html: marco({ preencabezado: cambio, titulo, cuerpo, urlSitio }), texto };
}

/** Enlace para crear una contraseña nueva. */
function restablecerPassword({ nombre, enlace, minutos, urlSitio }) {
    const titulo = `Crea una contraseña nueva, ${nombrePila(nombre)}`;
    const cuerpo = parrafo('Recibimos una solicitud para cambiar la contraseña de tu cuenta de BookingRD. Pulsa el botón para elegir una nueva:')
        + boton('Crear contraseña nueva', enlace, COLOR.azul)
        + parrafo(`El enlace vence en ${minutos} minutos y solo se puede usar una vez.`)
        + `<p style="margin:18px 0 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLOR.gris};">Si no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.<br>Si el botón no abre, copia esta dirección en el navegador: ${e(enlace)}</p>`;
    const texto = `${titulo}\n\nAbre este enlace para crear una contraseña nueva (vence en ${minutos} minutos):\n${enlace}\n\nSi no lo pediste, ignora este correo.`;
    return { asunto: 'Restablece tu contraseña de BookingRD', html: marco({ preencabezado: 'Enlace para crear una contraseña nueva.', titulo, cuerpo, urlSitio }), texto };
}

module.exports = { codigoAcceso, codigoNuevoCorreo, avisoSeguridad, bienvenidaViajero, bienvenidaEmpresa, confirmacionReserva, reservaRecibida, recordatorioReserva, pedirResena, codigoVerificacion, restablecerPassword };
