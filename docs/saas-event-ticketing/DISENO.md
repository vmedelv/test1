# Plataforma SaaS de Gestión de Eventos y Venta de Tickets — Chile

> Propuesta de diseño de producto y arquitectura, en base al prompt de especificación
> del sistema. Contexto fijado: **Chile**, con **Transbank Webpay Plus** y **Flow**
> como pasarelas de pago prioritarias.

## 0. Supuestos y variables resueltas

Antes de entrar al diseño, se fijan explícitamente las variables que el prompt
original dejaba abiertas (`⟨…⟩`). Donde no hay dato de negocio confirmado, se
deja una recomendación por defecto marcada como **[supuesto]** — hay que
validarla con el dueño del producto antes de comprometerla en contratos o
pricing.

| Variable | Resolución |
|---|---|
| País / normativa | **Chile**. Datos personales: Ley 19.628 y Ley 21.719 (nueva ley de protección de datos, entrada en vigor en tramos hasta 2026). Facturación: boleta/factura electrónica vía SII. |
| Pasarelas de pago | **Transbank Webpay Plus** (tarjetas, obligatorio de facto en Chile) + **Flow** (agregador: Webpay, Mercado Pago, Onepay, transferencia, Servipag/Multicaja). Stripe/PayPal solo para eventos con audiencia internacional o cobro en USD. |
| Stack | El sugerido en el prompt: Next.js + TypeScript + Tailwind (front), NestJS + PostgreSQL + Redis (back), S3-compatible para archivos, colas para async. |
| Volumen esperado | **[supuesto]** diseño para organizador mediano-grande: picos de hasta ~20.000 checkouts/hora en apertura de venta de un evento masivo, catálogo total de cientos de tenants. Si el volumen real es menor, se puede lanzar sin varias de las medidas de escalado de la sección 8. |
| Comisión de la plataforma | **[supuesto]** modelo tipo Eventbrite/Passline: % sobre el valor del ticket (sugerido 5–8%) + monto fijo por ticket (ej. CLP 300–500), configurable por plan y trasladable al comprador o absorbido por el organizador (a elección del organizador). Se modela como campo de configuración, no hardcodeado. |

---

## 1. Resumen ejecutivo

Se propone una plataforma SaaS **multi-tenant** (una organización = un tenant)
para gestión integral de eventos: creación de eventos y landing pages, venta de
entradas con múltiples tipos y códigos promocionales, agenda/programación,
control de acceso por QR, pagos vía Transbank/Flow con conciliación y
liquidación al organizador, y reportería.

Enfoque de entrega: **MVP delgado y vertical** — un organizador puede crear un
evento, vender entradas pagadas con Webpay Plus, emitir el ticket con QR,
hacer check-in en la puerta y ver un dashboard de ventas — antes de invertir en
todo lo "ancho" (multi-moneda, proveedores, marketing, SSO, etc.), que se
empuja a v1/v2.

Decisión de arquitectura más relevante para el contexto chileno: usar
**Transbank Webpay Plus** como medio de pago principal en el MVP (el
organizador o la plataforma es el comercio afiliado), y evaluar en v1 **Webpay
Plus MALL** o el **API de marketplace de Flow** para automatizar el *split* de
pago (comisión de la plataforma se descuenta al momento del pago, en vez de
liquidar manualmente después). Ver sección 6 y 7.4 para el detalle.

---

## 2. Arquitectura

### 2.1 Vista de componentes

