# BookingRD: resumen del proyecto

**Estado:** versión completa para presentación. Funciona en cualquier PC con Node.js en modo de demostración (sin base de datos) y está lista para instalarse en Azure SQL Database. Pendiente la primera ejecución del script SQL contra un motor real.

## Qué es

Plataforma web de alojamiento, excursiones, actividades y alquiler de autos en República Dominicana. Las empresas turísticas publican sus servicios; los viajeros los encuentran, consultan la disponibilidad y reservan; el equipo supervisa la plataforma desde un panel de administración.

**Stack:** Node.js + Express (rutas, controladores, servicios, validadores y repositorios), Azure SQL Database / SQL Server (`mssql`) o datos en memoria, HTML + CSS + JavaScript sin frameworks, bcrypt + JWT.

## Arrancar

```bash
npm install
npm start        # http://localhost:3000
```

Sin `.env`, arranca en modo de demostración con todos los datos de ejemplo. Con Azure: `npm run configurar`.

## Módulos

| Parte | Detalle |
|---|---|
| Inicio | Seis bloques claros: portada con buscador y cifras, qué reservar, mapa de destinos con ficha (foto, oferta y clima), recomendados, opiniones, y empresas con contacto. Sin carruseles ni movimiento automático. |
| Explorar | Todos los filtros en un panel a la izquierda; lista o mapa; siete órdenes; clima del destino; búsqueda en la URL. |
| Detalle y reserva | Fotografía, características, ubicación y pronóstico, reseñas, políticas, disponibilidad y total en tiempo real, control de cupo en transacción. |
| Alquiler de autos | Recogida y devolución con hora, ciudad de devolución, edad del conductor, extras, precio por bloques de 24 horas con desglose, disponibilidad por flota. |
| Pago (simulado) | Tarjeta de prueba o pago en el destino; validación de Luhn, vencimiento y CVV; tarjetas aprobadas y rechazadas; recibo imprimible; reembolso al cancelar. No hay banco real ni se guarda el número completo. |
| Mis reservas | Próximas, pasadas, canceladas, estado del pago y recibo, guardados y reseñas. |
| Panel de empresa | Resumen con gráficos, publicaciones con fotografía, reservas con estado del pago y *Marcar cobrado*, CSV, respuesta a reseñas, perfil. |
| Administración | Indicadores (incluye cobrado en línea, por cobrar y reembolsado), suspensión de cuentas, moderación de publicaciones y reseñas, reservas con su pago, mensajes. |
| Idioma y moneda | Español o inglés; RD$, US$ o € con tasa del día; el pago siempre en pesos. |
| Correos | Bienvenida y confirmación de reserva por SMTP, o guardados en `correos-enviados/`. |
| Base de datos | 11 tablas (incluye `pagos`); datos de ejemplo en un solo archivo (`database/datos-demo.js`) que alimenta tanto la demostración como los scripts SQL: 20 cuentas, 7 empresas, 15 alojamientos, 34 actividades, 11 autos, 90 reservas con su pago, 74 reseñas. |

## Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administración | admin@bookingrd.com | Admin123! |
| Viajero | cliente@bookingrd.com | Cliente123! |
| Empresa mixta | empresa@bookingrd.com | Empresa123! |
| Empresa de alojamiento | hoteles@bookingrd.com | Empresa123! |
| Alquiler de vehículos | autos@bookingrd.com | Empresa123! |

## Verificación

- 26 de 26 pruebas de la API (`npm run probar`), incluidos pagos aprobados, rechazados, en destino y reembolsos.
- 39 de 39 comprobaciones en navegador automatizado, sin errores de JavaScript.
- El guion de la demostración en clase (`docs/GUIA-DEMOSTRACION.md`) se ejecutó completo de forma automática: 12 de 12 pasos.
- Recorrido completo en inglés y dólares sin textos de interfaz pendientes.
- Script SQL emulado: todas las inserciones resuelven sus claves y los conteos coinciden.
- 90 fotografías, cada una usada una sola vez.
- Estética caribeña y futurista en todo el sitio: azules profundos, paneles de vidrio con brillo turquesa, franja tricolor y fotografías a pantalla completa.

## Pendientes

1. Crear la base gratuita en Azure y ejecutar `npm run configurar` (README, sección 3.A). El script aún no se ha ejecutado contra un motor real; `npm run bd:probar` confirma los conteos.
2. Cada integrante autoriza su IP en el firewall de Azure.
3. Configurar el SMTP en `.env` para que los correos salgan.
4. Cambiar la contraseña de administración si el sitio se expone fuera del equipo.
5. Siguiente fase posible: conectar una pasarela real (por ejemplo AZUL o CardNet) en lugar de la simulación, recuperación de contraseña por correo y varias fotografías por publicación.
