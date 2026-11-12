# Guía de demostración en clase

Recorrido de unos 14 minutos por BookingRD, con los tres roles (viajero, empresa y administración), los combos, la tienda, la Ruta del Parador y el pago simulado. Todo lo que se hace queda guardado en la base de datos; lo único simulado son los pagos. Cada paso indica qué hacer y qué conviene decir.

## Antes de empezar

1. Doble clic en `INICIAR-BookingRD.bat` (o `npm run iniciar`). La consola dice si usa SQL Server o la base local y abre el navegador.
2. Abre <http://localhost:3000> en el navegador, a pantalla completa. Si vas a proyectar, usa un zoom del 100 al 110 %.
3. Ten a mano esta guía y las tarjetas de prueba:

| Número | Resultado |
|---|---|
| 4242 4242 4242 4242 | Visa aprobada |
| 5555 5555 5555 4444 | Mastercard aprobada |
| 4000 0000 0000 9995 | Fondos insuficientes |
| 4000 0000 0000 0002 | Rechazada por el banco |

Vencimiento: cualquier fecha futura (por ejemplo 12/30). CVV: 123.

Si algo se desordena durante los ensayos, vuelve a los datos de ejemplo: con SQL Server, `npm run bd:reiniciar`; con la base local, cierra BookingRD y ejecuta `npm run local:reiniciar`. Para ensayar sin tocar la base: `npm run demo`.

## 1. El inicio (1 minuto)

- Muestra la portada: foto de playa, buscador sobre vidrio y las cifras de la plataforma.
- Baja a **¿Qué quieres reservar?**: las tres puertas de entrada (alojamiento, actividades, autos), y a los **combos** destacados.
- Baja al **mapa de la isla** y toca **Miches**, luego **Barahona**.
  - *Qué decir:* son 19 destinos. La ficha muestra la foto, cuenta en tiempo real cuántos alojamientos, actividades y autos hay, muestra un resumen del destino tomado de Wikipedia, lista los lugares imperdibles y el clima del momento (Open-Meteo). En el detalle de cualquier publicación, la sección *Ubicación y clima* añade amanecer y atardecer, índice UV, el estado del mar en los destinos de costa y los próximos feriados del país.
- Baja a los **recomendados** y cambia entre Alojamiento, Actividades y Autos.

## 2. Buscar con filtros (1 minuto)

- Pulsa **Alojamiento** en el menú.
- En el **panel de filtros de la izquierda**: destino *Punta Cana*, valoración *8+*, mueve el rango de precio.
- Cambia a **Mapa** y vuelve a **Lista**.
  - *Qué decir:* la búsqueda queda en la dirección de la página, así que se puede compartir; los conteos de cada categoría salen de la base de datos.

## 3. Reservar y pagar (3 minutos)

- **Iniciar sesión** > *Cuentas de demostración* > **Viajero** (María Rodríguez).
- Abre un hotel, elige fechas y pulsa **Reservar ahora**.
- En la ventana de pago:
  1. Abre *Tarjetas de prueba* y elige **4000 0000 0000 9995**. Pulsa **Pagar**.
     - *Qué decir:* la pasarela responde "fondos insuficientes" y la reserva **no** se crea: el cobro ocurre dentro de la misma transacción que la reserva y se deshace si el banco rechaza.
  2. Elige **4242 4242 4242 4242** y paga.
- Aparece el **código de reserva** y el chip *Pagado con Visa •••• 4242*. Pulsa **Ver recibo**.
  - *Qué decir:* referencia de pago, código de autorización y fecha. Se puede imprimir o guardar en PDF. Es una simulación: no hay banco real y no se guarda el número completo ni el CVV, solo la marca y los últimos 4 dígitos.

## 4. Combo de hotel y tours (1,5 minutos)

- Menú **Combos**. En el panel izquierdo elige **Cabarete**.
  - *Qué decir:* cada combo junta un hotel con las excursiones del destino; el boleto muestra el itinerario por días y el ahorro.
- **Arma tu combo**: cambia la llegada y las noches. El desglose tacha el precio normal de cada parte y muestra el total con descuento.
- **Reservar combo** > paga con **4242 4242 4242 4242**.
  - *Qué decir:* se crean tres reservas (hotel, Damajagua y teleférico) en una sola transacción, cada una con su código; si la tarjeta se rechaza no se crea ninguna.

