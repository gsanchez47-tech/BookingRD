/**
 * @file scripts/construir-frontend.js
 * @description Genera las páginas y hojas de estilo de public/ a partir de
 *   las fuentes de frontend/. Uso: `npm run construir`.
 *
 *   Páginas (frontend/paginas/<pagina>.html)
 *     La primera línea declara los datos de la página:
 *       <!-- @pagina titulo="..." descripcion="..." css="index" nav="destinos" -->
 *     y el cuerpo puede incluir las partes comunes con:
 *       <!-- @encabezado -->   frontend/partes/encabezado.html
 *       <!-- @pie -->          frontend/partes/pie.html
 *     El resultado es public/<pagina>.html con la cabecera <head> común.
 *
 *   Estilos
 *     public/css/<css>.css = frontend/estilos/base.css + frontend/estilos/<css>.css
 *     Una página puede incluir estilos compartidos por varias páginas con
 *       /* @incluir mapa.css *\/   (frontend/estilos/compartidos/mapa.css)
 *     Cada página carga así un único archivo CSS.
 *
 *   Los archivos generados se guardan en el repositorio: el sitio funciona sin
 *   ejecutar este script. Solo es necesario después de editar frontend/.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FRONTEND = path.join(RAIZ, 'frontend');
const PUBLICO = path.join(RAIZ, 'public');

const leer = (...partes) => fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8');

const partes = {
    cabeza: leer('partes', 'cabeza.html'),
    encabezado: leer('partes', 'encabezado.html'),
    pie: leer('partes', 'pie.html')
};
const base = leer('estilos', 'base.css');

/** Atributos de la directiva @pagina: titulo="..." css="..." */
function leerAtributos(texto) {
    const atributos = {};
    for (const [, clave, valor] of texto.matchAll(/(\w+)="([^"]*)"/g)) atributos[clave] = valor;
    return atributos;
}

const escapar = (valor) => valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function construirPagina(archivo) {
    const fuente = leer('paginas', archivo);
    const directiva = fuente.match(/^<!--\s*@pagina([^>]*)-->\s*\n/);
    if (!directiva) throw new Error(`${archivo}: falta la directiva @pagina en la primera línea.`);
    const datos = leerAtributos(directiva[1]);
    for (const requerido of ['titulo', 'descripcion', 'css']) {
        if (!datos[requerido]) throw new Error(`${archivo}: falta el atributo ${requerido} en @pagina.`);
    }

    // Enlace activo del menú principal.
    const encabezado = datos.nav
        ? partes.encabezado.replace(`data-nav="${datos.nav}"`, `data-nav="${datos.nav}" aria-current="page"`)
        : partes.encabezado;

    const cabeza = partes.cabeza
        .replace(/{{titulo}}/g, escapar(datos.titulo))
        .replace(/{{descripcion}}/g, escapar(datos.descripcion))
        .replace(/{{css}}/g, datos.css);

    const cuerpo = fuente
        .slice(directiva[0].length)
        .replace('<!-- @encabezado -->', encabezado.trimEnd())
        .replace('<!-- @pie -->', partes.pie.trimEnd());

    const html = `${cabeza}${cuerpo.trimEnd()}\n</body>\n</html>\n`;
    fs.writeFileSync(path.join(PUBLICO, archivo), html);
    return datos.css;
}

/** Sustituye cada comentario @incluir archivo.css por frontend/estilos/compartidos/archivo.css. */
function incluirCompartidos(css, incluidos = new Set()) {
    return css.replace(/\/\*\s*@incluir\s+([\w.-]+)\s*\*\//g, (_, archivo) => {
        if (incluidos.has(archivo)) return '';   // cada archivo se incluye una sola vez
        incluidos.add(archivo);
        return incluirCompartidos(leer('estilos', 'compartidos', archivo).trim(), incluidos);
    });
}

function construirEstilos(nombre) {
    const propio = incluirCompartidos(leer('estilos', `${nombre}.css`));
    const css = `${base.trimEnd()}\n\n/* ==========================================================================\n   Estilos propios de la página (frontend/estilos/${nombre}.css)\n   ======================================================================== */\n\n${propio.trim()}\n`;
    fs.mkdirSync(path.join(PUBLICO, 'css'), { recursive: true });
    fs.writeFileSync(path.join(PUBLICO, 'css', `${nombre}.css`), css);
}

const paginas = fs.readdirSync(path.join(FRONTEND, 'paginas')).filter((f) => f.endsWith('.html'));
const estilos = new Set(paginas.map(construirPagina));
estilos.forEach(construirEstilos);

console.log(`Páginas generadas: ${paginas.join(', ')}`);
console.log(`Hojas de estilo: ${[...estilos].map((e) => `${e}.css`).join(', ')}`);
