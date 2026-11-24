/**
 * @file pruebas/api.test.js
 * @description Pruebas de la API completa sobre el modo de demostración
 *   (datos en memoria). No necesitan base de datos ni dependencias
 *   adicionales: usan el ejecutor de pruebas de Node (node:test).
 *
 *   Uso: npm run probar
 *
 *   El servidor se inicia en un puerto libre con DB_MODO=demo y se detiene
 *   al terminar. Cada prueba parte del estado que dejó la anterior, en el
 *   orden en que aparecen (registro, reserva, cancelación, reseña...).
 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

let servidor;
let base;

/** Puerto libre asignado por el sistema operativo. */
function puertoLibre() {
    return new Promise((resolver, rechazar) => {
        const s = net.createServer();
        s.listen(0, () => {
            const { port } = s.address();
            s.close(() => resolver(port));
        });
        s.on('error', rechazar);
    });
}

before(async () => {
    const puerto = await puertoLibre();
    base = `http://localhost:${puerto}/api`;
    servidor = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
        env: Object.assign({}, process.env, { DB_MODO: 'demo', PORT: String(puerto), JWT_SECRET: 'pruebas-bookingrd-0123456789abcdef', LIMITE_INTENTOS_AUTH: '500', SMTP_HOST: '', CORREO_CARPETA: path.join(require('node:os').tmpdir(), `bookingrd-correos-${process.pid}`) }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolver, rechazar) => {
        const tiempo = setTimeout(() => rechazar(new Error('El servidor no inició a tiempo.')), 15000);
        servidor.stdout.on('data', (datos) => {
            if (String(datos).includes('funcionando en')) {
                clearTimeout(tiempo);
                resolver();
            }
        });
        servidor.on('exit', (codigo) => rechazar(new Error(`El servidor terminó con código ${codigo}`)));
    });
});

after(() => {
    if (servidor) servidor.kill();
});

/** Petición JSON. @returns {Promise<{status: number, datos: any}>} */
async function api(ruta, { metodo = 'GET', cuerpo, token } = {}) {
    const respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const texto = await respuesta.text();
    return { status: respuesta.status, datos: texto ? JSON.parse(texto) : null };
}

async function entrar(correo, password) {
    const { status, datos } = await api('/auth/login', { metodo: 'POST', cuerpo: { correo, password } });
    assert.equal(status, 200, `login de ${correo}`);
    return datos.token;
}

/** Fecha AAAA-MM-DD dentro de `dias` días. */
const fecha = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

const tokens = {};
const creadas = {};

/* ---------------------------------------------------------------------------
 * Catálogo público
 * ------------------------------------------------------------------------- */

test('estado del servidor en modo de demostración', async () => {
    const { status, datos } = await api('/salud');
    assert.equal(status, 200);
    assert.equal(datos.modo, 'demostracion');
});

test('estadísticas con conteos por tipo, categoría y destino', async () => {
    const { datos } = await api('/estadisticas');
    assert.ok(datos.totalHoteles >= 15);
    assert.ok(datos.totalActividades >= 34);
    assert.ok(datos.totalVehiculos >= 11);
    assert.equal(Object.values(datos.porCiudadTipo['Punta Cana']).reduce((a, b) => a + b, 0), datos.porCiudad['Punta Cana']);
    assert.ok(datos.puntuacionMedia > 8);
});

test('catálogos con coordenadas de los 19 destinos', async () => {
    const { datos } = await api('/catalogos');
    assert.equal(datos.destinos.length, 19);
    for (const destino of datos.destinos) assert.equal(datos.coordenadas[destino].length, 2);
});

test('listado con filtros, orden y paginación', async () => {
    const todos = await api('/publicaciones?tipo=actividad&porPagina=5');
    assert.equal(todos.datos.publicaciones.length, 5);
    const filtrado = await api('/publicaciones?tipo=hotel&ciudad=Punta%20Cana&orden=precio-asc');
    const precios = filtrado.datos.publicaciones.map((p) => p.precio);
    assert.deepEqual(precios, [...precios].sort((a, b) => a - b));
    assert.ok(filtrado.datos.publicaciones.every((p) => p.ciudad === 'Punta Cana'));
    const autos = await api('/publicaciones?tipo=vehiculo&transmision=manual');
    assert.ok(autos.datos.publicaciones.length >= 1);
    assert.ok(autos.datos.publicaciones.every((p) => p.transmision === 'manual'));
    const valorados = await api('/publicaciones?tipo=actividad&puntuacionMin=9');
    assert.ok(valorados.datos.publicaciones.every((p) => p.puntuacion >= 9));
    const texto = await api('/publicaciones?tipo=actividad&q=ballenas');
    assert.ok(texto.datos.total >= 1);
});

