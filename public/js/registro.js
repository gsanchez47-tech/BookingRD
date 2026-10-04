/**
 * @file public/js/registro.js
 * @description Formulario de registro (registro.html).
 *
 * Tipos de cuenta:
 *   cliente  formulario de un solo paso: nombre, correo y contraseña.
 *   empresa  formulario en tres pasos:
 *              1. Representante: nombre, cargo, correo, teléfono, contraseña.
 *              2. Empresa: nombre comercial, razón social, RNC, teléfono,
 *                 provincia, ciudad, dirección, sitio web y licencia MITUR.
 *              3. Servicios: tipo de empresa (alojamiento | actividades |
 *                 mixto). Según el tipo se habilitan los datos de
 *                 alojamiento (tipo y número de habitaciones) y/o las
 *                 categorías de actividades.
 *            Cada paso se valida antes de avanzar.
 *
 * Elementos con data-solo="empresa" se muestran solo para cuentas de empresa.
 * Parámetro de URL: ?tipo=empresa preselecciona la cuenta de empresa.
 * Tras el registro la sesión queda iniciada y se redirige a index.html.
 *
 * API: POST /api/auth/registro. Los errores 400/409 incluyen el campo que
 * los originó; el formulario vuelve al paso correspondiente y lo marca.
 */

const LONGITUD_MINIMA_PASSWORD = 8;
const TOTAL_PASOS_EMPRESA = 3;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_RNC = /^(\d{9}|\d{11})$/;
const PATRON_SITIO_WEB = /^https?:\/\/\S+\.\S+$/i;

/** Contenido del panel fotográfico y textos del formulario por tipo de cuenta. */
const PRESENTACION = {
    cliente: {
        foto: 'img/playa-costa-este.jpg',
        titulo: 'El Caribe dominicano, a un clic',
        texto: 'Crea tu cuenta en menos de un minuto y guarda tus planes de viaje.',
        tituloPaso1: 'Tus datos',
        etiquetaNombre: 'Nombre completo'
    },
    empresa: {
        foto: 'img/hero-playa.jpg',
        titulo: 'Lleva tu negocio a más viajeros',
        texto: 'Registra tu hotel, tus tours o tus actividades de aventura y prepárate para publicarlos en BookingRD.',
        tituloPaso1: 'Datos del representante',
        etiquetaNombre: 'Nombre del representante'
    }
};

/** Paso actual del formulario de empresa (1 a 3). */
let pasoActual = 1;

document.addEventListener('DOMContentLoaded', () => {
    const formulario = document.getElementById('form-registro');

    if (new URLSearchParams(window.location.search).get('tipo') === 'empresa') {
        formulario.querySelector('input[name="tipoCuenta"][value="empresa"]').checked = true;
    }
    aplicarTipoCuenta(false);

    formulario.querySelectorAll('input[name="tipoCuenta"]').forEach((opcion) => {
        opcion.addEventListener('change', () => aplicarTipoCuenta(true));
    });
    document.getElementById('tipoServicio').addEventListener('change', aplicarTipoServicio);
    document.getElementById('boton-anterior').addEventListener('click', () => irAPaso(pasoActual - 1));
    document.getElementById('password').addEventListener('input', actualizarMedidorPassword);

    // Botones "Mostrar" / "Ocultar" de los campos de contraseña.
    document.querySelectorAll('[data-mostrar]').forEach((boton) => {
        boton.addEventListener('click', () => {
            const campo = document.getElementById(boton.dataset.mostrar);
            const mostrar = campo.type === 'password';
            campo.type = mostrar ? 'text' : 'password';
            boton.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        });
    });

    // Al corregir un campo marcado como inválido se retira la marca.
    formulario.addEventListener('input', retirarMarca);
    formulario.addEventListener('change', retirarMarca);

    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (tipoCuentaElegido() === 'empresa' && pasoActual < TOTAL_PASOS_EMPRESA) {
            avanzarPaso();
        } else {
            enviarRegistro();
        }
    });
});

/* ----------------------------------------------------------------------------
   TIPO DE CUENTA Y PASOS
   ---------------------------------------------------------------------------- */

