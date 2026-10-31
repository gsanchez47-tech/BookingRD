/**
 * @file public/js/autos.js
 * @description Alquiler de autos (autos.html).
 *
 *   - Buscador de autos:      js/buscador.js (tipo fijo "vehiculo").
 *   - Tipos de auto:          modelos por categoría (GET /api/estadisticas).
 *   - Autos mejor valorados:  GET /api/publicaciones?tipo=vehiculo&orden=valoracion
 */

document.addEventListener('DOMContentLoaded', () => {
    iniciarBuscador();
    cargarConteos();
    cargarAutos();
    iniciarCarrusel('carrusel-autos', 'grid-autos');
});

async function cargarConteos() {
    try {
        const datos = await apiFetch('/estadisticas');
        publicacionesPorDestino = datos.porCiudad || {};
        estadisticasCargadas = true;
        document.querySelectorAll('.categoria-auto').forEach((tarjeta) => {
            const conteo = tarjeta.querySelector('[data-conteo-categoria]');
            const total = datos.porCategoria[conteo.dataset.conteoCategoria] || 0;
            conteo.textContent = total ? `${total} ${total === 1 ? 'modelo' : 'modelos'}` : 'Próximamente';
            tarjeta.classList.toggle('sin-autos', !total);
        });
    } catch (_) {
        /* Las tarjetas se muestran sin conteo. */
    }
}

async function cargarAutos() {
    const pista = document.getElementById('grid-autos');
    pista.innerHTML = tarjetasEsqueleto(3);
    try {
        const { publicaciones } = await apiFetch('/publicaciones?tipo=vehiculo&orden=valoracion&porPagina=9');
        pista.innerHTML = publicaciones.length
            ? publicaciones.map(crearTarjetaPublicacion).join('')
            : crearEstado({ titulo: 'Aún no hay autos publicados', texto: 'Las empresas de alquiler pronto publicarán su flota.' });
        Favoritos.pintar(pista);
    } catch (error) {
        pista.innerHTML = crearEstado({ titulo: 'No se pudieron cargar los autos', texto: error.message, esError: true });
    }
    actualizarBotonesCarrusel('carrusel-autos', 'grid-autos');
}