## 5. Tienda y ruta (1,5 minutos)

- Menú **Tienda**: filtra **Larimar**, agrega el colgante y, en **Todo**, un café de Jarabacoa. Abre el **carrito**, elige **A domicilio** (RD$450) y paga.
  - *Qué decir:* las existencias se descuentan en la misma transacción que el cobro; el pedido se sigue desde *Mis reservas* y la administración lo marca como enviado y entregado.
- Menú **En ruta**: filtra **Quesos de campo** y muestra la **asistencia vial** (911, *462 y grúas por provincia).
- En **Actividades**, categoría **Alquiler de equipo de aventura**: el kit de camping se reserva por equipos, no por personas.

## 6. Alquiler de auto (1 minuto)

- Menú **Autos** > abre cualquier vehículo.
- Cambia la **edad del conductor** a 23, la **devolución** a otra ciudad y marca **GPS**.
  - *Qué decir:* el desglose (días por bloques de 24 horas, cargo por conductor joven, devolución en otra ciudad, extras) lo calcula el servidor.
- **Reservar ahora** > **Pagar en el mostrador** > **Confirmar reserva**.

## 7. Mis reservas (1 minuto)

- Menú de la cuenta > **Mis reservas**: cada reserva muestra su estado de pago.
- Cancela la reserva del hotel pagada con tarjeta.
  - *Qué decir:* la ventana avisa del reembolso; al confirmar, el pago pasa a *Reembolsado* y el cupo se libera.
- Las tres partes del combo llevan la etiqueta **Combo**. Pestaña **Pedidos**: el pedido de la tienda con su recibo.
- Pestaña **Reseñas**: escribe una reseña de la reserva terminada pendiente.

## 8. Panel de empresa (1,5 minutos)

- **Salir** > **Iniciar sesión** > *Cuentas de demostración* > **Empresa** (Bahía Caribe Tours, `empresa@bookingrd.com`).
- **Resumen:** indicadores y gráfico de ingresos.
- **Reservas recibidas:** columna *Pago*. En la reserva *Senderismo al Salto El Limón* (*Por cobrar en destino*), pulsa **Marcar cobrado**.
  - *Qué decir:* cada empresa solo ve y modifica sus propias reservas; el filtro se aplica en el servidor con el id de empresa del token.
- **Reseñas:** filtra *Sin responder* y responde una.

## 9. Administración (1 minuto)

- **Salir** > **Administración** (`admin@bookingrd.com` / `Admin123!`).
- **Resumen:** *Cobrado en línea*, lo pendiente en destino y lo reembolsado.
- **Tienda:** marca el pedido como enviado.
- **Empresas:** suspende una empresa, abre Explorar en otra pestaña y muestra que sus publicaciones desaparecieron; reactívala.

## 10. Cierre (30 segundos)

- Botón **ES / RD$** del encabezado: cambia a **inglés** y **US$**. Los precios se convierten con la tasa del día.
- En el mismo menú, español e inglés aparecen destacados arriba (traducción propia). Debajo, **Más idiomas**: elige *Français* o *Kreyòl ayisyen*; la página se traduce automáticamente (necesita internet).
  - *Qué decir:* el pago se hace en pesos o en dólares; en la ventana de pago se elige la moneda y el recibo guarda la tasa aplicada.
- *Qué decir:* Node.js + Express por capas, SQL Server o Azure SQL Database (instalación en un clic, con una base local de respaldo), HTML, CSS y JavaScript sin frameworks, contraseñas con bcrypt y sesiones con JWT.

## Si algo falla

| Situación | Qué hacer |
|---|---|
| La página dice que el servidor no está en ejecución | Doble clic en `INICIAR-BookingRD.bat` y recarga |
| El clima, el estado del mar o el resumen del destino no aparecen | No hay internet o el servicio no responde; el resto funciona igual (los feriados usan una lista de respaldo) |
| El mapa sale gris con el contorno del país | No cargan los mosaicos de OpenStreetMap ni los de Esri (sin internet); los precios del mapa siguen funcionando |
| Una fecha no tiene disponibilidad | Elige otras fechas o menos personas |
| Los datos quedaron alterados por los ensayos | `npm run bd:reiniciar` (SQL Server) o `npm run local:reiniciar` (base local) |
| La consola dice "Base de datos local" y querías SQL Server | `npm run sqlserver`; revisa que el servicio de SQL Server esté iniciado |