test('histograma de precios', async () => {
    const { datos } = await api('/publicaciones/precios?tipo=hotel');
    assert.ok(datos.minimo < datos.maximo);
    assert.equal(datos.tramos.reduce((a, b) => a + b, 0), datos.total);
});

test('detalle, reseñas y disponibilidad de un alojamiento', async () => {
    const lista = await api('/publicaciones?tipo=hotel&q=Palmar');
    const hotel = lista.datos.publicaciones[0];
    creadas.hotel = hotel;
    const detalle = await api(`/publicaciones/hotel/${hotel.id}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.datos.empresa.nombre, 'Coralia Hotels & Resorts');
    const resenas = await api(`/publicaciones/hotel/${hotel.id}/resenas`);
    assert.ok(resenas.datos.resumen.total >= 2);
    const disponible = await api(`/publicaciones/hotel/${hotel.id}/disponibilidad?entrada=${fecha(20)}&salida=${fecha(23)}&habitaciones=1&personas=2`);
    assert.equal(disponible.status, 200);
    assert.equal(disponible.datos.total, hotel.precio * 3);
});

test('publicación inexistente responde 404', async () => {
    const { status } = await api('/publicaciones/hotel/99999');
    assert.equal(status, 404);
});

test('opiniones destacadas', async () => {
    const { datos } = await api('/resenas/destacadas');
    assert.ok(datos.resenas.length >= 3);
    assert.ok(datos.resenas.every((r) => r.puntuacion >= 9));
});

test('clima con destino inválido responde 400', async () => {
    const { status } = await api('/clima?ciudad=Narnia');
    assert.equal(status, 400);
});

test('tasas de cambio con valores de respaldo o reales', async () => {
    const { status, datos } = await api('/monedas');
    assert.equal(status, 200);
    assert.ok(datos.tasas.USD > 30 && datos.tasas.EUR > 30);
});

test('contacto valida y guarda el mensaje', async () => {
    const malo = await api('/contacto', { metodo: 'POST', cuerpo: { nombre: '', correo: 'x', asunto: 'otro', mensaje: 'corto' } });
    assert.equal(malo.status, 400);
    const bueno = await api('/contacto', { metodo: 'POST', cuerpo: { nombre: 'Prueba', correo: 'prueba@correo.com', asunto: 'viajero', mensaje: 'Mensaje de prueba automática.' } });
    assert.equal(bueno.status, 201);
});

/* ---------------------------------------------------------------------------
 * Cuentas
 * ------------------------------------------------------------------------- */

test('inicio de sesión correcto e incorrecto', async () => {
    const malo = await api('/auth/login', { metodo: 'POST', cuerpo: { correo: 'cliente@bookingrd.com', password: 'equivocada' } });
    assert.equal(malo.status, 401);
    tokens.cliente = await entrar('cliente@bookingrd.com', 'Cliente123!');
    tokens.empresa = await entrar('empresa@bookingrd.com', 'Empresa123!');
    tokens.hoteles = await entrar('hoteles@bookingrd.com', 'Empresa123!');
    tokens.admin = await entrar('admin@bookingrd.com', 'Admin123!');
    const sesion = await api('/auth/sesion', { token: tokens.cliente });
    assert.equal(sesion.datos.usuario.rol, 'cliente');
});

/** Lee el código de 6 dígitos del correo de prueba (sin SMTP, el correo queda en archivo). */
async function codigoDelCorreo(vistaPrevia) {
    assert.ok(vistaPrevia, 'la respuesta debe traer la vista previa del correo');
    const html = await (await fetch(base + vistaPrevia.replace(/^\/api/, ''))).text();
    const codigo = (html.match(/Tu código de BookingRD: (\d{6})/) || [])[1];
    assert.ok(codigo, 'el correo debe traer el código');
    return codigo;
}

/** Registro completo: solicitud, código del correo y verificación. */
async function registrarYVerificar(cuerpo) {
    const solicitud = await api('/auth/registro', { metodo: 'POST', cuerpo });
    assert.equal(solicitud.status, 202, JSON.stringify(solicitud.datos));
    const codigo = await codigoDelCorreo(solicitud.datos.vistaPrevia);
    return api('/auth/registro/verificar', { metodo: 'POST', cuerpo: { correo: cuerpo.correo, codigo } });
}

test('registro de viajero y de empresa con código por correo', async () => {
    const datosViajera = { tipoCuenta: 'cliente', nombre: 'Viajera de Prueba', correo: 'viajera.prueba@correo.com', password: 'Prueba123', confirmarPassword: 'Prueba123' };
    // Sin verificar el correo la cuenta no existe todavía.
    const solicitud = await api('/auth/registro', { metodo: 'POST', cuerpo: datosViajera });
    assert.equal(solicitud.status, 202);
    assert.equal((await api('/auth/login', { metodo: 'POST', cuerpo: { correo: datosViajera.correo, password: 'Prueba123' } })).status, 401);
    const malo = await api('/auth/registro/verificar', { metodo: 'POST', cuerpo: { correo: datosViajera.correo, codigo: '000000' } });
    assert.equal(malo.status, 400);
    assert.equal(malo.datos.campo, 'codigo');
    // Reenviar antes de un minuto se rechaza.
    assert.equal((await api('/auth/registro/reenviar', { metodo: 'POST', cuerpo: { correo: datosViajera.correo } })).status, 429);
    const codigo = await codigoDelCorreo(solicitud.datos.vistaPrevia);
    const viajero = await api('/auth/registro/verificar', { metodo: 'POST', cuerpo: { correo: datosViajera.correo, codigo } });
    assert.equal(viajero.status, 201, JSON.stringify(viajero.datos));
    tokens.nueva = viajero.datos.token;
    // El mismo código no sirve dos veces.
    assert.equal((await api('/auth/registro/verificar', { metodo: 'POST', cuerpo: { correo: datosViajera.correo, codigo } })).status, 410);
    const repetido = await api('/auth/registro', {
        metodo: 'POST',
        cuerpo: { tipoCuenta: 'cliente', nombre: 'Otra', correo: 'viajera.prueba@correo.com', password: 'Prueba123', confirmarPassword: 'Prueba123' }
    });
    assert.equal(repetido.status, 409);
    const empresa = await registrarYVerificar({
        tipoCuenta: 'empresa', nombre: 'Rosa Almánzar', cargo: 'Propietaria', correo: 'hostal.prueba@correo.com', telefono: '809-555-0000',
        password: 'Prueba123', confirmarPassword: 'Prueba123', nombreEmpresa: 'Hostal Valle Nuevo', razonSocial: 'Hostal Valle Nuevo SRL',
        rnc: '131000123', telefonoEmpresa: '809-555-0001', provincia: 'La Vega', ciudadEmpresa: 'Constanza', direccion: 'Calle Principal 1',
        tipoServicio: 'alojamiento', tipoAlojamiento: 'hostal', numeroHabitaciones: 8, confirmaDatos: true
    });
    assert.equal(empresa.status, 201, JSON.stringify(empresa.datos));
    assert.equal(empresa.datos.usuario.rol, 'empresa');
    tokens.hostal = empresa.datos.token;
});

test('recuperar la contraseña con el enlace del correo', async () => {
    // Un correo sin cuenta recibe la misma respuesta (no revela qué correos existen).
    const inexistente = await api('/auth/recuperar', { metodo: 'POST', cuerpo: { correo: 'nadie@correo.com' } });
    assert.equal(inexistente.status, 200);
    assert.equal(inexistente.datos.vistaPrevia, undefined);
    const pedido = await api('/auth/recuperar', { metodo: 'POST', cuerpo: { correo: 'viajera.prueba@correo.com' } });
    assert.equal(pedido.status, 200);
    const html = await (await fetch(base + pedido.datos.vistaPrevia.replace(/^\/api/, ''))).text();
    const clave = decodeURIComponent((html.match(/restablecer\.html\?clave=([\w%-]+)/) || [])[1] || '');
    assert.ok(clave, 'el correo debe traer el enlace');
    assert.equal((await api(`/auth/restablecer?clave=${encodeURIComponent(clave)}`)).status, 200);
    const corta = await api('/auth/restablecer', { metodo: 'POST', cuerpo: { clave, password: 'corta', confirmarPassword: 'corta' } });
    assert.equal(corta.status, 400);
    const nueva = await api('/auth/restablecer', { metodo: 'POST', cuerpo: { clave, password: 'Nueva2026x', confirmarPassword: 'Nueva2026x' } });
    assert.equal(nueva.status, 200);
    assert.ok(nueva.datos.token);
    assert.equal((await api('/auth/restablecer', { metodo: 'POST', cuerpo: { clave, password: 'Otra2026xx', confirmarPassword: 'Otra2026xx' } })).status, 410);
    assert.equal((await api('/auth/login', { metodo: 'POST', cuerpo: { correo: 'viajera.prueba@correo.com', password: 'Prueba123' } })).status, 401);
    const login = await api('/auth/login', { metodo: 'POST', cuerpo: { correo: 'viajera.prueba@correo.com', password: 'Nueva2026x' } });
    assert.equal(login.status, 200);
    tokens.nueva = login.datos.token;
});

test('rutas protegidas exigen sesión y rol', async () => {
    assert.equal((await api('/reservas')).status, 401);
    assert.equal((await api('/admin/resumen', { token: tokens.cliente })).status, 403);
    assert.equal((await api('/empresa/perfil', { token: tokens.cliente })).status, 403);
});

/* ---------------------------------------------------------------------------
 * Reservas
 * ------------------------------------------------------------------------- */

test('reserva de alojamiento, actividad y auto con desglose', async () => {
    const hotel = await api('/reservas', {
        metodo: 'POST', token: tokens.nueva,
        cuerpo: {
            tipo: 'hotel', idPublicacion: creadas.hotel.id, entrada: fecha(30), salida: fecha(32), habitaciones: 1, personas: 2,
            pago: { metodo: 'tarjeta', titular: 'Laura Peña', numero: '4242 4242 4242 4242', vencimiento: '12/30', cvv: '123' }
        }
    });
    assert.equal(hotel.status, 201, JSON.stringify(hotel.datos));
    assert.match(hotel.datos.codigo, /^BRD[A-Z0-9]{7}$/);
    assert.equal(hotel.datos.total, creadas.hotel.precio * 2);
    assert.equal(hotel.datos.pago.estado, 'pagado');
    assert.equal(hotel.datos.pago.marca, 'Visa');
    assert.equal(hotel.datos.pago.ultimos4, '4242');
    assert.equal(hotel.datos.pago.monto, hotel.datos.total);
    assert.match(hotel.datos.pago.referencia, /^PAY[A-Z0-9]{8}$/);
    assert.match(hotel.datos.pago.autorizacion, /^\d{6}$/);
    assert.equal(JSON.stringify(hotel.datos).includes('4242424242424242'), false, 'el número completo no se devuelve');
    creadas.reservaHotel = hotel.datos;

    const actividades = await api('/publicaciones?tipo=actividad&q=Tres%20Ojos');
    const actividad = actividades.datos.publicaciones[0];
    const reservaActividad = await api('/reservas', {
        metodo: 'POST', token: tokens.nueva,
        cuerpo: { tipo: 'actividad', idPublicacion: actividad.id, fecha: fecha(10), personas: 3 }
    });
    assert.equal(reservaActividad.status, 201);
    assert.equal(reservaActividad.datos.total, actividad.precio * 3);
    assert.equal(reservaActividad.datos.pago.metodo, 'en_destino');
    assert.equal(reservaActividad.datos.pago.estado, 'pendiente');

    const autos = await api('/publicaciones?tipo=vehiculo&q=Jimny');
    const auto = autos.datos.publicaciones[0];
    const alquiler = await api('/reservas', {
        metodo: 'POST', token: tokens.nueva,
        cuerpo: {
            tipo: 'vehiculo', idPublicacion: auto.id, recogida: fecha(15), horaRecogida: '10:00', devolucion: fecha(18),
            horaDevolucion: '10:00', edadConductor: 23, ciudadDevolucion: auto.ciudad, extras: ['gps']
        }
    });
    assert.equal(alquiler.status, 201, JSON.stringify(alquiler.datos));
    // 3 días + GPS (350/día) + conductor joven (600/día).
    assert.equal(alquiler.datos.total, auto.precio * 3 + 350 * 3 + 600 * 3);
});

test('no se aceptan reservas con datos inválidos', async () => {
    const pasado = await api('/reservas', {
        metodo: 'POST', token: tokens.nueva,
        cuerpo: { tipo: 'hotel', idPublicacion: creadas.hotel.id, entrada: fecha(-3), salida: fecha(-1), habitaciones: 1, personas: 2 }
    });
    assert.equal(pasado.status, 400);
    const empresa = await api('/reservas', {
        metodo: 'POST', token: tokens.empresa,
        cuerpo: { tipo: 'hotel', idPublicacion: creadas.hotel.id, entrada: fecha(5), salida: fecha(6), habitaciones: 1, personas: 2 }
    });
    assert.equal(empresa.status, 403);
});

test('pagos: tarjetas inválidas, rechazadas y pago en destino', async () => {
    const reserva = (pago) => api('/reservas', {
        metodo: 'POST', token: tokens.nueva,
        cuerpo: { tipo: 'hotel', idPublicacion: creadas.hotel.id, entrada: fecha(40), salida: fecha(41), habitaciones: 1, personas: 2, pago }
    });
    const tarjeta = (cambios) => Object.assign({ metodo: 'tarjeta', titular: 'Laura Peña', numero: '4242424242424242', vencimiento: '12/30', cvv: '123' }, cambios);

    const luhn = await reserva(tarjeta({ numero: '4242424242424241' }));
    assert.equal(luhn.status, 400);
    assert.equal(luhn.datos.campo, 'pago-numero');
    const vencida = await reserva(tarjeta({ vencimiento: '01/20' }));
    assert.equal(vencida.status, 400);
    assert.equal(vencida.datos.campo, 'pago-vencimiento');
    const amex = await reserva(tarjeta({ numero: '378282246310005', cvv: '123' }));
    assert.equal(amex.status, 400, 'American Express pide CVV de 4 dígitos');
    const rechazada = await reserva(tarjeta({ numero: '4000 0000 0000 0002' }));
    assert.equal(rechazada.status, 402);
    const fondos = await reserva(tarjeta({ numero: '4000000000009995' }));
    assert.equal(fondos.status, 402);
    assert.match(fondos.datos.error, /Fondos insuficientes/);

    const { datos } = await api('/reservas', { token: tokens.nueva });
    assert.equal(datos.reservas.length, 3, 'un pago rechazado no crea la reserva');

    const enDestino = await reserva({ metodo: 'en_destino' });
    assert.equal(enDestino.status, 201);
    assert.equal(enDestino.datos.pago.estado, 'pendiente');
    creadas.reservaEnDestino = enDestino.datos;
});

test('la empresa registra el cobro en destino', async () => {
    // El hotel de la prueba es de Coralia Hotels & Resorts; otra empresa no puede marcarlo.
    const ajena = await api(`/empresa/reservas/${creadas.reservaEnDestino.id}/cobro`, { metodo: 'PATCH', token: tokens.empresa });
    assert.equal(ajena.status, 409);
    tokens.hoteles = await entrar('hoteles@bookingrd.com', 'Empresa123!');
    const cobro = await api(`/empresa/reservas/${creadas.reservaEnDestino.id}/cobro`, { metodo: 'PATCH', token: tokens.hoteles });
    assert.equal(cobro.status, 200, JSON.stringify(cobro.datos));
    const repetido = await api(`/empresa/reservas/${creadas.reservaEnDestino.id}/cobro`, { metodo: 'PATCH', token: tokens.hoteles });
    assert.equal(repetido.status, 409);
    const { datos } = await api('/empresa/reservas', { token: tokens.hoteles });
    const fila = datos.reservas.find((r) => r.id === creadas.reservaEnDestino.id);
    assert.equal(fila.pago.estado, 'pagado');
});

test('mis reservas y cancelación con reembolso', async () => {
    const { datos } = await api('/reservas', { token: tokens.nueva });
    assert.equal(datos.reservas.length, 4);
    assert.ok(datos.reservas.every((r) => r.pago && r.pago.referencia));
    const cancelar = await api(`/reservas/${creadas.reservaHotel.id}/cancelar`, { metodo: 'PATCH', token: tokens.nueva });
    assert.equal(cancelar.status, 200);
    assert.equal(cancelar.datos.reembolso.ultimos4, '4242');
    assert.equal(cancelar.datos.reembolso.monto, creadas.reservaHotel.total);
    const despues = await api('/reservas', { token: tokens.nueva });
    assert.equal(despues.datos.reservas.find((r) => r.id === creadas.reservaHotel.id).pago.estado, 'reembolsado');
    const otra = await api(`/reservas/${creadas.reservaHotel.id}/cancelar`, { metodo: 'PATCH', token: tokens.cliente });
    assert.ok([403, 404].includes(otra.status));
});

test('pago en dólares: tasa del día, importe cobrado, recibo y reembolso en US$', async () => {
    const cuerpo = (pago) => ({ tipo: 'hotel', idPublicacion: creadas.hotel.id, entrada: fecha(60), salida: fecha(62), habitaciones: 1, personas: 2, pago });
    const tarjeta = { metodo: 'tarjeta', titular: 'Laura Peña', numero: '4242424242424242', vencimiento: '12/30', cvv: '123' };
    const euros = await api('/reservas', { metodo: 'POST', token: tokens.nueva, cuerpo: cuerpo(Object.assign({ moneda: 'EUR' }, tarjeta)) });
    assert.equal(euros.status, 400, 'solo pesos o dólares');
    assert.equal(euros.datos.campo, 'pago-moneda');

    const { datos: monedas } = await api('/monedas');
    const usd = await api('/reservas', { metodo: 'POST', token: tokens.nueva, cuerpo: cuerpo(Object.assign({ moneda: 'USD' }, tarjeta)) });
    assert.equal(usd.status, 201, JSON.stringify(usd.datos));
    const pago = usd.datos.pago;
    assert.equal(pago.moneda, 'USD');
    assert.equal(pago.monto, usd.datos.total, 'el monto en pesos es el total de la reserva');
    assert.ok(Math.abs(pago.tasa - monedas.tasas.USD) < 0.01, `usa la tasa del día: ${pago.tasa} / ${JSON.stringify(monedas)}`);
    assert.equal(pago.montoCobrado, Math.round((usd.datos.total / pago.tasa) * 100) / 100);

    const lista = await api('/reservas', { token: tokens.nueva });
    const guardada = lista.datos.reservas.find((r) => r.id === usd.datos.id);
    assert.equal(guardada.pago.moneda, 'USD');
    assert.equal(guardada.pago.montoCobrado, pago.montoCobrado);

    const cancelada = await api(`/reservas/${usd.datos.id}/cancelar`, { metodo: 'PATCH', token: tokens.nueva });
    assert.equal(cancelada.status, 200);
    assert.equal(cancelada.datos.reembolso.moneda, 'USD');
    assert.equal(cancelada.datos.reembolso.montoCobrado, pago.montoCobrado);

    // En el destino se registra en pesos aunque se pida dólares.
    const destino = await api('/reservas', { metodo: 'POST', token: tokens.nueva, cuerpo: cuerpo({ metodo: 'en_destino', moneda: 'USD' }) });
    assert.equal(destino.status, 201);
    assert.equal(destino.datos.pago.moneda, 'DOP');
    await api(`/reservas/${destino.datos.id}/cancelar`, { metodo: 'PATCH', token: tokens.nueva });
});

/* ---------------------------------------------------------------------------
 * Favoritos y reseñas
 * ------------------------------------------------------------------------- */

test('favoritos: guardar, listar y quitar', async () => {
    const guardar = await api(`/favoritos/hotel/${creadas.hotel.id}`, { metodo: 'PUT', token: tokens.nueva });
    assert.ok([200, 201, 204].includes(guardar.status));
    const claves = await api('/favoritos/claves', { token: tokens.nueva });
    assert.deepEqual(claves.datos.favoritos, [{ tipo: 'hotel', id: creadas.hotel.id }]);
    const lista = await api('/favoritos', { token: tokens.nueva });
    assert.equal(lista.datos.publicaciones[0].nombre, creadas.hotel.nombre);
    await api(`/favoritos/hotel/${creadas.hotel.id}`, { metodo: 'DELETE', token: tokens.nueva });
    const vacio = await api('/favoritos/claves', { token: tokens.nueva });
    assert.equal(vacio.datos.favoritos.length, 0);
});

test('reseña de una reserva terminada (una sola vez)', async () => {
    const { datos } = await api('/resenas', { token: tokens.cliente });
    assert.ok(datos.pendientes.length >= 1, 'la cuenta de demostración tiene una reseña pendiente');
    const pendiente = datos.pendientes[0];
    const cuerpo = { idReserva: pendiente.idReserva, puntuacion: 9, titulo: 'Muy recomendable', comentario: 'Todo salió como estaba previsto y el guía fue excelente.' };
    const crear = await api('/resenas', { metodo: 'POST', token: tokens.cliente, cuerpo });
    assert.equal(crear.status, 201, JSON.stringify(crear.datos));
    const repetir = await api('/resenas', { metodo: 'POST', token: tokens.cliente, cuerpo });
    assert.equal(repetir.status, 409);
    creadas.resena = crear.datos;
});

/* ---------------------------------------------------------------------------
 * Panel de empresa
 * ------------------------------------------------------------------------- */

test('panel de empresa: perfil, reservas y reseñas', async () => {
    const perfil = await api('/empresa/perfil', { token: tokens.hoteles });
    assert.equal(perfil.datos.empresa.nombreComercial, 'Coralia Hotels & Resorts');
    const reservas = await api('/empresa/reservas', { token: tokens.hoteles });
    assert.ok(reservas.datos.reservas.some((r) => r.codigo === creadas.reservaHotel.codigo && r.estado === 'cancelada'));
    const resenas = await api('/empresa/resenas', { token: tokens.empresa });
    const sinRespuesta = resenas.datos.resenas.find((r) => !r.respuesta);
    const responder = await api(`/empresa/resenas/${sinRespuesta.id}/respuesta`, { metodo: 'PUT', token: tokens.empresa, cuerpo: { respuesta: 'Gracias por tu visita.' } });
    assert.equal(responder.status, 200);
});

test('panel de empresa: subir fotografía, crear, editar, ocultar y eliminar', async () => {
    // JPEG mínimo válido (firma FF D8 FF).
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    const imagen = await api('/empresa/imagenes', { metodo: 'POST', token: tokens.hostal, cuerpo: { imagen: `data:image/jpeg;base64,${jpeg.toString('base64')}` } });
    assert.equal(imagen.status, 201, JSON.stringify(imagen.datos));
    const servida = await fetch(`${base}/imagenes/${imagen.datos.id}`);
    assert.equal(servida.headers.get('content-type'), 'image/jpeg');

    const datos = {
        tipo: 'hotel', nombre: 'Hostal Valle Nuevo', ciudad: 'Constanza', descripcion: 'Habitaciones sencillas junto al valle, con desayuno de la finca.',
        precio: 2900, tipoAlojamiento: 'hostal', direccion: 'Calle Principal 1, Constanza', capacidadPersonas: 3, habitaciones: 8,
        servicios: ['wifi', 'desayuno'], idImagen: imagen.datos.id
    };
    const crear = await api('/empresa/publicaciones', { metodo: 'POST', token: tokens.hostal, cuerpo: datos });
    assert.equal(crear.status, 201, JSON.stringify(crear.datos));
    const id = crear.datos.id;
    const publica = await api(`/publicaciones/hotel/${id}`);
    assert.equal(publica.datos.imagen, `/api/imagenes/${imagen.datos.id}`);

    const editar = await api(`/empresa/publicaciones/hotel/${id}`, { metodo: 'PUT', token: tokens.hostal, cuerpo: Object.assign({}, datos, { precio: 3100, idImagen: null }) });
    assert.equal(editar.status, 200);
    assert.equal((await api(`/publicaciones/hotel/${id}`)).datos.precio, 3100);

    await api(`/empresa/publicaciones/hotel/${id}/estado`, { metodo: 'PATCH', token: tokens.hostal, cuerpo: { activo: false } });
    assert.equal((await api(`/publicaciones/hotel/${id}`)).status, 404);

    const otraEmpresa = await api(`/empresa/publicaciones/hotel/${id}`, { metodo: 'DELETE', token: tokens.hoteles });
    assert.equal(otraEmpresa.status, 404);
    const eliminar = await api(`/empresa/publicaciones/hotel/${id}`, { metodo: 'DELETE', token: tokens.hostal });
    assert.equal(eliminar.status, 204);
});

test('una empresa de alojamiento no publica autos', async () => {
    const intento = await api('/empresa/publicaciones', { metodo: 'POST', token: tokens.hostal, cuerpo: { tipo: 'vehiculo', nombre: 'Auto' } });
    assert.equal(intento.status, 403);
});

/* ---------------------------------------------------------------------------
 * Combos y tienda de artesanía
 * ------------------------------------------------------------------------- */

const TARJETA_PRUEBA = { metodo: 'tarjeta', titular: 'Laura Peña', numero: '4242424242424242', vencimiento: '12/30', cvv: '123' };

test('combos: listado, cotización con descuento y reserva en un paso', async () => {
    const lista = await api('/combos');
    assert.equal(lista.status, 200);
    assert.ok(lista.datos.combos.length >= 7);
    const combo = lista.datos.combos.find((c) => c.actividades.length === 2);
    assert.ok(combo.referencia.total < combo.referencia.normal);

    const entrada = fecha(50);
    const minimo = Math.max(...combo.actividades.map((a) => a.dia)) + 1;
    const corta = await api(`/combos/${combo.id}/cotizacion?entrada=${entrada}&noches=${minimo - 1 || 0}&personas=2&habitaciones=1`);
    assert.equal(corta.status, 400, 'las noches deben cubrir los días de las actividades');

    const q = await api(`/combos/${combo.id}/cotizacion?entrada=${entrada}&noches=${minimo}&personas=2&habitaciones=1`);
    assert.equal(q.status, 200);
    assert.equal(q.datos.lineas.length, 3);
    assert.equal(q.datos.disponible, true);
    assert.ok(Math.abs(q.datos.normal - q.datos.total - q.datos.ahorro) < 0.01);

    const sinSesion = await api(`/combos/${combo.id}/reservar`, { metodo: 'POST', cuerpo: { entrada, noches: minimo, personas: 2, habitaciones: 1 } });
    assert.equal(sinSesion.status, 401);
    const rechazada = await api(`/combos/${combo.id}/reservar`, {
        metodo: 'POST', token: tokens.cliente,
        cuerpo: { entrada, noches: minimo, personas: 2, habitaciones: 1, pago: Object.assign({}, TARJETA_PRUEBA, { numero: '4000000000000002' }) }
    });
    assert.equal(rechazada.status, 402);
    const antes = (await api('/reservas', { token: tokens.cliente })).datos.reservas.length;
    assert.equal(antes, (await api('/reservas', { token: tokens.cliente })).datos.reservas.length, 'la tarjeta rechazada no crea reservas');

    const reserva = await api(`/combos/${combo.id}/reservar`, {
        metodo: 'POST', token: tokens.cliente,
        cuerpo: { entrada, noches: minimo, personas: 2, habitaciones: 1, pago: TARJETA_PRUEBA }
    });
    assert.equal(reserva.status, 201);
    assert.equal(reserva.datos.reservas.length, 3);
    assert.equal(reserva.datos.total, q.datos.total);
    const mias = (await api('/reservas', { token: tokens.cliente })).datos.reservas;
    assert.equal(mias.length, antes + 3);
    assert.equal(mias.filter((r) => r.combo && r.combo.id === combo.id && reserva.datos.reservas.some((x) => x.codigo === r.codigo)).length, 3);
});

test('tienda: compra con entrega, existencias, cancelación y seguimiento', async () => {
    const { datos } = await api('/tienda/productos');
    assert.ok(datos.productos.length >= 11);
    const producto = datos.productos[0];

    const sinPago = await api('/tienda/pedidos', {
        metodo: 'POST', token: tokens.cliente,
        cuerpo: { productos: [{ id: producto.id, cantidad: 1 }], entrega: 'hotel', destinatario: 'Laura Peña', direccion: 'Coralia Grand, Punta Cana', pago: { metodo: 'en_destino' } }
    });
    assert.equal(sinPago.status, 400, 'la tienda solo acepta tarjeta');
    const demasiados = await api('/tienda/pedidos', {
        metodo: 'POST', token: tokens.cliente,
        cuerpo: { productos: [{ id: producto.id, cantidad: producto.existencias + 1 }], entrega: 'hotel', destinatario: 'Laura Peña', direccion: 'Coralia Grand, Punta Cana', pago: TARJETA_PRUEBA }
    });
    assert.ok([400, 409].includes(demasiados.status));

    const pedido = await api('/tienda/pedidos', {
        metodo: 'POST', token: tokens.cliente,
        cuerpo: { productos: [{ id: producto.id, cantidad: 2 }], entrega: 'domicilio', destinatario: 'Laura Peña', direccion: 'Calle El Conde 12, Santo Domingo', pago: TARJETA_PRUEBA }
    });
    assert.equal(pedido.status, 201);
    assert.equal(pedido.datos.envio, 450);
    assert.equal(pedido.datos.total, producto.precio * 2 + 450);
    const despues = (await api('/tienda/productos')).datos.productos.find((p) => p.id === producto.id);
    assert.equal(despues.existencias, producto.existencias - 2);

    const cancelado = await api(`/tienda/pedidos/${pedido.datos.id}/cancelar`, { metodo: 'PATCH', token: tokens.cliente });
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.datos.reembolso.ultimos4, '4242');
    assert.equal((await api('/tienda/productos')).datos.productos.find((p) => p.id === producto.id).existencias, producto.existencias);

    const otro = await api('/tienda/pedidos', {
        metodo: 'POST', token: tokens.cliente,
        cuerpo: { productos: [{ id: producto.id, cantidad: 1 }], entrega: 'hotel', destinatario: 'Laura Peña', direccion: 'Coralia Grand, Punta Cana', pago: TARJETA_PRUEBA }
    });
    assert.equal(otro.status, 201);
    assert.equal((await api(`/admin/pedidos/${otro.datos.id}/avanzar`, { metodo: 'PATCH', token: tokens.admin })).datos.estado, 'enviado');
    assert.equal((await api(`/tienda/pedidos/${otro.datos.id}/cancelar`, { metodo: 'PATCH', token: tokens.cliente })).status, 409, 'enviado: ya no se cancela');
    assert.equal((await api(`/admin/pedidos/${otro.datos.id}/avanzar`, { metodo: 'PATCH', token: tokens.admin })).datos.estado, 'entregado');
    const mios = await api('/tienda/pedidos', { token: tokens.cliente });
    assert.ok(mios.datos.pedidos.some((p) => p.codigo === otro.datos.codigo && p.estado === 'entregado'));
    assert.equal((await api('/admin/pedidos', { token: tokens.cliente })).status, 403);
});

/* ---------------------------------------------------------------------------
 * Administración
 * ------------------------------------------------------------------------- */

test('administración: resumen y listados', async () => {
    const resumen = await api('/admin/resumen', { token: tokens.admin });
    assert.ok(resumen.datos.totales.confirmadas > 80);
    for (const ruta of ['/admin/usuarios', '/admin/empresas', '/admin/publicaciones?tipo=vehiculo', '/admin/reservas', '/admin/mensajes', '/admin/resenas']) {
        assert.equal((await api(ruta, { token: tokens.admin })).status, 200, ruta);
    }
});

test('administración: destacar, ocultar reseña y suspender una cuenta', async () => {
    const destacar = await api(`/admin/publicaciones/hotel/${creadas.hotel.id}`, { metodo: 'PATCH', token: tokens.admin, cuerpo: { destacado: false } });
    assert.equal(destacar.status, 200);
    const ocultar = await api(`/admin/resenas/${creadas.resena.id}`, { metodo: 'PATCH', token: tokens.admin, cuerpo: { visible: false } });
    assert.equal(ocultar.status, 200);

    const usuarios = await api('/admin/usuarios?texto=hostal.prueba', { token: tokens.admin });
    const hostal = usuarios.datos.usuarios[0];
    const suspender = await api(`/admin/usuarios/${hostal.id}/estado`, { metodo: 'PATCH', token: tokens.admin, cuerpo: { activo: false } });
    assert.equal(suspender.status, 200);
    // La sesión abierta de una cuenta suspendida deja de ser válida (401: el navegador la cierra).
    assert.equal((await api('/empresa/perfil', { token: tokens.hostal })).status, 401);
    const login = await api('/auth/login', { metodo: 'POST', cuerpo: { correo: 'hostal.prueba@correo.com', password: 'Prueba123' } });
    assert.equal(login.status, 403);
});
