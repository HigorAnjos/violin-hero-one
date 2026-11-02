-- 0018_students_off_ranking.sql — Conta de aluno da turma fica fora do ranking e do desafio.
-- O aluno entra sem e-mail pela class-login e vira uma conta não anônima (e-mail sintético): sem isto, get_ranking o
-- listava pelo nome gerado e o desafio o aceitava. Público com crianças (LGPD): a conta da turma fica só na turma.
-- Aluno é quem tem class_members.user_id, ativo ou não (a conta nunca deixa de ser de aluno).

/** Conta de verdade (não anônima e não de aluno da turma); sem sessão 42501, anônimo ou aluno 28000. */
create or replace function violinhero.require_account() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true) then
    raise exception 'desafio pede conta' using errcode = '28000';
  end if;
  if exists (select 1 from violinhero.class_members m where m.user_id = v_uid) then
    raise exception 'conta de aluno da turma não entra em desafio' using errcode = '28000';
  end if;
  return v_uid;
end $$;

-- Ranking só de música pública e só de conta com e-mail: anônimo e aluno da turma jogam, mas não aparecem. O resto é o da 0009.
create or replace function violinhero.get_ranking(p_song_id text, p_level violinhero.chart_level, p_period text, p_limit int default 20)
returns table (
  rank         int,
  ranking_name text,
  points       int,
  accuracy     numeric,
  is_me        boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if p_period is null or p_period not in ('week', 'all') then
    raise exception 'período inválido: %', p_period using errcode = '22023';
  end if;
  if p_level is null or not exists (
    select 1 from violinhero.songs s
      join violinhero.song_charts c on c.song_id = s.id and c.level = p_level
     where s.id = p_song_id and s.visibility = 'public') then
    raise exception 'música ou nível não encontrado' using errcode = 'P0002';
  end if;
  v_week := case when p_period = 'week' then violinhero.ranking_week(now()) end;

  return query
  with best as (
    select distinct on (p.user_id) p.user_id, p.ranking_points, p.accuracy, p.created_at
      from violinhero.plays p
     where p.song_id = p_song_id and p.level = p_level and p.counts_for_record
       and (v_week is null or p.week = v_week)
       and not exists (select 1 from violinhero.class_members m where m.user_id = p.user_id)
     order by p.user_id, p.ranking_points desc, p.created_at, p.id
  ), ranked as (
    select (row_number() over (order by b.ranking_points desc, b.created_at, b.user_id))::int as pos,
           violinhero.ranking_name(pr.animal, pr.nickname_tag) as name,
           b.ranking_points, b.accuracy, b.user_id = v_uid as me
      from best b
      join violinhero.profiles pr on pr.id = b.user_id and not pr.is_anonymous
  )
  select r.pos, r.name, r.ranking_points, r.accuracy, r.me
    from ranked r
   where r.pos <= least(greatest(coalesce(p_limit, 20), 1), 100) or r.me
   order by r.pos;
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