```
                                   ┌─────────────────────────┐
                                   │        CDN / Edge        │
                                   │ (landing pages públicas,  │
                                   │  assets, imágenes evento) │
                                   └────────────┬─────────────┘
                                                │
        ┌───────────────────────────────────────┼───────────────────────────────────────┐
        │                                Next.js (Frontend)                              │
        │  - Sitio público del evento (SSR/ISR, SEO, Open Graph)                          │
        │  - Checkout de compra de entradas                                               │
        │  - Panel del organizador (dashboard)                                            │
        │  - App/vista de check-in (PWA, soporta offline)                                 │
        └───────────────────────────────────────┬───────────────────────────────────────┘
                                                 │ REST/GraphQL (HTTPS, JWT)
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────────────┐
        │                              API Gateway / BFF (NestJS)                        │
        │        Auth, rate limiting, resolución de tenant (subdominio/dominio)          │
        └───────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┘
                │           │           │           │           │           │
                ▼           ▼           ▼           ▼           ▼           ▼
          ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐
          │ Events  │ │ Ticketing │ │ Agenda  │ │ Payments│ │ Check-in│ │ Messaging │
          │ Service │ │  Service  │ │ Service │ │ Service │ │ Service │ │  Service  │
          └────┬────┘ └─────┬─────┘ └────┬────┘ └────┬────┘ └────┬────┘ └─────┬─────┘
               │            │            │           │           │           │
               └────────────┴─────┬──────┴─────┬─────┴─────┬─────┴─────┬─────┘
                                   ▼             ▼           ▼           ▼
                          ┌────────────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐
                          │  PostgreSQL    │ │ Redis  │ │  Cola    │ │  S3       │
                          │ (RLS por       │ │(cache, │ │(BullMQ:  │ │(imágenes, │
                          │  tenant_id)    │ │ locks  │ │ emails,  │ │ PDFs,     │
                          │                │ │ stock) │ │ PDFs,QR, │ │ export)   │
                          │                │ │        │ │ webhooks)│ │           │
                          └────────────────┘ └────────┘ └─────┬────┘ └──────────┘
                                                                │
                                          ┌─────────────────────┼─────────────────────┐
                                          ▼                     ▼                     ▼
                                  ┌──────────────┐     ┌────────────────┐   ┌──────────────────┐
                                  │ Transbank     │     │  Flow (agrega- │   │  Emisor boleta/    │
                                  │ Webpay Plus   │     │  dor de medios │   │  factura electró-  │
                                  │ (+ Mall en v1)│     │  de pago)      │   │  nica (proveedor    │
                                  │               │     │                │   │  homologado SII)    │
                                  └──────────────┘     └────────────────┘   └──────────────────┘
```

### 2.2 Multi-tenancy

- **Estrategia recomendada para el MVP:** *shared database, shared schema*,
  con `tenant_id` (= `organization_id`) en cada tabla y **Row-Level Security
  (RLS)** de PostgreSQL activada por tenant. Es la opción más barata de operar
  y escalar horizontalmente para SaaS con muchos tenants pequeños/medianos.
- **Alternativa evaluada:** schema-per-tenant. Se descarta para el MVP por el
  costo operativo de migraciones (cientos de schemas) — se deja como
  posibilidad para tenants "enterprise" que exijan aislamiento físico fuerte
  (se puede migrar un tenant puntual a schema/BD propia sin rediseñar el resto).
- Resolución de tenant: por subdominio (`{slug}.tudominio.cl`) y, en el MVP,
  también por dominio custom vía CNAME + verificación (para el plan superior).
- Aislamiento de archivos (S3): prefijo `tenant_id/` + bucket policies.

### 2.3 Stack técnico

