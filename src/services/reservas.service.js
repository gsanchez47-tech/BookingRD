/**
 * @file src/services/reservas.service.js
 * @description Reglas de negocio de disponibilidad y reservas.
 *
 * Hotel:
 *   - Fechas: entrada desde hoy, salida posterior, estadía de 1 a 30 noches,
 *     entrada hasta 365 días en el futuro.
 *   - Disponibilidad: habitaciones de la publicación menos la mayor
 *     ocupación de cualquiera de las noches del rango.
 *   - Personas: hasta capacidad por habitación x habitaciones reservadas.
 *   - Total: precio por noche x noches x habitaciones.
 * Actividad:
 *   - Fecha desde hoy y hasta 365 días en el futuro.
 *   - Disponibilidad: cupo diario menos las personas ya reservadas ese día.
 *   - Total: precio por persona x personas.
 * Vehículo (alquiler de autos, prácticas habituales del sector):
 *   - Recogida y devolución con fecha y hora dentro del horario del mostrador
 *     (HORARIO_ALQUILER). Si la recogida es hoy, al menos una hora después
 *     de la hora actual de República Dominicana.
 *   - Días de alquiler: bloques de 24 horas desde la recogida, con una hora
 *     de cortesía en la devolución; mínimo 1 día y máximo 30.
 *   - Conductor: edad desde la mínima del vehículo; entre esa edad y 24 años
 *     se aplica el cargo por conductor joven (por día).
 *   - Devolución en otra ciudad: solo si el vehículo tiene cargo_otra_ciudad
 *     (cargo único).
 *   - Extras del catálogo EXTRAS_VEHICULO, por día o por reserva.
 *   - Disponibilidad: unidades del modelo menos el mayor número de autos ya
 *     alquilados en cualquiera de los días del rango (recogida y devolución
 *     incluidos).
 *   - Depósito de garantía: informativo, se retiene al recoger y no forma
 *     parte del total.
 *
 * La creación se ejecuta en una transacción que bloquea la fila de la
 * publicación: las reservas simultáneas se procesan en serie y el cupo no
 * puede superarse.
 */

const crypto = require('crypto');

const { conTransaccion } = require('../config/db');
const reservasRepo = require('../repositories/reservas.repo');
const cuentasRepo = require('../repositories/cuentas.repo');
const correoService = require('./correo.service');
const { solicitudInvalida, noEncontrado, conflicto, prohibido } = require('../utils/errores');
const { hoy, esFechaValida, diferenciaDias, sumarDias } = require('../utils/fechas');
const { aEnteroPositivo, textoLimpio } = require('../utils/validacion');
const { DESTINOS, EXTRAS_VEHICULO, HORARIO_ALQUILER, enCatalogo } = require('../utils/catalogos');

const MAXIMO_NOCHES = 30;
const MAXIMO_DIAS_ALQUILER = 30;
const EDAD_CONDUCTOR_JOVEN = 25;          // el cargo joven aplica por debajo de esta edad
const MINUTOS_CORTESIA = 60;              // tolerancia en la devolución antes de cobrar otro día
const ANTELACION_MINIMA_MINUTOS = 60;     // recogida en el mismo día
const PATRON_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ANTICIPACION_MAXIMA_DIAS = 365;
const MAXIMO_HABITACIONES_POR_RESERVA = 20;
const MAXIMO_PERSONAS_POR_RESERVA = 60;
const ERRORES_SQL_DUPLICADO = [2627, 2601];
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin O, 0, I ni 1

/** Código de reserva legible: BRD + 7 caracteres aleatorios. */
function generarCodigo() {
    let codigo = 'BRD';
    for (let i = 0; i < 7; i++) codigo += ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)];
    return codigo;
}

/** Valida una fecha de inicio: válida, no pasada y dentro de la anticipación máxima. */
function validarFechaInicio(fecha, campo) {
    if (!esFechaValida(fecha)) throw solicitudInvalida('Selecciona una fecha válida.', campo);
    const dias = diferenciaDias(hoy(), fecha);
    if (dias < 0) throw solicitudInvalida('La fecha no puede ser anterior a hoy.', campo);
    if (dias > ANTICIPACION_MAXIMA_DIAS) throw solicitudInvalida('Solo se aceptan reservas con hasta un año de anticipación.', campo);
}

