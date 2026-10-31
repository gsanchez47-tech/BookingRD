/**
 * @file public/js/login.js
 * @description Inicio de sesión (login.html).
 *
 *   - Fondo: presentación automática de fotografías; los botones de destino
 *     permiten elegir una y reinician el temporizador.
 *   - Formulario: correo y contraseña, opción "Mostrar" contraseña y
 *     "Recordarme" (sesión persistente en localStorage o, si se desmarca,
 *     en sessionStorage hasta cerrar el navegador).
 *   - "¿Olvidaste tu contraseña?" muestra las instrucciones de recuperación
 *     mediante el formulario de contacto.
 *
 * Parámetros de URL opcionales:
 *   volver  página local a la que se redirige tras iniciar sesión
 *           (validada con destinoSeguro); por defecto index.html.
 *   motivo  "sesion-expirada" muestra un aviso informativo.
 *
 * API: POST /api/auth/login  { correo, password } -> { token, usuario }
 */

const DURACION_DIAPOSITIVA_MS = 7000;

document.addEventListener('DOMContentLoaded', () => {
    iniciarPresentacion();
    iniciarFormulario();
});

/* ----------------------------------------------------------------------------
   PRESENTACIÓN DE FONDO
   ---------------------------------------------------------------------------- */

function iniciarPresentacion() {
    const diapositivas = document.querySelectorAll('.login-diapositiva');
    const botones = document.querySelectorAll('.login-destino');
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let indice = 0;
    let temporizador = null;

    document.documentElement.style.setProperty('--duracion-diapositiva', `${DURACION_DIAPOSITIVA_MS}ms`);

    const mostrar = (nuevoIndice) => {
        indice = (nuevoIndice + diapositivas.length) % diapositivas.length;
        diapositivas.forEach((diapositiva, i) => diapositiva.classList.toggle('activa', i === indice));
        botones.forEach((boton, i) => {
            boton.classList.toggle('activo', i === indice);
            boton.setAttribute('aria-pressed', String(i === indice));
        });
        programar();
    };

    const programar = () => {
        clearTimeout(temporizador);
        if (!reducirMovimiento) temporizador = setTimeout(() => mostrar(indice + 1), DURACION_DIAPOSITIVA_MS);
    };

    botones.forEach((boton) => {
        boton.addEventListener('click', () => mostrar(Number(boton.dataset.diapositiva)));
    });
    mostrar(0);
}

/* ----------------------------------------------------------------------------
   FORMULARIO
   ---------------------------------------------------------------------------- */

function iniciarFormulario() {
    const parametros = new URLSearchParams(window.location.search);
    const formulario = document.getElementById('form-login');
    const boton = document.getElementById('boton-login');
    const mensajeError = document.getElementById('mensaje-error');

    if (parametros.get('motivo') === 'sesion-expirada') {
        const info = document.getElementById('mensaje-info');
        info.textContent = 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
        info.classList.add('visible');
    }

    // Mostrar u ocultar la contraseña.
    document.getElementById('boton-mostrar').addEventListener('click', (evento) => {
        const campo = document.getElementById('password');
        const mostrar = campo.type === 'password';
        campo.type = mostrar ? 'text' : 'password';
        evento.currentTarget.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    });

    // Instrucciones de recuperación de contraseña.
    document.getElementById('boton-olvido').addEventListener('click', (evento) => {
        const panel = document.getElementById('panel-olvido');
        panel.hidden = !panel.hidden;
        evento.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });

    formulario.addEventListener('input', (evento) => {
        const contenedor = evento.target.closest('.campo');
        if (contenedor) contenedor.classList.remove('invalido');
    });

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mensajeError.classList.remove('visible');
        formulario.querySelectorAll('.invalido').forEach((campo) => campo.classList.remove('invalido'));

        const correo = document.getElementById('correo').value.trim();
        const password = document.getElementById('password').value;
        const recordarme = document.getElementById('recordarme').checked;

        if (!correo || !password) {
            mostrarError('Escribe tu correo y tu contraseña.', !correo ? 'correo' : 'password');
            return;
        }

        botonCargando(boton, 'Ingresando...');
        try {
            const respuesta = await apiFetch('/auth/login', { method: 'POST', body: { correo, password } });
            guardarSesion(respuesta.token, respuesta.usuario, recordarme);
            programarAviso(`Bienvenido de vuelta, ${respuesta.usuario.nombre.split(' ')[0]}.`);
            // Sin página de regreso, cada rol va a su espacio principal.
            const inicioPorRol = { admin: 'admin.html', empresa: 'panel-empresa.html' };
            const volver = parametros.get('volver');
            window.location.href = volver ? destinoSeguro(volver) : (inicioPorRol[respuesta.usuario.rol] || 'index.html');
        } catch (error) {
            // 401: credenciales incorrectas (mensaje genérico). 403: cuenta suspendida.
            mostrarError(error.message, error.status === 401 ? 'password' : null);
            botonNormal(boton, 'Iniciar sesión');
        }
    });

    /** Muestra el mensaje de error y marca el campo indicado. */
    function mostrarError(texto, idCampo) {
        mensajeError.textContent = texto;
        mensajeError.classList.remove('visible');
        void mensajeError.offsetWidth;   // reinicia la animación si el mensaje ya estaba visible
        mensajeError.classList.add('visible');
        if (idCampo) {
            const campo = document.getElementById(idCampo);
            campo.closest('.campo').classList.add('invalido');
            campo.focus();
        }
    }
}
