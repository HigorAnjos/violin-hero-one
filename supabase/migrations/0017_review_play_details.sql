-- 0017_review_play_details.sql — O que a revisão do professor mostra da partida e da gravação.
-- A tela de revisão (TeacherReview) mostra, além de pontos e precisão, a afinação média e a de cada corda da partida
-- entregue, e toca o áudio com a duração certa: o webm do MediaRecorder sai sem duração no arquivo, então quem
-- entrega manda a que gravou (p_audio_duration_ms) e o banco guarda junto da entrega. A situação da tarefa
-- (assignment_status) passa a trazer mean_abs_cents, string_cents e duration_ms da partida em best e submission, e
-- audio_duration_ms em submission. Quem lê continua o mesmo de antes: o próprio aluno, o professor da turma e o
-- responsável, só pelas funções de 0012–0013.

alter table violinhero.submissions
  add column audio_duration_ms int check (audio_duration_ms between 0 and 4 * 3600 * 1000);

/** Situação de um aluno numa tarefa: melhor partida que conta, entrega e revisão (com afinação e duração). */
create or replace function violinhero.assignment_status(p_assignment violinhero.assignments, p_member violinhero.class_members)
returns jsonb
language sql stable set search_path = '' as $$
  with best as (select * from violinhero.assignment_best(p_assignment, p_member.user_id) b where b.id is not null),
  sub as (select * from violinhero.submissions s where s.assignment_id = p_assignment.id and s.member_id = p_member.id)
  select jsonb_build_object(
           'best', (select jsonb_build_object('play_id', b.id, 'score', b.score, 'accuracy', b.accuracy, 'played_at', b.played_at,
                                              'mean_abs_cents', b.mean_abs_cents, 'string_cents', to_jsonb(b.string_cents),
                                              'duration_ms', b.duration_ms)
                      from best b),
           'submission', (select jsonb_build_object(
                                   'id', s.id, 'play_id', s.play_id, 'score', p.score, 'accuracy', p.accuracy,
                                   'mean_abs_cents', p.mean_abs_cents, 'string_cents', to_jsonb(p.string_cents),
                                   'duration_ms', p.duration_ms,
                                   'submitted_at', s.submitted_at, 'audio_path', s.audio_path,
                                   'audio_duration_ms', s.audio_duration_ms,
                                   'audio_deleted', s.audio_deleted_at is not null)
                            from sub s left join violinhero.plays p on p.id = s.play_id),
           'review', (select jsonb_build_object('grade', r.grade, 'concept', r.concept, 'comment', r.comment,
                                                'reviewed_at', r.reviewed_at)
                        from sub s join violinhero.reviews r on r.submission_id = s.id))
$$;

-- Parâmetro novo no fim, com default: quem chama com três argumentos (ou pelo nome) segue igual. Duas versões ao mesmo
-- tempo deixariam a chamada de três argumentos ambígua, então a antiga sai.
drop function violinhero.submit_assignment(uuid, uuid, text);

/**
 * O aluno da sessão entrega a tarefa: a partida escolhida (precisa contar; sem ela, a melhor que conta) e, se gravou,
 * o caminho do áudio já enviado ao bucket submissions, na pasta <turma>/<aluno>/<tarefa>/ do próprio aluno (senão
 * 22023), com a duração gravada em ms (opcional; só vale com áudio). Entregar de novo troca partida e áudio até a
 * revisão; depois dela, 22023. Tarefa fora da turma do aluno ativo, P0002; turma encerrada, 22023. A entrega pode
 * chegar depois do prazo (o áudio pode ter ficado na fila sem rede): o que vale o prazo é a partida. Devolve a tarefa
 * como em get_my_assignments.
 */
create function violinhero.submit_assignment(p_assignment_id uuid, p_play_id uuid default null, p_audio_path text default null,
                                             p_audio_duration_ms int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_assignment violinhero.assignments;
  v_member     violinhero.class_members;
  v_closed     timestamptz;
  v_play       violinhero.plays;
  v_duration   int := case when p_audio_path is null then null else p_audio_duration_ms end;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  select m.* into v_member
    from violinhero.assignments a
    join violinhero.class_members m on m.class_id = a.class_id and m.user_id = v_uid and m.active
   where a.id = p_assignment_id;
  if not found then
    raise exception 'tarefa não encontrada' using errcode = 'P0002';
  end if;
  select * into v_assignment from violinhero.assignments where id = p_assignment_id;
  select closed_at into v_closed from violinhero.classes where id = v_assignment.class_id;
  if v_closed is not null then
    raise exception 'turma encerrada' using errcode = '22023';
  end if;
  if p_play_id is null then
    v_play := violinhero.assignment_best(v_assignment, v_uid);
  else
    select * into v_play from violinhero.plays where id = p_play_id and user_id = v_uid;
  end if;
  if v_play.id is null or not violinhero.play_counts_for(v_play, v_assignment, v_uid) then
    raise exception 'partida não vale para a tarefa' using errcode = '22023';
  end if;
  if p_audio_path is not null and (
     p_audio_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(webm|ogg|m4a|mp4)$'
     or split_part(p_audio_path, '/', 1) <> v_assignment.class_id::text
     or split_part(p_audio_path, '/', 2) <> v_member.id::text
     or split_part(p_audio_path, '/', 3) <> v_assignment.id::text) then
    raise exception 'caminho do áudio inválido' using errcode = '22023';
  end if;
  if v_duration is not null and v_duration not between 0 and 4 * 3600 * 1000 then
    raise exception 'duração do áudio inválida' using errcode = '22023';
  end if;
  if exists (select 1 from violinhero.submissions s join violinhero.reviews r on r.submission_id = s.id
              where s.assignment_id = v_assignment.id and s.member_id = v_member.id) then
    raise exception 'entrega já revisada' using errcode = '22023';
  end if;
  insert into violinhero.submissions (assignment_id, member_id, play_id, audio_path, audio_duration_ms)
  values (v_assignment.id, v_member.id, v_play.id, p_audio_path, v_duration)
  on conflict (assignment_id, member_id) do update
    set play_id = excluded.play_id, audio_path = excluded.audio_path, audio_duration_ms = excluded.audio_duration_ms,
        submitted_at = now();
  return violinhero.assignment_fields(v_assignment) || violinhero.assignment_status(v_assignment, v_member);
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
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
grant execute on function violinhero.submit_assignment(uuid, uuid, text, int) to authenticated;
grant execute on function violinhero.create_guardian_invite(uuid) to authenticated;
grant execute on function violinhero.accept_guardian_invite(text) to authenticated;
grant execute on function violinhero.list_my_children() to authenticated;
grant execute on function violinhero.get_student_progress(uuid) to authenticated;
grant execute on function violinhero.can_read_submission_audio(text) to authenticated;
grant execute on function violinhero.can_upload_submission_audio(text) to authenticated;
