/**
 * @file public/js/tienda.js
 * @description Tienda de artesanía: catálogo con filtros a la izquierda,
 *   carrito (guardado en este navegador), datos de entrega y pago con
 *   tarjeta simulado.
 *
 *   GET  /api/tienda/productos
 *   POST /api/tienda/pedidos
 */

const CLAVE_CARRITO = 'bookingrd-carrito';

const tienda = {
    productos: [],
    categoria: '',
    orden: 'destacados',
    carrito: new Map(),   // id -> cantidad
    checkout: null,
    recibo: null
};

document.addEventListener('DOMContentLoaded', async () => {
    tienda.categoria = new URLSearchParams(window.location.search).get('categoria') || '';
    leerCarrito();
    document.querySelectorAll('input[name="orden-tienda"]').forEach((radio) => radio.addEventListener('change', () => {
        tienda.orden = radio.value;
        pintarProductos();
    }));
    document.getElementById('lista-productos').addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-agregar]');
        if (boton) agregar(Number(boton.dataset.agregar));
    });
    document.getElementById('boton-carrito').addEventListener('click', abrirCarrito);
    prepararCarrito();
    document.getElementById('boton-recibo-pedido').addEventListener('click', () => {
        if (tienda.recibo) abrirRecibo(tienda.recibo);
    });

    try {
        const { productos } = await apiFetch('/tienda/productos');
        tienda.productos = productos;
        // Se descartan del carrito los productos que ya no se venden.
        for (const id of [...tienda.carrito.keys()]) if (!productos.some((p) => p.id === id)) tienda.carrito.delete(id);
        pintarCategorias();
        pintarProductos();
        actualizarBotonCarrito();
    } catch (error) {
        document.getElementById('lista-productos').innerHTML = `<li class="estado-vacio">${escaparHtml(error.message)}</li>`;
    }
});

/* ----------------------------------------------------------------------------
   Catálogo
   ---------------------------------------------------------------------------- */

function pintarCategorias() {
    const conteo = {};
    for (const p of tienda.productos) conteo[p.categoria] = (conteo[p.categoria] || 0) + 1;
    const opciones = [['', 'Todo', tienda.productos.length]]
        .concat(Object.entries(CATALOGOS.categoriasProducto).filter(([c]) => conteo[c]).map(([c, nombre]) => [c, nombre, conteo[c]]));
    const contenedor = document.getElementById('filtro-categoria-tienda');
    contenedor.innerHTML = opciones.map(([valor, texto, n]) => `
        <label><input type="radio" name="categoria-tienda" value="${valor}"${valor === tienda.categoria ? ' checked' : ''}>
            <span>${escaparHtml(texto)}<small>${n}</small></span></label>`).join('');
    if (!contenedor.querySelector('input:checked')) contenedor.querySelector('input').checked = true;
    contenedor.addEventListener('change', (evento) => {
        tienda.categoria = evento.target.value;
        const url = new URL(window.location.href);
        if (tienda.categoria) url.searchParams.set('categoria', tienda.categoria);
        else url.searchParams.delete('categoria');
        history.replaceState(null, '', url);
        pintarProductos();
    });
}

