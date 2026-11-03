-- 0021_public_name_not_found.sql — Nome público sem repetição e "não encontrado" como HTTP 404.
-- O nome público (ranking_name) era bicho + 4 dígitos e, sem bicho, 'Violinista NNNN': 10 mil combinações por bicho,
-- e já colidiu. Agora todo perfil tem bicho (sorteado quando não escolheu; o jogador troca no Perfil) e o número tem 5
-- dígitos. Os números de antes ganham um dígito no fim (Gato 4821 vira Gato 4821x), o nome segue reconhecível, e
-- bicho + número nunca se repete: índice único, com o trigger sorteando outro número quando o par já é de alguém.

-- A lista de bichos do app (src/services/profile.ts: ANIMALS); muda junto com ela e com ranking_name
create function violinhero.random_animal() returns text
language sql volatile set search_path = '' as $$
  select (array['fox', 'penguin', 'cat'])[1 + floor(random() * 3)::int]
$$;

create function violinhero.random_nickname_tag() returns int
language sql volatile set search_path = '' as $$
  select 10000 + floor(random() * 90000)::int
$$;

-- A conversão é um comando só (um bloco do): atômica também no supabase start, que aplica a migração comando a
-- comando e fora de transação (lock table solto daria 25P01); no scripts/migrate.mjs ela roda dentro do begin dele.
do $conv$
declare
  r     record;
  v_tag int;
begin
  -- Trava a tabela antes de converter: perfil novo no meio da conversão ficaria com o número de 4 dígitos
  lock table violinhero.profiles in access exclusive mode;
  -- A conversão não é edição do jogador: updated_at fica como estava
  alter table violinhero.profiles disable trigger profiles_touch;

  alter table violinhero.profiles
    drop constraint profiles_nickname_tag_check,
    drop constraint profiles_animal_check,
    alter column nickname_tag drop default,
    alter column nickname_tag type int;

  update violinhero.profiles set animal = violinhero.random_animal()
   where animal is null or animal not in ('fox', 'penguin', 'cat');

  -- Cada número de 4 dígitos ganha um dígito sorteado entre os que ninguém do mesmo bicho tem; com os 10 tomados (11
  -- contas no mesmo par), um número novo qualquer
  create index profiles_public_name_tmp on violinhero.profiles (animal, nickname_tag);
  for r in select id, animal, nickname_tag from violinhero.profiles where nickname_tag < 10000 order by created_at, id loop
    select t into v_tag
      from (select r.nickname_tag * 10 + d as t from generate_series(0, 9) d) c
     where not exists (select 1 from violinhero.profiles p where p.animal = r.animal and p.nickname_tag = c.t)
     order by random() limit 1;
    while v_tag is null or exists (select 1 from violinhero.profiles p where p.animal = r.animal and p.nickname_tag = v_tag) loop
      v_tag := violinhero.random_nickname_tag();
    end loop;
    update violinhero.profiles set nickname_tag = v_tag where id = r.id;
  end loop;
  drop index violinhero.profiles_public_name_tmp;

  alter table violinhero.profiles enable trigger profiles_touch;

  alter table violinhero.profiles
    alter column animal set not null,
    add constraint profiles_animal_check check (animal in ('fox', 'penguin', 'cat')),
    alter column nickname_tag set default violinhero.random_nickname_tag(),
    add constraint profiles_nickname_tag_check check (nickname_tag between 10000 and 99999);
  create unique index profiles_public_name on violinhero.profiles (animal, nickname_tag);
end $conv$;

/**
 * Bicho e número do perfil: sem bicho, sorteia (no insert) ou mantém o que tinha (o app manda animal nulo quando o
 * jogador não escolheu); par que já é de outra conta, sorteia outro número. Definer: o par de outra conta não aparece
 * pela RLS de quem troca o bicho.
 */
