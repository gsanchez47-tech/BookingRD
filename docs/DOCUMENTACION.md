# BookingRD: documentación técnica

## 1. Alcance

| Módulo | Contenido |
|---|---|
| Inicio | Presentación de tres fotografías con indicadores, buscador (alojamiento, actividades o autos; destino con autocompletado; fechas, o recogida y devolución con hora; personas), cinta de destinos, destinos con publicaciones, indicadores con la valoración media, *Vistos recientemente*, menú *Servicios*, vitrina por categoría, carrusel de destacados, mapa de la isla con precios, opiniones verificadas, *Sobre nosotros*, llamado a empresas y *Contacto*. |
| Alquiler de autos | `autos.html`: portada con buscador de autos, tipos de auto con su conteo, autos mejor valorados, pasos, lo que incluye, requisitos y preguntas frecuentes. |
| Explorar | Panel de filtros a la izquierda (cajón lateral en móvil) con etiquetas de filtros activos; catálogo filtrable por categoría, destino, personas, transmisión, rango de precio (control deslizante de dos extremos sobre un histograma), valoración mínima y texto; siete órdenes; vista de lista o de mapa; paginación incremental; filtros y fechas del viaje reflejados en la URL. |
| Detalle | Valoración, guardar y compartir; barra de secciones; lo más destacado; información, servicios o lo que incluye; mapa de la zona; reseñas con distribución y respuestas; políticas; datos de la empresa; relacionadas y reserva con disponibilidad en tiempo real. |
| Favoritos y reseñas | Publicaciones guardadas por el viajero (`dbo.favoritos`); reseñas de 1 a 10 sobre reservas terminadas, una por reserva, con respuesta pública de la empresa y moderación de la administración (`dbo.resenas`). |
| Alquiler de autos | Flota publicada por empresas de tipo `vehiculos` (`dbo.vehiculos`): ficha técnica, requisitos, políticas, recogida y devolución con hora, devolución en otra ciudad, edad del conductor y extras; precio y disponibilidad calculados en el servidor (sección 4.1). |
| Reservas | Creación con control de cupo en transacción, código único, listado del viajero y cancelación. |
| Panel de empresa | Resumen con indicadores (incluida la valoración media) y gráficos; alta, edición, publicación u ocultación y eliminación de publicaciones con fotografía; reservas recibidas con búsqueda, filtro y exportación CSV; reseñas con respuesta pública; perfil público editable. |
| Administración | Rol `admin` (equipo de desarrollo): indicadores y gráficos globales, suspensión y reactivación de cuentas, moderación de publicaciones (visibilidad y destacado) y de reseñas, consulta de reservas y atención de mensajes de contacto. |
| Cuentas | Registro de viajero (sencillo) y de empresa (tres pasos), inicio de sesión con *Recordarme*, cierre de sesión, expiración del token. |
| Contacto | Mensajes guardados en `dbo.mensajes_contacto`. |
| Correos | Bienvenida al registrarse (viajero o empresa) y confirmación de cada reserva, por SMTP con nodemailer (sección 7.1). |

Fuera de alcance: pagos en línea, recuperación automática de contraseña por correo y edición de datos legales de la empresa desde el panel (RNC, razón social y tipo de servicio quedan a cargo de la administración).

## 2. Arquitectura

```
Navegador (public/*.html + css + js)
        │  fetch JSON  (Authorization: Bearer <JWT>)
        ▼
Express (src/server.js): helmet, CORS, límite de intentos, límites de tamaño
  ├── /api/auth/*       auth.routes      → auth.controller ─────────────┐
  ├── /api/reservas/*   reservas.routes  → reservas.controller          │
  │                                         └→ services/reservas.service │
  ├── /api/empresa/*    empresa.routes   → empresa.controller           │
  │                                         └→ validators/publicaciones, │
  │                                            validators/empresa        │
  ├── /api/admin/*      admin.routes     → admin.controller             │
  ├── /api/*            catalogo.routes, contacto.routes                 │
  ├── /api/favoritos, /api/resenas  viajero.routes → viajero.controller  │
  │                                         └→ validators/resenas        │
  ├── estáticos         public/                                          ▼
  └── manejador de errores                              repositories/*.repo.js
                                                       (único lugar con SQL)
                                                                 │ mssql
                                                                 ▼
                                          Azure SQL Database / SQL Server
```

