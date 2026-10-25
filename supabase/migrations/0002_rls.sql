-- 0002_rls.sql — Row Level Security e permissões
-- Regra geral: RLS em toda tabela; o que o cliente não pode decidir sozinho vai por função
-- SECURITY DEFINER. Chave de serviço nunca vai para o app.
set local search_path = violinhero, public;

alter table profiles enable row level security;

-- O próprio jogador lê e edita o seu perfil. Professor e responsável (ciclo 5) só verão o apelido,
-- por função dedicada, não por esta política.
create policy profiles_select_own on profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Permissões de objeto
revoke all on schema violinhero from public, anon;
grant usage on schema violinhero to authenticated;

revoke all on all tables    in schema violinhero from public, anon, authenticated;
revoke all on all functions in schema violinhero from public, anon, authenticated;

grant select on profiles to authenticated;
-- Só as preferências do jogador; id, is_anonymous e datas são do servidor
grant update (nickname, animal, level, a4_hz, latency_ms, theme_id) on profiles to authenticated;
