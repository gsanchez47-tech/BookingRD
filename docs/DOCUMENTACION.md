# BookingRD: documentación técnica

## 1. Alcance

| Módulo | Contenido |
|---|---|
| Inicio | Portada con fotografía, buscador sobre vidrio y cifras; accesos a alojamiento, actividades y autos; franja de garantías; experiencias por categoría; cómo funciona en tres pasos; combos destacados; *Más para tu viaje* (equipo, fotógrafos, Ruta del Parador y tienda); mapa SVG de la isla sobre azul noche con los 19 destinos (ficha con fotografía, conteos por tipo, lugares imperdibles de `public/js/lugares.js` y clima); banda de cifras; buscador (alojamiento, actividades o autos; destino con autocompletado; fechas, o recogida y devolución con hora; personas), postales de destinos, categorías, recomendados por tipo, *Vistos recientemente*, opiniones verificadas, *Nosotros*, llamado a empresas y *Contacto*. |
| Combos | `combos.html`: paquetes de un alojamiento y una o dos actividades del mismo destino con descuento (`dbo.combos`). Filtros a la izquierda, itinerario por días, cotización con disponibilidad real y reserva de todas las partes con un solo pago (sección 4.3). |
| Tienda de artesanía | `tienda.html`: productos de talleres locales (`dbo.productos`), carrito guardado en el navegador, entrega en el hotel o a domicilio, pago con tarjeta simulado, cancelación antes del envío y seguimiento por la administración (`dbo.pedidos`, sección 4.4). |
| En ruta | `ruta.html`: Ruta del Parador (paradas para comer por carretera, con filtros) y asistencia vial: llamada al 911 y al *462, grúas por provincia (red de ejemplo con teléfonos 555) y enlace con la ubicación del navegador. Contenido informativo sin base de datos. |
| Equipo y fotógrafos | Categorías de actividad `alquiler-equipo` y `fotografia`, que se reservan por unidades (equipos por día o sesiones) en lugar de por personas (`UNIDAD_ACTIVIDAD`). |
| Alquiler de autos | `autos.html`: portada con buscador de autos, tipos de auto con su conteo, autos mejor valorados, pasos, lo que incluye, requisitos y preguntas frecuentes. |
| Explorar | Todos los filtros en un panel a la izquierda (cajón lateral en móvil): tipo, categoría con conteo, destino, palabra clave, personas o pasajeros, transmisión, rango de precio (control de dos extremos sobre un histograma), valoración mínima y fechas; etiquetas de filtros activos; siete órdenes; vista de lista o de mapa; clima del destino; paginación incremental; filtros y fechas en la URL. |
| Detalle | Valoración, guardar y compartir; barra de secciones; lo más destacado; información, servicios o lo que incluye; mapa de la zona; reseñas con distribución y respuestas; políticas; datos de la empresa; relacionadas y reserva con disponibilidad en tiempo real. |
| Favoritos y reseñas | Publicaciones guardadas por el viajero (`dbo.favoritos`); reseñas de 1 a 10 sobre reservas terminadas, una por reserva, con respuesta pública de la empresa y moderación de la administración (`dbo.resenas`). |
| Alquiler de autos | Flota publicada por empresas de tipo `vehiculos` (`dbo.vehiculos`): ficha técnica, requisitos, políticas, recogida y devolución con hora, devolución en otra ciudad, edad del conductor y extras; precio y disponibilidad calculados en el servidor (sección 4.1). |
| Reservas | Creación con control de cupo en transacción, código único, listado del viajero y cancelación. |
| Panel de empresa | Resumen con indicadores (incluida la valoración media) y gráficos; alta, edición, publicación u ocultación y eliminación de publicaciones con fotografía; reservas recibidas con búsqueda, filtro y exportación CSV; reseñas con respuesta pública; perfil público editable. |
| Administración | Rol `admin` (equipo de desarrollo): indicadores y gráficos globales, suspensión y reactivación de cuentas, moderación de publicaciones (visibilidad y destacado) y de reseñas, consulta de reservas, pedidos de la tienda (enviar y entregar) y atención de mensajes de contacto. |
| Cuentas | Registro de viajero (sencillo) y de empresa (tres pasos), inicio de sesión con *Recordarme*, cierre de sesión, expiración del token. |
| Contacto | Mensajes guardados en `dbo.mensajes_contacto`. |
| Correos | Bienvenida al registrarse (viajero o empresa) y confirmación de cada reserva, por SMTP con nodemailer (sección 7.1). |
| Pagos (simulados) | Al reservar: tarjeta (Visa, Mastercard, American Express) o pago en el destino. Validación de Luhn, vencimiento y CVV; tarjetas de prueba aprobadas y rechazadas; recibo imprimible; reembolso automático al cancelar; la empresa registra los cobros en destino (sección 4.2). |
| Idioma y moneda | Interfaz en español o inglés (traducción propia) y en cualquier otro idioma con traducción automática; precios en RD$, US$ o € con la tasa del día; pago en pesos o en dólares; clima actual y pronóstico de cada destino (sección 6.8). |

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