| Capa | Responsabilidad |
|---|---|
| `routes/` | Rutas, autenticación y rol requeridos (`middleware/autenticacion.js`), validación de `:tipo` (`parametros.js`). La autenticación verifica el JWT y, en cada petición, que la cuenta siga activa. |
| `controllers/` | Lectura de la petición y forma de la respuesta HTTP. |
| `services/` | Reglas de negocio de reservas: fechas válidas, límites, disponibilidad, cálculo del total (incluido el desglose del alquiler de autos), cancelación. |
| `validators/` | Validación y normalización de publicaciones; errores con el id del campo del formulario. |
| `repositories/` | Consultas parametrizadas y transformación de filas a objetos de la API. |
| `utils/` | Catálogos de valores permitidos, fechas en zona `America/Santo_Domingo`, validaciones comunes, clase `ErrorHttp`. |
| `config/db.js` | Pool único, `conTransaccion(trabajo)` con commit / rollback automático. |

Errores: los controladores lanzan `ErrorHttp(status, mensaje, campo)`; el manejador central responde `{ error, campo }`. Los fallos de conexión a la base responden 503 con un mensaje para el usuario.

## 3. API

Respuestas JSON. Error: `{ "error": "mensaje", "campo": "id-del-campo" }` (`campo` solo en validaciones). `:tipo` es `hotel`, `actividad` o `vehiculo`.

### 3.1 Público

| Método y ruta | Descripción |
|---|---|
| `GET /api/estadisticas` | `{ totalHoteles, totalActividades, totalVehiculos, totalEmpresas, ciudades[], porCategoria{}, porCiudad{}, puntuacionMedia, totalResenas }` |
| `GET /api/catalogos` | Valores permitidos (destinos, categorías de alojamiento, actividad y vehículo, tipos de alojamiento, servicios, transmisiones, combustibles, extras de alquiler con su precio y horario del mostrador) |
| `GET /api/publicaciones` | Parámetros: `tipo`, `categoria`, `ciudad`, `personas` (pasajeros en autos), `transmision` (solo autos: automatica, manual), `precioMin`, `precioMax` (400 si el mínimo supera al máximo), `puntuacionMin` (1-10), `q`, `orden` (destacados, valoracion, populares, recientes, precio-asc, precio-desc, nombre), `pagina`, `porPagina` (máx. 48). Respuesta `{ total, pagina, porPagina, publicaciones[] }`; cada publicación incluye `puntuacion` (media de reseñas visibles o `null`), `totalResenas`, `totalReservas` y `fechaCreacion` |
| `GET /api/publicaciones/precios` | `tipo`, `categoria`, `ciudad`. `{ tipo, minimo, maximo, total, tramos[24] }`: rango de precios de las publicaciones visibles y cuántas caen en cada uno de 24 tramos iguales (histograma del filtro de precio) |
| `GET /api/publicaciones/:tipo/:id/resenas` | `orden` (recientes, mejor-valoradas, peor-valoradas), `pagina` (5 por página). `{ resumen { promedio, total, distribucion { excelente, muyBueno, aceptable, regular, malo } }, resenas[] }`. El autor se muestra como nombre e inicial del apellido |
| `GET /api/resenas/destacadas` | Seis reseñas visibles con puntuación de 9 o más (página de inicio) |
| `GET /api/publicaciones/:tipo/:id` | Detalle con `empresa { nombre, telefono, sitioWeb, ciudad, descripcion, licenciaMitur }` |
| `GET /api/publicaciones/:tipo/:id/disponibilidad` | Hotel: `entrada`, `salida`, `habitaciones`, `personas`. Actividad: `fecha`, `personas`. Respuesta `{ disponible, libres, noches, total, mensaje }`. Auto: `recogida`, `horaRecogida`, `devolucion`, `horaDevolucion` (HH:MM), `edadConductor`, `ciudadDevolucion`?, `extras` (códigos separados por coma). Respuesta `{ disponible, libres, dias, total, desglose[{ concepto, importe }], deposito, mensaje }` |
| `GET /api/imagenes/:id` | Fotografía subida por una empresa (caché inmutable) |
| `POST /api/contacto` | `{ nombre, correo, asunto, mensaje }` |

### 3.2 Cuentas

| Método y ruta | Descripción |
|---|---|
| `POST /api/auth/registro` | Viajero `{ tipoCuenta: "cliente", nombre, correo, password, confirmarPassword }`; empresa con representante, datos legales y servicios (ver 3.5). 201 `{ token, usuario }` |
| `POST /api/auth/login` | `{ correo, password }`. 200 `{ token, usuario }`; 401 con mensaje genérico |
| `GET /api/auth/sesion` | Usuario del token vigente |

### 3.3 Viajero (rol `cliente`)

