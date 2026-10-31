/**
 * @file src/validators/publicaciones.validator.js
 * @description Validación y normalización de los datos de una publicación
 *   (hotel, actividad o vehículo) enviados desde el panel de empresa.
 *   Lanza ErrorHttp 400 con el id del campo del formulario que falló.
 */

const { solicitudInvalida } = require('../utils/errores');
const { textoLimpio, aEnteroPositivo } = require('../utils/validacion');
const {
    TIPOS_ALOJAMIENTO, CATEGORIAS_ACTIVIDAD, CATEGORIAS_VEHICULO, TRANSMISIONES, COMBUSTIBLES, SERVICIOS_HOTEL, DESTINOS, enCatalogo
} = require('../utils/catalogos');

const PRECIO_MAXIMO = 1000000;

/** Texto obligatorio con longitud máxima. */
function textoObligatorio(valor, campo, mensaje, maximo) {
    const texto = textoLimpio(valor);
    if (!texto || texto.length > maximo) throw solicitudInvalida(mensaje, campo);
    return texto;
}

/** Número decimal positivo con un máximo. */
function numeroPositivo(valor, campo, mensaje, maximo) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || numero > maximo) throw solicitudInvalida(mensaje, campo);
    return Math.round(numero * 100) / 100;
}

/** Entero dentro de un rango. */
function enteroEnRango(valor, campo, mensaje, minimo, maximo) {
    const numero = aEnteroPositivo(valor);
    if (numero === null || numero < minimo || numero > maximo) throw solicitudInvalida(mensaje, campo);
    return numero;
}

/**
 * @param {'hotel'|'actividad'|'vehiculo'} tipo
 * @param {object} body
 * @returns {object} datos normalizados para publicaciones.repo
 */
function validarPublicacion(tipo, body) {
    const datos = {
        nombre: textoObligatorio(body.nombre, 'pub-nombre', 'Escribe el nombre de la publicación (máximo 150 caracteres).', 150),
        ciudad: body.ciudad,
        descripcion: textoObligatorio(body.descripcion, 'pub-descripcion', 'Escribe una descripción (máximo 2000 caracteres).', 2000),
        precio: numeroPositivo(body.precio, 'pub-precio', 'Indica un precio mayor que cero.', PRECIO_MAXIMO),
        idImagen: body.idImagen ? aEnteroPositivo(body.idImagen) : null
    };
    if (!enCatalogo(DESTINOS, datos.ciudad)) throw solicitudInvalida('Selecciona el destino de la publicación.', 'pub-ciudad');

    if (tipo === 'hotel') {
        if (!enCatalogo(TIPOS_ALOJAMIENTO, body.tipoAlojamiento)) {
            throw solicitudInvalida('Selecciona el tipo de alojamiento.', 'pub-tipo-alojamiento');
        }
        const servicios = Array.isArray(body.servicios) ? [...new Set(body.servicios)] : [];
        if (!servicios.every((codigo) => enCatalogo(SERVICIOS_HOTEL, codigo))) {
            throw solicitudInvalida('Uno de los servicios seleccionados no es válido.', 'pub-servicios');
        }
        return Object.assign(datos, {
            tipoAlojamiento: body.tipoAlojamiento,
            direccion: textoObligatorio(body.direccion, 'pub-direccion', 'Escribe la dirección del alojamiento.', 250),
            servicios,
            capacidadPersonas: enteroEnRango(body.capacidadPersonas, 'pub-capacidad', 'Indica cuántas personas caben por habitación (1 a 30).', 1, 30),
            habitaciones: enteroEnRango(body.habitaciones, 'pub-habitaciones', 'Indica cuántas habitaciones o unidades ofreces (1 a 5000).', 1, 5000)
        });
    }

    if (tipo === 'vehiculo') return Object.assign(datos, validarVehiculo(body));

    if (!enCatalogo(CATEGORIAS_ACTIVIDAD, body.categoria)) {
        throw solicitudInvalida('Selecciona la categoría de la actividad.', 'pub-categoria');
    }
    const incluye = textoLimpio(body.incluye);
    if (incluye.length > 500) throw solicitudInvalida('La lista de lo que incluye admite hasta 500 caracteres.', 'pub-incluye');
    return Object.assign(datos, {
        categoria: body.categoria,
        puntoEncuentro: textoObligatorio(body.puntoEncuentro, 'pub-punto', 'Escribe el punto de encuentro.', 250),
        incluye: incluye || null,
        duracionHoras: numeroPositivo(body.duracionHoras, 'pub-duracion', 'Indica la duración en horas (hasta 240).', 240),
        cupoDiario: enteroEnRango(body.cupoDiario, 'pub-cupo', 'Indica el cupo de personas por día (1 a 1000).', 1, 1000)
    });
}