### 2.1 Modos de datos

| Modo | Cuándo | Persistencia |
|---|---|---|
| SQL Server / Azure SQL | `DB_SERVER` en `.env` (lo escribe `INICIAR-BookingRD.bat` / `npm run sqlserver`, o `npm run configurar` para Azure) | La base de datos |
| Base local en archivo | Sin `DB_SERVER` | `database/local/bookingrd-local.json` (guardado atómico tras cada cambio) y `database/local/clave-sesiones.txt` (clave de los JWT) |
| Demostración en memoria | `DB_MODO=demo` (`npm run demo` y las pruebas) | Ninguna: datos nuevos en cada arranque |

**Instalación en un paso (Windows):** `INICIAR-BookingRD.bat` instala Node.js con `winget` si falta, ejecuta `npm install` la primera vez y llama a `scripts/iniciar.js`. Este, si no hay `.env`, ejecuta `scripts/sqlserver-windows.ps1`, que pide permiso de administrador, busca o instala SQL Server 2022 Express, habilita TCP 1433 y la autenticación mixta (`database/habilitar-sqlserver.sql`), crea la base con `database/instalacion-completa.sql`, asigna una contraseña aleatoria a `bookingrd_app`, reinicia el servicio, prueba la conexión y escribe `.env`. Después prueba la conexión (20 s) y, si SQL Server no responde, arranca con la base local; finalmente abre el navegador. La base local cambia de versión de formato (`VERSION_LOCAL`) cuando cambian las tablas: un archivo de una versión anterior se reemplaza por los datos de ejemplo nuevos.

`src/config/modo.js` usa los repositorios en memoria cuando `DB_SERVER` está vacío o `DB_MODO=demo`. `src/repositories/index.js` entrega entonces la implementación en memoria (`repositories/memoria/`) en lugar de la SQL, con las mismas funciones y la misma forma de respuesta; controladores, servicios y middleware importan siempre desde `require('../repositories')` y no distinguen el modo. Las transacciones en memoria se serializan con una cola de promesas, de modo que el control de cupo se comporta igual que con `UPDLOCK, HOLDLOCK`. Si falta `JWT_SECRET`, se genera uno (temporal en memoria; guardado en la base local). `GET /api/salud` informa `{ estado, modo }` con `modo` ∈ {sql-server, local, demostracion}.

Los datos salen de `database/datos-demo.js`, la misma fuente que genera las inserciones del script SQL (`npm run bd:generar`), por lo que la demostración y la base instalada tienen el mismo contenido.

## 3. API

Respuestas JSON. Error: `{ "error": "mensaje", "campo": "id-del-campo" }` (`campo` solo en validaciones). `:tipo` es `hotel`, `actividad` o `vehiculo`.

### 3.1 Público

| Método y ruta | Descripción |
|---|---|
| `GET /api/estadisticas` | `{ totalHoteles, totalActividades, totalVehiculos, totalEmpresas, ciudades[], porCategoria{}, porCiudad{}, porCiudadTipo{ ciudad: { hotel, actividad, vehiculo } }, puntuacionMedia, totalResenas }` |
| `GET /api/catalogos` | Valores permitidos (destinos, categorías de alojamiento, actividad y vehículo, tipos de alojamiento, servicios, transmisiones, combustibles, extras de alquiler con su precio y horario del mostrador) |
| `GET /api/publicaciones` | Parámetros: `tipo`, `categoria`, `ciudad`, `personas` (pasajeros en autos), `transmision` (solo autos: automatica, manual), `precioMin`, `precioMax` (400 si el mínimo supera al máximo), `puntuacionMin` (1-10), `q`, `orden` (destacados, valoracion, populares, recientes, precio-asc, precio-desc, nombre), `pagina`, `porPagina` (máx. 48). Respuesta `{ total, pagina, porPagina, publicaciones[] }`; cada publicación incluye `puntuacion` (media de reseñas visibles o `null`), `totalResenas`, `totalReservas` y `fechaCreacion` |
| `GET /api/publicaciones/precios` | `tipo`, `categoria`, `ciudad`. `{ tipo, minimo, maximo, total, tramos[24] }`: rango de precios de las publicaciones visibles y cuántas caen en cada uno de 24 tramos iguales (histograma del filtro de precio) |
| `GET /api/publicaciones/:tipo/:id/resenas` | `orden` (recientes, mejor-valoradas, peor-valoradas), `pagina` (5 por página). `{ resumen { promedio, total, distribucion { excelente, muyBueno, aceptable, regular, malo } }, resenas[] }`. El autor se muestra como nombre e inicial del apellido |
| `GET /api/resenas/destacadas` | Seis reseñas visibles con puntuación de 9 o más (página de inicio) |
| `GET /api/publicaciones/:tipo/:id` | Detalle con `empresa { nombre, telefono, sitioWeb, ciudad, descripcion, licenciaMitur }` |
| `GET /api/publicaciones/:tipo/:id/disponibilidad` | Hotel: `entrada`, `salida`, `habitaciones`, `personas`. Actividad: `fecha`, `personas`. Respuesta `{ disponible, libres, noches, total, mensaje }`. Auto: `recogida`, `horaRecogida`, `devolucion`, `horaDevolucion` (HH:MM), `edadConductor`, `ciudadDevolucion`?, `extras` (códigos separados por coma). Respuesta `{ disponible, libres, dias, total, desglose[{ concepto, importe }], deposito, mensaje }` |
| `GET /api/imagenes/:id` | Fotografía subida por una empresa (caché inmutable) |
| `POST /api/contacto` | `{ nombre, correo, asunto, mensaje }` |
| `GET /api/clima?ciudad=` | Clima actual y pronóstico de 4 días del destino (Open-Meteo, caché de 15 minutos): `{ ciudad, actualizado, temperatura, sensacion, humedad, viento, estado, descripcion, pronostico[] }`. 503 si el servicio no responde |
| `GET /api/monedas` | Tasas de RD$ a USD y EUR (ExchangeRate-API, caché de 6 horas); sin conexión responde las tasas de respaldo (`TASA_USD` y `TASA_EUR` en `.env`, por defecto 61 y 71) con `fuente: "respaldo"` |
| `GET /api/mar?ciudad=` | Estado del mar en destinos de costa (Open-Meteo Marine, caché de 30 minutos): `{ ciudad, olas, agua, estado }`; 204 en Jarabacoa y Constanza |
| `GET /api/feriados` | Próximos 6 feriados de la República Dominicana (Nager.Date, caché de 24 horas); sin conexión usa la lista de respaldo de 2026 y 2027: `{ feriados: [{ fecha, nombre, nombreEn }], fuente, actualizado }` |
| `GET /api/destinos/resumen?ciudad=` | Dos primeras oraciones del artículo del destino en Wikipedia en español y su enlace (caché de 24 horas); 204 si no responde |
| `GET /api/salud` | `{ estado: "ok", modo: "demostracion" \| "sql" }` |