| Método y ruta | Descripción |
|---|---|
| `POST /api/reservas` | Hotel `{ tipo, idPublicacion, entrada, salida, habitaciones, personas, comentario? }`; actividad `{ tipo, idPublicacion, fecha, personas, comentario? }`; auto `{ tipo: "vehiculo", idPublicacion, recogida, horaRecogida, devolucion, horaDevolucion, edadConductor, ciudadDevolucion?, extras[], comentario? }`. 201 `{ id, codigo, total, publicacion }`; 409 sin cupo; 403 si la cuenta es de empresa |
| `GET /api/reservas` | Reservas propias; los alquileres incluyen `alquiler { horaRecogida, horaDevolucion, lugarRecogida, ciudadDevolucion, edadConductor, extras[], deposito }` |
| `PATCH /api/reservas/:id/cancelar` | Cancela una reserva propia confirmada que empieza al menos mañana |
| `GET /api/favoritos` · `GET /api/favoritos/claves` | Publicaciones guardadas (completas) o solo `[{ tipo, id }]` para marcar los corazones |
| `PUT /api/favoritos/:tipo/:id` · `DELETE /api/favoritos/:tipo/:id` | Guardar (404 si la publicación no está visible; repetir no duplica) o quitar |
| `GET /api/resenas` | `{ resenas[], pendientes[] }`: reseñas propias y reservas confirmadas ya terminadas sin reseña |
| `POST /api/resenas` | `{ idReserva, puntuacion (1-10), titulo (3-120), comentario (20-1500) }`. 201 `{ id }`; 403 si la reserva está cancelada o no ha terminado; 409 si ya tiene reseña (también garantizado por `UNIQUE (id_reserva)`); errores con campo `resena-*` |

Estas rutas exigen sesión con rol `cliente`: sin sesión responden 401 y con otro rol 403.

### 3.4 Empresa (rol `empresa`)

Cada consulta filtra por el `id_empresa` del token: una empresa no puede leer ni modificar datos de otra (responde 404).

| Método y ruta | Descripción |
|---|---|
| `GET /api/empresa/perfil` | `{ empresa, resumen { hoteles, actividades, vehiculos, proximas, ingresos, canceladas, resenas { promedio, total, sinRespuesta } } }` |
| `PUT /api/empresa/perfil` | `{ nombreComercial, telefono, provincia, ciudad, direccion, sitioWeb?, licenciaMitur?, descripcion? }` → `{ empresa }`. Errores con campo `perfil-*` |
| `GET /api/empresa/publicaciones?tipo=` | Publicaciones propias, incluidas las ocultas |
| `GET /api/empresa/publicaciones/:tipo/:id` | Publicación propia completa |
| `POST /api/empresa/publicaciones` | Crear (`tipo` en el cuerpo). 403 si el tipo no corresponde al servicio de la empresa |
| `PUT /api/empresa/publicaciones/:tipo/:id` | Actualizar (sin `idImagen`, conserva la fotografía actual) |
| `PATCH /api/empresa/publicaciones/:tipo/:id/estado` | `{ activo: true|false }` |
| `DELETE /api/empresa/publicaciones/:tipo/:id` | 204; 409 si tiene reservas (se sugiere ocultarla) |
| `POST /api/empresa/imagenes` | `{ imagen: "data:image/jpeg;base64,..." }`. JPG, PNG o WEBP, hasta 3 MB, verificado por firma binaria. 201 `{ id, url }` |
| `GET /api/empresa/reservas` | Reservas recibidas con nombre, correo y teléfono del cliente |
| `GET /api/empresa/resenas` | Reseñas de sus publicaciones, primero las sin responder |
| `PUT /api/empresa/resenas/:id/respuesta` | `{ respuesta }` (hasta 1000); vacía la retira. 404 si la reseña es de otra empresa |

Campos de publicación: `nombre` (150), `ciudad` (uno de los 15 destinos), `descripcion` (2000), `precio` (> 0), `idImagen`. Hotel: `tipoAlojamiento`, `direccion`, `servicios[]`, `capacidadPersonas` (1-30), `habitaciones` (1-5000). Actividad: `categoria`, `puntoEncuentro`, `incluye`, `duracionHoras` (hasta 240), `cupoDiario` (1-1000). Vehículo (precio por día): `categoria` (economico, compacto, sedan, suv, minivan, lujo, convertible, pickup), `marca`, `modelo`, `anio` (2000 al año próximo), `transmision`, `combustible`, `pasajeros` (1-15), `puertas` (2-5), `maletas` (0-10), `aire`, `kmPorDia` (vacío: ilimitado), `lugarRecogida`, `incluye`, `deposito`, `edadMinima` (18-30), `cargoConductorJoven`? (por día, menores de 25), `cargoOtraCiudad`? (vacío: solo se devuelve en la misma ciudad), `unidades` (1-1000). Errores con campo `veh-*`.

### 3.5 Administración (rol `admin`)

