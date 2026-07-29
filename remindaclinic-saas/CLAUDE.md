# RemindaClinic SaaS

SaaS **multi-tenant** para gestionar citas de clínicas y **enviar recordatorios**
a los pacientes por **WhatsApp / SMS / correo**, con el fin de reducir las
inasistencias ("no-shows"). Integra **Google Calendar** (sincroniza cada cita
como evento) y la **WhatsApp Cloud API** (plantillas + webhooks de estado y
respuestas del paciente).

> Distinto del prototipo `remindaclinic/` (serverless, solo `localStorage`).
> Este es el producto con backend real.

## Stack

- **Frontend:** Next.js (App Router, TypeScript) — app web para recepción.
- **Backend/DB:** Supabase (Postgres + Auth + RLS). Aislamiento por `clinic_id`.
- **Jobs:** cron (Vercel Cron o `pg_cron`) → `POST /api/cron/dispatch-reminders`.
- **Webhooks:** `/api/webhooks/whatsapp` (verificación GET + estados/respuestas POST).
- **Mensajería:** capa `lib/messaging` con adaptador `mock` (por defecto) y
  `cloud` (WhatsApp Cloud API). Los recordatorios son *business-initiated* →
  se envían con **plantillas aprobadas (HSM)**.
- **Calendario:** Google Calendar API (OAuth 2.0), one-way en v1 (app → Google).

## Estado actual

- ✅ **Capa de datos** (Supabase): esquema, índices, trigger de recordatorios y
  RLS multi-tenant — **verificada** contra Postgres 16 (`scripts/verify-db.sh`).
- ⏳ **Frontend Next.js + rutas API + integraciones**: pendiente. El registro de
  npm está **bloqueado** por la política de egress de este entorno remoto, así
  que la app no se puede instalar/compilar aquí (ver README → "Entorno").

## Modelo de datos

Ver `supabase/migrations/0001_init.sql`. Tablas: `clinics`, `profiles`,
`professionals`, `patients`, `appointments`, `reminders`, `message_templates`,
`google_integrations`, `whatsapp_integrations`, `inbound_messages`, `settings`.

- Todo cuelga de `clinic_id` y está protegido con **RLS**
  (`current_clinic_id()` resuelve la clínica del usuario autenticado).
- Los tokens (`google_integrations`, `whatsapp_integrations`) solo son visibles
  para `owner`/`admin`; el backend los lee con `service_role`.
- **Trigger `enqueue_reminders`**: al crear/mover una cita, genera filas
  `reminders` según `settings.hours_before` (p. ej. `{24,2}` h antes).

## Flujo del recordatorio

1. Se agenda/mueve una cita → el trigger crea `reminders` pendientes.
2. `pg_cron`/Vercel Cron llama a `/api/cron/dispatch-reminders`.
3. Toma pendientes vencidos → envía plantilla WhatsApp → marca `sent`.
4. Webhook actualiza `delivered/read/failed`.
5. Respuesta del paciente ("SÍ"/"CANCELAR") → `confirmed` / `cancelled`.

## Convenciones

- Español (es-CL). `timestamptz` en UTC; se muestra en la TZ de la clínica.
- Multi-tenant estricto: **toda** consulta de negocio filtra por `clinic_id`
  vía RLS. El cliente usa la `anon key`; el backend la `service_role` solo en
  webhooks/cron.
- Teléfonos en E.164 (Chile: `+56…`).

## Verificar la base de datos

```bash
./scripts/verify-db.sh   # levanta un Postgres efímero y corre trigger + RLS
```