### 3.2 Cuentas

| Método y ruta | Descripción |
|---|---|
| `POST /api/auth/registro` | Viajero `{ tipoCuenta: "cliente", nombre, correo, password, confirmarPassword }`; empresa con representante, datos legales y servicios (ver 3.5). 201 `{ token, usuario }` |
| `POST /api/auth/login` | `{ correo, password }`. 200 `{ token, usuario }`; 401 con mensaje genérico |
| `GET /api/auth/sesion` | Usuario del token vigente |

### 3.3 Viajero (rol `cliente`)

| Método y ruta | Descripción |
|---|---|
| `POST /api/reservas` | Hotel `{ tipo, idPublicacion, entrada, salida, habitaciones, personas, comentario? }`; actividad `{ tipo, idPublicacion, fecha, personas, comentario? }`; auto `{ tipo: "vehiculo", idPublicacion, recogida, horaRecogida, devolucion, horaDevolucion, edadConductor, ciudadDevolucion?, extras[], comentario? }`. Todas aceptan `pago`: `{ metodo: "tarjeta", titular, numero, vencimiento: "MM/AA", cvv }` o `{ metodo: "en_destino" }` (por defecto). 201 `{ id, codigo, total, publicacion, pago { metodo, estado, monto, marca, ultimos4, titular, referencia, autorizacion, fechaPago } }`; 400 tarjeta inválida (campo `pago-*`); 402 tarjeta rechazada (la reserva no se crea); 409 sin cupo; 403 si la cuenta es de empresa |
| `GET /api/reservas` | Reservas propias, cada una con su `pago`; los alquileres incluyen `alquiler { horaRecogida, horaDevolucion, lugarRecogida, ciudadDevolucion, edadConductor, extras[], deposito }` |
| `PATCH /api/reservas/:id/cancelar` | Cancela una reserva propia confirmada que empieza al menos mañana. `{ estado, reembolso: { monto, marca, ultimos4 } \| null }`: la tarjeta se reembolsa y el pago en destino se anula |
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
| `PATCH /api/empresa/reservas/:id/cobro` | Registra el cobro de un pago en destino pendiente de una reserva confirmada propia. 409 si no hay cobro pendiente o la reserva es de otra empresa |
| `GET /api/empresa/resenas` | Reseñas de sus publicaciones, primero las sin responder |
| `PUT /api/empresa/resenas/:id/respuesta` | `{ respuesta }` (hasta 1000); vacía la retira. 404 si la reseña es de otra empresa |

Campos de publicación: `nombre` (150), `ciudad` (uno de los 19 destinos), `descripcion` (2000), `precio` (> 0), `idImagen`. Hotel: `tipoAlojamiento`, `direccion`, `servicios[]`, `capacidadPersonas` (1-30), `habitaciones` (1-5000). Actividad: `categoria`, `puntoEncuentro`, `incluye`, `duracionHoras` (hasta 240), `cupoDiario` (1-1000). Vehículo (precio por día): `categoria` (economico, compacto, sedan, suv, minivan, lujo, convertible, pickup), `marca`, `modelo`, `anio` (2000 al año próximo), `transmision`, `combustible`, `pasajeros` (1-15), `puertas` (2-5), `maletas` (0-10), `aire`, `kmPorDia` (vacío: ilimitado), `lugarRecogida`, `incluye`, `deposito`, `edadMinima` (18-30), `cargoConductorJoven`? (por día, menores de 25), `cargoOtraCiudad`? (vacío: solo se devuelve en la misma ciudad), `unidades` (1-1000). Errores con campo `veh-*`.

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

