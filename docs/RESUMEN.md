# BookingRD: resumen del proyecto

**Estado:** versión completa para presentación. Se instala en Windows con doble clic en `INICIAR-BookingRD.bat`, que configura SQL Server local y crea la base BookingRD; si no hay SQL Server, funciona con una base local en archivo que también guarda los datos. Lista para Azure SQL Database. Lo único simulado son los pagos.

## Qué es

Plataforma web para buscar y reservar alojamiento y tours en República Dominicana, con combos de hotel y excursiones con descuento, alquiler de autos, equipo de aventura y fotógrafos, la Ruta del Parador con asistencia vial y una tienda de artesanía. Las empresas turísticas publican sus servicios; los viajeros los encuentran en 19 destinos, consultan la disponibilidad y reservan; el equipo supervisa la plataforma desde un panel de administración.

**Stack:** Node.js + Express (rutas, controladores, servicios, validadores y repositorios), SQL Server / Azure SQL Database (`mssql`) o base local en archivo, HTML + CSS + JavaScript sin frameworks, bcrypt + JWT.

## Arrancar

Windows: doble clic en `INICIAR-BookingRD.bat` (instala Node.js y las dependencias si faltan, configura SQL Server con permiso de administrador y abre <http://localhost:3000>).

Cualquier sistema:

```bash
npm install
npm run iniciar
```

Con Azure: `npm run configurar`. Demostración que no guarda nada: `npm run demo`.

## Módulos

| Parte | Detalle |
|---|---|
| Inicio | Portada con buscador y cifras, qué reservar, combos destacados, garantías, mapa de 19 destinos con ficha (foto, oferta, imperdibles y clima), experiencias por categoría, *Más para tu viaje*, recomendados, cómo funciona, opiniones, y empresas con contacto. Sin carruseles ni movimiento automático. |
| Combos | Hotel + una o dos actividades del destino con 10 a 15 % de descuento, itinerario por días, cotización con disponibilidad real y reserva de todas las partes con un solo pago. |
| Explorar | Todos los filtros en un panel a la izquierda; lista o mapa; siete órdenes; clima del destino; búsqueda en la URL. Incluye alquiler de equipo de aventura y fotógrafos con dron, que se reservan por unidades. |
| Detalle y reserva | Fotografía, características, ubicación y pronóstico, reseñas, políticas, disponibilidad y total en tiempo real, control de cupo en transacción. |
| Alquiler de autos | Recogida y devolución con hora, ciudad de devolución, edad del conductor, extras, precio por bloques de 24 horas con desglose, disponibilidad por flota. |
| En ruta | Paradas para comer por carretera (Duarte, del Este, Sánchez y costa norte) con filtros, y asistencia vial: 911, *462, grúas por provincia (red de ejemplo) y enlace con la ubicación. |
| Tienda | Larimar, ámbar, arte taíno, café, cacao y artesanía con carrito, entrega en el hotel o a domicilio, pago con tarjeta, cancelación antes del envío y seguimiento. |
| Pago (simulado) | Tarjeta de prueba o pago en el destino; validación de Luhn, vencimiento y CVV; tarjetas aprobadas y rechazadas; recibo imprimible; reembolso al cancelar. No hay banco real ni se guarda el número completo. |
| Mis reservas | Próximas, pasadas, canceladas (con la etiqueta del combo), estado del pago y recibo, guardados, reseñas y pedidos de la tienda. |
| Panel de empresa | Resumen con gráficos, publicaciones con fotografía, reservas con estado del pago y *Marcar cobrado*, CSV, respuesta a reseñas, perfil. |
| Administración | Indicadores, suspensión de cuentas, moderación de publicaciones y reseñas, reservas con su pago, pedidos de la tienda, mensajes. |
| Idioma y moneda | Español o inglés; RD$, US$ o € con tasa del día; el pago siempre en pesos. |
| Correos | Bienvenida y confirmación de reserva por SMTP, o guardados en `correos-enviados/`. |
| Base de datos | 15 tablas (incluye `combos`, `pagos`, `productos`, `pedidos` y `pedido_detalle`); datos de ejemplo en un solo archivo (`database/datos-demo.js`) que alimenta la base local y los scripts SQL: 21 cuentas, 8 empresas, 16 alojamientos, 50 actividades, 11 autos, 7 combos, 93 reservas con su pago, 74 reseñas, 11 productos y 2 pedidos. |

## Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administración | admin@bookingrd.com | Admin123! |
| Viajero | cliente@bookingrd.com | Cliente123! |
| Empresa mixta | empresa@bookingrd.com | Empresa123! |
| Empresa de alojamiento | hoteles@bookingrd.com | Empresa123! |
| Alquiler de vehículos | autos@bookingrd.com | Empresa123! |
| Equipo y fotógrafos | equipo@bookingrd.com | Empresa123! |

## Verificación

- 28 de 28 pruebas de la API (`npm run probar`), incluidos combos, tienda, pagos aprobados, rechazados, en destino y reembolsos.
- 39 + 25 comprobaciones en navegador automatizado (recorrido general, combos, tienda, ruta y administración), sin errores de JavaScript.
- El guion de la demostración en clase (`docs/GUIA-DEMOSTRACION.md`) se ejecutó de forma automática: 12 de 12 pasos.
- Consultas SQL de los repositorios validadas contra el esquema; script de instalación analizado con un parser de T-SQL.
- 107 fotografías, cada una usada una sola vez; 20 ilustraciones propias para el equipo, los fotógrafos y la tienda.
- Sin desbordamiento horizontal en 375, 768 y 1440 px en las 12 páginas.

## Pendientes

1. Ejecutar `INICIAR-BookingRD.bat` en un Windows real: el instalador de SQL Server solo pudo revisarse en sintaxis, y el script SQL aún no se ha ejecutado contra un motor real (`npm run bd:probar` confirma los conteos).
2. Para Azure: crear la base gratuita y ejecutar `npm run configurar` (README, sección 3.A); cada integrante autoriza su IP en el firewall.
3. Configurar el SMTP en `.env` para que los correos salgan.
4. Cambiar la contraseña de administración si el sitio se expone fuera del equipo.
5. Siguiente fase posible: conectar una pasarela real (por ejemplo AZUL o CardNet) en lugar de la simulación, recuperación de contraseña por correo y varias fotografías por publicación.