/** Hora y minutos actuales en República Dominicana (HH:MM). */
function horaActualRD() {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .format(new Date());
}

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Valida una hora HH:MM dentro del horario del mostrador. */
function validarHora(hora, campo, momento) {
    if (typeof hora !== 'string' || !PATRON_HORA.test(hora)) throw solicitudInvalida(`Selecciona la hora de ${momento}.`, campo);
    const minutos = aMinutos(hora);
    if (minutos < aMinutos(HORARIO_ALQUILER.apertura) || minutos > aMinutos(HORARIO_ALQUILER.cierre)) {
        throw solicitudInvalida(`El mostrador atiende de ${HORARIO_ALQUILER.apertura} a ${HORARIO_ALQUILER.cierre}.`, campo);
    }
}

/**
 * Días de alquiler: bloques de 24 horas desde la recogida, con una hora de
 * cortesía. 24 h = 1 día; 25 h = 1 día; 25 h 01 min = 2 días.
 */
function diasDeAlquiler(fechaRecogida, horaRecogida, fechaDevolucion, horaDevolucion) {
    const minutos = diferenciaDias(fechaRecogida, fechaDevolucion) * 1440 + aMinutos(horaDevolucion) - aMinutos(horaRecogida);
    return { minutos, dias: Math.max(1, Math.ceil((minutos - MINUTOS_CORTESIA) / 1440)) };
}

/** Solicitud de alquiler de vehículo normalizada (sin depender del vehículo). */
function validarSolicitudVehiculo(datos) {
    validarFechaInicio(datos.recogida, 'reserva-recogida');
    validarHora(datos.horaRecogida, 'reserva-hora-recogida', 'recogida');
    if (datos.recogida === hoy() && aMinutos(datos.horaRecogida) < aMinutos(horaActualRD()) + ANTELACION_MINIMA_MINUTOS) {
        throw solicitudInvalida('Para recoger hoy, elige una hora al menos una hora posterior a la actual.', 'reserva-hora-recogida');
    }
    if (!esFechaValida(datos.devolucion)) throw solicitudInvalida('Selecciona la fecha de devolución.', 'reserva-devolucion');
    validarHora(datos.horaDevolucion, 'reserva-hora-devolucion', 'devolución');
    const { minutos, dias } = diasDeAlquiler(datos.recogida, datos.horaRecogida, datos.devolucion, datos.horaDevolucion);
    if (minutos < 120) throw solicitudInvalida('La devolución debe ser al menos dos horas después de la recogida.', 'reserva-devolucion');
    if (dias > MAXIMO_DIAS_ALQUILER) throw solicitudInvalida(`El alquiler máximo es de ${MAXIMO_DIAS_ALQUILER} días.`, 'reserva-devolucion');

    const edad = aEnteroPositivo(datos.edadConductor);
    if (!edad || edad < 18 || edad > 99) throw solicitudInvalida('Indica la edad del conductor principal (18 a 99 años).', 'reserva-edad');

    const ciudadDevolucion = datos.ciudadDevolucion ? String(datos.ciudadDevolucion) : null;
    if (ciudadDevolucion && !enCatalogo(DESTINOS, ciudadDevolucion)) throw solicitudInvalida('Selecciona una ciudad de devolución válida.', 'reserva-ciudad-devolucion');

    // Los extras llegan como arreglo (JSON) o separados por coma (consulta GET).
    const listaExtras = Array.isArray(datos.extras) ? datos.extras : String(datos.extras || '').split(',');
    const extras = [...new Set(listaExtras.map((x) => String(x).trim()).filter(Boolean))];
    if (!extras.every((codigo) => enCatalogo(EXTRAS_VEHICULO, codigo))) throw solicitudInvalida('Uno de los extras seleccionados no es válido.', 'reserva-extras');

    return {
        fechaInicio: datos.recogida,
        fechaFin: datos.devolucion,
        horaInicio: datos.horaRecogida,
        horaFin: datos.horaDevolucion,
        dias,
        edadConductor: edad,
        ciudadDevolucion,
        extras,
        personas: 1,
        habitaciones: null,
        noches: null
    };
}

/**
 * Comprueba las condiciones del vehículo (edad mínima, devolución en otra
 * ciudad) y calcula el desglose del precio.
 * @returns {{total: number, desglose: {concepto: string, importe: number}[]}}
 */
