-- 0003_expose_schema.sql — expõe o schema na Data API (PostgREST), preservando os já expostos.
do $$
declare cur text; nxt text;
begin
  select split_part(c, '=', 2) into cur
    from pg_db_role_setting rs
    join pg_roles r on r.oid = rs.setrole
    cross join lateral unnest(rs.setconfig) c
   where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%'
   limit 1;

  cur := coalesce(nullif(cur, ''), 'public,graphql_public');
  if position('violinhero' in cur) = 0 then
    nxt := cur || ',violinhero';
    execute format('alter role authenticator set pgrst.db_schemas = %L', nxt);
  end if;
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
revoke execute on all functions in schema violinhero from public, anon, authenticated;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