| Capa | Elección | Motivo |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind | SSR/ISR necesario para SEO de landing pages públicas de eventos; un solo framework para sitio público + panel + checkout. |
| Backend | NestJS (Node/TypeScript) | Comparte lenguaje con el frontend, buen soporte de DI/módulos para separar dominios (events, ticketing, payments...), maduro para REST y colas. |
| Base de datos | PostgreSQL | Transaccionalidad fuerte (crítica para stock de entradas y pagos), RLS nativo, JSONB para formularios configurables. |
| Cache / locks | Redis | Cache de landing pages, y **locks distribuidos para control de stock de entradas** (evitar oversell en ventas de alta demanda). |
| Colas | BullMQ sobre Redis | Envío de emails, generación de PDF/QR, webhooks de pago, reconciliación. |
| Storage | S3 (o compatible) | Imágenes de eventos, PDFs de tickets, exports CSV/Excel. |
| Autenticación | JWT + refresh tokens, OAuth2 para SSO (v2) | Estándar, permite emitir tokens de invitado para checkout sin cuenta. |
| Pagos | Transbank Webpay Plus (SDK oficial), Flow (API REST) | Ver sección 6. |
| Facturación electrónica | Proveedor homologado SII (ej. OpenFactura/Haulmer, Bsale, o similar) vía API, **no integración directa al SII** | Integrar directo con el SII (certificado, CAF, firma XML) es un proyecto en sí mismo; delegarlo a un proveedor reduce tiempo de MVP y riesgo de cumplimiento. |
| Infraestructura | Contenedores Docker, orquestados en cloud (ECS/Kubernetes/similar) | Stateless, escalable horizontalmente en picos de venta. |

---

## 3. Modelo de datos

### 3.1 Entidades principales y relaciones

```
Organization (tenant)
 ├─ 1:N User  ──(N:M vía)── Role
 ├─ 1:N Event
 ├─ 1:N Venue
 ├─ 1:N Vendor
 └─ 1:N EmailCampaign

Event
 ├─ N:1 Organization
 ├─ N:1 Venue (opcional si es online)
 ├─ 1:N TicketType
 ├─ 1:N Session ── N:M Speaker
 ├─ 1:N PromoCode
 └─ 1:N Order

TicketType
 ├─ N:1 Event
 └─ 1:N Ticket (vía OrderItem)

Order
 ├─ N:1 Event
 ├─ N:1 Attendee (comprador)
 ├─ 1:N OrderItem ── N:1 TicketType
 ├─ 1:1 Payment
 └─ 0:1 PromoCode aplicado

Ticket
 ├─ N:1 OrderItem
 ├─ N:1 Attendee (asistente real, puede diferir del comprador)
 ├─ 1:1 QRCode (código único)
 └─ 0:N CheckIn

Attendee
 ├─ N:1 Organization (histórico cross-evento, opcional)
 └─ 1:N respuestas a formulario de inscripción (JSONB)

Session
 ├─ N:1 Event
 ├─ N:1 Room (N:1 Venue)
 └─ N:M Speaker

Venue
 └─ 1:N Room

Vendor
 └─ N:M Event (vía tabla EventVendor con estado de cotización)

Payment
 ├─ N:1 Order
 └─ referencia externa (Transbank `token`/`buyOrder`, o Flow `commerceOrder`/`flowOrder`)

CheckIn
 ├─ N:1 Ticket
 └─ auditoría: `scanned_by` (User staff), `scanned_at`, `device_id`, `offline_sync` (bool)

EmailCampaign
 ├─ N:1 Organization
 └─ N:1 Event (opcional, puede ser cross-evento)
```

### 3.2 Campos y estados clave (enums)

- `Event.status`: `draft | published | sold_out | finished | cancelled`
- `Event.type`: `in_person | online | hybrid`
- `Event.recurrence`: `null | { rule: RRULE, parent_event_id }` (eventos recurrentes = un `Event` padre + instancias)
- `TicketType.status`: `active | paused | sold_out | expired`
- `Order.status`: `pending | paid | failed | refunded | partially_refunded | cancelled`
- `Payment.status`: `initiated | authorized | rejected | reversed | refunded`
- `Payment.gateway`: `webpay_plus | flow | stripe | paypal`
- `Ticket.status`: `valid | used | cancelled | transferred`
- `Vendor.quote_status`: `requested | quoted | accepted | rejected | contracted`

### 3.3 Auditoría

Todas las tablas incluyen: `id (uuid)`, `created_at`, `updated_at`,
`created_by (user_id, nullable para acciones de sistema)`, y las de negocio
crítico (`Order`, `Payment`, `Ticket`, `CheckIn`) además llevan una tabla de
eventos de dominio (`*_audit_log`) append-only para trazabilidad de
transacciones (requisito no funcional de la sección 8).

