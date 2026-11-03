-- 0022_delete_my_account.sql — Exclusão de conta (exigência do Google Play e da App Store, ciclo 6): o jogador apaga a
-- própria conta, e o professor apaga a conta de um aluno da turma dele.
-- O app chama a Edge Function delete-account com a sessão de quem pede; ela chama delete_my_account() ou
-- remove_student() COMO essa pessoa (auth.uid() é ela), apaga do Storage o áudio que a função devolve e, por último, os
-- usuários do auth com a chave de serviço (que o app nunca tem). Os dados somem aqui, no banco, mesmo que o passo do auth
-- falhe; os usuários de auth a apagar ficam na fila auth_deletions até a Edge Function conseguir, e rodar de novo termina.
--
-- O que sai de quem apaga a conta: perfil, partidas, recordes, selos, dias e sequência, músicas próprias, desafios que
-- criou e as entradas dele nos desafios dos outros, vínculos de responsável e convites, plano de professor e as turmas
-- que ele dá (com alunos, PINs, tarefas, entregas e revisões). O que fica: tudo o que é de outro jogador (partidas,
-- recordes, desafios que ele criou e o aluno do qual ele era responsável).
--
-- Conta de aluno (entrou pela turma, sem e-mail) não se apaga sozinha: quem cadastrou foi o professor, e é ele quem
-- apaga, por remove_student (o aluno ou o responsável pede a ele). delete_my_account recusa com PT403.
-- Professor que apaga a conta leva as turmas, e o aluno de turma não tem como entrar sem ela: a conta de cada aluno
-- dessas turmas sai junto (dados de criança não ficam órfãos no banco).

-- Usuários de auth que a Edge Function delete-account ainda precisa apagar (alunos), por quem pediu. Só o servidor lê e
-- escreve: a linha sai quando o usuário sai do auth.
create table violinhero.auth_deletions (
  user_id      uuid primary key,
  requested_by uuid not null,
  queued_at    timestamptz not null default now()
);

create index auth_deletions_requested_by_idx on violinhero.auth_deletions (requested_by);

alter table violinhero.auth_deletions enable row level security;

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

/** Usuários de auth na fila de `p_by` (os desta chamada e os que uma tentativa anterior não conseguiu apagar). */
create function violinhero.queued_auth_deletions(p_by uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.user_id order by d.queued_at, d.user_id), '[]'::jsonb)
    from violinhero.auth_deletions d where d.requested_by = p_by
$$;

/**
 * Apaga os dados do jogador da sessão (anônimo ou com conta). Sem sessão, 42501; conta de aluno de turma, PT403.
 * Devolve { audio, students }: os caminhos do bucket submissions a apagar e os usuários de auth dos alunos das turmas
 * dele (com os que ficaram de uma tentativa anterior), que a Edge Function delete-account apaga com a chave de serviço
 * antes do próprio jogador. Idempotente.
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
  insert into violinhero.auth_deletions (user_id, requested_by)
  select s, v_uid from unnest(v_students) s
  on conflict (user_id) do nothing;
  v_audio := violinhero.wipe_user_data(v_uid);
  foreach v_student in array v_students loop
    v_audio := v_audio || violinhero.wipe_user_data(v_student);
  end loop;
  return jsonb_build_object('audio', to_jsonb(v_audio), 'students', violinhero.queued_auth_deletions(v_uid));
end $$;

/**
 * O professor apaga um aluno da turma dele: o cadastro (nome, PIN, entregas, revisões, vínculos de responsável) e, se
 * o aluno já entrou, os dados da conta dele. Aluno de outro professor ou inexistente, PT404; quem não é professor
 * (anônimo, aluno), 28000. Devolve { audio, students } como delete_my_account: a Edge Function apaga o áudio e o
 * usuário de auth do aluno. Vale em turma encerrada também. Rodar de novo devolve só o que ficou na fila.
 */
create function violinhero.remove_student(p_member_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_teacher uuid := violinhero.require_teacher();
  v_member  violinhero.class_members;
  v_audio   text[] := '{}';
begin
  -- Já apagado numa tentativa anterior: só o que ficou na fila
  if not exists (select 1 from violinhero.class_members where id = p_member_id)
     and exists (select 1 from violinhero.auth_deletions where requested_by = v_teacher) then
    return jsonb_build_object('audio', '[]'::jsonb, 'students', violinhero.queued_auth_deletions(v_teacher));
  end if;
  v_member := violinhero.own_member(p_member_id, v_teacher);
  select coalesce(array_agg(s.audio_path), '{}') into v_audio
    from violinhero.submissions s where s.member_id = v_member.id and s.audio_path is not null;
  -- PINs, entregas (o áudio entra na audio_trash), revisões e vínculos de responsável vão em cascata
  delete from violinhero.class_members where id = v_member.id;
  if v_member.user_id is not null then
    insert into violinhero.auth_deletions (user_id, requested_by) values (v_member.user_id, v_teacher)
    on conflict (user_id) do nothing;
    v_audio := v_audio || violinhero.wipe_user_data(v_member.user_id);
  end if;
  return jsonb_build_object('audio', to_jsonb(v_audio), 'students', violinhero.queued_auth_deletions(v_teacher));
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
-- wipe_user_data e queued_auth_deletions ficam de fora: só por dentro de delete_my_account e remove_student.
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
grant execute on function violinhero.remove_student(uuid) to authenticated;
