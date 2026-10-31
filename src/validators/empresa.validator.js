/**
 * @file src/validators/empresa.validator.js
 * @description Validación del perfil de empresa editable desde el panel.
 *   Lanza ErrorHttp 400 con el id del campo del formulario que falló.
 */

const { solicitudInvalida } = require('../utils/errores');
const { textoLimpio } = require('../utils/validacion');
const { PROVINCIAS } = require('../utils/catalogos');

/**
 * @param {object} body { nombreComercial, telefono, provincia, ciudad, direccion, sitioWeb?, licenciaMitur?, descripcion? }
 * @returns {object} datos normalizados para cuentas.repo.actualizarEmpresa
 */
function validarPerfilEmpresa(body) {
    const datos = {
        nombreComercial: textoLimpio(body.nombreComercial),
        telefono: textoLimpio(body.telefono),
        provincia: textoLimpio(body.provincia),
        ciudad: textoLimpio(body.ciudad),
        direccion: textoLimpio(body.direccion),
        sitioWeb: textoLimpio(body.sitioWeb) || null,
        licenciaMitur: textoLimpio(body.licenciaMitur) || null,
        descripcion: textoLimpio(body.descripcion) || null
    };
    if (!datos.nombreComercial || datos.nombreComercial.length > 150) {
        throw solicitudInvalida('Escribe el nombre comercial (máximo 150 caracteres).', 'perfil-nombre');
    }
    if (!datos.telefono || datos.telefono.length > 30) throw solicitudInvalida('Escribe el teléfono de la empresa.', 'perfil-telefono');
    if (!PROVINCIAS.includes(datos.provincia)) throw solicitudInvalida('Selecciona la provincia.', 'perfil-provincia');
    if (!datos.ciudad || datos.ciudad.length > 100) throw solicitudInvalida('Escribe la ciudad o el municipio.', 'perfil-ciudad');
    if (!datos.direccion || datos.direccion.length > 250) throw solicitudInvalida('Escribe la dirección.', 'perfil-direccion');
    if (datos.sitioWeb && (!/^https?:\/\/\S+\.\S+$/i.test(datos.sitioWeb) || datos.sitioWeb.length > 300)) {
        throw solicitudInvalida('El sitio web debe comenzar con http:// o https://', 'perfil-sitio');
    }
    if (datos.licenciaMitur && datos.licenciaMitur.length > 30) {
        throw solicitudInvalida('El número de licencia admite hasta 30 caracteres.', 'perfil-licencia');
    }
    if (datos.descripcion && datos.descripcion.length > 1000) {
        throw solicitudInvalida('La descripción admite hasta 1000 caracteres.', 'perfil-descripcion');
    }
    return datos;
}

module.exports = { validarPerfilEmpresa };