/** @returns {'cliente'|'empresa'} */
function tipoCuentaElegido() {
    return document.querySelector('input[name="tipoCuenta"]:checked').value;
}

/**
 * Ajusta el formulario al tipo de cuenta: campos visibles, textos, panel
 * fotográfico e indicador de pasos.
 * @param {boolean} animar true si el cambio lo origina el usuario.
 */
function aplicarTipoCuenta(animar) {
    const tipo = tipoCuentaElegido();
    const presentacion = PRESENTACION[tipo];
    const esEmpresa = tipo === 'empresa';

    limpiarErrores();
    document.querySelectorAll('[data-solo="empresa"]').forEach((elemento) => {
        elemento.hidden = !esEmpresa;
    });
    document.getElementById('titulo-paso-1').textContent = presentacion.tituloPaso1;
    document.getElementById('etiqueta-nombre').textContent = presentacion.etiquetaNombre;
    document.getElementById('foto-registro-titulo').textContent = presentacion.titulo;
    document.getElementById('foto-registro-texto').textContent = presentacion.texto;
    cambiarFoto(presentacion.foto, animar);
    irAPaso(1);
}

/** Reemplaza la fotografía del panel con una transición de opacidad. */
function cambiarFoto(ruta, animar) {
    const foto = document.getElementById('foto-registro');
    if (foto.getAttribute('src') === ruta) return;
    if (!animar) {
        foto.src = ruta;
        return;
    }
    foto.style.opacity = '0';
    setTimeout(() => {
        foto.src = ruta;
        foto.style.opacity = '1';
    }, 250);
}

/** Muestra el paso indicado y actualiza el indicador y los botones. */
function irAPaso(numero) {
    const esEmpresa = tipoCuentaElegido() === 'empresa';
    pasoActual = esEmpresa ? Math.min(Math.max(numero, 1), TOTAL_PASOS_EMPRESA) : 1;

    document.querySelectorAll('.paso-formulario').forEach((paso) => {
        paso.hidden = Number(paso.dataset.paso) !== pasoActual;
    });
    document.querySelectorAll('#indicador-pasos .paso').forEach((paso) => {
        const numeroPaso = Number(paso.dataset.paso);
        paso.classList.toggle('activo', numeroPaso === pasoActual);
        paso.classList.toggle('completado', numeroPaso < pasoActual);
    });

    const botonAnterior = document.getElementById('boton-anterior');
    const botonPrincipal = document.getElementById('boton-registro');
    botonAnterior.hidden = !esEmpresa || pasoActual === 1;
    if (!esEmpresa) botonPrincipal.textContent = 'Crear cuenta';
    else botonPrincipal.textContent = pasoActual < TOTAL_PASOS_EMPRESA ? 'Continuar' : 'Registrar empresa';
}

