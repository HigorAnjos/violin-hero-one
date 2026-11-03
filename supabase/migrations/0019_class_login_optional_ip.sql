-- 0019 — IP nulo ou vazio desliga só o throttle por IP; turma + nome continua igual.
create or replace function violinhero.class_login_check(p_code text, p_name text, p_pin text, p_ip text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_who    text := violinhero.login_who_key(v_code, p_name);
  v_ip     text := 'ip:' || nullif(btrim(p_ip), '');
  v_lim    record;
  v_member violinhero.class_members;
  v_class  violinhero.classes;
  v_hash   text;
  v_ok     boolean;
begin
  select * into v_lim from violinhero.login_limits();
  if exists (select 1 from violinhero.login_throttle where key in (v_who, v_ip) and locked_until > now()) then
    return jsonb_build_object('status', 'locked');
  end if;
  select m.* into v_member
    from violinhero.class_members m
    join violinhero.classes c on c.id = m.class_id
   where c.code = v_code and m.active and violinhero.name_key(m.display_name) = violinhero.name_key(p_name);
  if found then
    select pin_hash into v_hash from violinhero.class_member_pins where member_id = v_member.id;
  end if;
  v_ok := coalesce(p_pin ~ '^[0-9]{4}$', false) and v_hash is not null
          and v_hash = extensions.crypt(p_pin, v_hash);
  if v_hash is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
  end if;
  if not v_ok then
    perform violinhero.login_fail(v_who, v_lim.per_name);
    if v_ip is not null then
      perform violinhero.login_fail(v_ip, v_lim.per_ip);
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;
  delete from violinhero.login_throttle where key = v_who;
  select * into v_class from violinhero.classes where id = v_member.class_id;
  if v_class.closed_at is not null then
    return jsonb_build_object('status', 'closed');
  end if;
  return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'user_id', v_member.user_id,
                            'name', v_member.display_name, 'class_id', v_class.id, 'class_name', v_class.name);
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
-- A assinatura da 0017 (p_audio_duration_ms): esta migração vem depois dela
grant execute on function violinhero.submit_assignment(uuid, uuid, text, int) to authenticated;
grant execute on function violinhero.create_guardian_invite(uuid) to authenticated;
grant execute on function violinhero.accept_guardian_invite(text) to authenticated;
grant execute on function violinhero.list_my_children() to authenticated;
grant execute on function violinhero.get_student_progress(uuid) to authenticated;
grant execute on function violinhero.can_read_submission_audio(text) to authenticated;
grant execute on function violinhero.can_upload_submission_audio(text) to authenticated;
