-- 0001_schema.sql — Violin Hero
-- Tudo vive no schema dedicado "violinhero" (pg_dump -n violinhero separa o banco se precisar).

create schema if not exists violinhero;
set local search_path = violinhero, public;

-- Onde o jogador diz que começa (tela OnboardLevel). Nulo = ainda não respondeu.
create type player_level as enum ('never', 'beginner', 'some_songs', 'years');

-- Um perfil por usuário do Supabase, inclusive o anônimo do primeiro toque.
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  nickname     text check (nickname is null or length(trim(nickname)) between 1 and 24),
  animal       text check (animal is null or length(animal) between 1 and 32),
  level        player_level,
  a4_hz        numeric(5, 2) not null default 442 check (a4_hz between 415 and 466),
  latency_ms   int check (latency_ms is null or latency_ms between 0 and 1000),
  -- Espelho de auth.users.is_anonymous: muda quando a conta ganha e-mail ou Google
  is_anonymous boolean not null default true,
  theme_id     text check (theme_id is null or length(theme_id) <= 48),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create function touch_updated_at() returns trigger
language plpgsql set search_path = violinhero, public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- O perfil nasce com o usuário (anônimo ou não) e acompanha a troca de anônimo para conta.
create function sync_profile_from_auth() returns trigger
language plpgsql security definer set search_path = violinhero, public as $$
begin
  insert into violinhero.profiles (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do update set is_anonymous = excluded.is_anonymous;
  return new;
end $$;

create trigger violinhero_profile_on_signup after insert on auth.users
  for each row execute function violinhero.sync_profile_from_auth();

create trigger violinhero_profile_on_link after update of is_anonymous on auth.users
  for each row when (old.is_anonymous is distinct from new.is_anonymous)
  execute function violinhero.sync_profile_from_auth();
