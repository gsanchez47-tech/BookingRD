# BookingRD: resumen del proyecto

**Estado:** versión completa para entrega: catálogo con mapa, reservas de alojamiento, actividades y **alquiler de autos**, favoritos, reseñas, panel de empresa y administración de la plataforma. Pendiente la primera ejecución del script contra la base de Azure.

## Qué es

Plataforma web de alojamiento, tours, actividades de aventura y alquiler de autos en República Dominicana. Las empresas turísticas publican sus servicios; los viajeros los encuentran, consultan la disponibilidad y reservan; el equipo de desarrollo supervisa la plataforma desde un panel de administración.

**Stack:** Node.js + Express (rutas, controladores, servicios, validadores y repositorios), Azure SQL Database / SQL Server (`mssql`), HTML + CSS + JavaScript sin frameworks, bcrypt + JWT.

## Módulos

| Parte | Detalle |
|---|---|
| Inicio | Presentación de fotografías con indicadores y destino rotativo; cinta de destinos; buscador con pestañas de alojamiento, actividades y autos (recogida y devolución con hora), autocompletado de destinos y fechas; indicadores con valoración media; vistos recientemente; menú *Servicios*; vitrina de 10 categorías más alquiler de autos; destacados; mosaico de destinos; mapa de la isla con precios; opiniones verificadas; *Sobre nosotros* con paralaje; *Contacto*. |
| Página de autos | `autos.html` con buscador, tipos de auto, flota mejor valorada, pasos, requisitos y preguntas frecuentes. |
| Explorar | Panel de filtros a la izquierda (cajón en móvil) por destino, personas o pasajeros, transmisión (autos), rango de precio con control deslizante sobre un histograma, valoración y texto, con etiquetas de filtros activos; 7 órdenes (incluye mejor valorados y más reservados); vista de lista o de mapa; las fechas del buscador llegan a la reserva; búsqueda compartible por URL. |
| Tarjetas | Nota de 1 a 10 con calificación y número de reseñas, insignias (*Destacado*, *Muy reservado*, *Favorito de viajeros*), corazón para guardar, política de cancelación. |
| Detalle y reserva | Guardar y compartir; barra de secciones; lo más destacado; mapa de la zona; reseñas con distribución, orden y respuestas; políticas; disponibilidad y total en tiempo real con aviso de últimas plazas; código de reserva; control de cupo en transacción. |
| Alquiler de autos | Ficha técnica, requisitos y políticas del sector (combustible lleno a lleno, depósito, seguro, horario); recogida y devolución con fecha y hora, ciudad de devolución, edad del conductor y 6 extras; precio por bloques de 24 horas con una hora de cortesía, cargo por conductor joven y por devolución en otra ciudad, con desglose; disponibilidad por unidades de la flota en cada día. |
| Mis reservas | Próximas, pasadas y canceladas; cancelación; *Guardados*; *Reseñas* (pendientes y publicadas) con formulario de 1 a 10. |
| Panel de empresa | Resumen con gráficos y valoración media; publicaciones con fotografía (alojamiento, actividades o vehículos con todos sus datos); reservas recibidas con búsqueda y exportación CSV; reseñas con respuesta pública; perfil público editable. |
| Administración | Indicadores y gráficos globales; empresas y usuarios con suspensión y reactivación; moderación de publicaciones (ocultar, destacar) y de reseñas; reservas de la plataforma; mensajes de contacto. |
| Correos | Bienvenida al registrarse (viajero o empresa) y confirmación de cada reserva, por SMTP (Gmail, Outlook u otro) o guardados en `correos-enviados/` si no hay SMTP. |
| Cuentas | Registro sencillo de viajero y por pasos de empresa (alojamiento, actividades, mixto o alquiler de vehículos); login con *Recordarme*; cada rol llega a su espacio. |
| Base de datos | 10 tablas (incluye `vehiculos`, `resenas` y `favoritos`); fotografías subidas guardadas en la base para que todo el equipo las vea; script idempotente con datos de demostración (1 administración, 12 viajeros, 7 empresas, 14 alojamientos, 24 actividades, 5 autos en 15 destinos, 76 reservas, 63 reseñas, 6 favoritos, 2 mensajes). Las bases ya instaladas se actualizan sin perder datos (sección 3.9 del script). |

## Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administración | admin@bookingrd.com | Admin123! |
| Viajero | cliente@bookingrd.com | Cliente123! |
| Empresa mixta | empresa@bookingrd.com | Empresa123! |
| Empresa de alojamiento | hoteles@bookingrd.com | Empresa123! |
| Alquiler de vehículos | autos@bookingrd.com | Empresa123! |

## Verificación

- 594 comprobaciones (93 del alquiler de autos y 12 de los correos) en navegador automatizado contra el backend real con datos simulados: todas correctas.
- 0 errores de JavaScript y 0 desbordamientos en 9 páginas y todos los anchos probados (375 a 1440 px).
- Script SQL (301 lotes) y 114 consultas validados como T-SQL contra el esquema.
- Fotografías: ninguna se repite (comparación automática, que también detecta recortes, más revisión visual).

## Pendientes

1. **Crear la base gratuita en Azure y ejecutar `npm run configurar`** (README, sección 3.A). El script SQL no se ha ejecutado aún contra un motor real; la primera instalación confirma la validación estática.
2. Cada integrante autoriza su IP en el firewall de Azure.
3. Cambiar la contraseña de la cuenta de administración si el sitio se expone fuera del equipo (README, sección 4).
4. Configurar el SMTP en `.env` para que los correos salgan (README, sección 4).
5. **Siguiente fase:** pagos, recuperación de contraseña por correo y galería de varias fotografías por publicación, tarifas de autos por temporada.
