-- 0015_class_hardening.sql — Ajustes da revisão do ciclo 5 na entrada do aluno e na retenção do áudio.
-- 1. Bloqueio que escala: 3 bloqueios seguidos (um a menos de 1 dia do outro) do mesmo turma + nome só se desfazem com
--    o PIN novo do professor. Sem isso, 5 tentativas a cada 15 minutos acham um PIN de 4 dígitos em ~10 dias.
-- 2. Primeira entrada que caiu no meio: o usuário de auth do aluno foi criado e não chegou a ser ligado. A class-login
--    acha esse usuário pelo e-mail sintético (class_link_existing) em vez de ficar presa em "e-mail já existe".
-- 3. Retenção: além do áudio revisado há 30 dias e do trocado, sai o de entrega nunca revisada 30 dias depois do prazo
--    da tarefa (vale também para aluno inativo e turma encerrada) e o arquivo que nenhuma entrega cita (envio sem
--    submit_assignment, envio que caiu no meio) 48 horas depois de subir.

-- 4. Limite por IP sobe de 30 para 100 erros em 15 minutos (decisão do Regente): escola atrás de um NAT divide o IP.

alter table violinhero.login_throttle add column locks int not null default 0 check (locks >= 0);

/** Limites da class-login: erros seguidos por turma + nome e por IP numa janela, e quanto tempo o bloqueio dura. */
create or replace function violinhero.login_limits(out per_name int, out per_ip int, out win interval, out lock interval)
language sql immutable set search_path = '' as $$
  select 5, 100, interval '15 minutes', interval '15 minutes'
$$;

/** Bloqueios seguidos de um turma + nome antes de só o PIN novo do professor desfazer. */
create function violinhero.login_max_locks() returns int
language sql immutable set search_path = '' as $$ select 3 $$;

/**
 * Mais um erro na chave; ao chegar em `p_max` dentro da janela, bloqueia e zera a contagem. Na chave de turma + nome
 * ('who:'), o bloqueio número login_max_locks() não tem fim (só reset_student_pin apaga a linha); um dia sem
 * bloqueio zera a sequência. A chave de IP não escala.
 */
create or replace function violinhero.login_fail(p_key text, p_max int) returns void
language plpgsql volatile set search_path = '' as $$
declare
  v_lim record;
  v_row violinhero.login_throttle;
begin
  select * into v_lim from violinhero.login_limits();
  insert into violinhero.login_throttle (key) values (p_key) on conflict (key) do nothing;
  select * into v_row from violinhero.login_throttle where key = p_key for update;
  if v_row.window_started_at + v_lim.win < now() then
    v_row.failures := 0;
    v_row.window_started_at := now();
  end if;
  if v_row.locked_until < now() - interval '1 day' then
    v_row.locks := 0;
  end if;
  v_row.failures := v_row.failures + 1;
  if v_row.failures >= p_max then
    v_row.failures := 0;
    v_row.window_started_at := now();
    v_row.locks := v_row.locks + 1;
    v_row.locked_until := case
                            when p_key like 'who:%' and v_row.locks >= violinhero.login_max_locks() then 'infinity'::timestamptz
                            else now() + v_lim.lock
                          end;
  end if;
  update violinhero.login_throttle
     set failures = v_row.failures, window_started_at = v_row.window_started_at, locks = v_row.locks,
         locked_until = v_row.locked_until
   where key = p_key;
end $$;

/**
 * Liga ao aluno o usuário de auth que a class-login criou numa primeira entrada que caiu antes de ligar (achado pelo
 * e-mail sintético aluno-<id>@alunos.violinhero.invalid). Devolve o usuário que ficou no aluno; sem esse usuário, P0002.
 */
