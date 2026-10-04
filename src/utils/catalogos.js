/**
 * @file src/utils/catalogos.js
 * @description Valores permitidos para los campos de selección del registro
 *   y del formulario de contacto. Las mismas listas se presentan como
 *   opciones en public/registro.html e public/index.html; las restricciones
 *   CHECK de database/instalacion-completa.sql usan los mismos códigos.
 */

/** Tipo de servicio de la empresa. */
const TIPOS_SERVICIO = {
    alojamiento: 'Alojamiento',
    actividades: 'Actividades',
    mixto: 'Alojamiento y actividades'
};

/** Tipo de alojamiento (empresas con servicio "alojamiento" o "mixto"). */
const TIPOS_ALOJAMIENTO = {
    hotel: 'Hotel',
    resort: 'Resort todo incluido',
    boutique: 'Hotel boutique',
    villa: 'Villa',
    cabana: 'Cabañas',
    apartamento: 'Apartamentos turísticos',
    hostal: 'Hostal o posada'
};

/** Categorías de actividades (empresas con servicio "actividades" o "mixto"). */
const CATEGORIAS_ACTIVIDAD = {
    'tour-playa': 'Tours de playa',
    'tour-montana': 'Tours de montaña',
    'tour-gastronomico': 'Tours gastronómicos',
    'zip-line': 'Zip line',
    motocross: 'Motocross y buggies',
    acuaticas: 'Actividades acuáticas',
    cultural: 'Tours culturales e históricos'
};

/** Provincias de República Dominicana y Distrito Nacional. */
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

module.exports = { TIPOS_SERVICIO, TIPOS_ALOJAMIENTO, CATEGORIAS_ACTIVIDAD, PROVINCIAS, ASUNTOS_CONTACTO };
