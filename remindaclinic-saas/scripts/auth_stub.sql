-- Emula lo mínimo de Supabase para probar las migraciones localmente.
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- auth.uid() lee el usuario "autenticado" desde una GUC de sesión.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;