---

## 4. Backlog / Roadmap por fases

### Fase MVP (objetivo: un organizador puede vender y controlar acceso a un evento real)

1. Auth básico (registro organizador, login, roles: admin de cuenta + staff check-in).
2. CRUD de `Event` (single, no recurrente todavía) + landing pública autogenerada con slug.
3. `TicketType` con precio, stock, fechas de venta; entradas gratuitas y pagadas.
4. Checkout como invitado, carrito simple (varias entradas, sin agrupar por tipo aún es aceptable).
5. Integración **Transbank Webpay Plus** (flujo normal, no Mall): confirmación, emisión de ticket PDF+QR, email transaccional.
6. Control de stock con lock en Redis (evitar oversell).
7. Check-in vía escaneo de QR (vista web mobile), prevención de doble ingreso, conteo de aforo en vivo.
8. Dashboard esencial: ventas totales, entradas vendidas vs. disponibles, ingresos netos.
9. Boleta electrónica: integración con un proveedor homologado SII (emisión automática al confirmar pago).
10. Reembolso manual (por soporte, no self-service) para cumplir con SERNAC/ley del consumidor.

### v1 (robustecer ticketing + operación)

- Códigos promocionales (%, monto fijo, límite de usos, vigencia).
- Múltiples tipos de entrada con reglas independientes ya explotadas (VIP, early-bird, cortesía).
- Lista de espera automática cuando se agota el stock.
- Formularios de inscripción configurables (campos custom, condicionales).
- Agenda/programación: sesiones, tracks, salas, asignación de ponentes; "mi agenda" del asistente; export iCal.
- Segunda pasarela: **Flow** (para cubrir transferencia, Mercado Pago, Onepay, pagos en efectivo vía Servipag/Multicaja).
- Reportes exportables (CSV/Excel/PDF), por canal y por código promocional.
- Emails segmentados (recordatorios, cambios, post-evento) y encuesta de satisfacción.
- Eventos recurrentes (series).
- Modo offline de check-in con sincronización posterior.
- Reventa/transferencia de entradas entre asistentes.

### v2 (expansión y ecosistema)

- Gestión de sedes/venues con mapas y planos de sala; gestión de proveedores con flujo de cotización.
- Widget embebible de venta para sitios externos; integración CRM/Mailchimp; píxeles de tracking.
- Automatización de liquidación al organizador: **Webpay Plus Mall** o **Flow marketplace/split payments** (comisión de plataforma descontada en el momento del pago, sin conciliación manual).
- Multi-moneda + Stripe/PayPal para eventos con asistentes internacionales.
- SSO (SAML/OIDC) para cuentas enterprise.
- App nativa o mejora de PWA para check-in con hardware dedicado (lectores QR).
- Panel de analítica avanzada (cohortes, conversión de funnel de compra).

---

## 5. Especificación de API (endpoints principales, REST)

Todas las rutas van bajo `/api/v1`, con tenant resuelto por header/subdominio,
auth vía `Authorization: Bearer <jwt>` salvo donde se indique público.

