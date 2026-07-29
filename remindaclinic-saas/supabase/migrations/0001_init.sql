-- RemindaClinic SaaS · esquema inicial
-- Postgres 16 / Supabase. Multi-tenant: todo cuelga de clinic_id.
-- Zonas horarias: se guarda timestamptz (UTC) y se muestra en la TZ de la clínica.

-- gen_random_uuid() es nativo en PG13+. pgcrypto por compatibilidad.
create extension if not exists pgcrypto;

-- =========================================================
-- Tablas
-- =========================================================

create table if not exists public.clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'America/Santiago',
  phone       text,
  created_at  timestamptz not null default now()
);

-- Staff. 1:1 con auth.users (Supabase Auth).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  full_name   text,
  role        text not null default 'reception'
              check (role in ('owner','admin','reception')),
  created_at  timestamptz not null default now()
);
create index if not exists profiles_clinic_idx on public.profiles(clinic_id);

create table if not exists public.professionals (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  full_name          text not null,
  specialty          text,
  google_calendar_id text,               -- 'primary' o un calendar id
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists professionals_clinic_idx on public.professionals(clinic_id);

create table if not exists public.patients (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  full_name   text not null,
  phone_e164  text,                        -- +569XXXXXXXX (normalizado en la app)
  email       text,
  rut         text,
  notes       text,
  wa_opt_in   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists patients_clinic_idx on public.patients(clinic_id);
create index if not exists patients_phone_idx  on public.patients(clinic_id, phone_e164);

create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  professional_id  uuid references public.professionals(id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  status           text not null default 'scheduled'
                   check (status in ('scheduled','confirmed','attended','cancelled','no_show')),
  reason           text,
  google_event_id  text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint appointments_time_ck check (ends_at is null or ends_at >= starts_at)
);
create index if not exists appointments_clinic_start_idx on public.appointments(clinic_id, starts_at);
create index if not exists appointments_patient_idx      on public.appointments(patient_id);

create table if not exists public.reminders (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  appointment_id      uuid not null references public.appointments(id) on delete cascade,
  channel             text not null default 'whatsapp'
                      check (channel in ('whatsapp','sms','email')),
  scheduled_for       timestamptz not null,
  status              text not null default 'pending'
                      check (status in ('pending','sent','delivered','read','failed','cancelled')),
  template_name       text,
  provider_message_id text,
  sent_at             timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);
-- Índice que usa el cron para tomar lo pendiente y vencido.
create index if not exists reminders_due_idx on public.reminders(status, scheduled_for);
create index if not exists reminders_appt_idx on public.reminders(appointment_id);
-- Evita duplicar la misma ventana de recordatorio para una cita.
create unique index if not exists reminders_unique_slot
  on public.reminders(appointment_id, channel, scheduled_for);

create table if not exists public.message_templates (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  name             text not null,
  channel          text not null default 'whatsapp'
                   check (channel in ('whatsapp','sms','email')),
  language         text not null default 'es',
  body             text not null,           -- con {{1}} {{2}} … para WhatsApp
  wa_template_name text,                     -- nombre exacto aprobado en Meta
  approved         boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists templates_clinic_idx on public.message_templates(clinic_id);

create table if not exists public.google_integrations (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,
  professional_id      uuid references public.professionals(id) on delete cascade,
  google_account_email text,
  access_token         text,   -- cifrado en reposo (Vault/pgsodium) — nunca expuesto por RLS
  refresh_token        text,   -- cifrado
  scope                text,
  expiry               timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists google_clinic_idx on public.google_integrations(clinic_id);

create table if not exists public.whatsapp_integrations (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  waba_id         text,
  phone_number_id text,
  display_phone   text,
  access_token    text,   -- cifrado (system user token)
  verify_token    text,   -- verificación del webhook
  created_at      timestamptz not null default now()
);
create index if not exists whatsapp_clinic_idx on public.whatsapp_integrations(clinic_id);

create table if not exists public.inbound_messages (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  patient_id     uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  wa_message_id  text,
  from_phone     text,
  body           text,
  intent         text check (intent in ('confirm','cancel','unknown')),
  received_at    timestamptz not null default now()
);
create index if not exists inbound_clinic_idx on public.inbound_messages(clinic_id);

-- Configuración por clínica (1 fila).
create table if not exists public.settings (
  clinic_id       uuid primary key references public.clinics(id) on delete cascade,
  hours_before    int[] not null default '{24,2}',
  default_channel text not null default 'whatsapp'
                  check (default_channel in ('whatsapp','sms','email')),
  quiet_hours     jsonb,                 -- {"from":"21:00","to":"08:00"}
  country_code    text not null default '56'
);

-- =========================================================
-- Funciones y triggers
-- =========================================================

-- Mantiene updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- Crea una fila de settings por defecto al crear una clínica.
create or replace function public.create_default_settings()
returns trigger language plpgsql as $$
begin
  insert into public.settings(clinic_id) values (new.id)
  on conflict (clinic_id) do nothing;
  return new;
end $$;

drop trigger if exists clinics_default_settings on public.clinics;
create trigger clinics_default_settings
  after insert on public.clinics
  for each row execute function public.create_default_settings();

-- Genera/regenera los recordatorios PENDIENTES de una cita según settings.
-- Al mover la cita se borran los pendientes y se recrean; los ya enviados quedan.
create or replace function public.enqueue_reminders()
returns trigger language plpgsql as $$
declare
  v_hours   int[];
  v_channel text;
  h         int;
  when_ts   timestamptz;
begin
  if TG_OP = 'UPDATE' then
    delete from public.reminders
      where appointment_id = new.id and status = 'pending';
  end if;

  if new.status in ('cancelled','attended','no_show') then
    return new;
  end if;

  select hours_before, default_channel
    into v_hours, v_channel
    from public.settings
   where clinic_id = new.clinic_id;

  v_hours   := coalesce(v_hours, array[24,2]);
  v_channel := coalesce(v_channel, 'whatsapp');

  foreach h in array v_hours loop
    when_ts := new.starts_at - make_interval(hours => h);
    if when_ts > now() then
      insert into public.reminders(clinic_id, appointment_id, channel, scheduled_for, status)
      values (new.clinic_id, new.id, v_channel, when_ts, 'pending')
      on conflict (appointment_id, channel, scheduled_for) do nothing;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists appointments_enqueue_reminders on public.appointments;
create trigger appointments_enqueue_reminders
  after insert or update of starts_at, status on public.appointments
  for each row execute function public.enqueue_reminders();