/** Valida el paso actual y, si es correcto, avanza al siguiente. */
function avanzarPaso() {
    limpiarErrores();
    const error = validarPaso(pasoActual, leerFormulario());
    if (error) {
        mostrarError(error.mensaje, error.campo);
        return;
    }
    irAPaso(pasoActual + 1);
    document.querySelector('.auth-formulario-contenido').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Habilita los bloques de alojamiento y de actividades según el tipo de empresa. */
function aplicarTipoServicio() {
    const tipo = document.getElementById('tipoServicio').value;
    document.getElementById('bloque-alojamiento').hidden = !(tipo === 'alojamiento' || tipo === 'mixto');
    document.getElementById('bloque-actividades').hidden = !(tipo === 'actividades' || tipo === 'mixto');
}

/* ----------------------------------------------------------------------------
   LECTURA Y VALIDACIÓN
   ---------------------------------------------------------------------------- */

/**
 * Construye el body de POST /api/auth/registro. Los datos de empresa se
 * incluyen solo para tipoCuenta = "empresa", y los de servicio solo si
 * corresponden al tipo de empresa elegido.
 * @returns {object}
 */
function leerFormulario() {
    const valor = (id) => document.getElementById(id).value.trim();
    const tipoCuenta = tipoCuentaElegido();
    const datos = {
        tipoCuenta,
        nombre: valor('nombre'),
        correo: valor('correo'),
        password: document.getElementById('password').value,
        confirmarPassword: document.getElementById('confirmarPassword').value
    };
    if (tipoCuenta !== 'empresa') return datos;

    const tipoServicio = document.getElementById('tipoServicio').value;
    Object.assign(datos, {
        cargo: valor('cargo'),
        telefono: valor('telefono'),
        nombreEmpresa: valor('nombreEmpresa'),
        razonSocial: valor('razonSocial'),
        rnc: valor('rnc').replace(/[\s-]/g, ''),
        telefonoEmpresa: valor('telefonoEmpresa'),
        provincia: document.getElementById('provincia').value,
        ciudadEmpresa: valor('ciudadEmpresa'),
        direccion: valor('direccion'),
        sitioWeb: valor('sitioWeb'),
        licenciaMitur: valor('licenciaMitur'),
        tipoServicio,
        descripcionEmpresa: valor('descripcionEmpresa'),
        confirmaDatos: document.getElementById('confirmaDatos').checked
    });
    if (tipoServicio === 'alojamiento' || tipoServicio === 'mixto') {
        datos.tipoAlojamiento = document.getElementById('tipoAlojamiento').value;
        datos.numeroHabitaciones = Number(document.getElementById('numeroHabitaciones').value);
    }
    if (tipoServicio === 'actividades' || tipoServicio === 'mixto') {
        datos.categoriasActividad = [...document.querySelectorAll('input[name="categoriaActividad"]:checked')].map((casilla) => casilla.value);
    }
    return datos;
}

/**
 * Validación de un paso en el navegador; replica las reglas del backend
 * (src/controllers/auth.controller.js), que vuelve a validar cada campo.
 * @returns {{mensaje: string, campo: string}|null} primer error encontrado.
 */
function validarPaso(paso, datos) {
    const error = (campo, mensaje) => ({ campo, mensaje });
    const esEmpresa = datos.tipoCuenta === 'empresa';

    if (paso === 1) {
        if (!datos.nombre) return error('nombre', 'Escribe tu nombre completo.');
        if (esEmpresa && !datos.cargo) return error('cargo', 'Indica tu cargo en la empresa.');
        if (!PATRON_CORREO.test(datos.correo)) return error('correo', 'Escribe un correo con formato válido.');
        if (esEmpresa && !datos.telefono) return error('telefono', 'Escribe el teléfono del representante.');
        if (datos.password.length < LONGITUD_MINIMA_PASSWORD) {
            return error('password', `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`);
        }
        if (datos.password !== datos.confirmarPassword) return error('confirmarPassword', 'Las contraseñas no coinciden.');
    }

    if (paso === 2) {
        if (!datos.nombreEmpresa) return error('nombreEmpresa', 'Escribe el nombre comercial de la empresa.');
        if (!datos.razonSocial) return error('razonSocial', 'Escribe la razón social registrada de la empresa.');
        if (!PATRON_RNC.test(datos.rnc)) return error('rnc', 'El RNC debe tener 9 dígitos, u 11 si es una cédula.');
        if (!datos.telefonoEmpresa) return error('telefonoEmpresa', 'Escribe el teléfono de la empresa.');
        if (!datos.provincia) return error('provincia', 'Selecciona la provincia de la empresa.');
        if (!datos.ciudadEmpresa) return error('ciudadEmpresa', 'Escribe la ciudad o el municipio.');
        if (!datos.direccion) return error('direccion', 'Escribe la dirección de la empresa.');
        if (datos.sitioWeb && !PATRON_SITIO_WEB.test(datos.sitioWeb)) return error('sitioWeb', 'El sitio web debe comenzar con http:// o https://');
    }

    if (paso === 3) {
        if (!datos.tipoServicio) return error('tipoServicio', 'Selecciona si la empresa ofrece alojamiento, actividades o ambos.');
        if ('tipoAlojamiento' in datos) {
            if (!datos.tipoAlojamiento) return error('tipoAlojamiento', 'Selecciona el tipo de alojamiento.');
            if (!Number.isInteger(datos.numeroHabitaciones) || datos.numeroHabitaciones < 1) {
                return error('numeroHabitaciones', 'Indica el número de habitaciones o unidades.');
            }
        }
        if ('categoriasActividad' in datos && !datos.categoriasActividad.length) {
            return error('categoriasActividad', 'Selecciona al menos una categoría de actividades.');
        }
        if (!datos.confirmaDatos) return error('confirmaDatos', 'Confirma que los datos de la empresa son verídicos.');
    }
    return null;
}

/* ----------------------------------------------------------------------------
   ENVÍO
   ---------------------------------------------------------------------------- */

async function enviarRegistro() {
    limpiarErrores();
    const datos = leerFormulario();
    const pasos = datos.tipoCuenta === 'empresa' ? [1, 2, 3] : [1];

    for (const paso of pasos) {
        const error = validarPaso(paso, datos);
        if (error) {
            irAPaso(paso);
            mostrarError(error.mensaje, error.campo);
            return;
        }
    }

    const boton = document.getElementById('boton-registro');
    const textoBoton = boton.textContent;
    botonCargando(boton, 'Creando cuenta...');
    try {
        const respuesta = await apiFetch('/auth/registro', { method: 'POST', body: datos });
        guardarSesion(respuesta.token, respuesta.usuario);
        programarAviso(respuesta.usuario.rol === 'empresa'
            ? `Empresa ${respuesta.usuario.nombreEmpresa} registrada. La publicación de servicios estará disponible en la siguiente fase.`
            : `Cuenta creada. Bienvenido a BookingRD, ${respuesta.usuario.nombre.split(' ')[0]}.`);
        window.location.href = 'index.html';
    } catch (errorServidor) {
        botonNormal(boton, textoBoton);
        // El backend indica el campo con error: se vuelve al paso que lo contiene.
        const campo = errorServidor.campo ? document.getElementById(errorServidor.campo) : null;
        const pasoDelCampo = campo ? campo.closest('.paso-formulario') : null;
        if (pasoDelCampo) irAPaso(Number(pasoDelCampo.dataset.paso));
        mostrarError(errorServidor.message, errorServidor.campo);
    }
}

/* ----------------------------------------------------------------------------
   MENSAJES Y ESTADO VISUAL
   ---------------------------------------------------------------------------- */

/** Muestra el mensaje de error, marca el campo y le da el foco. */
function mostrarError(texto, idCampo) {
    const mensaje = document.getElementById('mensaje-error');
    mensaje.textContent = texto;
    mensaje.classList.remove('visible');
    void mensaje.offsetWidth;   // reinicia la animación si el mensaje ya estaba visible
    mensaje.classList.add('visible');

    const campo = idCampo ? document.getElementById(idCampo) : null;
    const contenedor = campo ? campo.closest('.campo, .casilla') || campo : null;
    if (contenedor) {
        contenedor.classList.add('invalido');
        campo.focus({ preventScroll: true });
        contenedor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        mensaje.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function retirarMarca(evento) {
    const contenedor = evento.target.closest('.campo, .casilla');
    if (contenedor) contenedor.classList.remove('invalido');
}

function limpiarErrores() {
    document.getElementById('mensaje-error').classList.remove('visible');
    document.querySelectorAll('#form-registro .invalido').forEach((elemento) => elemento.classList.remove('invalido'));
}

/**
 * Indicador de seguridad de la contraseña (0 a 4): longitud, mayúsculas y
 * minúsculas, números y símbolos.
 */
function actualizarMedidorPassword() {
    const valor = document.getElementById('password').value;
    let nivel = 0;
    if (valor.length >= LONGITUD_MINIMA_PASSWORD) nivel++;
    if (/[a-z]/.test(valor) && /[A-Z]/.test(valor)) nivel++;
    if (/\d/.test(valor)) nivel++;
    if (/[^A-Za-z0-9]/.test(valor)) nivel++;
    if (valor.length < LONGITUD_MINIMA_PASSWORD) nivel = Math.min(nivel, 1);

    const barra = document.getElementById('barra-password');
    barra.style.width = `${(valor ? Math.max(nivel, 1) : 0) * 25}%`;
    barra.dataset.nivel = String(nivel);
}
