# BookingRD: resumen del proyecto

**Estado:** Fase 1 lista para publicarse en GitHub. Pendiente la primera ejecución contra la base de Azure (ver "Pendientes").

## Qué es

Plataforma web de alojamiento, tours y actividades de aventura en República Dominicana. Los viajeros consultan la oferta; las empresas turísticas se registran para publicar sus habitaciones y actividades.

**Stack:** Node.js + Express, Azure SQL Database / SQL Server (`mssql`), HTML + CSS + JavaScript sin frameworks, bcrypt + JWT.

## Implementado en la Fase 1

| Parte | Detalle |
|---|---|
| Página de inicio | Buscador, indicadores en tiempo real, menú *Servicios* por categoría, vitrina fotográfica (hoteles y resorts, villas y cabañas, tours de playa, montaña y gastronómicos, zip line, motocross y buggies, actividades acuáticas), publicaciones, *Sobre nosotros*, llamado a empresas y *Contacto*. Sin publicaciones, cada sección lo indica. |
| Registro | Viajero: nombre, correo y contraseña. Empresa: tres pasos con representante (nombre, cargo, contacto), datos legales (razón social, RNC, provincia, dirección, licencia MITUR opcional) y servicios: *Alojamiento*, *Actividades* o *Mixto*, que habilitan tipo de alojamiento y habitaciones y/o categorías de actividades. |
| Inicio de sesión | Pantalla completa con fotografías en transición, tarjeta translúcida, *Recordarme* y ayuda para recuperar la contraseña. |
| Contacto | Formulario que guarda los mensajes en la base de datos. |
| Base de datos | Tablas `usuarios`, `empresas`, `hoteles`, `actividades`, `mensajes_contacto`. Script idempotente con dos cuentas de demostración. |
| Base compartida | Azure SQL Database (oferta gratuita). Asistente `npm run configurar`. |

## Organización del frontend

- Tres páginas: `index.html`, `registro.html`, `login.html`, cada una con su propia hoja de estilos en `public/css/` (mismo nombre).
- Paleta y tipografía institucionales en todo el sitio; sin librerías de iconos; animaciones sencillas en botones, menús, tarjetas y formularios.
- Diseño responsive (375 a 1440 px).

## Verificación

- 50 de 50 flujos de interfaz correctos contra el backend real con una capa de datos simulada; 0 errores de JavaScript; 0 desbordamientos.
- Script SQL y consultas validados sintácticamente como T-SQL.

## Pendientes

1. **Crear la base en Azure y ejecutar `npm run configurar`** (README, sección 3.A). El script SQL no se ha ejecutado aún contra un motor real.
2. **Reemplazar las fotografías provisionales** de tours gastronómicos, zip line y motocross en `public/img/servicios/` (mismo nombre de archivo).
3. **Publicar el repositorio en GitHub** e invitar a los integrantes (README, sección 5).
4. **Siguiente fase:** publicación de servicios por las empresas, reservas con control de cupo, recuperación de contraseña por correo y panel de administración.