function cotizarVehiculo(vehiculo, solicitud) {
    if (solicitud.edadConductor < vehiculo.edadMinima) {
        throw solicitudInvalida(`Este vehículo requiere un conductor de ${vehiculo.edadMinima} años o más.`, 'reserva-edad');
    }
    const otraCiudad = solicitud.ciudadDevolucion && solicitud.ciudadDevolucion !== vehiculo.ciudad;
    if (otraCiudad && vehiculo.cargoOtraCiudad === null) {
        throw solicitudInvalida(`Este vehículo debe devolverse en ${vehiculo.ciudad}.`, 'reserva-ciudad-devolucion');
    }
    const { dias } = solicitud;
    const desglose = [{ concepto: `Alquiler: ${dias} ${plural(dias, 'día', 'días')}`, importe: vehiculo.precio * dias }];
    for (const codigo of solicitud.extras) {
        const extra = EXTRAS_VEHICULO[codigo];
        desglose.push({ concepto: extra.nombre, importe: extra.porDia ? extra.precio * dias : extra.precio });
    }
    if (solicitud.edadConductor < EDAD_CONDUCTOR_JOVEN && vehiculo.cargoConductorJoven) {
        desglose.push({ concepto: 'Cargo por conductor joven', importe: vehiculo.cargoConductorJoven * dias });
    }
    if (otraCiudad) desglose.push({ concepto: `Devolución en ${solicitud.ciudadDevolucion}`, importe: vehiculo.cargoOtraCiudad });
    const total = Math.round(desglose.reduce((suma, linea) => suma + linea.importe, 0) * 100) / 100;
    return { total, desglose };
}

/**
 * Normaliza y valida la solicitud según el tipo de publicación.
 * @returns {{fechaInicio: string, fechaFin: string|null, noches: number|null, personas: number, habitaciones: number|null}}
 */
function validarSolicitud(tipo, datos) {
    if (tipo === 'vehiculo') return validarSolicitudVehiculo(datos);
    const personas = aEnteroPositivo(datos.personas);
    if (!personas || personas > MAXIMO_PERSONAS_POR_RESERVA) {
        throw solicitudInvalida(`Indica entre 1 y ${MAXIMO_PERSONAS_POR_RESERVA} personas.`, 'reserva-personas');
    }

    if (tipo === 'actividad') {
        validarFechaInicio(datos.fecha, 'reserva-fecha');
        return { fechaInicio: datos.fecha, fechaFin: null, noches: null, personas, habitaciones: null };
    }

    validarFechaInicio(datos.entrada, 'reserva-entrada');
    if (!esFechaValida(datos.salida)) throw solicitudInvalida('Selecciona la fecha de salida.', 'reserva-salida');
    const noches = diferenciaDias(datos.entrada, datos.salida);
    if (noches < 1) throw solicitudInvalida('La salida debe ser posterior a la entrada.', 'reserva-salida');
    if (noches > MAXIMO_NOCHES) throw solicitudInvalida(`La estadía máxima es de ${MAXIMO_NOCHES} noches.`, 'reserva-salida');

    const habitaciones = aEnteroPositivo(datos.habitaciones);
    if (!habitaciones || habitaciones > MAXIMO_HABITACIONES_POR_RESERVA) {
        throw solicitudInvalida(`Indica entre 1 y ${MAXIMO_HABITACIONES_POR_RESERVA} habitaciones.`, 'reserva-habitaciones');
    }
    return { fechaInicio: datos.entrada, fechaFin: datos.salida, noches, personas, habitaciones };
}

/**
 * Unidades libres para la solicitud (habitaciones o plazas), consultando
 * las reservas confirmadas con la transacción indicada (o sin transacción).
 */