/** Importe opcional: vacío -> null; si se indica, número de 0 al máximo. */
function importeOpcional(valor, campo, mensaje, maximo) {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0 || numero > maximo) throw solicitudInvalida(mensaje, campo);
    return Math.round(numero * 100) / 100;
}

/** Campos propios de un vehículo de alquiler. */
function validarVehiculo(body) {
    if (!enCatalogo(CATEGORIAS_VEHICULO, body.categoria)) throw solicitudInvalida('Selecciona la categoría del vehículo.', 'veh-categoria');
    if (!enCatalogo(TRANSMISIONES, body.transmision)) throw solicitudInvalida('Selecciona la transmisión.', 'veh-transmision');
    if (!enCatalogo(COMBUSTIBLES, body.combustible)) throw solicitudInvalida('Selecciona el combustible.', 'veh-combustible');
    const anioActual = new Date().getFullYear();
    const kmIlimitado = body.kmPorDia === null || body.kmPorDia === undefined || body.kmPorDia === '';
    const incluye = textoLimpio(body.incluye);
    if (incluye.length > 500) throw solicitudInvalida('La lista de lo que incluye admite hasta 500 caracteres.', 'veh-incluye');
    return {
        categoria: body.categoria,
        marca: textoObligatorio(body.marca, 'veh-marca', 'Escribe la marca (máximo 60 caracteres).', 60),
        modelo: textoObligatorio(body.modelo, 'veh-modelo', 'Escribe el modelo (máximo 60 caracteres).', 60),
        anio: enteroEnRango(body.anio, 'veh-anio', `Indica un año entre 2000 y ${anioActual + 1}.`, 2000, anioActual + 1),
        transmision: body.transmision,
        combustible: body.combustible,
        pasajeros: enteroEnRango(body.pasajeros, 'veh-pasajeros', 'Indica los pasajeros (1 a 15).', 1, 15),
        puertas: enteroEnRango(body.puertas, 'veh-puertas', 'Indica las puertas (2 a 5).', 2, 5),
        maletas: Number.isInteger(Number(body.maletas)) && Number(body.maletas) >= 0 && Number(body.maletas) <= 10
            ? Number(body.maletas)
            : (() => { throw solicitudInvalida('Indica cuántas maletas caben (0 a 10).', 'veh-maletas'); })(),
        aire: body.aire !== false,
        kmPorDia: kmIlimitado ? null : enteroEnRango(body.kmPorDia, 'veh-km', 'Indica el límite diario de kilómetros o déjalo vacío para kilometraje ilimitado.', 1, 5000),
        lugarRecogida: textoObligatorio(body.lugarRecogida, 'veh-lugar', 'Escribe el lugar de recogida (mostrador u oficina).', 250),
        incluye: incluye || null,
        deposito: importeOpcional(body.deposito, 'veh-deposito', 'Indica el depósito de garantía (0 o más).', 1000000) ?? 0,
        edadMinima: enteroEnRango(body.edadMinima, 'veh-edad', 'Indica la edad mínima del conductor (18 a 30).', 18, 30),
        cargoConductorJoven: importeOpcional(body.cargoConductorJoven, 'veh-cargo-joven', 'El cargo por conductor joven debe ser 0 o más.', 100000),
        cargoOtraCiudad: importeOpcional(body.cargoOtraCiudad, 'veh-cargo-ciudad', 'El cargo por devolver en otra ciudad debe ser 0 o más.', 1000000),
        unidades: enteroEnRango(body.unidades, 'veh-unidades', 'Indica cuántos autos de este modelo tienes (1 a 1000).', 1, 1000)
    };
}

module.exports = { validarPublicacion };
