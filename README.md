# BookingRD

Plataforma web de alojamiento, tours, actividades de aventura y alquiler de autos en República Dominicana. Las empresas turísticas publican sus hoteles, villas, excursiones y su flota de vehículos; los viajeros las encuentran, consultan la disponibilidad en tiempo real y reservan. Proyecto académico.

| Capa | Tecnología |
|---|---|
| Backend | Node.js 18+ y Express 4, arquitectura por capas (rutas, controladores, servicios, validadores y repositorios) |
| Base de datos | Azure SQL Database (base compartida por el equipo, oferta gratuita) o SQL Server 2019+ local, mediante `mssql` |
| Frontend | HTML, CSS y JavaScript sin frameworks ni herramientas de compilación |
| Seguridad | bcrypt, JWT, helmet, límite de intentos de acceso, consultas parametrizadas |

## Funcionalidades

| Módulo | Descripción |
|---|---|
| Inicio | **Presentación de fotografías** a pantalla completa (fundido con acercamiento lento, indicadores con barra de progreso) y destino que cambia en el título sin mover la página; buscador con pestañas *Alojamiento*, *Actividades* y **Autos**, autocompletado de destinos (sin importar tildes), fechas de llegada y salida, de la actividad o de **recogida y devolución con hora**, y personas; **cinta de destinos** en movimiento; indicadores con la valoración media; destinos con su número de publicaciones; **mosaico de destinos** con fotografía; *Vistos recientemente*; vitrina por categoría (con **golf** y **alquiler de autos**); carrusel de destacados; **mapa de la isla** con el precio de cada publicación; **opiniones verificadas**; *Sobre nosotros* con paralaje; llamado a empresas; *Contacto*. |
| Alquiler de autos (`autos.html`) | Portada con buscador de autos (lugar, fecha y hora de recogida y devolución), **tipos de auto** con su número de modelos, autos mejor valorados, cómo funciona en tres pasos, lo que incluye el precio, requisitos para recoger y **preguntas frecuentes**. |
| Explorar | **Panel de filtros a la izquierda** (en móvil se abre con el botón *Filtros*) por texto, destino, personas (pasajeros en autos), **transmisión** (autos), **rango de precio con control deslizante de dos extremos sobre el histograma de precios** y **valoración mínima**, con etiquetas de los filtros aplicados que se quitan con un clic; categorías arriba; orden por destacados, **mejor valorados**, **más reservados**, recientes, precio o nombre; **vista de mapa**; las fechas elegidas en el buscador viajan hasta el formulario de reserva. Todo queda en la URL para compartir la búsqueda. |
| Tarjetas | En autos: año, pasajeros, transmisión, maletas, kilometraje y precio por día. Nota de 1 a 10 con su calificación (*Fantástico*, *Muy bueno*...) y número de reseñas, o *Nuevo en BookingRD*; insignias *Destacado*, *Muy reservado* o *Favorito de viajeros*; corazón para guardar; política de cancelación. |
| Detalle | Valoración, **Guardar** y **Compartir** en la portada; barra de secciones fija; lo más destacado; descripción, detalles y servicios; **mapa de la zona** y enlace *Cómo llegar*; **reseñas** con nota media, distribución por tramos, orden y respuesta de la empresa; *Lo que debes saber* (cancelación, pago, documentos); datos de la empresa; relacionadas; tarjeta de reserva con disponibilidad, aviso de *últimas plazas* y total en tiempo real. |
| Alquiler de autos | Ficha con características (pasajeros, puertas, maletas, transmisión, combustible, aire y kilometraje), **requisitos** (licencia, edad mínima, tarjeta de crédito para el depósito y documento), políticas del sector (combustible lleno a lleno, depósito reembolsable, seguro incluido, horario del mostrador) y formulario con **fecha y hora** de recogida y devolución, **ciudad de devolución**, **edad del conductor** y **extras** (protección total, conductor adicional, silla infantil, GPS, Wi-Fi, entrega en el hotel). El servidor cobra por bloques de 24 horas con una hora de cortesía, suma el **cargo por conductor joven** (menores de 25), el de **devolución en otra ciudad** y los extras, y muestra el desglose; el depósito se informa aparte. La disponibilidad se calcula por unidades de la flota en cada día del alquiler. |
| Favoritos | Los viajeros guardan hoteles, actividades y autos con el corazón; el header muestra cuántos tienen y la pestaña *Guardados* los reúne. Se guardan en la base (`dbo.favoritos`), así que aparecen en cualquier equipo. |
| Reseñas | Solo el titular de una reserva confirmada y terminada puede reseñarla, una vez (puntuación de 1 a 10, título y comentario). La empresa responde desde su panel y la administración puede ocultar reseñas que incumplan las normas. |
| Reservas | Hoteles: entrada, salida, habitaciones y personas. Actividades: fecha y personas. Autos: recogida y devolución con hora (de 6:00 a. m. a 10:00 p. m., de 1 a 30 días), edad del conductor, ciudad de devolución y extras. El servidor bloquea la publicación durante la transacción, por lo que dos viajeros no pueden tomar el último cupo a la vez. Cada reserva recibe un código único (p. ej. `BRD7K2M9QA`). |
| Mis reservas | Próximas, pasadas y canceladas, con lugar y hora de recogida, devolución, extras y depósito en los alquileres; cancelación hasta un día antes; *Guardados*; *Reseñas* con las reservas pendientes de reseñar y un aviso para escribirlas. |
| Panel de empresa | *Resumen* con indicadores, ingresos por mes, publicaciones con más reservas y próximas llegadas; crear, editar, ocultar o eliminar publicaciones con fotografía; reservas recibidas con búsqueda, filtro y exportación a CSV (Excel); **reseñas** con su valoración media y respuesta pública; perfil público editable. Una empresa de *Alojamiento* solo publica hospedaje, una de *Actividades* solo actividades, una *Mixta* ambas cosas y una de **Alquiler de vehículos** publica cada modelo de su flota (unidades, lugar de recogida, depósito, edad mínima, kilometraje y cargos). |
| Administración (equipo de desarrollo) | Centro de control en `admin.html`: indicadores globales y gráficos; empresas con sus ingresos y opción de suspender o reactivar la cuenta; usuarios; moderación de cualquier publicación, también de autos (ocultar o destacar en la página de inicio); moderación de reseñas; todas las reservas; mensajes del formulario de contacto (pendientes y atendidos). Una cuenta suspendida no puede iniciar sesión, su sesión abierta se cierra y, si es una empresa, sus publicaciones salen del catálogo. |
| Registro | Sencillo para viajeros (nombre, correo y contraseña) y en tres pasos para empresas (representante, datos legales y servicios, incluido *Alquiler de vehículos*). |
| Inicio de sesión | Fotografías en transición, *Recordarme* y regreso automático a la página que pedía la sesión. |
| Correos | **Bienvenida** al registrarse (distinta para viajero y para empresa, con los primeros pasos según su servicio) y **confirmación de cada reserva** con el código, las fechas, el total y, en los autos, el depósito y lo que hay que llevar. Se envían por SMTP (Gmail, Outlook u otro); sin configurarlo se guardan como HTML en `correos-enviados/`. Un fallo del correo nunca impide registrarse ni reservar (sección 4). |