async function calcularLibres(transaccion, tipo, publicacion, solicitud) {
    if (tipo === 'vehiculo') {
        const alquileres = await reservasRepo.reservasVehiculoEnRango(transaccion, publicacion.id, solicitud.fechaInicio, solicitud.fechaFin);
        let ocupados = 0;
        for (let dia = solicitud.fechaInicio; dia <= solicitud.fechaFin; dia = sumarDias(dia, 1)) {
            ocupados = Math.max(ocupados, alquileres.filter((a) => a.inicio <= dia && dia <= a.fin).length);
        }
        return Math.max(publicacion.unidades - ocupados, 0);
    }
    if (tipo === 'actividad') {
        const reservadas = await reservasRepo.personasActividadEnFecha(transaccion, publicacion.id, solicitud.fechaInicio);
        return Math.max(publicacion.unidades - reservadas, 0);
    }
    const reservas = await reservasRepo.reservasHotelEnRango(transaccion, publicacion.id, solicitud.fechaInicio, solicitud.fechaFin);
    let ocupacionMaxima = 0;
    for (let noche = solicitud.fechaInicio; noche < solicitud.fechaFin; noche = sumarDias(noche, 1)) {
        const ocupadas = reservas
            .filter((reserva) => reserva.entrada <= noche && noche < reserva.salida)
            .reduce((suma, reserva) => suma + reserva.habitaciones, 0);
        ocupacionMaxima = Math.max(ocupacionMaxima, ocupadas);
    }
    return Math.max(publicacion.unidades - ocupacionMaxima, 0);
}

/** Total de la reserva. */
function calcularTotal(tipo, publicacion, solicitud) {
    const total = tipo === 'hotel'
        ? publicacion.precio * solicitud.noches * solicitud.habitaciones
        : publicacion.precio * solicitud.personas;
    return Math.round(total * 100) / 100;
}

/**
 * Consulta de disponibilidad sin reservar (detalle de la publicación).
 * @returns {Promise<{disponible: boolean, libres: number, total: number, noches: number|null, mensaje: string|null}>}
 */
async function consultarDisponibilidad(tipo, id, datos) {
    const solicitud = validarSolicitud(tipo, datos);
    // Consulta informativa: sin transacción (el bloqueo dura solo la sentencia).
    const publicacion = await reservasRepo.bloquearPublicacion(null, tipo, id);
    if (!publicacion || !publicacion.activo) throw noEncontrado('La publicación no existe o no está disponible.');
    const libres = await calcularLibres(null, tipo, publicacion, solicitud);
    if (tipo === 'vehiculo') {
        const { total, desglose } = cotizarVehiculo(publicacion, solicitud);
        return {
            disponible: libres > 0,
            libres,
            dias: solicitud.dias,
            noches: null,
            total,
            desglose,
            deposito: publicacion.deposito,
            mensaje: libres > 0 ? null : 'No quedan autos de este modelo para esas fechas.'
        };
    }
    return Object.assign(evaluar(tipo, publicacion, solicitud, libres), {
        libres,
        noches: solicitud.noches,
        total: calcularTotal(tipo, publicacion, solicitud)
    });
}

/** Singular o plural según la cantidad. */
const plural = (cantidad, singular, varios) => (cantidad === 1 ? singular : varios);

/** Determina si la solicitud cabe en las unidades libres y por qué no, si es el caso. */
function evaluar(tipo, publicacion, solicitud, libres) {
    if (tipo === 'actividad') {
        if (solicitud.personas > libres) {
            return { disponible: false, mensaje: libres ? `Solo ${plural(libres, 'queda', 'quedan')} ${libres} ${plural(libres, 'plaza', 'plazas')} para esa fecha.` : 'No quedan plazas para esa fecha.' };
        }
        return { disponible: true, mensaje: null };
    }
    if (solicitud.habitaciones > libres) {
        return { disponible: false, mensaje: libres ? `Solo ${plural(libres, 'queda', 'quedan')} ${libres} ${plural(libres, 'habitación', 'habitaciones')} para esas fechas.` : 'No quedan habitaciones para esas fechas.' };
    }
    const capacidad = publicacion.capacidad * solicitud.habitaciones;
    if (solicitud.personas > capacidad) {
        return { disponible: false, mensaje: `Con ${solicitud.habitaciones} ${plural(solicitud.habitaciones, 'habitación', 'habitaciones')} caben hasta ${capacidad} personas.` };
    }
    return { disponible: true, mensaje: null };
}

/**
 * Crea una reserva confirmada para un viajero.
 * @param {{id: number, rol: string}} usuario
 * @returns {Promise<{id: number, codigo: string, total: number}>}
 */