| Método y ruta | Descripción |
|---|---|
| `GET /api/admin/resumen` | `{ totales, meses[8], categorias[], empresas[5] }`: cuentas, publicaciones, reservas, ingresos, mensajes pendientes; ingresos por mes de servicio (5 meses atrás, el actual y 2 próximos); reservas por categoría; empresas con más ingresos |
| `GET /api/admin/empresas` | Empresas con representante, estado de la cuenta, publicaciones, reservas e ingresos |
| `GET /api/admin/usuarios?rol=&q=` | Viajeros y empresas (las cuentas `admin` no se listan) |
| `PATCH /api/admin/usuarios/:id/estado` | `{ activo }`. Suspende o reactiva; las cuentas `admin` no pueden modificarse (404) |
| `GET /api/admin/publicaciones?tipo=&q=` | Todas las publicaciones, incluidas las ocultas |
| `PATCH /api/admin/publicaciones/:tipo/:id` | `{ activo?, destacado? }` |
| `GET /api/admin/reservas?estado=` | Reservas de toda la plataforma (300 más recientes) |
| `GET /api/admin/mensajes` · `PATCH /api/admin/mensajes/:id` | Mensajes de contacto; `{ atendido }` |
| `GET /api/admin/resenas?visible=` · `PATCH /api/admin/resenas/:id` | Todas las reseñas; `{ visible }`. Una reseña oculta no se muestra ni cuenta en la valoración |

**Suspensión de cuentas.** Con `usuarios.activo = 0`: el inicio de sesión responde 403 con un aviso (solo si la contraseña es correcta); cualquier petición con un token de esa cuenta responde 401 y el navegador cierra la sesión; las publicaciones de una empresa suspendida no aparecen en el catálogo, el detalle, las estadísticas ni pueden reservarse. Al reactivarla todo vuelve a su estado anterior, porque la visibilidad propia de cada publicación no se modifica.

### 3.6 Registro de empresa

| Grupo | Campos |
|---|---|
| Representante | `nombre`, `cargo`, `correo`, `telefono`, `password`, `confirmarPassword` |
| Empresa | `nombreEmpresa`, `razonSocial`, `rnc` (9 u 11 dígitos), `telefonoEmpresa`, `provincia`, `ciudadEmpresa`, `direccion`, `sitioWeb`?, `licenciaMitur`? |
| Servicios | `tipoServicio` (alojamiento, actividades, mixto, vehiculos); con alojamiento `tipoAlojamiento` y `numeroHabitaciones`; con actividades `categoriasActividad[]` |
| Cierre | `descripcionEmpresa`?, `confirmaDatos: true` |

El usuario y la empresa se insertan en una sola transacción.

## 4. Reglas de reserva

| Regla | Hotel | Actividad |
|---|---|---|
| Fechas | Entrada desde hoy; salida posterior; máximo 30 noches; hasta 365 días de anticipación | Fecha desde hoy, hasta 365 días |
| Cantidades | 1-20 habitaciones; personas ≤ habitaciones × capacidad | 1-60 personas |
| Disponibilidad | Habitaciones de la publicación menos la ocupación máxima de cualquier noche del rango | Cupo diario menos las personas ya reservadas ese día |
| Total | precio por noche × noches × habitaciones | precio por persona × personas |
| Concurrencia | La publicación se lee con `UPDLOCK, HOLDLOCK` dentro de la transacción; dos reservas simultáneas por el último cupo no pueden confirmarse ambas | Igual |
| Cancelación | Solo reservas propias confirmadas que empiezan al menos al día siguiente | Igual |

### 4.1 Alquiler de autos

| Regla | Detalle |
|---|---|
| Horario | Recogida y devolución entre 06:00 y 22:00 (hora de República Dominicana). Para recoger hoy, al menos una hora después de la hora actual |
| Duración | Bloques de 24 horas desde la recogida con 60 minutos de cortesía: 24 h = 1 día, 25 h = 1 día, 25 h 01 min = 2 días. Mínimo 2 horas, máximo 30 días |
| Conductor | Edad de 18 a 99 años y no menor que la edad mínima del vehículo. Menores de 25 pagan el cargo por conductor joven de cada día, si el vehículo lo define |
| Devolución | En la ciudad del vehículo sin cargo; en otro destino solo si el vehículo define `cargo_otra_ciudad`, que se suma una vez |
| Extras | Catálogo de la plataforma: por día (protección total, conductor adicional, silla infantil, GPS, Wi-Fi portátil) o por alquiler (entrega en el hotel) |
| Total | precio por día × días + extras + cargo por conductor joven + cargo por devolución en otra ciudad. El depósito se informa y se guarda, pero no forma parte del total |
| Disponibilidad | Unidades del modelo menos el máximo de alquileres confirmados que coinciden en cualquier día del rango, contando inclusivos el día de recogida y el de devolución |