Las fotografías que suben las empresas se guardan en la base de datos (`dbo.imagenes`), de modo que todos los integrantes del equipo ven las mismas imágenes sin compartir archivos. Las fotografías del sitio y de los datos de demostración no se repiten: cada imagen de `public/img/` se usa en un solo lugar.

Documentación adicional:
- [`docs/RESUMEN.md`](docs/RESUMEN.md): estado del proyecto en una página.
- [`docs/DOCUMENTACION.md`](docs/DOCUMENTACION.md): arquitectura, API, base de datos, frontend y pruebas.

---

## Capturas

Cada captura lleva el nombre del archivo HTML que muestra (escritorio, 1440 px). En `docs/capturas/movil/` están las mismas páginas a 375 px.

| Página | Captura |
|---|---|
| Inicio · `public/index.html` | ![Inicio](docs/capturas/index.jpg) |
| Alquiler de autos · `public/autos.html` | ![Alquiler de autos](docs/capturas/autos.jpg) |
| Correos de bienvenida y de reserva | ![Correos](docs/capturas/correos.jpg) |
| Explorar · `public/explorar.html` | ![Explorar](docs/capturas/explorar.jpg) |
| Explorar, vista de mapa · `public/explorar.html?vista=mapa` | ![Mapa de resultados](docs/capturas/explorar-mapa.jpg) |
| Detalle y reserva · `public/detalle.html` | ![Detalle](docs/capturas/detalle.jpg) |
| Explorar autos · `public/explorar.html?tipo=vehiculo` | ![Autos en Explorar](docs/capturas/explorar-autos.jpg) |
| Detalle de un auto · `public/detalle.html?tipo=vehiculo` | ![Detalle de auto](docs/capturas/detalle-auto.jpg) |
| Reserva confirmada · `public/detalle.html` | ![Confirmación](docs/capturas/detalle-confirmacion.jpg) |
| Mis reservas · `public/mis-reservas.html` | ![Mis reservas](docs/capturas/mis-reservas.jpg) |
| Mis reservas, guardados · `public/mis-reservas.html?vista=guardados` | ![Guardados](docs/capturas/mis-reservas-guardados.jpg) |
| Mis reservas, reseñas · `public/mis-reservas.html?vista=resenas` | ![Reseñas del viajero](docs/capturas/mis-reservas-resenas.jpg) |
| Escribir una reseña · `public/mis-reservas.html` | ![Formulario de reseña](docs/capturas/mis-reservas-formulario-resena.jpg) |
| Panel de empresa · `public/panel-empresa.html` | ![Panel de empresa](docs/capturas/panel-empresa.jpg) |
| Panel de empresa, reseñas · `public/panel-empresa.html` | ![Reseñas de la empresa](docs/capturas/panel-empresa-resenas.jpg) |
| Panel de empresa, perfil · `public/panel-empresa.html` | ![Perfil de empresa](docs/capturas/panel-empresa-perfil.jpg) |
| Administración · `public/admin.html` | ![Administración](docs/capturas/admin.jpg) |
| Administración, reseñas · `public/admin.html` | ![Moderación de reseñas](docs/capturas/admin-resenas.jpg) |
| Administración, empresas · `public/admin.html` | ![Empresas](docs/capturas/admin-empresas.jpg) |
| Administración, publicaciones · `public/admin.html` | ![Moderación](docs/capturas/admin-publicaciones.jpg) |
| Administración, mensajes · `public/admin.html` | ![Mensajes](docs/capturas/admin-mensajes.jpg) |
| Registro de viajero · `public/registro.html` | ![Registro](docs/capturas/registro.jpg) |
| Registro de empresa · `public/registro.html?tipo=empresa` | ![Registro de empresa](docs/capturas/registro-empresa.jpg) |
| Inicio de sesión · `public/login.html` | ![Inicio de sesión](docs/capturas/login.jpg) |