### 3.7 Combos y tienda

| Método y ruta | Descripción |
|---|---|
| `GET /api/combos?ciudad=` | Combos visibles (todas sus partes activas y de empresas no suspendidas): `{ id, nombre, lema, descripcion, ciudad, descuento, nochesSugeridas, hotel { id, nombre, precio, capacidad, imagen }, actividades[{ id, nombre, precio, duracion, dia }], imagen, referencia { noches, personas, normal, total, ahorro } }` |
| `GET /api/combos/:id/cotizacion` | `entrada`, `noches`, `personas`, `habitaciones`. `{ disponible, mensaje, entrada, salida, noches, lineas[{ tipo, nombre, fecha, detalle, precio, precioCombo, normal, total }], normal, total, ahorro }` |
| `POST /api/combos/:id/reservar` | Viajero. `{ entrada, noches, personas, habitaciones, comentario?, pago }`. 201 `{ combo, reservas[{ codigo, tipo, publicacion, fecha, total, referencia }], total, normal, ahorro, pago }`; 402 tarjeta rechazada (no se crea ninguna reserva); 409 sin cupo en alguna parte |
| `GET /api/tienda/productos` | Productos a la venta con existencias |
| `POST /api/tienda/pedidos` | Viajero. `{ productos[{ id, cantidad }], entrega: "hotel" \| "domicilio", destinatario, direccion, telefono?, pago }` (solo tarjeta). 201 pedido con líneas y pago; 402; 409 sin existencias |
| `GET /api/tienda/pedidos` · `PATCH /api/tienda/pedidos/:id/cancelar` | Pedidos propios; cancelar mientras está `pagado` (reembolso y reposición de existencias) |
| `GET /api/admin/pedidos` · `PATCH /api/admin/pedidos/:id/avanzar` | Administración: todos los pedidos; `pagado` → `enviado` → `entregado` |

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

### 4.2 Pagos (pasarela simulada)

`src/services/pagos.service.js` imita una pasarela de pago para la demostración. No se conecta con ningún banco ni procesador y no guarda el número de la tarjeta ni el CVV: en `dbo.pagos` quedan la marca, los últimos 4 dígitos, el titular, una referencia (`PAY` + 8 caracteres) y un código de autorización de 6 dígitos.

1. **Validación** (también en el navegador, `public/js/pagos.js`): titular con letras; número de 13 a 19 dígitos que supera el algoritmo de Luhn; marca por los primeros dígitos (Visa `4`, Mastercard `51-55` y `2221-2720`, American Express `34`/`37`); vencimiento `MM/AA` no vencido; CVV de 3 dígitos, o 4 en American Express.
2. **Cobro** dentro de la transacción de la reserva, después de comprobar el cupo: las tarjetas `4000 0000 0000 0002` (rechazada), `4000 0000 0000 9995` (fondos insuficientes) y `4000 0000 0000 0127` (CVV incorrecto) responden 402 y la transacción se deshace, así que no queda reserva sin pago. Cualquier otra tarjeta válida se aprueba.
3. **Moneda del cobro:** pesos (`DOP`) o dólares (`USD`); cualquier otra responde 400 (`pago-moneda`). Los precios y `monto` están en pesos; en dólares, antes de abrir la transacción `prepararCobro` toma la tasa del día de `externos.tasas()` (pesos por dólar; si el servicio no responde, la de respaldo `TASA_USD`) y se guardan `monto_cobrado` (total / tasa, a centavos) y `tasa_cambio`. Las reservas de un combo usan la misma tasa. Los reembolsos se hacen en la moneda del cobro. Los pedidos de la tienda guardan lo mismo en `pago_moneda`, `pago_monto_cobrado` y `pago_tasa_cambio`.
4. **Pago en el destino:** se registra en pesos (al llegar se puede pagar en pesos o en dólares a la tasa del día); la reserva se crea con el pago `pendiente`; la empresa lo marca como `pagado` desde *Reservas recibidas* (`PATCH /api/empresa/reservas/:id/cobro`).
5. **Cancelación:** en la misma transacción, la tarjeta pasa a `reembolsado` (con fecha de reembolso) y el pago en destino a `anulado`.

Estados: `pagado`, `pendiente`, `reembolsado`, `anulado`. El viajero ve el estado y el recibo (imprimible o en PDF desde el navegador) en *Mis reservas*; la empresa y la administración, en sus tablas de reservas; la administración suma lo cobrado en línea, lo pendiente en destino y lo reembolsado.

### 4.3 Combos

