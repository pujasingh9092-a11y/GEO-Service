-- GEO Service database setup
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.geo_app_states (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  user_name text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists geo_app_states_user_email_idx
  on public.geo_app_states (lower(user_email));

alter table public.geo_app_states enable row level security;

drop policy if exists "Prototype users can read app states" on public.geo_app_states;
drop policy if exists "Prototype users can insert app states" on public.geo_app_states;
drop policy if exists "Prototype users can update app states" on public.geo_app_states;

-- This prototype still uses the app's email field, not Supabase Auth.
-- These permissive policies make browser sync work with the publishable key.
-- Before production, replace them with authenticated policies.
create policy "Prototype users can read app states"
  on public.geo_app_states
  for select
  to anon
  using (true);

create policy "Prototype users can insert app states"
  on public.geo_app_states
  for insert
  to anon
  with check (true);

create policy "Prototype users can update app states"
  on public.geo_app_states
  for update
  to anon
  using (true)
  with check (true);

grant usage on schema public to anon;
grant select, insert, update on public.geo_app_states to anon;