---

## 1. Requisitos

- [Node.js](https://nodejs.org) 18 o superior (LTS recomendada).
- [Git](https://git-scm.com).
- Acceso a la base de datos: la base compartida en Azure (sección 3.A) o un SQL Server local (sección 3.B).

No se requieren herramientas de compilación: `bcrypt` 6 incluye binarios para Windows, macOS y Linux.

## 2. Obtener el proyecto

```bash
git clone https://github.com/gsanchez47-tech/BookingRD.git
cd BookingRD
npm install
```

## 3. Base de datos

### 3.A Base compartida en Azure SQL Database (recomendado)

Una sola base para todo el equipo: lo que publica o reserva un integrante lo ven los demás de inmediato.

Azure SQL Database tiene una oferta gratuita permanente: por cada base, 100.000 vCore-segundos de cómputo y 32 GB de almacenamiento al mes, hasta 10 bases por suscripción. Con la opción de pausa automática no se generan cargos. La suscripción *Azure for Students Starter* no es compatible con esta oferta; sí lo son *Azure for Students* y la cuenta gratuita de Azure.

**Creación (una sola vez, un integrante):**

1. Ingresar a <https://portal.azure.com>, buscar **SQL databases** y seleccionar **Create**. En el aviso superior del formulario, seleccionar **Apply offer** (oferta gratuita).
2. Pestaña *Basics*:
   - *Resource group*: crear uno nuevo, p. ej. `bookingrd-rg`.
   - *Database name*: `BookingRD`.
   - *Server*: *Create new*. Nombre único, región cercana (p. ej. *East US 2*) y *Authentication method*: **Use SQL authentication**. Anotar el usuario y la contraseña de administrador.
   - *Behavior when free limit reached*: **Auto-pause the database until next month**.
3. Pestaña *Networking*: *Connectivity method*: **Public endpoint**; activar **Add current client IP address**.
4. *Review + create* > *Create*.
5. En la carpeta del proyecto, ejecutar el asistente y responder con los datos del servidor:

   ```bash
   npm run configurar
   ```

   El asistente genera `.env`, prueba la conexión (indica la IP a autorizar si el firewall la rechaza) y crea las tablas con los datos de demostración.

6. Compartir el archivo `.env` con el equipo por un canal privado. **El archivo `.env` no se sube al repositorio.**

**Resto del equipo:**

1. Copiar en la raíz del proyecto el `.env` recibido.
2. Autorizar su IP pública: *portal de Azure > SQL server > Security > Networking > Firewall rules > Add your client IPv4 address > Save*. Cada integrante y cada red (casa, universidad) necesita su propia regla.
3. Verificar la conexión:

   ```bash
   npm run bd:probar
   ```

Con la pausa automática, la primera conexión después de un tiempo sin uso puede tardar hasta un minuto y responder "El servicio no está disponible". Basta con reintentar. Para ahorrar cómputo, cerrar SSMS o el editor de consultas del portal al terminar.

**Reinstalar o actualizar:** `npm run bd:instalar` vuelve a ejecutar el script. Es idempotente: no duplica los datos de demostración y conserva lo que el equipo haya creado (cuentas, publicaciones con fotografía propia, reservas). Si la base ya tenía los datos de demostración de una versión anterior, los actualiza: retira las publicaciones de ejemplo que ya no existen (o las oculta si tienen reservas), renombra las que cambiaron y actualiza sus fotografías. Solo si detecta tablas con una estructura anterior, las reemplaza.

### 3.B SQL Server local (alternativa)

1. Instalar SQL Server (Express o Developer) y SQL Server Management Studio.
2. Abrir `database/instalacion-completa.sql` en SSMS con un login administrador y ejecutar (F5). Crea la base `BookingRD`, el login `bookingrd_app`, las tablas y los datos de demostración.
3. Crear el archivo de configuración:

   ```bash
   cp .env.example .env        # Windows (cmd): copy .env.example .env
   ```

En esta modalidad cada integrante tiene su propia base y los datos no se comparten.

## 4. Ejecución

```bash
npm start          # ejecución normal
npm run dev        # desarrollo, con reinicio automático (nodemon)
```

Abrir <http://localhost:3000>. Es preferible abrir el sitio así y no con doble clic en un HTML (`file://`): con el servidor encendido ambas formas funcionan, pero solo la primera es la que verán los usuarios.

### Correo electrónico

Para que los correos lleguen de verdad, completar en `.env` (la plantilla está en `.env.example`):

| Proveedor | Variables |
|---|---|
| Gmail | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USUARIO=tucuenta@gmail.com`, `SMTP_CLAVE=` una *contraseña de aplicación* (requiere la verificación en dos pasos: <https://myaccount.google.com/apppasswords>) |
| Outlook / Hotmail | `SMTP_HOST=smtp-mail.outlook.com`, `SMTP_PORT=587`, usuario y contraseña de la cuenta |
| Otro (SendGrid, Brevo, Mailgun...) | Los datos SMTP que entrega el servicio |

`CORREO_REMITENTE` es el nombre y correo que ve el destinatario y `URL_SITIO` la dirección pública del sitio (para los botones del correo). Sin `SMTP_HOST`, cada correo se guarda como página HTML en `correos-enviados/` (fuera del repositorio) y la consola indica la ruta. Los envíos son en segundo plano: si el servidor de correo falla, la cuenta o la reserva se crean igual y el error queda en la consola.

> Si el proyecto se descargó como `.zip`, extraerlo primero (*Extraer todo*). Abrir un HTML directamente desde dentro del `.zip` impide que el navegador encuentre la carpeta `css/`.

### Datos de demostración

El script crea 7 empresas (dos de alquiler de autos), 14 alojamientos, 24 actividades (incluido golf), 5 autos de alquiler (económico, lujo, convertible, SUV y pickup 4x4), 12 viajeros, 76 reservas (próximas, realizadas y una cancelada; tres de ellas alquileres próximos), 63 reseñas con respuestas de las empresas, 6 favoritos y 2 mensajes de contacto. Las fechas se calculan a partir del día de la instalación, así que siempre hay reservas próximas y un historial con reseñas. La cuenta `cliente@bookingrd.com` tiene una reserva terminada sin reseñar, para probar el formulario.

| Cuenta | Correo | Contraseña |
|---|---|---|
| Administración (equipo de desarrollo) | admin@bookingrd.com | Admin123! |
| Viajero | cliente@bookingrd.com | Cliente123! |
| Otros viajeros | luis.fernandez@correo.com, carmen.jimenez@correo.com, daniel.ortiz@correo.com y los demás autores de reseñas (ana.castillo, roberto.sanchez, patricia.nunez, miguel.herrera, yesenia.paulino, andres.cabrera, laura.vasquez, hector.marte, todos @correo.com) | Cliente123! |
| Empresa mixta (Bahía Caribe Tours) | empresa@bookingrd.com | Empresa123! |
| Empresa de alojamiento (Coralia Hotels & Resorts) | hoteles@bookingrd.com | Empresa123! |
| Empresa de actividades (Aventura Quisqueya) | aventura@bookingrd.com | Empresa123! |
| Empresa de actividades (Montaña Verde Ecotours) | montana@bookingrd.com | Empresa123! |
| Empresa de actividades (Raíces Dominicanas Tours) | cultura@bookingrd.com | Empresa123! |
| Alquiler de vehículos (Caribe Rent a Car) | autos@bookingrd.com | Empresa123! |
| Alquiler de vehículos (Ozama Rent a Car) | rentacar@bookingrd.com | Empresa123! |

**Recorrido sugerido:**

1. Entrar como `empresa@bookingrd.com`: se abre *Mi panel*. Crear una publicación con fotografía.
2. Cerrar sesión, entrar como `cliente@bookingrd.com`, buscarla en *Explorar* y reservarla.
3. Volver a la cuenta de empresa y verla en *Reservas recibidas* y en el *Resumen*.
4. Como `cliente@bookingrd.com`, abrir *Mis reservas > Reseñas* y reseñar la visita a la Zona Colonial; guardar un par de publicaciones con el corazón.
5. Como `empresa@bookingrd.com`, responder esa reseña en *Mi panel > Reseñas* y verla publicada en el detalle.
6. Como `cliente@bookingrd.com`, en *Inicio > Autos* buscar un auto con recogida y devolución, abrir el Toyota Corolla, cambiar la edad del conductor a 23, elegir devolverlo en Punta Cana, marcar un extra y ver cómo cambia el desglose; reservarlo.
7. Entrar como `autos@bookingrd.com`: publicar un modelo nuevo de la flota y ver el alquiler recibido con la hora de recogida y la ciudad de devolución.
8. Entrar como `admin@bookingrd.com`: se abre *Administración*. Suspender una empresa y comprobar que sus publicaciones desaparecen del catálogo; reactivarla. Ocultar una reseña en *Reseñas*.

Cada rol llega a su espacio al iniciar sesión: la administración a `admin.html`, las empresas a `panel-empresa.html` y los viajeros a la página de inicio.

**Cambiar la contraseña de administración:** la cuenta `admin@bookingrd.com` es de demostración. En un entorno real, generar un hash nuevo con `node -e "console.log(require('bcrypt').hashSync('NuevaClave', 10))"` y actualizar `password_hash` en `dbo.usuarios` desde el editor de consultas de Azure. Las cuentas con rol `admin` no pueden crearse desde el registro público.

## 5. Trabajo en equipo con GitHub

Repositorio: <https://github.com/gsanchez47-tech/BookingRD>. Para dar acceso: *Settings > Collaborators > Add people*.

```bash
git pull                        # traer los cambios del equipo antes de trabajar
git checkout -b nombre-de-rama  # rama por tarea (recomendado)
git add .
git commit -m "Descripción del cambio"
git push -u origin nombre-de-rama   # y abrir un Pull Request en GitHub
```

Excluidos del repositorio (`.gitignore`): `node_modules/`, `.env`, registros y archivos del editor.

## 6. Estructura

```
BookingRD/
├── public/                          Frontend (archivos estáticos servidos por Express)
│   ├── index.html                   Inicio
│   ├── autos.html                   Alquiler de autos
│   ├── explorar.html                Catálogo con filtros
│   ├── detalle.html                 Detalle y reserva de una publicación
│   ├── mis-reservas.html            Reservas del viajero
│   ├── panel-empresa.html           Panel de empresa
│   ├── admin.html                   Administración de la plataforma
│   ├── registro.html                Registro de viajero o de empresa
│   ├── login.html                   Inicio de sesión
│   ├── css/                         Una hoja de estilos por página (mismo nombre que el HTML)
│   ├── js/
│   │   ├── comun.js                 Cliente de la API, sesión, header, catálogos, tarjetas, modales,
│   │   │                            favoritos, valoraciones y vistos recientemente
│   │   ├── buscador.js              Buscador del inicio y de autos (autocompletado, fechas y horas)
│   │   ├── mapa.js                  Mapas de la isla (Leaflet) con el contorno del país
│   │   └── <página>.js              Lógica de cada página
│   ├── vendor/leaflet/              Leaflet 1.9.4 (BSD-2), incluido para no depender de una CDN
│   └── img/                         publicaciones/, servicios/, registro/ y fotografías generales
├── src/
│   ├── server.js                    Express: seguridad, rutas, estáticos y manejo de errores
│   ├── config/db.js                 Pool de conexiones y transacciones
│   ├── config/correo.js             Transporte de correo (SMTP o carpeta de desarrollo)
│   ├── correos/plantillas.js        HTML y texto de los correos (bienvenida y reserva)
│   ├── routes/                      Endpoints
│   ├── middleware/autenticacion.js  JWT y roles
│   ├── controllers/                 Entrada y salida HTTP
│   ├── services/                    Reglas de reserva, disponibilidad, precio del alquiler y envío de correos
│   ├── validators/                  Validación de publicaciones, perfil y reseñas
│   ├── repositories/                Todo el SQL del proyecto
│   └── utils/                       Catálogos, fechas, validaciones y errores
├── database/instalacion-completa.sql  Esquema y datos de demostración (idempotente)
├── scripts/                         Asistente de Azure y comandos bd:instalar / bd:probar
├── docs/                            Documentación y capturas
├── .env.example                     Plantilla de configuración
└── package.json
```

## 7. Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Falta JWT_SECRET` al iniciar | No existe `.env` | Ejecutar `npm run configurar` o copiar `.env.example` a `.env` |
| Página sin estilos | HTML abierto desde dentro del `.zip` | Extraer el `.zip` y abrir <http://localhost:3000> con el servidor en ejecución |
| Aviso "El servidor de BookingRD no está en ejecución", catálogo vacío o "No se pudieron cargar las publicaciones" | Se abrió el HTML desde la carpeta (`C:/Users/...`) sin `npm start` | Ejecutar `npm start` en la carpeta del proyecto y entrar a <http://localhost:3000> |
| "No se pudo conectar con el servidor" | El backend no está en ejecución | Ejecutar `npm start` |
| "El servicio no está disponible en este momento" | Sin conexión con la base de datos, o base de Azure reanudándose | Reintentar en un minuto; si persiste, `npm run bd:probar` |
| `Cannot open server ... requested by the login` (Azure) | IP no autorizada en el firewall | Agregar la IP en *Networking > Firewall rules* |
| `Login failed for user` | Usuario o contraseña incorrectos | Revisar `DB_USER` y `DB_PASSWORD` en `.env` |
| "Demasiados intentos" al iniciar sesión | Límite de intentos por IP | Esperar 10 minutos o subir `LIMITE_INTENTOS_AUTH` en `.env` |
| `Failed to connect to localhost:1433` (local) | TCP/IP deshabilitado en SQL Server Express | *SQL Server Configuration Manager > Protocolos > TCP/IP: habilitado*, o usar `DB_INSTANCE=SQLEXPRESS` con `DB_PORT` vacío |
