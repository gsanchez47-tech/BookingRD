/**
 * @file public/js/lugares.js
 * @description Lugares imperdibles de cada destino (ficha del mapa de la
 *   página de inicio). Los nombres propios no se traducen.
 */

const LUGARES_DESTINO = {
    'Punta Cana': ['Playa Bávaro', 'Playa Macao', 'Hoyo Azul (Cap Cana)', 'Reserva Ecológica Ojos Indígenas', 'Playa Cabeza de Toro', 'Playa Juanillo (Cap Cana)', 'Playa Uvero Alto'],
    'La Romana': ['Isla Saona', 'Isla Catalina', 'Playa Dominicus (Bayahíbe)', 'Altos de Chavón', 'Cueva de las Maravillas'],
    'Miches': ['Playa Esmeralda', 'Montaña Redonda', 'Laguna Limón', 'Laguna Redonda', 'Cueva Fun Fun (Hato Mayor)', 'Cueva Doña Ana (Hato Mayor)'],
    'Juan Dolio': ['Playa Juan Dolio', 'Playa Guayacanes'],
    'Santo Domingo': ['Zona Colonial y Calle Las Damas', 'Alcázar de Colón', 'Parque Nacional Los Tres Ojos', 'Faro a Colón', 'Jardín Botánico Nacional', 'Malecón', 'Parque Mirador Sur', 'Plaza de la Cultura'],
    'Boca Chica': ['Playa Boca Chica', 'Parque Nacional Submarino La Caleta'],
    'Samaná': ['Parque Nacional Los Haitises', 'Cayo Levantado', 'Salto El Limón', 'Playa El Valle', 'Cascada Lulú', 'Ballenas jorobadas (enero a marzo)'],
    'Las Galeras': ['Playa Rincón', 'Playa Frontón', 'Playa Madama', 'Boca del Diablo'],
    'Las Terrenas': ['Playa Cosón', 'Playa Bonita', 'Playa Las Ballenas', 'Pueblo de los Pescadores'],
    'Puerto Plata': ['27 Charcos de Damajagua (Imbert)', 'Teleférico y Loma Isabel de Torres', 'Calle de las Sombrillas', 'Fortaleza San Felipe', 'Cayo Arena (Punta Rucia)', 'Playa Dorada', 'Amber Cove y Taino Bay'],
    'Sosúa': ['Playa Sosúa', 'Playa Alicia', 'Malecón de Sosúa'],
    'Cabarete': ['Kite Beach', 'Playa Encuentro', 'Cuevas de Cabarete (Parque Nacional El Choco)'],
    'Río San Juan': ['Laguna Gri-Gri', 'Playa Grande', 'Playa Caletón', 'Playa Preciosa', 'Playa Rogelio (Gaspar Hernández)', 'Cabo Francés Viejo (Cabrera)', 'El Dudú (Cabrera)', 'Playa Diamante (Cabrera)'],
    'Jarabacoa': ['Pico Duarte', 'Salto de Baiguate', 'Saltos de Jimenoa', 'La Confluencia', 'Rancho Capote', 'Rafting en el río Yaque del Norte'],
    'Constanza': ['Parque Nacional Valle Nuevo', 'Las Pirámides de Valle Nuevo', 'Salto de Aguas Blancas', 'Valle del Tetero', 'San José de Ocoa y el valle de Tatón'],
    'Barahona': ['Playa San Rafael', 'Playa y río Los Patos', 'Playa Quemaito', 'Balneario Villa Miriam', 'Mina de larimar (Las Filipinas)', 'Lago Enriquillo e Isla Cabritos', 'La Azufrada', 'Las Caritas de los Taínos', 'Balneario Las Marías (Neyba)', 'Pozos de Cocolo y Boca de Cachón'],
    'Pedernales': ['Bahía de las Águilas', 'Parque Nacional Jaragua', 'Hoyo de Pelempito', 'Cabo Rojo', 'Laguna de Oviedo y sus flamencos'],
    'Montecristi': ['El Morro de Montecristi', 'Parque Nacional Submarino Montecristi', 'Cayos Siete Hermanos', 'Salinas de Montecristi', 'Mercado binacional de Dajabón', 'Balneario Ávalos (Mao)', 'Parque Nacional Nalga de Maco'],
    'Baní': ['Dunas de Baní', 'Salinas de Baní', 'Playa Los Almendros', 'Playa Palmar de Ocoa (Azua)', 'Playa Najayo (San Cristóbal)', 'Playa Palenque (San Cristóbal)']
};
