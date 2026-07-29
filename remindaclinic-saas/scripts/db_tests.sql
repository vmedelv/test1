\set ON_ERROR_STOP on
\pset pager off

-- ============ Seed (como superusuario, bypassa RLS) ============
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111','a-admin@test.cl'),
  ('22222222-2222-2222-2222-222222222222','a-recep@test.cl'),
  ('33333333-3333-3333-3333-333333333333','b-admin@test.cl');

insert into public.clinics(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Clinica A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Clinica B');

-- settings deben existir por el trigger clinics_default_settings:
select 'settings creados por trigger' as check,
       count(*) = 2 as ok from public.settings;

insert into public.profiles(id, clinic_id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A Admin','admin'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A Recepcion','reception'),
  ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B Admin','admin');

insert into public.patients(id, clinic_id, full_name, phone_e164) values
  ('a0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Paciente A1','+56911111111'),
  ('b0000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Paciente B1','+56922222222');

insert into public.whatsapp_integrations(clinic_id, phone_number_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','PHONE_A');

-- ============ TEST 1: trigger enqueue_reminders ============
-- Cita a 30h -> ventanas 24h y 2h ambas en el futuro => 2 recordatorios.
insert into public.appointments(id, clinic_id, patient_id, starts_at)
values ('c0000000-0000-0000-0000-000000000030','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'a0000000-0000-0000-0000-000000000001', now() + interval '30 hours');

select 'T1 cita a 30h => 2 recordatorios' as check,
       count(*) = 2 as ok
from public.reminders where appointment_id = 'c0000000-0000-0000-0000-000000000030';

-- Cita a 3h -> solo la ventana de 2h es futura => 1 recordatorio.
insert into public.appointments(id, clinic_id, patient_id, starts_at)
values ('c0000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'a0000000-0000-0000-0000-000000000001', now() + interval '3 hours');

select 'T2 cita a 3h => 1 recordatorio' as check,
       count(*) = 1 as ok
from public.reminders where appointment_id = 'c0000000-0000-0000-0000-000000000003';

-- ============ TEST 3: mover la cita regenera pendientes ============
update public.reminders set status='sent'
 where id = (select id from public.reminders
              where appointment_id='c0000000-0000-0000-0000-000000000030'
                and status='pending'
              order by scheduled_for limit 1);

-- Mover la cita a 50h: se borran los pendientes, el 'sent' se conserva.
update public.appointments set starts_at = now() + interval '50 hours'
 where id = 'c0000000-0000-0000-0000-000000000030';

select 'T3 tras mover: 1 enviado + 2 pendientes nuevos = 3 filas' as check,
       count(*) = 3 as ok,
       count(*) filter (where status='sent') = 1 as ok_sent,
       count(*) filter (where status='pending') = 2 as ok_pending
from public.reminders where appointment_id = 'c0000000-0000-0000-0000-000000000030';

-- ============ TEST 4: cancelar cita no deja pendientes ============
update public.appointments set status='cancelled'
 where id='c0000000-0000-0000-0000-000000000003';
select 'T4 cita cancelada => 0 pendientes' as check,
       count(*) filter (where status='pending') = 0 as ok
from public.reminders where appointment_id='c0000000-0000-0000-0000-000000000003';

-- ============ TEST 5: RLS aislamiento entre clínicas ============
set role authenticated;

-- Usuario admin de Clinica A
select set_config('app.user_id','11111111-1111-1111-1111-111111111111', false);
select 'T5 admin A ve solo pacientes de A' as check,
       count(*) = 1 as ok,
       bool_and(clinic_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as ok_tenant
from public.patients;

-- Usuario de Clinica B
select set_config('app.user_id','33333333-3333-3333-3333-333333333333', false);
select 'T6 usuario B ve solo pacientes de B' as check,
       count(*) = 1 as ok,
       bool_and(clinic_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as ok_tenant
from public.patients;

-- ============ TEST 7: with_check impide escribir en otra clínica ============
-- Usuario A intenta crear paciente en Clinica B -> debe fallar.
select set_config('app.user_id','11111111-1111-1111-1111-111111111111', false);
\set ON_ERROR_STOP off
insert into public.patients(clinic_id, full_name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Intruso');
\echo 'T7 esperado: ERROR de RLS arriba (insert cross-tenant bloqueado)'
\set ON_ERROR_STOP on

-- ============ TEST 8: integraciones ocultas para 'reception' ============
-- Recepcionista de A NO debe ver whatsapp_integrations.
select set_config('app.user_id','22222222-2222-2222-2222-222222222222', false);
select 'T8 reception NO ve whatsapp_integrations' as check,
       count(*) = 0 as ok
from public.whatsapp_integrations;

-- Admin de A SI debe verlas.
select set_config('app.user_id','11111111-1111-1111-1111-111111111111', false);
select 'T9 admin SI ve whatsapp_integrations' as check,
       count(*) = 1 as ok
from public.whatsapp_integrations;

reset role;
\echo 'FIN DE TESTS'
