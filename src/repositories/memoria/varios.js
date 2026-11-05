/**
 * @file src/repositories/memoria/varios.js
 * @description Versiones en memoria de los repositorios de favoritos,
 *   imágenes y mensajes de contacto (modo de demostración).
 */

'use strict';

const A = require('./almacen');

const COLUMNA = { hotel: 'id_hotel', actividad: 'id_actividad', vehiculo: 'id_vehiculo' };

const favoritos = {
    async listarClaves(idUsuario) {
        return A.bd.favoritos
            .filter((f) => f.id_usuario === idUsuario)
            .map((f) => ({ tipo: A.tipoDe(f), id: A.idPublicacionDe(f) }));
    },

    async agregar(idUsuario, tipo, idPublicacion) {
        const p = A.publicacion(tipo, idPublicacion);
        const visible = Boolean(p && p.activo && A.empresaActiva(p));
        const columna = COLUMNA[tipo];
        if (visible && !A.bd.favoritos.some((f) => f.id_usuario === idUsuario && f[columna] === idPublicacion)) {
            A.insertar('favoritos', 'id_favorito', {
                id_usuario: idUsuario,
                id_hotel: null,
                id_actividad: null,
                id_vehiculo: null,
                [columna]: idPublicacion,
                fecha_creacion: A.ahora()
            });
        }
        return visible;
    },

    async quitar(idUsuario, tipo, idPublicacion) {
        const columna = COLUMNA[tipo];
        A.bd.favoritos = A.bd.favoritos.filter((f) => !(f.id_usuario === idUsuario && f[columna] === idPublicacion));
    }
};

const imagenes = {
    async crear(idEmpresa, tipoMime, contenido) {
        const fila = A.insertar('imagenes', 'id_imagen', {
            id_empresa: idEmpresa,
            tipo_mime: tipoMime,
            contenido,
            tamano_bytes: contenido.length,
            fecha_subida: A.ahora()
        });
        return fila.id_imagen;
    },

    async obtener(idImagen) {
        const fila = A.bd.imagenes.find((i) => i.id_imagen === idImagen);
        return fila ? { tipoMime: fila.tipo_mime, contenido: fila.contenido } : null;
    },

    async perteneceAEmpresa(idImagen, idEmpresa) {
        return A.bd.imagenes.some((i) => i.id_imagen === idImagen && i.id_empresa === idEmpresa);
    }
};

const contacto = {
    async crear({ nombre, correo, asunto, mensaje }) {
        A.insertar('mensajes_contacto', 'id_mensaje', {
            nombre,
            correo,
            asunto,
            mensaje,
            atendido: 0,
            fecha_envio: A.ahora()
        });
    }
};

module.exports = { favoritos, imagenes, contacto };