async function crearReserva(usuario, datos) {
    if (usuario.rol !== 'cliente') {
        throw prohibido('Las reservas se realizan con una cuenta de viajero.');
    }
    const tipo = datos.tipo;
    if (!['hotel', 'actividad', 'vehiculo'].includes(tipo)) throw solicitudInvalida('Tipo de publicación no válido.');
    const idPublicacion = aEnteroPositivo(datos.idPublicacion);
    if (!idPublicacion) throw solicitudInvalida('Publicación no válida.');
    const solicitud = validarSolicitud(tipo, datos);
    const comentario = textoLimpio(datos.comentario).slice(0, 500);

    for (let intento = 1; ; intento++) {
        try {
            return await conTransaccion(async (transaccion) => {
                const publicacion = await reservasRepo.bloquearPublicacion(transaccion, tipo, idPublicacion);
                if (!publicacion || !publicacion.activo) throw noEncontrado('La publicación no existe o no está disponible.');

                const libres = await calcularLibres(transaccion, tipo, publicacion, solicitud);
                let total;
                if (tipo === 'vehiculo') {
                    total = cotizarVehiculo(publicacion, solicitud).total;
                    if (libres < 1) throw conflicto('No quedan autos de este modelo para esas fechas.');
                } else {
                    const evaluacion = evaluar(tipo, publicacion, solicitud, libres);
                    if (!evaluacion.disponible) throw conflicto(evaluacion.mensaje);
                    total = calcularTotal(tipo, publicacion, solicitud);
                }

                const reserva = {
                    codigo: generarCodigo(),
                    idUsuario: usuario.id,
                    tipo,
                    idPublicacion,
                    fechaInicio: solicitud.fechaInicio,
                    fechaFin: solicitud.fechaFin,
                    personas: solicitud.personas,
                    habitaciones: solicitud.habitaciones,
                    precioUnitario: publicacion.precio,
                    total,
                    comentario,
                    horaInicio: solicitud.horaInicio || null,
                    horaFin: solicitud.horaFin || null,
                    ciudadDevolucion: tipo === 'vehiculo' ? (solicitud.ciudadDevolucion || publicacion.ciudad) : null,
                    edadConductor: solicitud.edadConductor || null,
                    extras: solicitud.extras || [],
                    deposito: tipo === 'vehiculo' ? publicacion.deposito : null
                };
                const id = await reservasRepo.crear(transaccion, reserva);
                return { id, codigo: reserva.codigo, total: reserva.total, publicacion: publicacion.nombre, reserva, datosPublicacion: publicacion };
            }).then((creada) => {
                notificarReserva(usuario.id, creada.reserva, creada.datosPublicacion);
                return { id: creada.id, codigo: creada.codigo, total: creada.total, publicacion: creada.publicacion };
            });
        } catch (error) {
            // Código repetido (probabilidad mínima): se reintenta con otro código.
            if (ERRORES_SQL_DUPLICADO.includes(error.number) && intento < 3) continue;
            throw error;
        }
    }
}

/**
 * Envía la confirmación por correo al viajero, después de confirmar la
 * transacción. Un fallo al buscar el contacto o al enviar no afecta la reserva.
 */
function notificarReserva(idUsuario, reserva, publicacion) {
    cuentasRepo.obtenerContacto(idUsuario)
        .then((cliente) => { if (cliente) correoService.confirmacionReserva(cliente, reserva, publicacion); })
        .catch((error) => console.error(`No se pudo preparar el correo de la reserva ${reserva.codigo}: ${error.message}`));
}

/** Cancela una reserva futura del propio viajero. */
async function cancelarReserva(usuario, idReserva) {
    const id = aEnteroPositivo(idReserva);
    if (!id) throw noEncontrado('La reserva no existe.');
    await conTransaccion(async (transaccion) => {
        const reserva = await reservasRepo.bloquearReserva(transaccion, id);
        if (!reserva || reserva.idUsuario !== usuario.id) throw noEncontrado('La reserva no existe.');
        if (reserva.estado === 'cancelada') throw conflicto('La reserva ya estaba cancelada.');
        if (diferenciaDias(hoy(), reserva.fechaInicio) < 1) {
            throw conflicto('Solo se pueden cancelar reservas con al menos un día de anticipación.');
        }
        await reservasRepo.cancelar(transaccion, id);
    });
}

module.exports = { consultarDisponibilidad, crearReserva, cancelarReserva, generarCodigo, diasDeAlquiler };