create function violinhero.class_link_existing(p_member_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select u.id into v_user from auth.users u where u.email = 'aluno-' || p_member_id::text || '@alunos.violinhero.invalid';
  if v_user is null then
    raise exception 'usuário do aluno não encontrado' using errcode = 'P0002';
  end if;
  return violinhero.class_link_user(p_member_id, v_user);
end $$;

/** Quanto tempo o arquivo que nenhuma entrega cita fica no bucket (o envio e a entrega vêm juntos, com rede). */
create function violinhero.orphan_audio_age() returns interval
language sql immutable set search_path = '' as $$ select interval '48 hours' $$;

/**
 * Até `p_limit` arquivos a apagar: áudio revisado há mais de 30 dias, de entrega não revisada 30 dias depois do prazo
 * da tarefa, os trocados (audio_trash) e, onde o Storage existe, os arquivos do bucket submissions que nenhuma entrega
 * nem a fila citam há mais de 48 horas.
 */
create or replace function violinhero.audio_to_purge(p_limit int default 100) returns table (path text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 1000);
begin
  return query
  select x.path from (
    select s.audio_path as path, r.reviewed_at as since
      from violinhero.submissions s
      join violinhero.reviews r on r.submission_id = s.id
     where s.audio_path is not null and r.reviewed_at < now() - violinhero.audio_retention()
    union all
    select s.audio_path, a.due_at
      from violinhero.submissions s
      join violinhero.assignments a on a.id = s.assignment_id
     where s.audio_path is not null and a.due_at < now() - violinhero.audio_retention()
       and not exists (select 1 from violinhero.reviews r where r.submission_id = s.id)
    union all
    select t.path, t.queued_at from violinhero.audio_trash t
  ) x
  order by x.since, x.path
  limit v_limit;
  -- O Postgres sem o Storage (Supabase local desta máquina) não tem storage.objects: o resto da limpeza vale igual
  if to_regclass('storage.objects') is not null then
    return query execute
      'select o.name::text from storage.objects o
        where o.bucket_id = ''submissions'' and o.created_at < now() - violinhero.orphan_audio_age()
          and not exists (select 1 from violinhero.submissions s where s.audio_path = o.name)
          and not exists (select 1 from violinhero.audio_trash t where t.path = o.name)
        order by o.created_at, o.name
        limit $1'
      using v_limit;
  end if;
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
-- class_link_existing fica de fora de propósito: só a Edge Function class-login (service_role).
revoke execute on all functions in schema violinhero from public, anon, authenticated;
grant execute on function violinhero.get_song(text, violinhero.chart_level) to authenticated;
grant execute on function violinhero.ensure_my_profile() to authenticated;
grant execute on function violinhero.submit_play(jsonb) to authenticated;
grant execute on function violinhero.get_ranking(text, violinhero.chart_level, text, int) to authenticated;
grant execute on function violinhero.create_challenge(uuid, int) to authenticated;
grant execute on function violinhero.get_challenge(text) to authenticated;
grant execute on function violinhero.accept_challenge(text) to authenticated;
grant execute on function violinhero.list_my_challenges() to authenticated;
grant execute on function violinhero.create_class(text) to authenticated;
grant execute on function violinhero.list_my_classes() to authenticated;
grant execute on function violinhero.get_class(uuid) to authenticated;
grant execute on function violinhero.add_student(uuid, text) to authenticated;
grant execute on function violinhero.reset_student_pin(uuid) to authenticated;
grant execute on function violinhero.set_student_active(uuid, boolean) to authenticated;
grant execute on function violinhero.close_class(uuid) to authenticated;
grant execute on function violinhero.get_my_plan() to authenticated;
grant execute on function violinhero.get_my_class() to authenticated;
grant execute on function violinhero.create_assignment(uuid, text, violinhero.chart_level, violinhero.play_mode, timestamptz, text, text) to authenticated;
grant execute on function violinhero.list_class_assignments(uuid) to authenticated;
grant execute on function violinhero.get_assignment(uuid) to authenticated;
grant execute on function violinhero.review_submission(uuid, int, text, text) to authenticated;
grant execute on function violinhero.get_my_assignments() to authenticated;
grant execute on function violinhero.submit_assignment(uuid, uuid, text) to authenticated;
grant execute on function violinhero.create_guardian_invite(uuid) to authenticated;
grant execute on function violinhero.accept_guardian_invite(text) to authenticated;
grant execute on function violinhero.list_my_children() to authenticated;
grant execute on function violinhero.get_student_progress(uuid) to authenticated;
grant execute on function violinhero.can_read_submission_audio(text) to authenticated;
grant execute on function violinhero.can_upload_submission_audio(text) to authenticated;