- Un combo une un alojamiento y una o dos actividades con un `descuento_pct` (1 a 40) y el día de la estadía de cada actividad (`dia_actividad`, 0 = día de llegada).
- Las noches deben cubrir el último día de actividad (por ejemplo, actividad el día 2 exige al menos 3 noches); máximo 14.
- La cotización y la reserva comprueban el cupo de cada parte con las mismas reglas que una reserva suelta (habitaciones y capacidad del hotel; plazas de cada actividad en su fecha).
- Al reservar, en una sola transacción se crea una reserva por cada parte con `precio_unitario` ya rebajado e `id_combo`, y se cobra cada una con la misma tarjeta (o queda pendiente en destino). Cada parte se cancela por separado desde *Mis reservas*.
- Una publicación incluida en un combo no se puede eliminar (se puede ocultar).

### 4.4 Tienda de artesanía

- Entrega en la recepción del hotel (gratis) o a domicilio (RD$450, `ENTREGAS_PEDIDO`). Hasta 15 productos distintos y 20 unidades de cada uno.
- Las existencias se bloquean, comprueban y descuentan en la transacción del pedido, junto con el cobro (solo tarjeta). Una tarjeta rechazada no crea el pedido.
- Estados: `pagado` → `enviado` → `entregado` (administración), o `cancelado` por el viajero mientras no se haya enviado: la tarjeta se reembolsa y las existencias se reponen.

## 5. Base de datos

Scripts generados por `npm run bd:generar` a partir de `database/esquema.sql` (tablas e índices) y `database/datos-demo.js` (datos): `database/instalacion-completa.sql` (SQL Server local: crea la base y el login `bookingrd_app`) y `database/instalacion-azure.sql` (Azure SQL Database: se ejecuta sobre la base de la conexión). Ambos son idempotentes y UTF-8. `npm run bd:instalar` ejecuta el primero desde el marcador `-- @inicio-esquema`; `npm run bd:reiniciar` elimina las tablas y reinstala.

| Tabla | Propósito | Restricciones principales |
|---|---|---|
| `usuarios` | Cuentas | `correo` único; `rol` ∈ {cliente, empresa, admin} |
| `empresas` | Datos de empresa (1:1 con `usuarios`) | `rnc` único; `tipo_servicio`; campos obligatorios según el servicio |
| `imagenes` | Fotografías subidas | `VARBINARY(MAX)`; tipo jpeg, png o webp; máximo 3 MB |
| `hoteles` | Alojamientos | FK a `empresas` e `imagenes`; `tipo_alojamiento` y `ciudad` de catálogo; precio, capacidad (1-30) y habitaciones (1-5000) |
| `actividades` | Tours, actividades, alquiler de equipo y fotógrafos | `categoria` y `ciudad` de catálogo (incluye `golf`, `alquiler-equipo` y `fotografia`); duración, precio y cupo diario positivos |
| `combos` | Paquetes de alojamiento y actividades | `nombre` único; FK a `hoteles` y a una o dos `actividades` (distintas); `descuento_pct` de 1 a 40; días de las actividades y noches sugeridas en rango |
| `vehiculos` | Autos de alquiler | FK a `empresas` e `imagenes`; `categoria`, `transmision`, `combustible` y `ciudad` de catálogo; pasajeros, puertas, maletas, año, edad mínima y unidades en rango; `km_por_dia` y cargos opcionales |
| `pagos` | Pago de cada reserva (1:1) | `id_reserva` único y FK; `metodo` ∈ {tarjeta, en_destino}; `estado` ∈ {pagado, pendiente, reembolsado, anulado}; `referencia` única; con tarjeta son obligatorios marca, últimos 4, titular y autorización. Nunca guarda el número completo ni el CVV |
| `reservas` | Reservas | `codigo` único; exactamente uno de `id_hotel` / `id_actividad` / `id_vehiculo`; hotel con fecha de salida posterior; alquiler con fecha de devolución, horas y edad del conductor (`hora_inicio`, `hora_fin`, `ciudad_devolucion`, `edad_conductor`, `extras`, `deposito`); total positivo; `estado` ∈ {confirmada, cancelada}; `id_combo` opcional (FK a `combos`) |
| `mensajes_contacto` | Formulario de contacto | `asunto` de catálogo |
| `resenas` | Reseñas de viajeros | `id_reserva` único (una reseña por reserva) y FK a `reservas`; `puntuacion` de 1 a 10; respuesta de la empresa y `visible` para la moderación. La publicación y el autor se obtienen de la reserva |
| `productos` | Tienda de artesanía | `nombre` único; `categoria` ∈ {larimar, ambar, arte, cafe-cacao, artesania}; precio positivo; existencias ≥ 0 |
| `pedidos` | Compras de la tienda | `codigo` único (PED + 7); `entrega` ∈ {hotel, domicilio}; `total = subtotal + envio`; `estado` ∈ {pagado, enviado, entregado, cancelado}; pago con tarjeta simulado (marca, últimos 4, titular, referencia única, autorización) |
| `pedido_detalle` | Productos de cada pedido | FK a `pedidos` y `productos`; un renglón por producto; cantidad de 1 a 20; precio del momento de la compra |
| `favoritos` | Publicaciones guardadas | FK a `usuarios`, `hoteles`, `actividades` o `vehiculos` (exactamente una); índices únicos filtrados por usuario y publicación |

