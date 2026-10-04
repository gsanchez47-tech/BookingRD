# BookingRD: documentación técnica (Fase 1)

## 1. Alcance

| Módulo | Incluido en la Fase 1 |
|---|---|
| Página de inicio | Hero con buscador, destinos, indicadores, menú *Servicios* por categoría, vitrina fotográfica de servicios, publicaciones (hoteles y actividades), *Sobre nosotros*, llamado a empresas, *Contacto* con formulario y footer. El contenido dinámico proviene de la base de datos. |
| Registro | Viajero: nombre, correo y contraseña. Empresa: tres pasos (representante, empresa, servicios) con campos según el tipo de empresa. La sesión queda iniciada al registrarse. |
| Inicio de sesión | Correo y contraseña; *Recordarme* (sesión persistente o hasta cerrar el navegador); instrucciones de recuperación de contraseña; cierre de sesión desde el header. |
| Contacto | Formulario de la página de inicio; los mensajes se guardan en `dbo.mensajes_contacto`. |

Fuera de alcance en esta fase: publicación de hoteles y actividades por las empresas, reservas, pagos, recuperación automática de contraseña y panel de administración. Las tablas `hoteles` y `actividades` ya existen y la página de inicio las consulta; mientras estén vacías, cada sección lo indica ("No se ha publicado ningún hotel por el momento").

## 2. Arquitectura

```
Navegador (public/*.html + css + js)
        │  fetch JSON  (Authorization: Bearer <JWT>)
        ▼
Express (src/server.js)
  ├── /api/auth/*        routes/auth.routes.js      → controllers/auth.controller.js
  ├── /api/estadisticas,
  │   /api/hoteles,
  │   /api/actividades   routes/catalogo.routes.js  → controllers/catalogo.controller.js
  ├── /api/contacto      routes/contacto.routes.js  → controllers/contacto.controller.js
  ├── /api (resto)       404 JSON
  ├── estáticos          public/
  └── manejador de errores (400 JSON inválido, 413 tamaño, 503 base no disponible, 500)
        │  consultas parametrizadas (mssql)
        ▼
Azure SQL Database / SQL Server  (base BookingRD)
```

- **Pool de conexiones** (`src/config/db.js`): singleton creado en la primera consulta; si la conexión falla se descarta para reintentar en la siguiente petición.
- **Catálogos** (`src/utils/catalogos.js`): valores permitidos de tipo de servicio, tipo de alojamiento, categorías de actividad, provincias y asuntos de contacto. Las restricciones CHECK del script SQL usan los mismos códigos.
- **CORS** habilitado: las páginas abiertas con `file://` consumen la API en `http://localhost:3000/api`.
- **Errores asíncronos**: `utils/asyncHandler.js` envía las excepciones al manejador central.

## 3. API

Todas las respuestas son JSON. Los errores tienen la forma `{ "error": "mensaje" }`; los errores de validación incluyen además `"campo"`, el id del campo del formulario que los originó.

| Método y ruta | Autenticación | Descripción | Respuestas |
|---|---|---|---|
| `GET /api/estadisticas` | No | Totales de hoteles y actividades activos, ciudades con publicaciones y empresas registradas | 200 `{ totalHoteles, totalActividades, ciudades[], totalEmpresas }` |
| `GET /api/hoteles?ciudad=&personas=` | No | Hoteles activos; `personas` filtra por capacidad | 200 `[ … ]` |
| `GET /api/actividades?ciudad=&personas=` | No | Actividades activas; `personas` filtra por cupo | 200 `[ … ]` |
| `POST /api/auth/registro` | No | Crea una cuenta de viajero o de empresa | 201 `{ token, usuario }`, 400 `{ error, campo }`, 409 `{ error, campo }` |
| `POST /api/auth/login` | No | Inicia sesión | 200 `{ token, usuario }`, 401 (mensaje genérico) |
| `GET /api/auth/sesion` | Sí | Usuario del token vigente | 200 `{ usuario }`, 401 |
| `POST /api/contacto` | No | Registra un mensaje de contacto | 201 `{ mensaje }`, 400 `{ error, campo }` |

### 3.1 Registro

**Viajero:**

```json
{ "tipoCuenta": "cliente", "nombre": "…", "correo": "…", "password": "mínimo 8", "confirmarPassword": "…" }
```

**Empresa:**