create function violinhero.profile_public_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.animal := coalesce(new.animal, old.animal);
    if new.animal = old.animal and new.nickname_tag = old.nickname_tag then
      return new;
    end if;
  end if;
  new.animal := coalesce(new.animal, violinhero.random_animal());
  -- Um sorteio por vez: dois perfis não pegam o mesmo par ao mesmo tempo (o índice único é a última garantia)
  perform pg_advisory_xact_lock(hashtext('violinhero.profiles.public_name'));
  while exists (select 1 from violinhero.profiles p
                 where p.animal = new.animal and p.nickname_tag = new.nickname_tag and p.id <> new.id) loop
    new.nickname_tag := violinhero.random_nickname_tag();
  end loop;
  return new;
end $$;

create trigger profiles_public_name before insert or update of animal, nickname_tag on violinhero.profiles
  for each row execute function violinhero.profile_public_name();

-- O número virou int: a versão smallint sai (as funções que chamam ranking_name passam a achar esta)
drop function violinhero.ranking_name(text, smallint);
create function violinhero.ranking_name(p_animal text, p_tag int) returns text
language sql immutable set search_path = '' as $$
  select case p_animal
           when 'fox' then 'Raposa'
           when 'penguin' then 'Pinguim'
           when 'cat' then 'Gato'
           else 'Violinista'
         end || ' ' || p_tag::text
$$;

-- ---------- "não encontrado" como 404 ----------
-- P0002 não tem status no PostgREST e virava HTTP 500, igual a erro de servidor. PT404 (SQLSTATE PTxyz vira o status
-- xyz) responde 404 com o mesmo corpo ({code, message}). Só muda o código: quem é negado continua igual a inexistente.
-- Ficam com P0002 submit_play (a fila de partidas do app) e o que só o servidor chama (import_song, class_link_*).
-- Os corpos são os da última versão de cada função (0008, 0011–0013, 0017, 0018).

create or replace function violinhero.own_class(p_class_id uuid, p_teacher uuid) returns violinhero.classes
language plpgsql stable set search_path = '' as $$
declare
  v_row violinhero.classes;
begin
  select * into v_row from violinhero.classes where id = p_class_id and teacher_id = p_teacher;
  if not found then
    raise exception 'turma não encontrada' using errcode = 'PT404';
  end if;
  return v_row;
end $$;

create or replace function violinhero.own_member(p_member_id uuid, p_teacher uuid) returns violinhero.class_members
language plpgsql stable set search_path = '' as $$
declare
  v_row violinhero.class_members;
begin
  select m.* into v_row from violinhero.class_members m
    join violinhero.classes c on c.id = m.class_id
   where m.id = p_member_id and c.teacher_id = p_teacher;
  if not found then
    raise exception 'aluno não encontrado' using errcode = 'PT404';
  end if;
  return v_row;
end $$;

create or replace function violinhero.own_assignment(p_assignment_id uuid, p_teacher uuid) returns violinhero.assignments
language plpgsql stable set search_path = '' as $$
declare
  v_row violinhero.assignments;
begin
  select a.* into v_row from violinhero.assignments a
    join violinhero.classes c on c.id = a.class_id
   where a.id = p_assignment_id and c.teacher_id = p_teacher;
  if not found then
    raise exception 'tarefa não encontrada' using errcode = 'PT404';
  end if;
  return v_row;
end $$;

create or replace function violinhero.watched_member(p_member_id uuid) returns violinhero.class_members
language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row violinhero.class_members;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  select m.* into v_row
    from violinhero.class_members m
    join violinhero.classes c on c.id = m.class_id
   where m.id = p_member_id
     and (c.teacher_id = v_uid
          or (m.active and exists (select 1 from violinhero.guardian_links g where g.member_id = m.id and g.guardian_id = v_uid)));
  if not found then
    raise exception 'aluno não encontrado' using errcode = 'PT404';
  end if;
  return v_row;
end $$;

create or replace function violinhero.accept_guardian_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := violinhero.require_guardian();
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite violinhero.guardian_invites;
  v_member violinhero.class_members;
