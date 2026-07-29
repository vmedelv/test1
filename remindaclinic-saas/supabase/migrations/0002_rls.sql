-- RemindaClinic SaaS · Row Level Security (multi-tenant)
-- Cada usuario solo ve/edita filas de SU clínica. El aislamiento se apoya en
-- current_clinic_id(), que resuelve la clínica del usuario autenticado.

-- SECURITY DEFINER: evita recursión de RLS al leer profiles.
create or replace function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from public.profiles where id = auth.uid();
$$;

-- Rol de aplicación (en Supabase ya existe 'authenticated'; lo creamos si falta).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
grant execute on function public.current_clinic_id() to authenticated;

-- Habilita RLS en todas las tablas de negocio.
alter table public.clinics                enable row level security;
alter table public.profiles               enable row level security;
alter table public.professionals          enable row level security;
alter table public.patients               enable row level security;
alter table public.appointments           enable row level security;
alter table public.reminders              enable row level security;
alter table public.message_templates      enable row level security;
alter table public.google_integrations    enable row level security;
alter table public.whatsapp_integrations  enable row level security;
alter table public.inbound_messages       enable row level security;
alter table public.settings               enable row level security;

-- Fuerza RLS también para el dueño de las tablas (endurece el aislamiento).
alter table public.clinics                force row level security;
alter table public.profiles               force row level security;
alter table public.professionals          force row level security;
alter table public.patients               force row level security;
alter table public.appointments           force row level security;
alter table public.reminders              force row level security;
alter table public.message_templates      force row level security;
alter table public.google_integrations    force row level security;
alter table public.whatsapp_integrations  force row level security;
alter table public.inbound_messages       force row level security;
alter table public.settings               force row level security;

-- clinics: el usuario ve su propia clínica.
drop policy if exists clinics_rw on public.clinics;
create policy clinics_rw on public.clinics
  using (id = public.current_clinic_id())
  with check (id = public.current_clinic_id());

-- profiles: te ves a ti y a los del mismo tenant.
drop policy if exists profiles_rw on public.profiles;
create policy profiles_rw on public.profiles
  using (id = auth.uid() or clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- Patrón genérico para el resto: clinic_id = clínica del usuario.
drop policy if exists professionals_rw on public.professionals;
create policy professionals_rw on public.professionals
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists patients_rw on public.patients;
create policy patients_rw on public.patients
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists appointments_rw on public.appointments;
create policy appointments_rw on public.appointments
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists reminders_rw on public.reminders;
create policy reminders_rw on public.reminders
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists templates_rw on public.message_templates;
create policy templates_rw on public.message_templates
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists inbound_rw on public.inbound_messages;
create policy inbound_rw on public.inbound_messages
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists settings_rw on public.settings;
create policy settings_rw on public.settings
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- Integraciones con secretos (tokens OAuth / WhatsApp):
-- visibles solo para owner/admin; NUNCA para 'reception'. El backend usa la
-- service_role (que bypassa RLS) para leerlas al enviar mensajes / sincronizar.
create or replace function public.is_clinic_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('owner','admin')
  );
$$;
grant execute on function public.is_clinic_admin() to authenticated;

drop policy if exists google_admin_rw on public.google_integrations;
create policy google_admin_rw on public.google_integrations
  using (clinic_id = public.current_clinic_id() and public.is_clinic_admin())
  with check (clinic_id = public.current_clinic_id() and public.is_clinic_admin());

drop policy if exists whatsapp_admin_rw on public.whatsapp_integrations;
create policy whatsapp_admin_rw on public.whatsapp_integrations
  using (clinic_id = public.current_clinic_id() and public.is_clinic_admin())
  with check (clinic_id = public.current_clinic_id() and public.is_clinic_admin());
