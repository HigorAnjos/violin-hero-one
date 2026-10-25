-- 0002_rls.sql — Row Level Security e permissões
-- Regra geral: RLS em toda tabela; o que o cliente não pode decidir sozinho vai por função
-- SECURITY DEFINER. Chave de serviço nunca vai para o app.

alter table violinhero.profiles enable row level security;

-- O próprio jogador lê e edita o seu perfil. Professor e responsável (ciclo 5) só verão o apelido,
-- por função dedicada, não por esta política.
create policy profiles_select_own on violinhero.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on violinhero.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Permissões de objeto
revoke all on schema violinhero from public, anon;
grant usage on schema violinhero to authenticated, service_role;

revoke all on all tables    in schema violinhero from public, anon, authenticated;
revoke all on all functions in schema violinhero from public, anon, authenticated;

-- Objetos futuros nascem fechados: função nova não fica chamável por qualquer jogador, e
-- tabela nova não fica legível antes da migração dela decidir quem lê.
-- O EXECUTE para PUBLIC vem do default global e "in schema" só soma a ele: o revoke tem de ser global.
-- No public o Supabase já concede EXECUTE por schema a anon/authenticated, então lá nada muda.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges in schema violinhero revoke all on tables from public, anon, authenticated;

-- O servidor (Edge Functions, webhooks) ignora RLS, mas não GRANT: escreve o que "só o servidor" escreve.
grant all on all tables in schema violinhero to service_role;
alter default privileges in schema violinhero grant all on tables to service_role;

grant select on violinhero.profiles to authenticated;
-- Só as preferências do jogador; id, is_anonymous e datas são do servidor
grant update (nickname, animal, level, a4_hz, latency_ms, theme_id) on violinhero.profiles to authenticated;
