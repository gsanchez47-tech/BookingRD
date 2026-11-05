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
    'zip-line': 'Tirolesa y aventura aérea',
    motocross: 'Motocross y buggies',
    acuaticas: 'Actividades acuáticas',
    golf: 'Golf',
    'alquiler-equipo': 'Alquiler de equipo de aventura',
    fotografia: 'Fotógrafos y drones'
};

/**
 * Categorías de actividad que se reservan por unidades en lugar de por
 * personas: el equipo se alquila por pieza y día, y el fotógrafo por sesión.
 */
const UNIDAD_ACTIVIDAD = {
    'alquiler-equipo': { singular: 'equipo', plural: 'equipos', precio: 'por equipo y día' },
    fotografia: { singular: 'sesión', plural: 'sesiones', precio: 'por sesión' }
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
    'Pedernales': 'Pedernales',
    'Miches': 'El Seibo',
    'Barahona': 'Barahona',
    'Montecristi': 'Monte Cristi',
    'Baní': 'Peravia'
};

/** Coordenadas (latitud, longitud) de cada destino: mapa de la isla y consulta del clima. */
const COORDENADAS_DESTINOS = {
    'Santo Domingo': [18.4861, -69.9312],
    'Punta Cana': [18.5601, -68.3725],
    'Puerto Plata': [19.7934, -70.6884],
    'Las Terrenas': [19.3110, -69.5428],
    'Samaná': [19.2056, -69.3366],
    'Las Galeras': [19.2850, -69.1960],
    'La Romana': [18.4273, -68.9728],
    'Sosúa': [19.7520, -70.5170],
    'Cabarete': [19.7490, -70.4100],
    'Jarabacoa': [19.1180, -70.6380],
    'Constanza': [18.9090, -70.7450],
    'Juan Dolio': [18.4270, -69.4290],
    'Boca Chica': [18.4500, -69.6060],
    'Río San Juan': [19.6420, -70.0760],
    'Pedernales': [18.0380, -71.7440],
    'Miches': [18.9820, -69.0450],
    'Barahona': [18.2085, -71.1008],
    'Montecristi': [19.8480, -71.6460],
    'Baní': [18.2800, -70.3310]
};

/** Categorías de la tienda de artesanía. */
const CATEGORIAS_PRODUCTO = {
    larimar: 'Larimar',
    ambar: 'Ámbar',
    arte: 'Pintura y arte taíno',
    'cafe-cacao': 'Café y cacao de origen',
    artesania: 'Artesanía tradicional'
};

/** Entrega de los pedidos de la tienda y su costo en RD$. */
const ENTREGAS_PEDIDO = {
    hotel: { nombre: 'En la recepción de tu hotel', costo: 0 },
    domicilio: { nombre: 'A domicilio', costo: 450 }
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
    UNIDAD_ACTIVIDAD,
    CATEGORIAS_PRODUCTO,
    ENTREGAS_PEDIDO,
    CATEGORIAS_VEHICULO,
    TRANSMISIONES,
    COMBUSTIBLES,
    EXTRAS_VEHICULO,
    HORARIO_ALQUILER,
    SERVICIOS_HOTEL,
    DESTINOS,
    COORDENADAS_DESTINOS,
    PROVINCIAS,
    ASUNTOS_CONTACTO,
    enCatalogo
};