El precio se guarda en la reserva (`precio_unitario`), por lo que un cambio posterior de precio no altera reservas existentes. Las fechas "hoy" se calculan en la zona horaria de República Dominicana.

## 5. Base de datos

Script: `database/instalacion-completa.sql` (idempotente, UTF-8). `npm run bd:instalar` ejecuta desde el marcador `-- @inicio-esquema` (compatible con Azure SQL Database).

| Tabla | Propósito | Restricciones principales |
|---|---|---|
| `usuarios` | Cuentas | `correo` único; `rol` ∈ {cliente, empresa, admin} |
| `empresas` | Datos de empresa (1:1 con `usuarios`) | `rnc` único; `tipo_servicio`; campos obligatorios según el servicio |
| `imagenes` | Fotografías subidas | `VARBINARY(MAX)`; tipo jpeg, png o webp; máximo 3 MB |
| `hoteles` | Alojamientos | FK a `empresas` e `imagenes`; `tipo_alojamiento` y `ciudad` de catálogo; precio, capacidad (1-30) y habitaciones (1-5000) |
| `actividades` | Tours y actividades | `categoria` y `ciudad` de catálogo (incluye `golf`); duración, precio y cupo diario positivos |
| `vehiculos` | Autos de alquiler | FK a `empresas` e `imagenes`; `categoria`, `transmision`, `combustible` y `ciudad` de catálogo; pasajeros, puertas, maletas, año, edad mínima y unidades en rango; `km_por_dia` y cargos opcionales |
| `reservas` | Reservas | `codigo` único; exactamente uno de `id_hotel` / `id_actividad` / `id_vehiculo`; hotel con fecha de salida posterior; alquiler con fecha de devolución, horas y edad del conductor (`hora_inicio`, `hora_fin`, `ciudad_devolucion`, `edad_conductor`, `extras`, `deposito`); total positivo; `estado` ∈ {confirmada, cancelada} |
| `mensajes_contacto` | Formulario de contacto | `asunto` de catálogo |
| `resenas` | Reseñas de viajeros | `id_reserva` único (una reseña por reserva) y FK a `reservas`; `puntuacion` de 1 a 10; respuesta de la empresa y `visible` para la moderación. La publicación y el autor se obtienen de la reserva |
| `favoritos` | Publicaciones guardadas | FK a `usuarios`, `hoteles`, `actividades` o `vehiculos` (exactamente una); índices únicos filtrados por usuario y publicación |

Índices sobre empresa, ciudad, categoría y estado de las publicaciones, y sobre usuario, publicación y fecha de las reservas.

**Actualización desde versiones anteriores:** si el script detecta `hoteles`, `actividades` o `reservas` con la estructura de la versión anterior (sin las columnas nuevas), las elimina y las vuelve a crear. Las bases nuevas o ya actualizadas no pierden datos al volver a ejecutarlo. La sección 3.9 agrega a una base existente lo necesario para el alquiler de autos (tabla `vehiculos`, columnas nuevas de `reservas` y `favoritos`, y las restricciones `CHECK` ampliadas de `empresas`, `actividades`, `reservas` y `favoritos`) sin borrar datos.

**Datos de demostración:** 1 cuenta de administración (`admin@bookingrd.com`, `Admin123!`), 12 viajeros (`Cliente123!`), 7 empresas (`Empresa123!`; dos de alquiler de autos), 14 alojamientos, 24 actividades, 5 autos, 76 reservas con fechas relativas a la instalación (11 con fecha futura, entre ellas 3 alquileres de autos, y 65 de historial), 63 reseñas (12 con respuesta de la empresa; dos actividades y un alojamiento quedan sin reseñas y se muestran como *Nuevo*), 6 favoritos y 2 mensajes de contacto. Las tablas `resenas` y `favoritos` se crean en bases existentes sin tocar los demás datos. Si la base tenía los datos de una versión anterior, la sección 4.3 del script retira las publicaciones de ejemplo eliminadas (o las oculta si tienen reservas), renombra las que cambiaron y actualiza sus fotografías, sin tocar las publicaciones con fotografía subida por la empresa. Las fotografías de demostración son archivos estáticos (`public/img/publicaciones/`, columna `imagen_url`); las subidas desde el panel van a `dbo.imagenes`.

## 6. Frontend

### 6.1 Páginas