Índices sobre empresa, ciudad, categoría y estado de las publicaciones, y sobre usuario, publicación y fecha de las reservas.

**Bases de una versión anterior:** el script solo crea lo que falta (tablas nuevas y la columna `reservas.id_combo`) y no altera las restricciones de tablas existentes; los destinos nuevos (Miches, Barahona, Montecristi y Baní) y las categorías `alquiler-equipo` y `fotografia` requieren reinstalar. Si la base tiene tablas de una versión previa con otra estructura, usar `npm run bd:reiniciar` (borra los datos de BookingRD).

**Datos de demostración:** 1 cuenta de administración (`admin@bookingrd.com`, `Admin123!`), 12 viajeros (`Cliente123!`), 8 empresas (`Empresa123!`; dos de alquiler de autos y una de equipo y fotógrafos), 16 alojamientos, 50 actividades (incluidos 6 alquileres de equipo y 3 servicios de fotografía) y 11 autos en los 19 destinos, 7 combos, 93 reservas con fechas relativas a la instalación (próximas, realizadas, canceladas y un combo de tres partes) y su pago (`datosDemo.pagoDemo`), 74 reseñas con respuestas de las empresas, 6 favoritos, 2 mensajes de contacto, 11 productos y 2 pedidos (`datosDemo.pedidoDemo`). Las relaciones se expresan con claves naturales (correo, RNC y nombre de la publicación) y el script las resuelve con subconsultas, así que no depende de los identificadores generados. Cada inserción comprueba antes que el registro no exista. Las fotografías de demostración son archivos estáticos (`public/img/publicaciones/`, columna `imagen_url`); las subidas desde el panel van a `dbo.imagenes`.

## 6. Frontend

### 6.1 Construcción de las páginas

Las páginas se escriben en `frontend/` y `npm run construir` (`scripts/construir-frontend.js`) genera `public/*.html` y `public/css/*.css`:

- `frontend/paginas/<pagina>.html` empieza con `<!-- @pagina titulo="" descripcion="" css="" nav="" -->` y usa `<!-- @encabezado -->` y `<!-- @pie -->`, que se sustituyen por `frontend/partes/` (cabeza, encabezado y pie comunes, con la sección activa marcada).
- Cada hoja de `public/css/` es `frontend/estilos/base.css` más la hoja de la página; `/* @incluir x.css */` inserta una hoja de `frontend/estilos/compartidos/` (mapa, buscador, auth, cuenta, panel) una sola vez.
- El resultado es HTML y CSS estáticos, una hoja por página, sin dependencias en el navegador. Los scripts de `public/js/` se editan directamente.

| Página | Script | Acceso |
|---|---|---|
| `index.html` | `isla.js`, `clima.js`, `buscador.js`, `index.js` | Público |
| `autos.html` | `buscador.js`, `autos.js` | Público |
| `explorar.html` | `clima.js`, `mapa.js`, `explorar.js` | Público |
| `detalle.html?tipo=&id=` | `clima.js`, `mapa.js`, `detalle.js` | Público; reservar exige cuenta de viajero |
| `mis-reservas.html` | `mis-reservas.js` | Viajero |
| `panel-empresa.html` | `panel-empresa.js` | Empresa |
| `admin.html` | `admin.js` | Administración |
| `registro.html` | `registro.js` | Público |
| `login.html` | `login.js` | Público |

Todas cargan `comun.js` (cliente de la API, sesión, encabezado, catálogos, tarjetas, modales, gráficos, favoritos, valoraciones, vistos recientemente, formato de moneda y fechas) y `preferencias.js` (idioma y moneda). Las páginas protegidas envían al inicio de sesión con regreso automático (`login.html?volver=`).

### 6.2 Diseño

