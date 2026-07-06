# Demo funcional — Plataforma de gestión de eventos y ticketing (Chile)

Implementación mínima pero **end-to-end** del MVP descrito en
`docs/saas-event-ticketing/DISENO.md`: crear evento → vender entradas →
pagar → generar ticket con código de acceso → hacer check-in → ver
estadísticas. Sin build step, sin dependencias externas: solo Node.js.

## Por qué no usa Express / una librería de QR real

Este sandbox no tiene salida a internet hacia `registry.npmjs.org`,
`pypi.org` ni CDNs (`npm install` devuelve 403 por política de egress de la
sesión). Por eso el servidor está escrito solo con módulos nativos de Node
(`http`, `fs`, `crypto`) y no hay ninguna dependencia en `package.json`.

Consecuencia concreta: **la imagen "QR" de cada ticket no es un QR real**
(no implementa el estándar ISO/IEC 18004 — habría que reproducir de memoria
la corrección Reed-Solomon sin forma de verificar que decodifique bien, lo
cual es peor que ser explícito al respecto). En su lugar:

- Cada ticket tiene un **código alfanumérico único** (ej. `Y9XK-XVK-7G5`),
  que es el dato real que valida el acceso.
- La imagen junto al código es un patrón determinista con estética de QR
  (mismo código → mismo dibujo), solo para que la pantalla del ticket se
  vea como se vería en producción.
- El check-in valida **por código** (escribiéndolo o pegándolo), que es
  además un fallback real que casi todo software de control de acceso
  soporta cuando la cámara falla.

Ver `src/qr.js` para el detalle y el comentario de diseño.

De la misma forma, **Transbank Webpay Plus y Flow están simulados**: no hay
credenciales de comercio ni llamadas de red salientes. El flujo de pantallas
sí replica la arquitectura real (redirect a una pantalla "del medio de
pago" + confirmación que dispara la emisión del ticket) para que sea fácil
reemplazar la simulación por los SDKs reales sin rediseñar el resto.

## Cómo correrlo

```bash
cd demo-event-ticketing
node src/seed.js     # (opcional) reinicia los datos y crea un evento de ejemplo publicado
node src/server.js   # sirve en http://localhost:8787
```

Sin `seed.js`, arranca con una base de datos vacía (`data/db.json`, se crea
sola) y todo se puede armar desde el panel del organizador.

## Recorrido sugerido

1. **`/admin`** — crea un evento (o usa el de ejemplo `DevChile Summit
   2026`), define tipos de entrada con precio/stock, agrega un código
   promocional opcional, y publícalo.
2. **`/`** — el evento publicado aparece en la vitrina pública.
3. **`/e/:slug`** — selecciona cantidad de entradas, ingresa datos del
   comprador y un código promocional (ej. `EARLYBIRD`, 20% dto., viene en
   el evento de ejemplo).
4. **`/pay/:orderId`** — elige Webpay Plus o Flow (ambos simulados), "paga"
   en la pantalla simulada del medio de pago.
5. **`/orders/:id`** — confirmación con los tickets generados (código +
   imagen tipo QR).
6. **`/checkin`** — pega el código de un ticket y valida el acceso en vivo;
   reintentar el mismo código muestra "ya utilizado". El contador de aforo
   se actualiza al toque.
7. **`/admin`** de nuevo → "Ver estadísticas" para ver ingresos, entradas
   vendidas/disponibles por tipo, tasa de asistencia y órdenes recientes.

## Qué es real en esta demo (y qué no)

| Área | Estado |
|---|---|
| Modelo de datos (Event, TicketType, Order, Ticket, PromoCode) | Real, persistido en `data/db.json` |
| Reserva de stock / prevención de oversell | Real (reserva atómica en el mismo tick de Node al iniciar el checkout, liberada si se cancela/expira) |
| Códigos promocionales (%, límite de usos) | Real |
| Emisión de ticket con código único | Real |
| Check-in con prevención de doble ingreso | Real |
| Dashboard / reportes | Real, calculado en vivo desde los datos |
| Pasarela de pago (Webpay Plus / Flow) | **Simulada** — no hay integración real ni credenciales |
| Imagen QR | **Estilizada**, no es un QR ISO decodificable por un lector real |
| Boleta/factura electrónica SII | No implementada en esta demo (documentada como decisión en el diseño) |
| Multi-tenant / RLS | No implementada (single-tenant para simplificar la demo) |

## Estructura

```
src/server.js    Servidor HTTP + router (sin framework)
src/domain.js    Reglas de negocio: eventos, checkout, pagos, check-in, stats
src/store.js     Persistencia en data/db.json + helpers de IDs/slugs
src/qr.js        Generador de imagen tipo QR (ver nota arriba)
src/seed.js      Reinicia datos y crea un evento de ejemplo publicado
public/          Front-end (HTML + JS vanilla, sin build step)
```
