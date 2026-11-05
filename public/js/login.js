/**
 * @file public/js/login.js
 * @description Inicio de sesión (login.html).
 *
 *   - Formulario: correo y contraseña, opción "Mostrar" contraseña y
 *     "Recordarme" (sesión persistente en localStorage o, si se desmarca,
 *     en sessionStorage hasta cerrar el navegador).
 *   - "¿Olvidaste tu contraseña?" muestra las instrucciones de recuperación
 *     mediante el formulario de contacto.
 *   - "Cuentas de demostración" completa el formulario con una cuenta de
 *     ejemplo (datos de database/datos-demo.js).
 *
 * Parámetros de URL opcionales:
 *   volver  página local a la que se redirige tras iniciar sesión
 *           (validada con destinoSeguro); por defecto index.html.
 *   motivo  "sesion-expirada" muestra un aviso informativo.
 *
 * API: POST /api/auth/login  { correo, password } -> { token, usuario }
 */

document.addEventListener('DOMContentLoaded', () => {
    iniciarFormulario();
});

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
        info.hidden = false;
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

    // Cuentas de demostración: completan el formulario.
    document.querySelectorAll('[data-demo]').forEach((boton) => {
        boton.addEventListener('click', () => {
            document.getElementById('correo').value = boton.dataset.demo;
            document.getElementById('password').value = boton.dataset.clave;
            document.getElementById('boton-login').focus();
        });
    });

    formulario.addEventListener('input', (evento) => {
        const contenedor = evento.target.closest('.campo');
        if (contenedor) contenedor.classList.remove('invalido');
    });

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mensajeError.hidden = true;
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
        mensajeError.hidden = false;
        if (idCampo) {
            const campo = document.getElementById(idCampo);
            campo.closest('.campo').classList.add('invalido');
            campo.focus();
        }
    }
}