```
# Eventos
POST   /events                        Crear evento (organizador)
GET    /events/:id                    Detalle (privado, panel organizador)
PATCH  /events/:id                    Editar evento
POST   /events/:id/publish            Publicar (draft -> published)
GET    /public/events/:orgSlug/:eventSlug   Landing pública del evento (sin auth)

# Tipos de entrada
POST   /events/:id/ticket-types
PATCH  /ticket-types/:id
GET    /events/:id/ticket-types       (incluye disponibilidad en tiempo real)

# Checkout / Órdenes
POST   /public/orders                 Crear orden (carrito) — invitado o autenticado
GET    /orders/:id
POST   /orders/:id/apply-promo-code

# Pagos
POST   /orders/:id/payments/webpay/init      -> devuelve token+url de redirección Transbank
POST   /payments/webpay/commit               Webhook/callback de confirmación Transbank
POST   /orders/:id/payments/flow/init        -> devuelve url de pago Flow
POST   /payments/flow/confirmation           Webhook de confirmación Flow (server-to-server)
POST   /orders/:id/refund                    Reembolso (staff/admin)

# Tickets y check-in
GET    /tickets/:id                    Detalle + estado
GET    /tickets/:id/pdf
POST   /checkin/scan                   { qr_code, event_id } -> valida y marca used
GET    /events/:id/checkin/stats       Conteo de aforo en vivo

# Agenda
POST   /events/:id/sessions
POST   /sessions/:id/speakers
GET    /public/events/:eventSlug/agenda

# Reportes
GET    /events/:id/reports/sales?format=csv|xlsx|pdf
GET    /events/:id/reports/attendance

# Administración de cuenta (organización)
POST   /organizations
POST   /organizations/:id/users        Invitar staff con rol
GET    /organizations/:id/billing      Plan, comisión configurada, facturación SaaS
```

**Notas de diseño de API:**
- Los endpoints de pago (`init`/`commit`/`confirmation`) están separados por
  gateway porque Transbank y Flow tienen flujos distintos: Webpay Plus es
  *redirect + commit síncrono* (el navegador vuelve a una `return_url` propia
  y el backend hace `commit` contra Transbank); Flow es *redirect + webhook
  asíncrono* (`urlConfirmation` que Flow llama server-to-server, más
  `urlReturn` para la UX). Esto **no es opcional**: hay que soportar ambos
  patrones desde el diseño del `PaymentService`, no asumir que todo es síncrono.
- Los webhooks de confirmación deben ser **idempotentes** (usar el
  `buyOrder`/`commerceOrder` como clave de dedupe) porque tanto Transbank como
  Flow pueden reintentar la notificación.

---

## 6. Wireframes / descripción de pantallas clave

1. **Landing pública del evento** — hero con imagen de portada, fecha/hora con
   zona horaria, ubicación (o "online"), descripción, selector de tipos de
   entrada con contador de stock, botón "Comprar" fijo (sticky) en mobile.
2. **Checkout** — máximo 3 pasos: (1) selección de cantidad por tipo de
   entrada + código promo, (2) datos del comprador/asistentes (formulario
   configurable), (3) pago (redirección a Webpay o selector de medio en Flow).
   Confirmación en la misma pantalla sin depender solo del email.
3. **Panel del organizador — dashboard** — tarjetas de KPI (ingresos, entradas
   vendidas/disponibles, asistencia esperada), gráfico de ventas en el tiempo,
   accesos rápidos a "Nuevo evento", "Ver check-in en vivo".
4. **Gestión de evento (tabs)** — Detalles / Entradas / Agenda / Formulario de
   inscripción / Promociones / Comunicación / Reportes.
5. **Vista de check-in (mobile-first, PWA)** — cámara a pantalla completa
   para escanear QR, resultado grande en verde/rojo (válido/ya usado/no
   corresponde a este evento), contador de aforo visible, banner de "modo
   offline" cuando no hay conexión.
6. **Mi ticket (asistente)** — QR grande, datos del evento, botón agregar a
   Apple/Google Wallet (v2), botón descargar PDF, opción de transferir (v1).

---

## 7. Riesgos y decisiones técnicas

### 7.1 Oversell de entradas en picos de demanda
**Riesgo:** dos compradores reservan la última entrada en simultáneo.
**Decisión:** reserva de stock con lock optimista en Redis (`DECR` atómico) al
iniciar el checkout, con expiración (ej. 10 min) si no se completa el pago;
confirmación final de stock dentro de la misma transacción de PostgreSQL que
marca la orden como pagada.

### 7.2 PCI-DSS y datos de tarjeta
**Decisión:** la plataforma **nunca** toca el número de tarjeta. Con Webpay
Plus el flujo es *redirect*: Transbank captura los datos de la tarjeta en su
propio dominio. Con Flow, igual (Flow redirige al medio de pago elegido). Esto
reduce el alcance de cumplimiento PCI-DSS a SAQ-A, evitando la certificación
completa.

