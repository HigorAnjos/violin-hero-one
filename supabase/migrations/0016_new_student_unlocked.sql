-- 0016_new_student_unlocked.sql — Aluno cadastrado (ou trazido de volta) nasce desbloqueado.
-- O bloqueio da class-login vale por turma + nome mesmo para nome que não existe (para não revelar quem está na turma),
-- e desde a 0015 o terceiro bloqueio seguido não acaba sozinho. Sem isto, erros com um nome antes de o professor
-- cadastrá-lo deixariam o aluno novo bloqueado sem ninguém saber por quê.

/**
 * Cadastra um aluno pelo nome e gera o PIN dele, que só esta resposta traz (o banco guarda o hash). Turma encerrada ou
 * nome inválido dão 22023; nome igual ao de um aluno ativo da turma (sem contar acento e maiúscula), 23505; passar dos
 * alunos do plano, VHLIM. Apaga o bloqueio que o nome tiver acumulado. Devolve { student, pin }.
 */
create or replace function violinhero.add_student(p_class_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_class  violinhero.classes := violinhero.own_class(p_class_id, violinhero.require_teacher());
  v_name   text := violinhero.clean_student_name(p_name);
  v_pin    text := violinhero.new_pin();
  v_member violinhero.class_members;
begin
  if v_class.closed_at is not null then
    raise exception 'turma encerrada' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('violinhero.class_members'), hashtext(v_class.id::text));
  perform violinhero.check_student_limit(v_class);
  insert into violinhero.class_members (class_id, display_name) values (v_class.id, v_name) returning * into v_member;
  insert into violinhero.class_member_pins (member_id, pin_hash) values (v_member.id, extensions.crypt(v_pin, extensions.gen_salt('bf', 10)));
  delete from violinhero.login_throttle where key = violinhero.login_who_key(v_class.code, v_name);
  return jsonb_build_object(
    'student', jsonb_build_object('id', v_member.id, 'name', v_member.display_name, 'active', true, 'joined', false, 'created_at', v_member.created_at),
    'pin', v_pin);
end $$;

/**
 * Tira o aluno da turma (inativo: não entra mais, some de tarefas e de quem o vê) ou traz de volta. Voltar confere o
 * nome repetido (23505) e o limite do plano (VHLIM) e apaga o bloqueio que o nome acumulou; turma encerrada dá 22023.
 * Devolve a turma, como get_class.
 */
create or replace function violinhero.set_student_active(p_member_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member violinhero.class_members := violinhero.own_member(p_member_id, violinhero.require_teacher());
  v_class  violinhero.classes;
begin
  if p_active is null then
    raise exception 'ativo é obrigatório' using errcode = '22023';
  end if;
  select * into v_class from violinhero.classes where id = v_member.class_id;
  if v_class.closed_at is not null then
    raise exception 'turma encerrada' using errcode = '22023';
  end if;
  if p_active and not v_member.active then
    perform pg_advisory_xact_lock(hashtext('violinhero.class_members'), hashtext(v_class.id::text));
    perform violinhero.check_student_limit(v_class);
    delete from violinhero.login_throttle where key = violinhero.login_who_key(v_class.code, v_member.display_name);
  end if;
  update violinhero.class_members set active = p_active where id = v_member.id;
  return violinhero.class_view(v_class);
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
grant execute on function violinhero.submit_assignment(uuid, uuid, text) to authenticated;
grant execute on function violinhero.create_guardian_invite(uuid) to authenticated;
grant execute on function violinhero.accept_guardian_invite(text) to authenticated;
grant execute on function violinhero.list_my_children() to authenticated;
grant execute on function violinhero.get_student_progress(uuid) to authenticated;
grant execute on function violinhero.can_read_submission_audio(text) to authenticated;
grant execute on function violinhero.can_upload_submission_audio(text) to authenticated;
