/**
 * @file src/utils/catalogos.js
 * @description Valores permitidos de los campos de selección del sistema.
 *   Son la referencia única del backend; las restricciones CHECK de
 *   database/instalacion-completa.sql usan los mismos códigos y el frontend
 *   los replica en public/js/comun.js (constante CATALOGOS).
 */

/** Tipo de servicio que ofrece una empresa. */
const TIPOS_SERVICIO = {
    alojamiento: 'Alojamiento',
    actividades: 'Actividades',
    mixto: 'Alojamiento y actividades',
    vehiculos: 'Alquiler de vehículos'
};

/**
 * Tipos de alojamiento y grupo (categoría pública) al que pertenecen.
 * Las categorías públicas de alojamiento son "hoteles-resorts" y
 * "villas-cabanas".
 */
const TIPOS_ALOJAMIENTO = {
    hotel: { nombre: 'Hotel', categoria: 'hoteles-resorts' },
    resort: { nombre: 'Resort todo incluido', categoria: 'hoteles-resorts' },
    boutique: { nombre: 'Hotel boutique', categoria: 'hoteles-resorts' },
    villa: { nombre: 'Villa', categoria: 'villas-cabanas' },
    cabana: { nombre: 'Cabañas', categoria: 'villas-cabanas' },
    apartamento: { nombre: 'Apartamentos turísticos', categoria: 'villas-cabanas' },
    hostal: { nombre: 'Hostal o posada', categoria: 'villas-cabanas' }
};

/** Categorías públicas de alojamiento. */
const CATEGORIAS_ALOJAMIENTO = {
    'hoteles-resorts': 'Hoteles y resorts',
    'villas-cabanas': 'Villas y cabañas'
};

/** Categorías de actividades. */
const CATEGORIAS_ACTIVIDAD = {
    'tour-playa': 'Tours de playa',
    'tour-montana': 'Tours de montaña',
    'tour-gastronomico': 'Tours gastronómicos',
    cultural: 'Tours culturales e históricos',
    'zip-line': 'Zip line y parapente',
    motocross: 'Motocross y buggies',
    acuaticas: 'Actividades acuáticas',
    golf: 'Golf'
};

/** Categorías de vehículos de alquiler (clases habituales del sector). */
const CATEGORIAS_VEHICULO = {
    economico: 'Económicos',
    compacto: 'Compactos',
    sedan: 'Sedanes',
    suv: 'SUV y camionetas',
    minivan: 'Minivanes',
    lujo: 'Lujo y ejecutivos',
    convertible: 'Convertibles',
    pickup: 'Pickups y 4x4'
};

const TRANSMISIONES = { automatica: 'Automática', manual: 'Manual' };
const COMBUSTIBLES = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico' };

/**
 * Extras opcionales del alquiler, con tarifa de la plataforma en RD$.
 *   porDia: true  se cobra por cada día de alquiler
 *   porDia: false se cobra una vez por reserva
 */
const EXTRAS_VEHICULO = {
    'proteccion-total': { nombre: 'Protección total sin deducible', precio: 950, porDia: true },
    'conductor-adicional': { nombre: 'Conductor adicional', precio: 450, porDia: true },
    'silla-infantil': { nombre: 'Silla infantil', precio: 300, porDia: true },
    gps: { nombre: 'Navegador GPS', precio: 350, porDia: true },
    'wifi-portatil': { nombre: 'Wi-Fi portátil', precio: 400, porDia: true },
    'entrega-hotel': { nombre: 'Entrega y recogida en tu hotel', precio: 1500, porDia: false }
};

/** Horario de los mostradores de alquiler (horas de recogida y devolución permitidas). */
const HORARIO_ALQUILER = { apertura: '06:00', cierre: '22:00' };

/** Servicios de un alojamiento (casillas del formulario de publicación). */
const SERVICIOS_HOTEL = {
    wifi: 'Wi-Fi',
    piscina: 'Piscina',
    playa: 'Acceso a la playa',
    'todo-incluido': 'Todo incluido',
    desayuno: 'Desayuno incluido',
    restaurante: 'Restaurante',
    spa: 'Spa',
    gimnasio: 'Gimnasio',
    aire: 'Aire acondicionado',
    estacionamiento: 'Estacionamiento',
    traslado: 'Traslado al aeropuerto',
    mascotas: 'Admite mascotas'
};

/** Destinos habilitados en la plataforma y provincia a la que pertenecen. */
const DESTINOS = {
    'Santo Domingo': 'Distrito Nacional',
    'Punta Cana': 'La Altagracia',
    'Puerto Plata': 'Puerto Plata',
    'Las Terrenas': 'Samaná',
    'Samaná': 'Samaná',
    'Las Galeras': 'Samaná',
    'La Romana': 'La Romana',
    'Sosúa': 'Puerto Plata',
    'Cabarete': 'Puerto Plata',
    'Jarabacoa': 'La Vega',
    'Constanza': 'La Vega',
    'Juan Dolio': 'San Pedro de Macorís',
    'Boca Chica': 'Santo Domingo',
    'Río San Juan': 'María Trinidad Sánchez',
    'Pedernales': 'Pedernales'
};

/** Provincias de República Dominicana y Distrito Nacional (registro de empresas). */
const PROVINCIAS = [
    'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional', 'Duarte',
    'El Seibo', 'Elías Piña', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal',
    'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
    'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata',
    'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná', 'San Cristóbal',
    'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez',
    'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde'
];

/** Asunto del formulario de contacto. */
const ASUNTOS_CONTACTO = {
    viajero: 'Consulta de viajero',
    empresa: 'Quiero registrar mi empresa',
    cuenta: 'Problemas con mi cuenta',
    otro: 'Otro asunto'
};

/** Comprueba que un valor sea una clave propia del catálogo. */
const enCatalogo = (catalogo, valor) => typeof valor === 'string' && Object.hasOwn(catalogo, valor);

module.exports = {
    TIPOS_SERVICIO,
    TIPOS_ALOJAMIENTO,
    CATEGORIAS_ALOJAMIENTO,
    CATEGORIAS_ACTIVIDAD,
    CATEGORIAS_VEHICULO,
    TRANSMISIONES,
    COMBUSTIBLES,
    EXTRAS_VEHICULO,
    HORARIO_ALQUILER,
    SERVICIOS_HOTEL,
    DESTINOS,
    PROVINCIAS,
    ASUNTOS_CONTACTO,
    enCatalogo
};