### 7.3 Boleta/factura electrónica
**Riesgo:** integrar directo con el SII (CAF, firma electrónica, envío XML)
es un proyecto de meses y un riesgo de cumplimiento alto si se hace mal.
**Decisión:** delegar a un proveedor de facturación electrónica homologado
(ej. Haulmer/OpenFactura, Bsale, Defontana) vía su API REST — la plataforma
solo entrega los datos de la transacción y recibe el PDF/folio timbrado.

### 7.4 Comisión de plataforma y liquidación al organizador (Chile-específico)
**Riesgo:** con Webpay Plus "normal", el comercio afiliado (¿la plataforma o
cada organizador?) recibe el 100% del pago — hay que decidir quién es el
comercio afiliado ante Transbank.
- **Opción A (recomendada para MVP):** la plataforma es el comercio afiliado
  único; cobra el 100% al comprador y **liquida manualmente** (transferencia)
  al organizador el neto (venta − comisión), en un ciclo periódico (ej.
  semanal). Simple de implementar, pero agrega trabajo operativo y expone a la
  plataforma a riesgo de custodia de fondos de terceros (revisar si esto
  requiere autorización como "operador de tarjetas de pago" ante la CMF —
  **punto a validar con asesoría legal**, no asumir que es trivial).
- **Opción B (v2):** **Webpay Plus MALL**, donde la plataforma es el comercio
  "padre" y cada organizador es un comercio "hijo" con su propio código de
  comercio Transbank — el split de fondos ocurre automáticamente en la
  transacción. Requiere que cada organizador tenga afiliación propia con
  Transbank, lo que añade fricción de onboarding pero resuelve el riesgo legal
  de custodia de fondos.
- **Alternativa a evaluar en paralelo:** el modelo de **marketplace/split
  payments de Flow**, que permite distribuir un pago entre múltiples
  destinatarios (plataforma + organizador) en la misma transacción.
- Recomendación: **arrancar con Opción A** para no bloquear el MVP con
  onboarding de afiliación Transbank por cada organizador, y migrar a Mall/Flow
  marketplace en cuanto el volumen lo justifique.

### 7.5 Zonas horarias y eventos recurrentes
**Riesgo:** Chile tiene cambios de huso horario (horario de verano) que
rompen cálculos ingenuos de fecha/hora en eventos recurrentes.
**Decisión:** almacenar todo en UTC + `timezone` (IANA, ej.
`America/Santiago`) por evento, y expandir la recurrencia (RRULE) en el
backend, nunca en el cliente.

### 7.6 Multi-tenancy y aislamiento de datos
**Riesgo:** un bug de autorización filtra datos entre organizaciones (crítico
en un SaaS de pagos).
**Decisión:** RLS de PostgreSQL como segunda capa de defensa además del
filtro por `tenant_id` en la capa de aplicación (defensa en profundidad, no
confiar solo en el código de la API).

### 7.7 Picos de tráfico en apertura de venta
**Riesgo:** lanzamientos de venta masiva (ej. entradas para un festival)
generan spikes de 100x el tráfico normal.
**Decisión:** landing pages públicas cacheadas/ISR en CDN, checkout con cola
de espera virtual (v1/v2) si el volumen lo requiere, servicios stateless
detrás de autoscaling.

---

## 8. Próximos pasos sugeridos

1. Validar con negocio los **[supuestos]** de la sección 0 (comisión, volumen,
   si la plataforma o el organizador será el comercio afiliado ante
   Transbank).
2. Definir con legal/CMF si el modelo de custodia de fondos (Opción A de 7.4)
   requiere autorización regulatoria en Chile.
3. Elegir proveedor de facturación electrónica homologado SII.
4. Iniciar el MVP por el módulo de `Event` + `TicketType` + checkout +
   Webpay Plus, que es el camino crítico de negocio (sin venta no hay
   producto).
