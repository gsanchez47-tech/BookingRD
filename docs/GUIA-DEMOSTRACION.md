# Guía de demostración en clase

Recorrido de unos 10 minutos por BookingRD en modo de demostración, con los tres roles (viajero, empresa y administración) y el pago simulado. Cada paso indica qué hacer y qué conviene decir.

## Antes de empezar

1. En la carpeta del proyecto: `npm start`. La consola debe decir *Modo de demostración*.
2. Abre <http://localhost:3000> en el navegador, a pantalla completa. Si vas a proyectar, usa un zoom del 100 al 110 %.
3. Ten a mano esta guía y las tarjetas de prueba:

| Número | Resultado |
|---|---|
| 4242 4242 4242 4242 | Visa aprobada |
| 5555 5555 5555 4444 | Mastercard aprobada |
| 4000 0000 0000 9995 | Fondos insuficientes |
| 4000 0000 0000 0002 | Rechazada por el banco |

Vencimiento: cualquier fecha futura (por ejemplo 12/30). CVV: 123.

Si algo se desordena durante los ensayos, detén el servidor con `Ctrl + C` y vuelve a ejecutar `npm start`: los datos vuelven a su estado original.

## 1. El inicio (1 minuto)

- Muestra la portada: foto de playa, buscador de alojamiento, actividades o autos.
- Baja al **mapa de la isla** y toca **Punta Cana**, luego **Jarabacoa**.
  - *Qué decir:* la ficha cuenta en tiempo real cuántos alojamientos, actividades y autos hay en cada destino y muestra el clima del momento (Open-Meteo).
- Baja hasta las cifras, los destinos y los recomendados.

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

## 4. Alquiler de auto (1 minuto)

- Menú **Autos** > abre cualquier vehículo.
- Cambia la **edad del conductor** a 23, la **devolución** a otra ciudad y marca **GPS**.
  - *Qué decir:* el desglose (días por bloques de 24 horas, cargo por conductor joven, devolución en otra ciudad, extras) lo calcula el servidor.
- **Reservar ahora** > **Pagar en el mostrador** > **Confirmar reserva**.

## 5. Mis reservas (1 minuto)

- Menú de la cuenta > **Mis reservas**: cada reserva muestra su estado de pago.
- Cancela la reserva del hotel pagada con tarjeta.
  - *Qué decir:* la ventana avisa del reembolso; al confirmar, el pago pasa a *Reembolsado* y el cupo se libera.
- Pestaña **Reseñas**: escribe una reseña de la reserva terminada pendiente.

## 6. Panel de empresa (1,5 minutos)

- **Salir** > **Iniciar sesión** > *Cuentas de demostración* > **Empresa** (Bahía Caribe Tours, `empresa@bookingrd.com`).
- **Resumen:** indicadores y gráfico de ingresos.
- **Reservas recibidas:** columna *Pago*. En la reserva *Senderismo al Salto El Limón* (*Por cobrar en destino*), pulsa **Marcar cobrado**.
  - *Qué decir:* cada empresa solo ve y modifica sus propias reservas; el filtro se aplica en el servidor con el id de empresa del token.
- **Reseñas:** filtra *Sin responder* y responde una.

## 7. Administración (1 minuto)

- **Salir** > **Administración** (`admin@bookingrd.com` / `Admin123!`).
- **Resumen:** *Cobrado en línea*, lo pendiente en destino y lo reembolsado.
- **Empresas:** suspende una empresa, abre Explorar en otra pestaña y muestra que sus publicaciones desaparecieron; reactívala.

## 8. Cierre (30 segundos)

- Botón **ES / RD$** del encabezado: cambia a **inglés** y **US$**. Los precios se convierten con la tasa del día; el pago sigue en pesos.
- *Qué decir:* Node.js + Express por capas, Azure SQL Database (con un modo en memoria para presentar sin base), HTML, CSS y JavaScript sin frameworks, contraseñas con bcrypt y sesiones con JWT.

## Si algo falla

| Situación | Qué hacer |
|---|---|
| La página dice que el servidor no está en ejecución | Ejecuta `npm start` y recarga |
| El clima no aparece | No hay internet o Open-Meteo no responde; el resto funciona igual |
| Una fecha no tiene disponibilidad | Elige otras fechas o menos personas |
| Los datos quedaron alterados por los ensayos | `Ctrl + C` y `npm start` |