- Estética caribeña y futurista: azules profundos con paneles de vidrio translúcido (`.vidrio`: fondo azul noche semitransparente, `backdrop-filter`, borde de luz), brillos turquesa en botones, mapa y tarjetas, y retícula de puntos en las bandas oscuras. Paleta de la bandera y del Caribe (azul `#003087`, rojo `#CE1126`, turquesa `#00B4D8` / `#0077A8`, selva `#2D6A4F` / `#52B788`, arena `#F4A261` / `#FDEBD0`, noche `#05132B` / `#0A1F44`) con fondo claro `#F8F5EF`.
- Elementos compartidos (`base.css`): encabezado azul noche con franja tricolor; `.etiqueta-caribe` (píldora sobre los títulos; `.roja` con mini bandera en CSS); `h1 em` / `h2 em` en cursiva turquesa para la segunda parte del titular; `.cabecera-caribe` (degradado azul noche a turquesa con franja tricolor) en Explorar, Autos, Mis reservas, panel y administración; `.banda-oscura` y `.banda-arena` para alternar secciones; `.franja-tricolor`.
- Inicio con un bloque por idea, alternando fondos claros, arena y azul noche: portada (fotografía de playa, buscador sobre vidrio, cifras), qué reservar (tres tarjetas), garantías (franja arena), experiencias por categoría (tarjetas con borde del mar), cómo funciona (tres pasos unidos por una línea), destinos (mapa nocturno con contorno turquesa y ficha con la foto del destino), recomendados (cuatro por tipo), opiniones (vidrio sobre azul noche) y empresas con contacto (Malecón bajo velo azul).
- Inicio de sesión y registro: fotografía a pantalla completa, bienvenida a la izquierda y formulario en un panel de vidrio oscuro; dentro del panel se redefinen las variables de color (`--tinta`, `--superficie`, `--linea`), así el formulario cambia a tema oscuro sin reescribir sus reglas.
- Tipografía: Fraunces (titulares y precios) y Nunito (texto), servidas desde `public/fonts/` (licencia OFL) para no depender de Google Fonts. Sin emojis ni librerías de iconos: los pocos íconos son SVG en línea.
- Movimiento: una sola animación, la aparición de los puntos del mapa al cargar. Sin carruseles, presentaciones de fotografías ni cintas que se desplacen; las transiciones solo responden a acciones del usuario. Con "reducir movimiento" no hay animación.
- Mobile-first, verificado de 375 a 1440 px; en móvil el mapa agrega una lista de destinos, el panel de filtros es un cajón y las tablas de los paneles se convierten en tarjetas.

### 6.3 Mapas

- Inicio: `isla.js` contiene el contorno de República Dominicana y Haití (Natural Earth, dominio público) como trazados SVG y `ISLA.proyectar(lat, lon)`. Los 19 destinos se ubican con `COORDENADAS_DESTINOS` (`src/utils/catalogos.js`, también en `/api/catalogos`). Cada punto es un botón accesible por teclado.
- Explorar y detalle: Leaflet 1.9.4 incluido en `public/vendor/leaflet/`, con mosaicos de OpenStreetMap (sin clave). Si sus mosaicos fallan cuatro veces sin cargar ninguno, `mapa.js` cambia solo a Esri World Street Map; y si tampoco cargan, queda visible el contorno del país dibujado debajo. (Los mosaicos de CARTO se retiraron porque ahora exigen clave y mostraban «API KEY REQUIRED».) Las publicaciones se ubican en su destino con un desplazamiento estable; el detalle enlaza a *Cómo llegar* en Google Maps.

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
| `img/publicaciones/` | Una fotografía por publicación de demostración |
| `img/destinos/` | Ficha de 15 destinos en el mapa del inicio |
| `img/servicios/` | Tarjetas de *¿Qué quieres reservar?* y cabecera de Explorar de 8 categorías |
| `img/paginas/` | Portada y banda de empresas del inicio, autos, combos, tienda, ruta, registro e inicio de sesión |
| `img/productos/` | Una fotografía por producto de la tienda de artesanía |
| `img/ruta/` | Antojo típico de cada carretera en *En ruta* |
| `img/mini/` | Copias de 640 px de ancho de `publicaciones/`, `destinos/`, `servicios/` y `productos/` para tarjetas, listas y fichas |

Ninguna fotografía se repite: cada archivo se usa en un solo lugar (comprobado con un inventario automático de referencias más revisión visual). En las fotografías de autos se difuminaron las placas y se retiraron marcas de agua. El panel de empresa reduce las fotografías subidas a 1600 px (JPEG) antes de enviarlas.

### 6.6.1 Rendimiento

- Las tarjetas y listas cargan la miniatura de 640 px (`urlMiniatura` en `comun.js`) y la página de detalle, la fotografía completa; si falta una miniatura se carga la original. Las imágenes fuera de pantalla usan `loading="lazy"` y la de la portada, `fetchpriority="high"`.
- El servidor comprime con gzip el HTML, CSS, JavaScript y JSON (`compression`) y los archivos estáticos se guardan en caché una hora.
- Las tipografías son locales (precargadas) y el traductor automático y el catálogo en inglés se cargan solo cuando se eligen.
- Peso medido en el primer acceso (sin mapa externo): Explorar pasó de 2,26 MB a 1,08 MB, el inicio en móvil de 1,40 MB a 0,97 MB y Combos de 1,30 MB a 0,72 MB.

### 6.7 Sesión en el navegador

- *Recordarme* activado: `localStorage`; desactivado: `sessionStorage`.
- Un 401 en una petición autenticada cierra la sesión local y envía al inicio de sesión con el aviso de sesión expirada.
- `data-sesion` en el HTML (`invitado`, `usuario`, `cliente`, `empresa`) determina qué elementos se muestran.

### 6.8 Idioma, moneda y clima

