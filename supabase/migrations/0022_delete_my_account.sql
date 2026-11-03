-- 0022_delete_my_account.sql — Exclusão de conta pelo próprio jogador (exigência do Google Play e da App Store, ciclo 6).
-- O app chama a Edge Function delete-account com a sessão do jogador; ela chama delete_my_account() COMO o jogador
-- (auth.uid() é ele), apaga do Storage o áudio que a função devolve e, por último, o usuário do auth com a chave de
-- serviço (que o app nunca tem). Os dados somem aqui, no banco, mesmo que o passo do auth falhe: rodar de novo termina.
--
-- O que sai: perfil, partidas, recordes, selos, dias e sequência, músicas próprias, desafios que criou e as entradas
-- dele nos desafios dos outros, vínculos de responsável e convites, plano de professor e as turmas que ele dá (com
-- alunos, PINs, tarefas, entregas e revisões). O que fica: tudo o que é de outro jogador (partidas, recordes, desafios
-- que ele criou e o aluno do qual ele era responsável).
--
-- Conta de aluno (entrou pela turma, sem e-mail) não se apaga sozinha: quem cadastrou foi o professor, e é com ele (ou
-- o responsável, pelo professor) que a exclusão se pede. A função recusa com PT403.
-- Professor que apaga a conta leva as turmas, e o aluno de turma não tem como entrar sem ela: a conta de cada aluno
-- dessas turmas sai junto (dados de criança não ficam órfãos no banco). A função devolve os ids para a Edge Function
-- apagar os usuários do auth.

/** Apaga, sem conferir quem pede, os dados de `p_uid` no schema; devolve o áudio de entregas que saiu junto. */
create function violinhero.wipe_user_data(p_uid uuid) returns text[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_audio text[];
begin
  select coalesce(array_agg(s.audio_path), '{}') into v_audio
    from violinhero.submissions s
    join violinhero.assignments a on a.id = s.assignment_id
    join violinhero.classes c on c.id = a.class_id
   where s.audio_path is not null and c.teacher_id = p_uid;
  -- Turmas que ele dá: alunos, PINs, tarefas, entregas e revisões vão em cascata (o áudio entra na audio_trash)
  delete from violinhero.classes where teacher_id = p_uid;
  delete from violinhero.reviews where teacher_id = p_uid;
  delete from violinhero.teacher_plans where teacher_id = p_uid;
  delete from violinhero.guardian_links where guardian_id = p_uid;
  delete from violinhero.guardian_invites where created_by = p_uid;
  update violinhero.guardian_invites set used_by = null where used_by = p_uid;
  delete from violinhero.challenge_entries where user_id = p_uid;
  delete from violinhero.challenges where creator_id = p_uid;
  delete from violinhero.badges_earned where user_id = p_uid;
  delete from violinhero.records where user_id = p_uid;
  delete from violinhero.plays where user_id = p_uid;
  delete from violinhero.play_days where user_id = p_uid;
  delete from violinhero.streaks where user_id = p_uid;
  delete from violinhero.songs where owner_id = p_uid;
  delete from violinhero.profiles where id = p_uid;
  return v_audio;
end $$;

/**
 * Apaga os dados do jogador da sessão (anônimo ou com conta). Sem sessão, 42501; conta de aluno de turma, PT403.
 * Devolve { audio, students }: os caminhos do bucket submissions a apagar e os usuários de auth dos alunos das turmas
 * dele, que a Edge Function delete-account apaga com a chave de serviço antes do próprio jogador. Idempotente.
 */
create function violinhero.delete_my_account() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_students uuid[];
  v_audio    text[];
  v_student  uuid;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if exists (select 1 from violinhero.class_members m where m.user_id = v_uid) then
    raise exception 'conta de aluno: quem remove é o professor da turma' using errcode = 'PT403';
  end if;
  select coalesce(array_agg(m.user_id), '{}') into v_students
    from violinhero.class_members m
    join violinhero.classes c on c.id = m.class_id
   where c.teacher_id = v_uid and m.user_id is not null;
  v_audio := violinhero.wipe_user_data(v_uid);
  foreach v_student in array v_students loop
    v_audio := v_audio || violinhero.wipe_user_data(v_student);
  end loop;
  return jsonb_build_object('audio', to_jsonb(v_audio), 'students', to_jsonb(v_students));
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
-- wipe_user_data fica de fora: apaga de qualquer um, só por dentro de delete_my_account.
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
grant execute on function violinhero.delete_my_account() to authenticated;
