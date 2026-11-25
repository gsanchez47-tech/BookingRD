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
    const mensajeInfo = document.getElementById('mensaje-info');

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

    // "¿Olvidaste tu contraseña?" lleva el correo escrito a la página de recuperación.
    document.getElementById('enlace-olvido').addEventListener('click', (evento) => {
        const correo = document.getElementById('correo').value.trim();
        if (correo) evento.currentTarget.href = `restablecer.html?correo=${encodeURIComponent(correo)}`;
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

    // Entrar con un código: se pide al correo y se escribe en lugar de la contraseña.
    let modoCodigo = false;
    let codigoEnviado = false;
    const botonModo = document.getElementById('boton-modo-codigo');
    function cambiarModo(conCodigo) {
        modoCodigo = conCodigo;
        codigoEnviado = false;
        document.getElementById('campo-password').hidden = conCodigo;
        document.getElementById('campo-codigo').hidden = true;
        document.getElementById('enlace-olvido').hidden = conCodigo;
        botonModo.textContent = conCodigo ? 'Entrar con mi contraseña' : 'Entrar con un código por correo';
        botonNormal(boton, conCodigo ? 'Enviarme el código' : 'Iniciar sesión');
        mensajeError.hidden = true;
        document.getElementById('correo').focus();
    }
    botonModo.addEventListener('click', () => cambiarModo(!modoCodigo));

    async function entrarConCodigo(correo, recordarme) {
        if (!codigoEnviado) {
            botonCargando(boton, 'Enviando...');
            try {
                const respuesta = await apiFetch('/auth/acceso', { method: 'POST', body: { correo } });
                codigoEnviado = true;
                document.getElementById('campo-codigo').hidden = false;
                const demo = document.getElementById('aviso-acceso-demo');
                demo.hidden = !respuesta.vistaPrevia;
                if (respuesta.vistaPrevia) document.getElementById('enlace-acceso-demo').href = respuesta.vistaPrevia;
                mensajeInfo.textContent = `Si ${correo} tiene una cuenta, te llegó un código de 6 dígitos. Vence en ${respuesta.minutos} minutos.`;
                mensajeInfo.hidden = false;
                botonNormal(boton, 'Entrar');
                document.getElementById('codigo-acceso').focus();
            } catch (error) {
                mostrarError(error.message, 'correo');
                botonNormal(boton, 'Enviarme el código');
            }
            return;
        }
        const codigo = document.getElementById('codigo-acceso').value.replace(/\D/g, '');
        if (codigo.length !== 6) {
            mostrarError('Escribe los 6 dígitos del código.', 'codigo-acceso');
            return;
        }
        botonCargando(boton, 'Entrando...');
        try {
            const respuesta = await apiFetch('/auth/acceso/verificar', { method: 'POST', body: { correo, codigo } });
            terminarInicio(respuesta, recordarme);
        } catch (error) {
            mostrarError(error.message, 'codigo-acceso');
            botonNormal(boton, 'Entrar');
        }
    }

    function terminarInicio(respuesta, recordarme) {
        guardarSesion(respuesta.token, respuesta.usuario, recordarme);
        programarAviso(`Bienvenido de vuelta, ${respuesta.usuario.nombre.split(' ')[0]}.`);
        const inicioPorRol = { admin: 'admin.html', empresa: 'panel-empresa.html' };
        const volver = parametros.get('volver');
        window.location.href = volver ? destinoSeguro(volver) : (inicioPorRol[respuesta.usuario.rol] || 'index.html');
    }

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mensajeError.hidden = true;
        formulario.querySelectorAll('.invalido').forEach((campo) => campo.classList.remove('invalido'));
        if (modoCodigo) {
            const correoCodigo = document.getElementById('correo').value.trim();
            if (!correoCodigo) return mostrarError('Escribe el correo de tu cuenta.', 'correo');
            return entrarConCodigo(correoCodigo, document.getElementById('recordarme').checked);
        }

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