function pintarProductos() {
    let lista = tienda.productos.filter((p) => !tienda.categoria || p.categoria === tienda.categoria);
    if (tienda.orden === 'precio-asc') lista = lista.slice().sort((a, b) => a.precio - b.precio);
    if (tienda.orden === 'precio-desc') lista = lista.slice().sort((a, b) => b.precio - a.precio);
    document.getElementById('conteo-productos').textContent = `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;
    document.getElementById('lista-productos').innerHTML = lista.map((p) => {
        const enCarrito = tienda.carrito.get(p.id) || 0;
        const agotado = p.existencias <= 0;
        return `
            <li class="producto">
                <img src="${escaparHtml(urlMiniatura(p.imagen || ''))}" alt="" loading="lazy">
                <div class="producto-cuerpo">
                    <span class="producto-categoria">${escaparHtml(CATALOGOS.categoriasProducto[p.categoria] || '')}</span>
                    <h3 translate="no">${escaparHtml(p.nombre)}</h3>
                    <p>${escaparHtml(p.descripcion)}</p>
                    <p class="producto-origen"><span translate="no">${escaparHtml(p.taller)}</span>, <span translate="no">${escaparHtml(p.origen)}</span></p>
                </div>
                <div class="producto-pie">
                    <strong>${escaparHtml(formatearPrecio(p.precio))}</strong>
                    <small>${agotado ? 'Agotado' : p.existencias <= 8 ? `Quedan ${p.existencias}` : 'Disponible'}</small>
                    <button type="button" class="btn-primario btn-chico" data-agregar="${p.id}"${agotado || enCarrito >= Math.min(20, p.existencias) ? ' disabled' : ''}>
                        ${enCarrito ? `En el carrito: ${enCarrito}` : 'Agregar'}
                    </button>
                </div>
            </li>`;
    }).join('') || '<li class="estado-vacio">No hay productos en esta categoría.</li>';
}

/* ----------------------------------------------------------------------------
   Carrito
   ---------------------------------------------------------------------------- */

function leerCarrito() {
    try {
        const guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]');
        tienda.carrito = new Map(guardado.filter((l) => Number.isInteger(l[0]) && Number.isInteger(l[1]) && l[1] > 0));
    } catch (error) {
        tienda.carrito = new Map();
    }
}

function guardarCarrito() {
    try {
        localStorage.setItem(CLAVE_CARRITO, JSON.stringify([...tienda.carrito.entries()]));
    } catch (error) {
        // Sin almacenamiento disponible: el carrito vive solo en esta visita.
    }
}

const productoPorId = (id) => tienda.productos.find((p) => p.id === id);

function importes() {
    const subtotal = [...tienda.carrito.entries()].reduce((suma, [id, cantidad]) => suma + (productoPorId(id)?.precio || 0) * cantidad, 0);
    const entrega = document.querySelector('input[name="entrega"]:checked').value;
    const envio = CATALOGOS.entregasPedido[entrega].costo;
    return { subtotal, envio, total: subtotal + envio, entrega };
}

function agregar(id) {
    const producto = productoPorId(id);
    if (!producto) return;
    const actual = tienda.carrito.get(id) || 0;
    if (actual >= Math.min(20, producto.existencias)) return;
    tienda.carrito.set(id, actual + 1);
    guardarCarrito();
    pintarProductos();
    actualizarBotonCarrito();
    mostrarAviso(`${producto.nombre} se agregó al carrito.`);
}

function actualizarBotonCarrito() {
    const cantidad = [...tienda.carrito.values()].reduce((a, b) => a + b, 0);
    const boton = document.getElementById('boton-carrito');
    boton.hidden = cantidad === 0;
    document.getElementById('carrito-cantidad').textContent = cantidad;
    document.getElementById('carrito-total-boton').textContent = cantidad ? formatearPrecio(importes().subtotal) : '';
}

function pintarCarrito() {
    const lineas = document.getElementById('carrito-lineas');
    lineas.innerHTML = [...tienda.carrito.entries()].map(([id, cantidad]) => {
        const p = productoPorId(id);
        return `
            <li>
                <img src="${escaparHtml(urlMiniatura(p.imagen || ''))}" alt="" width="56" height="56">
                <span class="carrito-nombre" translate="no">${escaparHtml(p.nombre)}</span>
                <span class="carrito-cantidad" role="group" aria-label="Cantidad de ${escaparHtml(p.nombre)}">
                    <button type="button" data-restar="${id}" aria-label="Quitar uno">-</button>
                    <output>${cantidad}</output>
                    <button type="button" data-sumar="${id}" aria-label="Agregar uno"${cantidad >= Math.min(20, p.existencias) ? ' disabled' : ''}>+</button>
                </span>
                <strong>${escaparHtml(formatearPrecio(p.precio * cantidad))}</strong>
            </li>`;
    }).join('') || '<li class="carrito-vacio">Tu carrito está vacío.</li>';
    const { subtotal, envio, total } = importes();
    document.getElementById('carrito-importes').innerHTML = `
        <div><dt>Productos</dt><dd>${escaparHtml(formatearPrecio(subtotal))}</dd></div>
        <div><dt>Entrega</dt><dd>${envio ? escaparHtml(formatearPrecio(envio)) : 'Gratis'}</dd></div>
        <div class="carrito-total"><dt>Total</dt><dd>${escaparHtml(formatearPrecio(total))}</dd></div>`;
    document.getElementById('boton-comprar').disabled = tienda.carrito.size === 0;
}

function abrirCarrito() {
    const usuario = obtenerUsuario();
    const destinatario = document.getElementById('pedido-destinatario');
    if (usuario && !destinatario.value) destinatario.value = usuario.nombre;
    mostrarErrorCarrito('');
    pintarCarrito();
    abrirModal('modal-carrito');
}

function mostrarErrorCarrito(texto) {
    const error = document.getElementById('carrito-error');
    error.textContent = texto;
    error.hidden = !texto;
    error.classList.toggle('visible', Boolean(texto));
}

function prepararCarrito() {
    const formulario = document.getElementById('form-carrito');
    retirarMarcasAlEditar(formulario);
    document.getElementById('carrito-lineas').addEventListener('click', (evento) => {
        const restar = evento.target.closest('[data-restar]');
        const sumar = evento.target.closest('[data-sumar]');
        if (!restar && !sumar) return;
        const id = Number((restar || sumar).dataset[restar ? 'restar' : 'sumar']);
        const nueva = (tienda.carrito.get(id) || 0) + (sumar ? 1 : -1);
        if (nueva <= 0) tienda.carrito.delete(id);
        else tienda.carrito.set(id, nueva);
        guardarCarrito();
        pintarCarrito();
        pintarProductos();
        actualizarBotonCarrito();
    });
    formulario.querySelectorAll('input[name="entrega"]').forEach((radio) => radio.addEventListener('change', () => {
        const hotel = radio.value === 'hotel' && radio.checked;
        if (!radio.checked) return;
        document.getElementById('etiqueta-direccion').textContent = hotel ? 'Hotel y ciudad' : 'Dirección completa';
        document.getElementById('pedido-direccion').placeholder = hotel ? 'Ej.: Coralia Grand Resort, Punta Cana' : 'Calle, número, sector y ciudad';
        pintarCarrito();
    }));
    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        mostrarErrorCarrito('');
        const usuario = obtenerUsuario();
        if (!usuario) {
            irAlLogin();
            return;
        }
        if (usuario.rol !== 'cliente') {
            mostrarErrorCarrito('Las compras se realizan con una cuenta de viajero.');
            return;
        }
        if (document.getElementById('pedido-destinatario').value.trim().length < 3) {
            mostrarErrorCarrito('Escribe el nombre de quien recibe el pedido.');
            marcarCampo('pedido-destinatario');
            return;
        }
        if (document.getElementById('pedido-direccion').value.trim().length < 8) {
            mostrarErrorCarrito(importes().entrega === 'hotel' ? 'Escribe el nombre del hotel y la ciudad.' : 'Escribe la dirección completa de entrega.');
            marcarCampo('pedido-direccion');
            return;
        }
        if (!tienda.checkout) tienda.checkout = prepararPago({ alPagar: enviarPedido });
        const { total } = importes();
        const cantidad = [...tienda.carrito.values()].reduce((a, b) => a + b, 0);
        const primero = productoPorId([...tienda.carrito.keys()][0]);
        cerrarModal('modal-carrito');
        setTimeout(() => tienda.checkout.abrir({
            imagen: primero ? primero.imagen : '',
            publicacion: `Pedido de artesanía (${cantidad} ${cantidad === 1 ? 'producto' : 'productos'})`,
            fechas: CATALOGOS.entregasPedido[importes().entrega].nombre,
            total,
            soloTarjeta: true
        }), 200);
    });
}

async function enviarPedido(pago) {
    const { entrega } = importes();
    const pedido = await apiFetch('/tienda/pedidos', {
        method: 'POST',
        body: {
            productos: [...tienda.carrito.entries()].map(([id, cantidad]) => ({ id, cantidad })),
            entrega,
            destinatario: document.getElementById('pedido-destinatario').value.trim(),
            direccion: document.getElementById('pedido-direccion').value.trim(),
            telefono: document.getElementById('pedido-telefono').value.trim(),
            pago
        }
    });
    const usuario = obtenerUsuario();
    tienda.recibo = {
        codigo: pedido.codigo,
        etiquetaCodigo: 'Código del pedido',
        etiquetaServicio: 'Productos',
        publicacion: pedido.lineas.map((l) => `${l.cantidad} x ${l.nombre}`).join(', '),
        etiquetaFechas: 'Entrega',
        fechas: `${CATALOGOS.entregasPedido[pedido.entrega].nombre}: ${pedido.direccion}`,
        cliente: usuario ? usuario.nombre : '',
        total: pedido.total,
        pago: pedido.pago
    };
    // Existencias actualizadas y carrito vacío.
    for (const linea of pedido.lineas) {
        const p = productoPorId(linea.idProducto);
        if (p) p.existencias -= linea.cantidad;
    }
    tienda.carrito.clear();
    guardarCarrito();
    pintarProductos();
    actualizarBotonCarrito();
    document.getElementById('confirmacion-codigo').textContent = pedido.codigo;
    document.getElementById('confirmacion-texto').textContent =
        `Total: ${formatoMoneda.format(pedido.total)}. ${pedido.entrega === 'hotel' ? 'Lo entregamos en la recepción de tu hotel.' : 'Te lo enviamos a la dirección indicada.'}`;
    document.getElementById('confirmacion-pago').innerHTML = chipPago(pedido.pago);
    return () => abrirModal('modal-confirmacion');
}