| Grupo | Campos | Reglas |
|---|---|---|
| Representante | `nombre`, `cargo`, `correo`, `telefono`, `password`, `confirmarPassword` | Todos obligatorios; contraseña de 8 caracteres o más |
| Empresa | `nombreEmpresa`, `razonSocial`, `rnc`, `telefonoEmpresa`, `provincia`, `ciudadEmpresa`, `direccion`, `sitioWeb`, `licenciaMitur` | RNC de 9 u 11 dígitos (se aceptan guiones); provincia de la lista oficial; sitio web y licencia MITUR opcionales |
| Servicios | `tipoServicio` | `alojamiento`, `actividades` o `mixto` |
| Si incluye alojamiento | `tipoAlojamiento`, `numeroHabitaciones` | Tipo: hotel, resort, boutique, villa, cabana, apartamento, hostal; habitaciones 1 a 5000 |
| Si incluye actividades | `categoriasActividad` (arreglo) | Al menos una de: tour-playa, tour-montana, tour-gastronomico, zip-line, motocross, acuaticas, cultural |
| Cierre | `descripcionEmpresa`, `confirmaDatos` | Descripción opcional; `confirmaDatos` debe ser `true` |

El usuario y la empresa se insertan en una sola transacción.

**Objeto `usuario`** (también contenido en el JWT): `{ id, nombre, rol }` y, para empresas, `nombreEmpresa` y `tipoServicio`.

### 3.2 Contacto

`{ nombre, correo, asunto, mensaje }`, con `asunto` ∈ {viajero, empresa, cuenta, otro} y mensaje de 10 a 2000 caracteres.

## 4. Base de datos

Script: `database/instalacion-completa.sql` (idempotente).

| Tabla | Propósito | Restricciones principales |
|---|---|---|
| `usuarios` | Cuentas del sistema | `correo` único; `rol` ∈ {cliente, empresa, admin}; `telefono` opcional (obligatorio para representantes desde la API) |
| `empresas` | Datos de las cuentas de empresa (1:1 con `usuarios`) | `rnc` único de 9 u 11 dígitos; `tipo_servicio` ∈ {alojamiento, actividades, mixto}; si incluye alojamiento exige `tipo_alojamiento` y `numero_habitaciones`; si incluye actividades exige `categorias_actividad` |
| `hoteles` | Publicaciones de hospedaje | FK opcional a `empresas`; precio, capacidad y cupo positivos |
| `actividades` | Tours y excursiones | Igual esquema de propiedad que `hoteles` |
| `mensajes_contacto` | Mensajes del formulario de contacto | `asunto` ∈ {viajero, empresa, cuenta, otro}; `atendido` para seguimiento |

**Actualización de bases creadas con la versión anterior del script:** si `dbo.empresas` no tiene la columna `razon_social`, el script la elimina y la recrea con la nueva estructura (se conservan los usuarios; se pierden solo los datos de empresa de prueba anteriores).

`npm run bd:instalar` ejecuta las secciones 3 y 4 (desde el marcador `-- @inicio-esquema`), compatibles con Azure SQL Database.

## 5. Frontend

### 5.1 Páginas

| Archivo | Hoja de estilos | Script | Contenido |
|---|---|---|---|
| `index.html` | `css/index.css` | `js/index.js` | Inicio |
| `registro.html` | `css/registro.css` | `js/registro.js` | Registro de viajero y de empresa |
| `login.html` | `css/login.css` | `js/login.js` | Inicio de sesión |

Todas cargan además `js/comun.js`. Cada hoja de estilos es autónoma: la página se ve con su diseño completo al abrir el HTML directamente. Las secciones BASE, HEADER, BOTONES, AVISO FLOTANTE, APARICIÓN AL DESPLAZAR y FORMULARIOS son idénticas en las tres hojas; un cambio en ellas debe replicarse en los tres archivos.

### 5.2 Navegación

- Menú principal: *Inicio*, *Servicios* (desplegable), *Sobre nosotros*, *Contacto*; a la derecha, *Iniciar sesión* y *Crear cuenta*, o el nombre del usuario y *Cerrar sesión*.
- *Servicios* agrupa las categorías en tres columnas (Alojamiento, Tours, Aventura) y enlaza con la tarjeta correspondiente de la página de inicio, que se resalta al llegar. Se abre con el cursor, con el teclado o con clic.
- En móvil, el menú se despliega desde el botón de tres líneas y *Servicios* funciona como acordeón.
- El enlace activo del menú sigue la sección visible de la página.

