# Guía: base de datos gratuita en Azure para BookingRD

Esta guía parte de cero: sin cuenta de Azure y sin base creada. Al terminar, la base `BookingRD` queda en Azure SQL Database con todas las tablas y los datos de demostración, y el sitio funciona en <http://localhost:3000> conectado a ella. Se hace una sola vez y la hace un integrante del equipo; los demás solo reciben el archivo `.env` (paso 6).

Para ver el sitio sin base de datos no hace falta nada de esto: `npm install` y `npm start` lo arrancan en modo de demostración (README, sección 1).

Tiempo aproximado: 20 minutos.

---

## 1. Lo que se necesita

| Requisito | Detalle |
|---|---|
| Cuenta de Azure | La [cuenta gratuita de Azure](https://azure.microsoft.com/free) o la suscripción **Azure for Students** (con el correo de la universidad). La suscripción *Azure for Students Starter* **no** admite la base gratuita. |
| Node.js 18 o superior | <https://nodejs.org> (versión LTS). Comprobar con `node -v`. |
| El proyecto | La carpeta `BookingRD` extraída del `.zip` (no abierta dentro del `.zip`) y, dentro de ella, `npm install`. |

### Lo que incluye la oferta gratuita

Cada mes y por cada base: 100.000 segundos de vCore de cómputo, 32 GB de datos y 32 GB de copias de seguridad, sin costo y sin fecha de vencimiento. Se pueden tener hasta 10 bases gratuitas por suscripción.

La base **se pausa sola tras un rato sin uso** y se reanuda con la siguiente conexión. Mientras está pausada no gasta cómputo. El servidor de BookingRD cierra sus conexiones a los 30 segundos de inactividad, así que no impide la pausa.

---

## 2. Crear la base gratuita

1. Entrar a <https://portal.azure.com> con la cuenta de Azure.
2. Buscar **SQL databases** en la barra superior, elegir **Create** y, en el aviso azul de la parte superior del formulario, **Apply offer**.
3. Pestaña **Basics**:
   - **Subscription**: la suscripción gratuita o de estudiantes.
   - **Resource group**: *Create new* y escribir `bookingrd-rg`.
   - **Database name**: `BookingRD` (exactamente así).
   - **Server**: *Create new*.
     - **Server name**: un nombre único en minúsculas, por ejemplo `bookingrd-tunombre`. Será `bookingrd-tunombre.database.windows.net`.
     - **Location**: la región más cercana, por ejemplo *(US) East US 2*.
     - **Authentication method**: **Use SQL authentication** (o *Use both SQL and Microsoft Entra authentication*). **No** elegir *Microsoft Entra-only*: BookingRD se conecta con usuario y contraseña.
     - **Server admin login**: por ejemplo `bookingrdadmin`. No se permiten nombres como `admin` o `sa`.
     - **Password**: al menos 8 caracteres con mayúsculas, minúsculas, números y un símbolo.
     - Anotar el nombre del servidor, el usuario y la contraseña: se piden en el paso 4.
   - **Behavior when free limit reached**: **Auto-pause the database until next month**. Así nunca se cobra nada.
4. Pestaña **Networking** (si aparece):
   - **Connectivity method**: **Public endpoint**.
   - **Add current client IP address**: **Yes**.
5. **Review + create** y luego **Create**. La creación tarda de 2 a 5 minutos. Al terminar, **Go to resource**.
6. En **Overview** comprobar que **Pricing tier** dice *General Purpose - Serverless* y que aparece **Free amount remaining**.

### Si el formulario no tenía pestaña Networking

Abrir el servidor (en **Overview** de la base, el enlace **Server name**) y entrar a **Security > Networking**:

1. **Public network access**: **Selected networks**.
2. **Firewall rules**: **Add your client IPv4 address**.
3. **Save**.

---

## 3. Datos que se necesitan

| Dato | Dónde está | Ejemplo |
|---|---|---|
| Servidor | **Server name** en el Overview de la base | `bookingrd-tunombre.database.windows.net` |
| Base de datos | Nombre de la base | `BookingRD` |
| Usuario | **Server admin** en el Overview del servidor | `bookingrdadmin` |
| Contraseña | La elegida en el paso 2 | |

---

## 4. Cargar la base (un solo comando)

En una terminal abierta en la carpeta `BookingRD`:

```bash
npm install
npm run configurar
```

El asistente pregunta los cuatro datos del paso 3. Luego:

1. Genera el archivo `.env` con la conexión y una clave segura para las sesiones (`JWT_SECRET`).
2. Prueba la conexión. La primera vez puede tardar hasta un minuto porque la base se está reanudando.
3. Pregunta **¿Crear o actualizar las tablas ahora? (s/n)**: responder `s`. Ejecuta los 324 lotes del script (tablas, índices y datos de demostración) y al final muestra cuántos registros tiene cada tabla.

Conteos esperados con los datos de demostración:

| Tabla | Registros |
|---|---|
| usuarios | 21 |
| empresas | 8 |
| imagenes | 0 |
| hoteles | 16 |
| actividades | 50 |
| vehiculos | 11 |
| combos | 7 |
| reservas | 93 |
| pagos | 93 |
| resenas | 74 |
| favoritos | 6 |
| mensajes_contacto | 2 |
| productos | 11 |
| pedidos | 2 |
| pedido_detalle | 4 |

### Alternativa: cargar el script a mano

1. Conectarse al servidor con SSMS, Azure Data Studio o el **Query editor** del portal, con **SQL Server Authentication** y el usuario del administrador. En SSMS, en **Options > Connection Properties**, elegir la base `BookingRD`.
2. Abrir `database/instalacion-azure.sql` y ejecutarlo completo.
3. Crear el `.env` con `npm run configurar` y responder `n` a la pregunta de las tablas.

No usar `database/instalacion-completa.sql` en Azure: sus primeras secciones (crear la base y el login) son para un SQL Server local y Azure las rechaza.

---

## 5. Encender el sitio

```bash
npm start
```

La consola ya no dice "Modo de demostración": los datos vienen de Azure. Abrir <http://localhost:3000>.

| Rol | Correo | Contraseña |
|---|---|---|
| Administración | admin@bookingrd.com | Admin123! |
| Viajero | cliente@bookingrd.com | Cliente123! |
| Empresa | empresa@bookingrd.com | Empresa123! |
| Alquiler de autos | autos@bookingrd.com | Empresa123! |

Cerrar el Query editor y SSMS al terminar, porque una conexión abierta impide la pausa automática.

---

## 6. El resto del equipo

1. Quien creó la base envía el archivo `.env` por un canal privado (mensaje directo, nunca el repositorio).
2. Cada integrante copia `.env` en la carpeta `BookingRD` y ejecuta `npm install`.
3. Cada integrante autoriza su IP: servidor > **Security > Networking > Add your client IPv4 address > Save**. Hace falta una regla por cada red (casa, universidad).
4. Comprobar con `npm run bd:probar` y encender con `npm start`.

---

## 7. Problemas frecuentes

| Mensaje | Causa | Solución |
|---|---|---|
| `Client with IP address 'x.x.x.x' is not allowed to access the server` | La IP no está en el firewall | Agregarla en **Security > Networking > Firewall rules** y repetir `npm run configurar` |
| `Login failed for user` | Contraseña incorrecta, o servidor *Microsoft Entra-only* | Servidor > **Settings > Microsoft Entra ID**: desmarcar *Support only Microsoft Entra authentication*; luego **Overview > Reset password** |
| `getaddrinfo ENOTFOUND` | Nombre del servidor mal escrito | Copiar **Server name** del Overview |
| `Database 'BookingRD' on server ... is not currently available` | La base se está reanudando | Esperar un minuto y reintentar |
| `ETIMEOUT` | La red bloquea el puerto 1433 (común en universidades o empresas) | Probar desde otra red o con los datos del celular |
| `Invalid column name` o conteos distintos a los esperados | La base tiene tablas de una versión anterior de BookingRD | `npm run bd:reiniciar` (borra los datos de BookingRD y reinstala) |
| La base dice *Paused* hasta el mes siguiente | Se agotó el cómputo gratuito del mes | Esperar al día 1, o usar `npm run demo` mientras tanto |

---

## 8. Volver a cargar o actualizar los datos

- `npm run bd:instalar`: ejecuta de nuevo el script. Es idempotente: no duplica los datos de demostración y conserva lo que el equipo haya creado.
- `npm run bd:reiniciar`: elimina las tablas de BookingRD y reinstala desde cero. Pide escribir el nombre de la base para confirmar.

Fuentes: [Azure SQL Database free offer (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer) y [preguntas frecuentes de la oferta gratuita](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer-faq).