| Archivo | Hoja de estilos | Script | Acceso |
|---|---|---|---|
| `index.html` | `css/index.css` | `js/buscador.js`, `js/mapa.js`, `js/index.js` | Público |
| `autos.html` | `css/autos.css` | `js/buscador.js`, `js/autos.js` | Público |
| `explorar.html` | `css/explorar.css` | `js/explorar.js` | Público |
| `detalle.html?tipo=&id=` | `css/detalle.css` | `js/detalle.js` | Público; reservar exige cuenta de viajero |
| `mis-reservas.html` | `css/mis-reservas.css` | `js/mis-reservas.js` | Viajero |
| `panel-empresa.html` | `css/panel-empresa.css` | `js/panel-empresa.js` | Empresa |
| `admin.html` | `css/admin.css` | `js/admin.js` | Administración |
| `registro.html` | `css/registro.css` | `js/registro.js` | Público |
| `login.html` | `css/login.css` | `js/login.js` | Público |

Todas cargan `js/comun.js` (cliente de la API, sesión, header, catálogos, tarjetas, modales, gráficos, favoritos, valoraciones, vistos recientemente, formato de moneda y fechas). Inicio, explorar y detalle cargan además `vendor/leaflet/leaflet.js` y `js/mapa.js`. Al iniciar sesión sin página de regreso, cada rol va a su espacio: `admin.html`, `panel-empresa.html` o la página de inicio. Cada hoja de estilos es autónoma; las secciones comunes (base, header, botones, formularios, tarjetas, modales, footer) son idénticas en las hojas que las incluyen y un cambio en ellas debe replicarse en cada una. Las páginas protegidas envían al inicio de sesión con regreso automático (`login.html?volver=`).

### 6.2 Diseño

- Identidad dominicana: paleta de la bandera y del Caribe (azul `#003087`, rojo `#CE1126`, turquesa `#00B4D8` / `#0077A8`, selva `#2D6A4F` / `#52B788`, arena `#F4A261` / `#FDEBD0`, noche `#05132B` / `#0A1F44`) sobre fondo crema `#F8F5EF`; franja tricolor al pie del hero, de los banners y del footer; etiquetas en píldora sobre los títulos de sección y palabra destacada en cursiva turquesa en los titulares.
- Tipografía: Fraunces para titulares y precios, Nunito para el texto. Sin librerías de iconos: los pocos íconos (corazón, compartir, ubicación, verificación) son SVG en línea o se dibujan con CSS.
- Dinamismo: foto del hero con acercamiento lento y destino que cambia en el título; contadores animados; aparición de secciones al desplazar; tarjetas que se elevan al pasar el cursor; latido del corazón al guardar; mapa con vuelo al destino elegido; barras de distribución de reseñas y de los gráficos. Con "reducir movimiento" activado se desactivan las animaciones continuas.
- Patrones de plataformas de reservas conocidas: nota de 1 a 10 con calificación verbal y número de reseñas; insignias; corazón para guardar; política de cancelación en la tarjeta; marcadores con precio en el mapa; barra de secciones fija en el detalle; aviso de últimas plazas calculado con la disponibilidad real; vistos recientemente; fechas del buscador que llegan completadas a la reserva.
- Mobile-first, verificado en 375, 768, 1024, 1280 y 1440 px. En móvil, el detalle muestra una barra inferior con el precio y acceso a la reserva; las tablas de los paneles se convierten en tarjetas; las pestañas, los filtros de categoría y la barra de secciones se desplazan en horizontal.

### 6.3 Mapas

`js/mapa.js` crea los mapas con Leaflet 1.9.4, incluido en `public/vendor/leaflet/` para no depender de una CDN. El fondo son mosaicos de CARTO con datos de OpenStreetMap; debajo se dibuja el contorno de República Dominicana (Natural Earth, dominio público), de modo que el mapa sigue siendo legible mientras cargan los mosaicos o sin conexión. Las publicaciones guardan el destino, no coordenadas: cada una se ubica en el centro de su destino con un desplazamiento pequeño y estable para que no se superpongan, y el detalle lo presenta como zona aproximada con un enlace *Cómo llegar* a Google Maps con la dirección o el punto de encuentro.

### 6.4 Reseñas, favoritos y vistos recientemente

- Calificación verbal: 9,5 o más *Excepcional*, 9 *Fantástico*, 8 *Muy bueno*, 7 *Bueno*, 6 *Agradable*, menos *Regular*. Sin reseñas: *Nuevo en BookingRD*.
- Insignias de tarjeta (una por publicación): *Destacado* (administración), *Muy reservado* (3 o más reservas confirmadas), *Favorito de viajeros* (media de 9,5 o más con al menos 2 reseñas).
- Los corazones se sincronizan en toda la página con una sola consulta (`/api/favoritos/claves`) y se actualizan al instante; si el servidor rechaza el cambio, se revierten.
- *Vistos recientemente* guarda en el navegador (`localStorage`) una copia reducida de las últimas 8 publicaciones abiertas; no se envía al servidor y puede borrarse desde la sección.