### 5.3 Diseño

- Paleta: azul `#003087`, rojo `#CE1126`, blanco cálido `#F8F5EF`, turquesa `#00B4D8` / `#0077A8`, verde `#2D6A4F` / `#52B788`, arena `#F4A261` / `#FDEBD0`, noche `#05132B` / `#0A1F44`.
- Tipografía: Fraunces (títulos) y Nunito (texto).
- Sin librerías de iconos: flechas, menú móvil, indicadores de carga y marcas decorativas se dibujan con CSS.
- Mobile-first, verificado en 375, 768, 1280 y 1440 px.
- Fotografías de servicios en `public/img/servicios/` (800 x 600 px). Las de tours gastronómicos, zip line y motocross son provisionales: se reemplazan con otro archivo del mismo nombre.

### 5.4 Animaciones

| Elemento | Efecto |
|---|---|
| Botones, pestañas, chips | Elevación al pasar el cursor y compresión al presionar |
| Menú principal | Subrayado que crece desde el centro; desplegable con aparición suave y flecha que gira |
| Header | Sombra al desplazar; transparente sobre la fotografía del login |
| Hero, formularios y login | Entrada escalonada al cargar |
| Secciones de inicio | Aparición al entrar en pantalla |
| Indicadores | Conteo desde 0 hasta el valor real |
| Tarjetas de servicio | Elevación, acercamiento de la fotografía y resaltado al llegar desde el menú |
| Registro de empresa | Indicador de pasos con línea de progreso; despliegue de los bloques de alojamiento y actividades; medidor de seguridad de la contraseña |
| Login | Transición cruzada entre fotografías con acercamiento lento y barra de progreso en el destino activo |
| Mensajes | Aviso flotante deslizante; error con sacudida breve |

Con "reducir movimiento" activado en el sistema, las animaciones se desactivan y la presentación del login se detiene.

### 5.5 Sesión en el navegador

- *Recordarme* activado: `localStorage` (`bookingrd_token`, `bookingrd_usuario`). Desactivado: `sessionStorage` (la sesión termina al cerrar el navegador).
- Al cargar cada página, `comun.js` consulta `GET /api/auth/sesion`; un 401 elimina la sesión local.
- Atributo `data-sesion` en el HTML: `invitado`, `usuario`, `cliente` o `empresa` determina qué elementos se muestran.
- El parámetro `?volver=` de `login.html` solo acepta páginas locales del sitio.

## 6. Seguridad

- Contraseñas con bcrypt (10 rondas), mínimo 8 caracteres.
- Consultas parametrizadas en todos los accesos a la base.
- Mensaje de inicio de sesión genérico.
- Validación en el navegador y nuevamente en el backend; listas de valores permitidos en el servidor y restricciones CHECK en la base.
- Contenido de la base escapado antes de insertarse en el HTML.
- Cuerpo JSON limitado a 20 KB.
- Credenciales fuera del repositorio (`.env` en `.gitignore`).

## 7. Pruebas realizadas

El entorno de desarrollo no disponía de un motor SQL Server. Las pruebas se ejecutaron con el backend real (Express, controladores, bcrypt y JWT) y una capa de datos en memoria que reproduce las consultas y las restricciones del script. El script SQL y las consultas se validaron sintácticamente como T-SQL.

| Prueba | Resultado |
|---|---|
| API: registro de viajero y de empresa (cada tipo de servicio y cada validación), duplicados 409, contacto, login, sesión, JSON inválido, base inaccesible 503, CORS | Correcto |
| Flujos de interfaz (navegador automatizado): inicio sin publicaciones, menú *Servicios*, contacto, registro de viajero, registro de empresa por pasos (incluido regreso al paso con error del servidor), login con y sin *Recordarme*, token inválido, menú móvil | 50 de 50 |
| Desbordamiento horizontal y errores de JavaScript (3 páginas, 4 anchos) | 0 incidencias |
| Sintaxis T-SQL del script (22 lotes) y de las consultas de los controladores (12) | 0 errores |

**Primera verificación recomendada al equipo:** `npm run configurar`, `npm start`, registrar un viajero y una empresa mixta, enviar un mensaje de contacto y confirmar las filas en `usuarios`, `empresas` y `mensajes_contacto`.