begin
  select i.* into v_invite
    from violinhero.guardian_invites i
    join violinhero.class_members m on m.id = i.member_id and m.active
    join violinhero.classes c on c.id = m.class_id and c.closed_at is null
   where i.code = v_code
     and ((i.used_at is null and i.expires_at > now()) or i.used_by = v_uid)
   for update of i;
  if not found then
    raise exception 'convite não encontrado' using errcode = 'PT404';
  end if;
  select * into v_member from violinhero.class_members where id = v_invite.member_id;
  if not exists (select 1 from violinhero.guardian_links where guardian_id = v_uid and member_id = v_member.id) then
    if (select count(*) from violinhero.guardian_links where member_id = v_member.id) >= violinhero.guardian_limit() then
      raise exception 'limite de % responsáveis por aluno', violinhero.guardian_limit() using errcode = 'VHLIM';
    end if;
    insert into violinhero.guardian_links (guardian_id, member_id) values (v_uid, v_member.id);
  end if;
  update violinhero.guardian_invites set used_at = coalesce(used_at, now()), used_by = v_uid where code = v_invite.code;
  return violinhero.child_view(v_member);
end $$;

create or replace function violinhero.create_assignment(
  p_class_id         uuid,
  p_song_id          text,
  p_level            violinhero.chart_level,
  p_mode             violinhero.play_mode,
  p_due_at           timestamptz,
  p_instruction_key  text default null,
  p_instruction_text text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_class violinhero.classes := violinhero.own_class(p_class_id, violinhero.require_teacher());
  v_text  text := nullif(regexp_replace(btrim(coalesce(p_instruction_text, '')), '\s+', ' ', 'g'), '');
  v_row   violinhero.assignments;
begin
  if v_class.closed_at is not null then
    raise exception 'turma encerrada' using errcode = '22023';
  end if;
  if p_level is null or not exists (
    select 1 from violinhero.songs s join violinhero.song_charts c on c.song_id = s.id and c.level = p_level
     where s.id = p_song_id and s.visibility = 'public') then
    raise exception 'música ou nível não encontrado' using errcode = 'PT404';
  end if;
  if p_mode is null or p_mode = 'practice' then
    raise exception 'modo inválido: %', p_mode using errcode = '22023';
  end if;
  if p_due_at is null or p_due_at <= now() or p_due_at > now() + interval '60 days' then
    raise exception 'prazo inválido' using errcode = '22023';
  end if;
  if p_instruction_key is not null and p_instruction_key not in
     ('tocar-inteira', 'capricha-afinacao', 'devagar-primeiro', 'atencao-ritmo', 'grave-com-calma') then
    raise exception 'instrução desconhecida: %', p_instruction_key using errcode = '22023';
  end if;
  if length(v_text) > 140 then
    raise exception 'instrução longa demais' using errcode = '22023';
  end if;
  insert into violinhero.assignments (class_id, song_id, level, mode, instruction_key, instruction_text, due_at)
  values (v_class.id, p_song_id, p_level, p_mode, p_instruction_key, v_text, p_due_at)
  returning * into v_row;
  return violinhero.assignment_teacher_view(v_row);
end $$;

create or replace function violinhero.review_submission(p_submission_id uuid, p_grade int, p_concept text, p_comment text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := violinhero.require_teacher();
  v_comment text := regexp_replace(btrim(coalesce(p_comment, '')), '\s+', ' ', 'g');
  v_row     violinhero.reviews;
begin
  if not exists (
    select 1 from violinhero.submissions s
      join violinhero.assignments a on a.id = s.assignment_id
      join violinhero.classes c on c.id = a.class_id
     where s.id = p_submission_id and c.teacher_id = v_uid) then
    raise exception 'entrega não encontrada' using errcode = 'PT404';
  end if;
  if (p_grade is null) = (p_concept is null) or p_grade not between 1 and 5
     or p_concept not in ('otimo', 'muito-bom', 'bom', 'precisa-praticar') then
    raise exception 'nota ou conceito inválido' using errcode = '22023';
  end if;
  if length(v_comment) > 280 then
    raise exception 'comentário longo demais' using errcode = '22023';
  end if;
  insert into violinhero.reviews (submission_id, teacher_id, grade, concept, comment)
  values (p_submission_id, v_uid, p_grade, p_concept, v_comment)
  on conflict (submission_id) do update
    set teacher_id = excluded.teacher_id, grade = excluded.grade, concept = excluded.concept,
        comment = excluded.comment, reviewed_at = now()
  returning * into v_row;
  return jsonb_build_object('submission_id', v_row.submission_id, 'grade', v_row.grade, 'concept', v_row.concept,
                            'comment', v_row.comment, 'reviewed_at', v_row.reviewed_at);
end $$;

create or replace function violinhero.submit_assignment(p_assignment_id uuid, p_play_id uuid default null, p_audio_path text default null,
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
    raise exception 'tarefa não encontrada' using errcode = 'PT404';
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
    raise exception 'música ou nível não encontrado' using errcode = 'PT404';
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

create or replace function violinhero.create_challenge(p_play_id uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := violinhero.require_account();
  v_play violinhero.plays;
  v_row  violinhero.challenges;
begin
  if p_days is null or p_days not between 1 and 7 then
    raise exception 'prazo inválido: % dias', p_days using errcode = '22023';
  end if;
  select p.* into v_play
    from violinhero.plays p
    join violinhero.songs s on s.id = p.song_id and s.visibility = 'public'
   where p.id = p_play_id and p.user_id = v_uid;
  if not found then
    raise exception 'partida não encontrada' using errcode = 'PT404';
  end if;
  if not v_play.counts_for_record then
    raise exception 'só partida que vale ranking vira desafio' using errcode = '22023';
  end if;

  -- Um pedido por vez da mesma conta: o limite não escapa em paralelo
  perform pg_advisory_xact_lock(hashtext('violinhero.challenges'), hashtext(v_uid::text));
  select * into v_row from violinhero.challenges
   where creator_id = v_uid and play_id = p_play_id and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    if (select count(*) from violinhero.challenges where creator_id = v_uid and expires_at > now())
       >= violinhero.challenge_open_limit() then
      raise exception 'limite de % desafios abertos', violinhero.challenge_open_limit() using errcode = '22023';
    end if;
    insert into violinhero.challenges (code, creator_id, play_id, song_id, level, target_score, expires_at)
    values (translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'), v_uid, v_play.id, v_play.song_id,
            v_play.level, v_play.score, now() + make_interval(days => p_days))
    returning * into v_row;
  end if;
  return violinhero.challenge_view(v_row, v_uid);
end $$;

create or replace function violinhero.get_challenge(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row violinhero.challenges;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  select * into v_row from violinhero.challenges where code = p_code;
  if not found then
    raise exception 'desafio não encontrado' using errcode = 'PT404';
  end if;
  return violinhero.challenge_view(v_row, v_uid);
end $$;

create or replace function violinhero.accept_challenge(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := violinhero.require_account();
  v_row violinhero.challenges;
begin
  select * into v_row from violinhero.challenges where code = p_code;
  if not found then
    raise exception 'desafio não encontrado' using errcode = 'PT404';
  end if;
  if v_row.creator_id = v_uid then
    raise exception 'o desafio é seu' using errcode = '22023';
  end if;
  if not exists (select 1 from violinhero.challenge_entries where challenge_id = v_row.id and user_id = v_uid) then
    if v_row.expires_at <= now() then
      raise exception 'desafio encerrado' using errcode = '22023';
    end if;
    -- Quem aceitou entra no ranking pelo nome gerado: garante o perfil (usuário antigo do banco compartilhado)
    insert into violinhero.profiles (id, is_anonymous) values (v_uid, false) on conflict (id) do nothing;
    insert into violinhero.challenge_entries (challenge_id, user_id)
    values (v_row.id, v_uid)
    on conflict (challenge_id, user_id) do nothing;
  end if;
  return violinhero.challenge_view(v_row, v_uid);
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