- `preferencias.js` guarda en el navegador el idioma (`es`, `en` o un código de `IDIOMAS_AUTOMATICOS`) y la moneda (`DOP` / `USD` / `EUR`) elegidos en el encabezado.
- Otros idiomas (unos 50, en `comun.js`): se carga bajo demanda el traductor de sitios de Google (`translate_a/element.js`) con la cookie `googtrans=/es/<idioma>`; respeta `translate="no"`, traduce también el contenido que se agrega después y se ocultan su barra y sus ventanas. Si no carga en 12 s (sin internet o bloqueado), se borra la cookie, la página queda en español y se muestra un aviso. Al volver a español o inglés se borra la cookie.
- Inglés: se carga `idioma-en.js` y se traducen los textos y atributos visibles (placeholder, aria-label, title, alt), también los que se agregan después (MutationObserver). `CATALOGO_EN` traduce textos fijos, `PATRONES_EN` textos con cantidades o nombres y `REEMPLAZOS_EN` frases compuestas. El contenido escrito por usuarios y empresas lleva `translate="no"`. Fechas, horas (10:00 AM) y decimales siguen la configuración regional.
- Moneda: `formatearPrecio` convierte con las tasas de `/api/monedas`. En la ventana de pago se elige pesos o dólares (por defecto, dólares si el visitante ve los precios en US$); el total y el botón muestran el importe en la moneda del cobro y el recibo, el importe cobrado, el equivalente en pesos y la tasa.
- Clima: `clima.js` pinta el estado actual y el pronóstico de `/api/clima` en la ficha del mapa, en Explorar y en el detalle; si el servicio no responde, la sección se oculta sin afectar la página.

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

El entorno de desarrollo no disponía de SQL Server ni de acceso a Azure, ni de salida a Open-Meteo, ExchangeRate-API, Nager.Date, Wikipedia u OpenStreetMap (las respuestas de respaldo sí se probaron). Las pruebas se ejecutaron con el backend real (Express, controladores, servicios, validadores, bcrypt y JWT) en modo de demostración; el clima se simuló en el navegador y la moneda usó las tasas de referencia.

| Prueba | Resultado |
|---|---|
| `npm run probar`: catálogo, filtros, combos (cotización, noches mínimas, tarjeta rechazada sin reservas, reserva de tres partes), tienda (solo tarjeta, existencias, cancelación con reposición, envío y entrega), detalle, disponibilidad, reservas (sin cupo, fechas pasadas, empresa que intenta reservar), pagos (aprobado, Luhn inválido, vencida, CVV de American Express, rechazada, fondos insuficientes sin crear la reserva, pago en destino, cobro registrado por la empresa y no por otra; pago en dólares con la tasa del día, moneda no admitida y reembolso en US$), cancelación con reembolso, reseñas, favoritos, panel de empresa, administración (suspensión con efecto en catálogo, login y token), clima y monedas | 29 de 29 |
| Recorrido en navegador automatizado de los combos (inicio, filtro, desglose, inicio de sesión, pago y recibo), la tienda (filtro, carrito, entrega a domicilio, pago solo con tarjeta, pedido en *Mis reservas* y cancelación), la Ruta del Parador (filtros, grúas, 911), equipo por unidades, pedidos en la administración e inglés | 25 de 25, sin errores de JavaScript |
| Recorrido en navegador automatizado: mapa del inicio (19 destinos, ficha), recomendados, buscador hacia Explorar, panel de filtros, vista de mapa, detalle, reserva de actividad con pago en destino, alquiler de auto con tarjeta inválida, rechazada y aprobada, recibo, mis reservas, cancelación con aviso de reembolso, reseña, respuesta de la empresa, publicación nueva, administración, registro de viajero y de empresa | 39 de 39, sin errores de JavaScript |
| Recorrido en inglés con dólares, pago en dólares (botón, chip y recibo con tasa) y cambio a otro idioma (francés) con regreso al español si el traductor no está disponible | Correcto |
| Recorrido en inglés con dólares: textos de la interfaz sin traducir (excluidos nombres propios y contenido de usuarios) | 0 pendientes |
| Script SQL: esquema y lotes de inserción emulados; cada clave natural resuelve y los conteos coinciden con `datos-demo.js`. El lote de pagos se ejecutó dos veces sobre una emulación: 90 pagos, 90 referencias distintas, sin duplicados. Las 97 consultas de los repositorios se validaron contra el esquema y los lotes nuevos (combos, reservas de combo, productos y pedidos) se analizaron con un parser de T-SQL | Correcto |
| Desbordamiento horizontal en 375, 768 y 1440 px y revisión visual de las 12 páginas | Sin incidencias |

**Pendiente de verificar con un motor real:** ejecutar `npm run configurar` (o `npm run bd:instalar`) contra Azure SQL Database y comprobar con `npm run bd:probar` que los conteos coinciden: 21 usuarios, 8 empresas, 16 hoteles, 50 actividades, 11 vehículos, 7 combos, 93 reservas, 93 pagos, 74 reseñas, 6 favoritos, 2 mensajes, 11 productos, 2 pedidos y 4 líneas de pedido. El instalador de Windows (`scripts/sqlserver-windows.ps1`) solo pudo revisarse en sintaxis: falta ejecutarlo en un Windows real.
