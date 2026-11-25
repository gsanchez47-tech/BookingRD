/**
 * @file public/js/cuenta.js
 * @description Mi cuenta y seguridad: datos de la cuenta, cambio de contraseña
 *   (POST /api/auth/password) y cambio de correo con código
 *   (POST /api/auth/correo y /api/auth/correo/confirmar).
 */

const NOMBRES_ROL = { cliente: 'Viajero', empresa: 'Empresa', admin: 'Administración' };

function errorEn(campo, mensaje) {
    const p = document.getElementById(`error-${campo}`);
    if (!p) return mostrarAviso(mensaje, 'error');
    p.textContent = mensaje || '';
    p.hidden = !mensaje;
    const entrada = document.getElementById(campo === 'codigo' ? 'codigo-correo' : campo);
    if (entrada) {
        entrada.setAttribute('aria-invalid', String(Boolean(mensaje)));
        if (mensaje) entrada.focus();
    }
}

function limpiarErrores(form) {
    form.querySelectorAll('.error-campo').forEach((p) => { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

/** Nivel de 1 a 4 según longitud, mayúsculas, números y símbolos. */
function nivelPassword(texto) {
    if (!texto) return 0;
    let nivel = texto.length >= 8 ? 1 : 0;
    if (texto.length >= 10) nivel++;
    if (/[A-Z]/.test(texto) && /[a-z]/.test(texto)) nivel++;
    if (/\d/.test(texto) && /[^\w\s]/.test(texto)) nivel++;
    return Math.max(1, Math.min(4, nivel));
}

async function cargarCuenta() {
    try {
        const cuenta = await apiFetch('/auth/cuenta');
        document.getElementById('dato-nombre').textContent = cuenta.nombre;
        document.getElementById('dato-correo').textContent = cuenta.correo;
        document.getElementById('dato-rol').textContent = NOMBRES_ROL[cuenta.rol] || cuenta.rol;
    } catch (error) {
        mostrarAviso(error.message, 'error');
    }
}

function iniciarPassword() {
    const form = document.getElementById('form-password');
    const nueva = document.getElementById('password');
    nueva.addEventListener('input', () => { document.getElementById('fuerza').dataset.nivel = nivelPassword(nueva.value); });
    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        limpiarErrores(form);
        const boton = document.getElementById('boton-password');
        botonCargando(boton, 'Guardando...');
        try {
            await apiFetch('/auth/password', {
                method: 'POST',
                body: { actual: document.getElementById('actual').value, password: nueva.value, confirmarPassword: document.getElementById('confirmarPassword').value }
            });
            form.reset();
            delete document.getElementById('fuerza').dataset.nivel;
            mostrarAviso('Contraseña cambiada. Te enviamos un aviso por correo.', 'exito', 6000);
        } catch (error) {
            errorEn(error.campo || (error.datos && error.datos.campo) || 'password', error.message);
        } finally {
            botonNormal(boton);
        }
    });
}

function iniciarCorreo() {
    const form = document.getElementById('form-correo');
    const pasoCorreo = document.getElementById('paso-correo');
    const pasoCodigo = document.getElementById('paso-codigo');
    let correoNuevo = '';

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        limpiarErrores(form);
        const boton = document.getElementById('boton-correo');
        botonCargando(boton, 'Enviando...');
        try {
            correoNuevo = document.getElementById('correo-nuevo').value.trim();
            const respuesta = await apiFetch('/auth/correo', {
                method: 'POST',
                body: { correo: correoNuevo, password: document.getElementById('password-correo').value }
            });
            document.getElementById('correo-destino').textContent = respuesta.correo;
            const demo = document.getElementById('aviso-correo-demo');
            demo.hidden = !respuesta.vistaPrevia;
            if (respuesta.vistaPrevia) document.getElementById('enlace-correo-demo').href = respuesta.vistaPrevia;
            pasoCorreo.hidden = true;
            pasoCodigo.hidden = false;
            document.getElementById('codigo-correo').focus();
        } catch (error) {
            errorEn(error.campo || (error.datos && error.datos.campo) || 'correo-nuevo', error.message);
        } finally {
            botonNormal(boton);
        }
    });

    document.getElementById('boton-volver-correo').addEventListener('click', () => {
        pasoCodigo.hidden = true;
        pasoCorreo.hidden = false;
    });

    document.getElementById('boton-confirmar-correo').addEventListener('click', async () => {
        limpiarErrores(form);
        const boton = document.getElementById('boton-confirmar-correo');
        botonCargando(boton, 'Confirmando...');
        try {
            const respuesta = await apiFetch('/auth/correo/confirmar', {
                method: 'POST',
                body: { correo: correoNuevo, codigo: document.getElementById('codigo-correo').value }
            });
            let persistente = true;
            try { persistente = Boolean(localStorage.getItem(CLAVE_TOKEN)); } catch (_) { /* sin almacenamiento */ }
            guardarSesion(respuesta.token, respuesta.usuario, persistente);
            form.reset();
            pasoCodigo.hidden = true;
            pasoCorreo.hidden = false;
            document.getElementById('dato-correo').textContent = respuesta.correo;
            mostrarAviso(`Listo: tu correo ahora es ${respuesta.correo}. Avisamos al correo anterior.`, 'exito', 7000);
        } catch (error) {
            errorEn('codigo', error.message);
        } finally {
            botonNormal(boton);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!exigirSesion()) return;
    cargarCuenta();
    iniciarPassword();
    iniciarCorreo();
});
