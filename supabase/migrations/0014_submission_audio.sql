-- 0014_submission_audio.sql — Quem sobe e quem ouve o áudio das entregas, e a retenção de 30 dias.
-- O áudio fica no bucket privado submissions (criado com as policies em supabase/storage/0001_submissions.sql, que o
-- scripts/migrate.mjs aplica quando o Storage existe), no caminho <turma>/<aluno>/<tarefa>/<arquivo>. As policies do
-- Storage só chamam as duas funções abaixo, que valem também nos testes de banco sem Storage:
--   ouvir: o próprio aluno, o professor da turma e o responsável ligado ao aluno (enquanto ativo);
--   subir: só o próprio aluno, ativo, em turma aberta, tarefa da turma dele, entrega ainda não revisada.
-- Retenção (decisão do Higor, ciclo 5): o áudio é apagado 30 dias depois da (última) revisão. Áudio trocado por outro
-- antes da revisão vai para audio_trash e sai na mesma limpeza. Quem apaga é a Edge Function purge-submission-audio
-- (pela API do Storage: apagar a linha de storage.objects não apaga o arquivo), agendada como está no cabeçalho dela.

create table violinhero.audio_trash (
  path      text primary key,
  queued_at timestamptz not null default now()
);

alter table violinhero.audio_trash enable row level security;

/** Áudio trocado ou entrega apagada (tarefa, turma, aluno): o arquivo antigo entra na fila da limpeza. */
create function violinhero.queue_replaced_audio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.audio_path is not null and (tg_op = 'DELETE' or new.audio_path is distinct from old.audio_path) then
    insert into violinhero.audio_trash (path) values (old.audio_path) on conflict (path) do nothing;
  end if;
  return null;
end $$;

create trigger submissions_audio_trash after update of audio_path or delete on violinhero.submissions
  for each row execute function violinhero.queue_replaced_audio();

/** Quanto tempo o áudio fica depois da revisão. */
create function violinhero.audio_retention() returns interval
language sql immutable set search_path = '' as $$ select interval '30 days' $$;

/** Turma, aluno e tarefa de um caminho do bucket, se ele tiver a forma <uuid>/<uuid>/<uuid>/<arquivo de áudio>. */
create function violinhero.audio_path_parts(p_name text, out class_id uuid, out member_id uuid, out assignment_id uuid)
language sql immutable set search_path = '' as $$
  select split_part(p_name, '/', 1)::uuid, split_part(p_name, '/', 2)::uuid, split_part(p_name, '/', 3)::uuid
   where p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(webm|ogg|m4a|mp4)$'
$$;

/** Policy de leitura do bucket submissions: o jogador da sessão pode ouvir este arquivo? */
create function violinhero.can_read_submission_audio(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
      from violinhero.audio_path_parts(p_name) x
      join violinhero.class_members m on m.id = x.member_id and m.class_id = x.class_id
      join violinhero.classes c on c.id = m.class_id
      join violinhero.assignments a on a.id = x.assignment_id and a.class_id = c.id
     where m.user_id = auth.uid()
        or c.teacher_id = auth.uid()
        or (m.active and exists (select 1 from violinhero.guardian_links g where g.member_id = m.id and g.guardian_id = auth.uid())))
$$;

/** Policy de envio do bucket submissions: o jogador da sessão pode subir este arquivo? */
create function violinhero.can_upload_submission_audio(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
      from violinhero.audio_path_parts(p_name) x
      join violinhero.class_members m on m.id = x.member_id and m.class_id = x.class_id and m.active
      join violinhero.classes c on c.id = m.class_id and c.closed_at is null
      join violinhero.assignments a on a.id = x.assignment_id and a.class_id = c.id
     where m.user_id = auth.uid()
       and not exists (select 1 from violinhero.submissions s join violinhero.reviews r on r.submission_id = s.id
                        where s.assignment_id = a.id and s.member_id = m.id))
$$;

-- ---------- funções do servidor (purge-submission-audio, service_role) ----------
/** Até `p_limit` arquivos a apagar: áudio de entrega revisada há mais de 30 dias e os trocados (audio_trash). */
create function violinhero.audio_to_purge(p_limit int default 100) returns table (path text)
language sql stable security definer set search_path = '' as $$
  select x.path from (
    select s.audio_path as path, r.reviewed_at as since
      from violinhero.submissions s
      join violinhero.reviews r on r.submission_id = s.id
     where s.audio_path is not null and r.reviewed_at < now() - violinhero.audio_retention()
    union all
    select t.path, t.queued_at from violinhero.audio_trash t
  ) x
  order by x.since, x.path
  limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;

/** Depois de apagar no Storage: tira os caminhos das entregas (marcando quando) e da fila. Devolve quantos saíram. */
create function violinhero.audio_purged(p_paths text[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_count int;
begin
  update violinhero.submissions set audio_path = null, audio_deleted_at = now() where audio_path = any(p_paths);
  -- o trigger põe na fila o que acabou de sair; já foi apagado, então sai junto
  delete from violinhero.audio_trash where path = any(p_paths);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
-- As duas funções das policies do Storage entram na lista: a policy roda como o jogador e precisa do EXECUTE; elas só
-- devolvem sim/não para a sessão dele. audio_to_purge e audio_purged ficam só para o servidor.
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
