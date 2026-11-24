/**
 * @file public/js/restablecer.js
 * @description Restablecer la contraseña (restablecer.html).
 *   Sin parámetros: pide el correo y envía el enlace (POST /api/auth/recuperar).
 *   Con ?clave=...: comprueba el enlace (GET /api/auth/restablecer) y guarda
 *   la contraseña nueva (POST /api/auth/restablecer); después inicia sesión.
 */

const inicioPorRolRestablecer = { admin: 'admin.html', empresa: 'panel-empresa.html', cliente: 'index.html' };

function mostrarBloque(id) {
    document.querySelectorAll('.bloque-restablecer').forEach((bloque) => { bloque.hidden = bloque.id !== id; });
}

function errorEn(idMensaje, texto) {
    const mensaje = document.getElementById(idMensaje);
    mensaje.textContent = texto;
    mensaje.hidden = !texto;
}

async function pedirEnlace(evento) {
    evento.preventDefault();
    const correo = document.getElementById('correo').value.trim();
    errorEn('mensaje-error', '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        errorEn('mensaje-error', 'Escribe el correo de tu cuenta.');
        document.getElementById('correo').focus();
        return;
    }
    const boton = document.getElementById('boton-pedir');
    const texto = boton.textContent;
    botonCargando(boton, 'Enviando...');
    try {
        const respuesta = await apiFetch('/auth/recuperar', { method: 'POST', body: { correo } });
        document.getElementById('enviado-a').textContent = respuesta.correo;
        const aviso = document.getElementById('aviso-demostracion');
        aviso.hidden = !respuesta.vistaPrevia;
        if (respuesta.vistaPrevia) document.getElementById('enlace-correo-prueba').href = urlRecurso(respuesta.vistaPrevia);
        mostrarBloque('bloque-enviado');
    } catch (error) {
        errorEn('mensaje-error', error.message);
    } finally {
        botonNormal(boton, texto);
    }
}

async function guardarNueva(evento, clave) {
    evento.preventDefault();
    errorEn('mensaje-error-nueva', '');
    const password = document.getElementById('password').value;
    const confirmarPassword = document.getElementById('confirmarPassword').value;
    if (password.length < 8) return errorEn('mensaje-error-nueva', 'La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirmarPassword) return errorEn('mensaje-error-nueva', 'Las contraseñas no coinciden.');
    const boton = document.getElementById('boton-nueva');
    const texto = boton.textContent;
    botonCargando(boton, 'Guardando...');
    try {
        const respuesta = await apiFetch('/auth/restablecer', { method: 'POST', body: { clave, password, confirmarPassword } });
        if (respuesta.token) {
            guardarSesion(respuesta.token, respuesta.usuario);
            programarAviso('Contraseña cambiada. Ya iniciaste sesión.');
            window.location.href = inicioPorRolRestablecer[respuesta.usuario.rol] || 'index.html';
        } else {
            window.location.href = 'login.html';
        }
    } catch (error) {
        botonNormal(boton, texto);
        if (error.status === 410) return mostrarBloque('bloque-vencido');
        errorEn('mensaje-error-nueva', error.message);
    }
}

async function iniciarRestablecer() {
    const parametros = new URLSearchParams(window.location.search);
    const clave = parametros.get('clave');

    document.querySelectorAll('[data-mostrar]').forEach((boton) => {
        boton.addEventListener('click', () => {
            const campo = document.getElementById(boton.dataset.mostrar);
            const mostrar = campo.type === 'password';
            campo.type = mostrar ? 'text' : 'password';
            boton.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        });
    });

    if (!clave) {
        if (parametros.get('correo')) document.getElementById('correo').value = parametros.get('correo');
        document.getElementById('form-pedir').addEventListener('submit', pedirEnlace);
        document.getElementById('boton-otra-vez').addEventListener('click', () => mostrarBloque('bloque-pedir'));
        mostrarBloque('bloque-pedir');
        return;
    }

    try {
        const enlace = await apiFetch(`/auth/restablecer?clave=${encodeURIComponent(clave)}`);
        document.getElementById('nueva-para').textContent = enlace.correo;
        mostrarBloque('bloque-nueva');
        document.getElementById('form-nueva').addEventListener('submit', (evento) => guardarNueva(evento, clave));
        document.getElementById('password').focus();
    } catch {
        mostrarBloque('bloque-vencido');
    }
}

iniciarRestablecer();