### 6.5 Gráficos

`crearGraficoColumnas` y `crearBarrasHorizontales` (`js/comun.js`) dibujan gráficos de una sola serie con HTML y CSS: columnas de 24 px como máximo con el extremo redondeado, líneas guía de 1 px, valor visible solo en el máximo y en el mes actual, ayuda emergente al pasar el cursor o con el teclado, y una tabla oculta equivalente para lectores de pantalla. El color de la serie es el turquesa profundo de la paleta (`#0077A8`) y el mes actual se resalta en azul (`#003087`); ambos superan el contraste 3:1 sobre blanco. Los textos usan las tintas neutras, nunca el color de la serie.

### 6.6 Fotografías

| Carpeta | Uso |
|---|---|
| `img/publicaciones/` | Una fotografía por publicación de demostración, incluidos los autos (43) |
| `img/destinos/` | Mosaico de destinos de la página de inicio (5) |
| `img/servicios/` | Vitrina de categorías de la página de inicio, con golf y alquiler de autos (11) |
| `img/registro/` | Selector *Soy viajero* / *Soy una empresa* |
| `img/` | Hero, *Sobre nosotros*, llamado a empresas, banner de Explorar e inicio de sesión |

Ninguna fotografía se repite: cada archivo se usa en un solo lugar del sitio (las del registro aparecen en el selector y, ampliadas, en el panel lateral de la misma página). La verificación se hizo con una comparación automática que detecta también recortes de una misma imagen, más una revisión visual. Las categorías de Explorar se distinguen con una marca de color por grupo, no con fotografías. El panel reduce las fotografías subidas a 1600 px (JPEG) antes de enviarlas.

### 6.7 Sesión en el navegador

- *Recordarme* activado: `localStorage`; desactivado: `sessionStorage`.
- Un 401 en una petición autenticada cierra la sesión local y envía al inicio de sesión con el aviso de sesión expirada.
- `data-sesion` en el HTML (`invitado`, `usuario`, `cliente`, `empresa`) determina qué elementos se muestran.

## 7. Correo electrónico

### 7.1 Envío

`src/config/correo.js` crea el transporte de nodemailer con `SMTP_HOST`, `SMTP_PORT`, `SMTP_SEGURO` (por defecto `true` con el puerto 465), `SMTP_USUARIO` y `SMTP_CLAVE`; el remitente es `CORREO_REMITENTE` y los enlaces usan `URL_SITIO`. Sin `SMTP_HOST`, cada correo se guarda como HTML en `CORREO_CARPETA` (por defecto `correos-enviados/`, excluida del repositorio) para revisarlo en desarrollo. `npm run configurar` conserva estas variables al regenerar `.env`.

`src/services/correo.service.js` envía en segundo plano, después de responder (registro) o de confirmar la transacción (reserva). Un fallo del servidor de correo no cambia la respuesta de la API: se registra en la consola. Los tiempos de espera de conexión están limitados a 10 s.

| Correo | Cuándo | Contenido |
|---|---|---|
| Bienvenida de viajero | Registro de una cuenta `cliente` | Saludo con el nombre, ventajas (sin pago adelantado, cancelación, favoritos, reseñas) y botón a Explorar |
| Bienvenida de empresa | Registro de una cuenta `empresa` | Nombre comercial, cuatro primeros pasos según el tipo de servicio y botón al panel |
| Reserva confirmada | `POST /api/reservas` correcto | Código, publicación, fechas (con horas en autos), habitaciones o personas, extras y ciudad de devolución, total, depósito y documentos para recoger el auto, política de cancelación y botón a Mis reservas |

### 7.2 Plantillas

`src/correos/plantillas.js` genera HTML con tablas y estilos en línea (compatible con Gmail, Outlook y Apple Mail), 600 px de ancho máximo, la paleta de la marca y la franja tricolor, más una versión en texto plano. Todo dato del usuario se escapa antes de insertarse.

## 8. Seguridad

- Contraseñas con bcrypt (10 rondas), mínimo 8 caracteres; mensaje de inicio de sesión genérico.
- JWT con expiración (`JWT_EXPIRES_IN`); roles verificados en cada ruta protegida; estado de la cuenta comprobado en cada petición autenticada (una suspensión surte efecto de inmediato).
- Consultas parametrizadas en todos los accesos; `ORDER BY` desde una lista cerrada; comodines de `LIKE` escapados.
- Validación en el navegador y nuevamente en el servidor; restricciones CHECK y claves foráneas en la base.
- Contenido de la base escapado antes de insertarse en el HTML (incluidas reseñas y respuestas); enlaces externos solo `http(s)`.
- Reseñas: solo el titular de la reserva, solo reservas confirmadas y terminadas, una por reserva (restricción `UNIQUE` en la base); la empresa solo responde reseñas de sus publicaciones; el nombre público del autor se reduce a nombre e inicial.
- helmet (encabezados de seguridad), límite de intentos en `/api/auth` (`LIMITE_INTENTOS_AUTH` por IP cada 10 minutos), cuerpo JSON limitado a 20 KB (4 MB solo para fotografías).
- Fotografías validadas por firma binaria, no solo por el tipo declarado.
- Credenciales fuera del repositorio (`.env` en `.gitignore`).

