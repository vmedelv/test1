# 🩺 RemindaClinic SaaS

SaaS multi-tenant para gestionar citas de clínicas y **enviar recordatorios** a
los pacientes por **WhatsApp / SMS / correo**, reduciendo las inasistencias.
Integra **Google Calendar** y la **WhatsApp Cloud API**.

- **Frontend:** Next.js (App Router, TypeScript)
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Mensajería:** WhatsApp Cloud API (adaptador `mock` por defecto)
- **Calendario:** Google Calendar API (OAuth 2.0)

## Estado

| Módulo | Estado |
|---|---|
| Esquema Supabase + RLS + trigger de recordatorios | ✅ implementado y **verificado** (`scripts/verify-db.sh`) |
| App Next.js, rutas API, integraciones WhatsApp/Google | ⏳ pendiente (ver "Entorno") |

## Arquitectura

```
Web app (Next.js, recepción)
        │  Supabase JS (anon key, RLS por clinic_id)
        ▼
Supabase / Postgres  ── trigger enqueue_reminders ──► tabla reminders
        │  pg_cron / Vercel Cron
        ▼
/api/cron/dispatch-reminders ──► WhatsApp Cloud API ──► paciente
        ▲                                   │
        │        /api/webhooks/whatsapp  ◄──┘ (estados + respuestas)
        │
/api/google/oauth/callback ──► Google Calendar (sync de eventos)
```

Detalle del modelo de datos y flujos en [`CLAUDE.md`](./CLAUDE.md).

## Base de datos

Migraciones en `supabase/migrations/`:

- `0001_init.sql` — esquema, índices, `updated_at`, settings por clínica y el
  trigger `enqueue_reminders`.
- `0002_rls.sql` — RLS multi-tenant + políticas (incluye ocultar tokens a
  `reception`).

### Aplicar en Supabase

```bash
# Con Supabase CLI:
supabase db push
# o pega el contenido de cada archivo en el SQL Editor, en orden.
```

### Verificar localmente (sin Docker ni red)

```bash
./scripts/verify-db.sh
```

Levanta un Postgres 16 efímero, aplica un stub del esquema `auth` de Supabase,
corre las migraciones y ejecuta pruebas de:

- trigger de recordatorios (crear, mover, cancelar cita),
- aislamiento multi-tenant por RLS,
- bloqueo de escritura cruzada entre clínicas,
- visibilidad de tokens solo para `owner`/`admin`.

## Puesta en marcha (app)

> Requiere red hacia el registro de npm (ver "Entorno").

```bash
cp .env.example .env.local   # completa las claves
npm install
npm run dev                  # http://localhost:3000
```

Variables en [`.env.example`](./.env.example): Supabase, `CRON_SECRET`,
WhatsApp Cloud API (`WHATSAPP_PROVIDER=mock` para no enviar nada real) y Google
OAuth.

## Entorno

Este repositorio se desarrolla en un entorno remoto cuyo **egress bloquea el
registro de npm** (`registry.npmjs.org` responde 403). Por eso la app Next.js
**no se puede instalar ni compilar dentro del entorno**; la capa de base de
datos sí se valida allí porque usa el Postgres local. Para trabajar el frontend:
instala/compila en una máquina o CI con acceso a npm, o habilita
`registry.npmjs.org` en la política de red del entorno.