## 9. Pruebas realizadas

El entorno de desarrollo no disponía de un motor SQL Server ni de acceso a Azure. Las pruebas se ejecutaron con el backend real (Express, controladores, servicios, validadores, bcrypt y JWT) y una capa de repositorios en memoria con los mismos datos de demostración y restricciones del script. El script SQL y las 114 consultas de los repositorios se validaron como T-SQL contra el esquema (tablas y columnas existentes).

| Prueba | Resultado |
|---|---|
| API: catálogo y filtros, detalle, disponibilidad, reservas (sin cupo, fechas pasadas, empresa que intenta reservar, cancelación repetida), panel de empresa (permisos, validaciones, fotografías, eliminación con reservas, perfil), administración (suspensión con efecto en catálogo, login y token; cuentas admin protegidas; moderación; mensajes; acceso denegado a otros roles) | Correcto |
| Recorridos en navegador automatizado: explorar, reservar, mis reservas y cancelación, panel de empresa (resumen, publicaciones con fotografía, reservas con búsqueda y CSV, perfil), administración (resumen, suspender y reactivar empresa, aviso de cuenta suspendida, filtros, destacar, reservas, mensajes), redirecciones por rol | 125 de 125 |
| Inicio, registro de viajero y de empresa por pasos, contacto, login con y sin *Recordarme*, token inválido, menú móvil | 53 de 53 |
| Funciones nuevas: autocompletado y fechas del buscador hasta el formulario de reserva, vistos recientemente, mapa (marcadores, filtro, ventana), opiniones, orden y filtro por valoración, vista de mapa, reseñas en el detalle (resumen, orden, respuesta), favoritos (header, catálogo, guardados), escribir una reseña con sus validaciones, respuesta de la empresa, moderación de la administración, y reglas de la API (401/403/404/409, reserva futura, segunda reseña, empresa ajena) | 83 de 83 |
| Alquiler de autos: catálogo y filtros (transmisión, pasajeros, precio por día, lugar), precio por días con hora de cortesía, conductor joven, edad mínima, devolución en otra ciudad (con cargo o no permitida), extras, horario y validaciones, disponibilidad por flota y liberación al cancelar, permisos, empresa de alquiler (crear y editar con validaciones; un hotel no puede publicar autos), administración, favoritos, registro, buscador del inicio, explorar, detalle, reserva completa en el navegador, mis reservas, panel y sin desborde en 375 y 768 px | 93 de 93 |
| Desbordamiento horizontal y errores de JavaScript (9 páginas, cada sección de los paneles y las pestañas nuevas, 375 / 768 / 1024 / 1280 / 1440 px) | 0 incidencias |
| Base de datos inaccesible: mensajes de servicio no disponible | Correcto |
| Menús desplegables (Servicios, menú móvil y sugerencias del buscador) visibles y sin quedar tapados por mapas, franjas ni barras fijas, en 9 páginas, 5 anchos y varias posiciones de desplazamiento | 197 de 197 |
| Panel de filtros (escritorio fijo a la izquierda, cajón móvil, etiquetas, contador, Escape y toque fuera) y aviso de servidor detenido | 31 de 31 |
| Presentación de fotografías del inicio (indicadores, cambio de fotografía, pausa fuera de la vista) y página de autos | Correcto |
| Filtro de precio: histograma de 24 tramos, arrastre con el ratón y teclado, extremos que no se cruzan, URL, etiqueta que lo quita, cambio de tipo | Correcto |
| Correos: bienvenida de viajero y de empresa (asunto, nombre, pasos, enlaces, nombre escapado), sin correo en registros o reservas rechazados, confirmación de alquiler y de hotel con sus datos, envío real por SMTP con autenticación (servidor de prueba local) y servidor de correo caído sin afectar el registro | 12 de 12 |
| Script SQL (301 lotes) y 114 consultas de repositorios contra el esquema | 0 errores |

**Primera verificación recomendada al equipo:** `npm run configurar`, `npm start` y el recorrido sugerido del README (crear una publicación con fotografía, reservarla con la cuenta de viajero y verla en *Reservas recibidas*).
