-- 0012_assignments.sql — Tarefas da turma, entregas do aluno e revisão do professor.
-- A tarefa pede uma música do catálogo num nível e num modo, com prazo, e uma instrução curta (de uma lista fixa ou um
-- texto do professor, visível só na turma). Quanto o aluno fez sai de plays, como no desafio: conta a partida terminada
-- da música, nível e modo da tarefa, jogada depois de a tarefa ser criada e que chegou ao servidor até o prazo. A entrega
-- é o aluno escolhendo uma dessas partidas (ou deixando o servidor pegar a melhor) e, se gravou, o caminho do áudio no
-- bucket privado submissions (policies e retenção na 0014). O professor revisa com nota de 1 a 5 ou conceito e um
-- comentário curto; depois da revisão a entrega não muda mais. Nada disso é legível direto: só por função.

create table violinhero.assignments (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references violinhero.classes on delete cascade,
  song_id          text not null references violinhero.songs on delete cascade,
  level            violinhero.chart_level not null,
  -- Prática não termina valendo (counts_for_record): a tarefa pede uma partida de verdade
  mode             violinhero.play_mode not null check (mode <> 'practice'),
  -- Mesmos ids de ASSIGNMENT_INSTRUCTIONS em src/services/classroom.ts (o texto em pt-BR fica no app)
  instruction_key  text check (instruction_key in
    ('tocar-inteira', 'capricha-afinacao', 'devagar-primeiro', 'atencao-ritmo', 'grave-com-calma')),
  instruction_text text check (instruction_text = btrim(instruction_text) and length(instruction_text) between 1 and 140),
  created_at       timestamptz not null default now(),
  due_at           timestamptz not null,
  constraint assignments_deadline check (due_at > created_at and due_at <= created_at + interval '60 days')
);

create index assignments_class_idx on violinhero.assignments (class_id, created_at desc);

create table violinhero.submissions (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references violinhero.assignments on delete cascade,
  member_id        uuid not null references violinhero.class_members on delete cascade,
  -- A partida que vale; some se a música for apagada (a entrega e a revisão ficam)
  play_id          uuid references violinhero.plays on delete set null,
  -- <turma>/<aluno>/<tarefa>/<arquivo> no bucket submissions; nulo sem gravação ou depois da retenção
  audio_path       text check (audio_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(webm|ogg|m4a|mp4)$'),
  audio_deleted_at timestamptz,
  submitted_at     timestamptz not null default now(),
  constraint submissions_one_per_student unique (assignment_id, member_id)
);

create index submissions_member_idx on violinhero.submissions (member_id);

create table violinhero.reviews (
  submission_id uuid primary key references violinhero.submissions on delete cascade,
  teacher_id    uuid not null references auth.users on delete cascade,
  grade         smallint check (grade between 1 and 5),
  -- Mesmos ids de REVIEW_CONCEPTS em src/services/classroom.ts
  concept       text check (concept in ('otimo', 'muito-bom', 'bom', 'precisa-praticar')),
  comment       text not null default '' check (comment = btrim(comment) and length(comment) <= 280),
  reviewed_at   timestamptz not null default now(),
  constraint reviews_grade_or_concept check ((grade is null) <> (concept is null))
);

create index reviews_reviewed_idx on violinhero.reviews (reviewed_at);

alter table violinhero.assignments enable row level security;
alter table violinhero.submissions enable row level security;
alter table violinhero.reviews enable row level security;

-- ---------- regras ----------
/** A partida conta para a tarefa? Do aluno, terminada, música + nível + modo da tarefa, jogada e chegada no prazo. */
create function violinhero.play_counts_for(p_play violinhero.plays, p_assignment violinhero.assignments, p_user uuid)
returns boolean
language sql stable set search_path = '' as $$
  select p_play.user_id = p_user and p_play.finished and p_play.song_id = p_assignment.song_id
     and p_play.level = p_assignment.level and p_play.mode = p_assignment.mode
     and p_play.played_at >= p_assignment.created_at and p_play.created_at >= p_assignment.created_at
     and p_play.created_at <= p_assignment.due_at
$$;

/** Melhor partida do aluno que conta para a tarefa (maior pontuação; empate, a primeira), ou nula. */
create function violinhero.assignment_best(p_assignment violinhero.assignments, p_user uuid) returns violinhero.plays
language sql stable set search_path = '' as $$
  select p.* from violinhero.plays p
   where p_user is not null and p.user_id = p_user and p.song_id = p_assignment.song_id and p.level = p_assignment.level
     and violinhero.play_counts_for(p, p_assignment, p_user)
   order by p.score desc, p.created_at, p.id
   limit 1
$$;

/** Os campos da tarefa que todo mundo da turma vê. */
create function violinhero.assignment_fields(p_assignment violinhero.assignments) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'id', p_assignment.id, 'class_id', p_assignment.class_id, 'song_id', p_assignment.song_id,
           'song_title', (select s.title from violinhero.songs s where s.id = p_assignment.song_id),
           'level', p_assignment.level, 'mode', p_assignment.mode,
           'instruction_key', p_assignment.instruction_key, 'instruction_text', p_assignment.instruction_text,
           'created_at', p_assignment.created_at, 'due_at', p_assignment.due_at, 'closed', p_assignment.due_at <= now())
$$;

/** Situação de um aluno numa tarefa: melhor partida que conta, entrega e revisão. */
create function violinhero.assignment_status(p_assignment violinhero.assignments, p_member violinhero.class_members)
returns jsonb
language sql stable set search_path = '' as $$
  with best as (select * from violinhero.assignment_best(p_assignment, p_member.user_id) b where b.id is not null),
  sub as (select * from violinhero.submissions s where s.assignment_id = p_assignment.id and s.member_id = p_member.id)
  select jsonb_build_object(
           'best', (select jsonb_build_object('play_id', b.id, 'score', b.score, 'accuracy', b.accuracy, 'played_at', b.played_at)
                      from best b),
           'submission', (select jsonb_build_object(
                                   'id', s.id, 'play_id', s.play_id, 'score', p.score, 'accuracy', p.accuracy,
                                   'submitted_at', s.submitted_at, 'audio_path', s.audio_path,
                                   'audio_deleted', s.audio_deleted_at is not null)
                            from sub s left join violinhero.plays p on p.id = s.play_id),
           'review', (select jsonb_build_object('grade', r.grade, 'concept', r.concept, 'comment', r.comment,
                                                'reviewed_at', r.reviewed_at)
                        from sub s join violinhero.reviews r on r.submission_id = s.id))
$$;

/** Tarefa de uma turma do professor da sessão; de outro ou inexistente, P0002. */
create function violinhero.own_assignment(p_assignment_id uuid, p_teacher uuid) returns violinhero.assignments
language plpgsql stable set search_path = '' as $$
declare
  v_row violinhero.assignments;
begin
  select a.* into v_row from violinhero.assignments a
    join violinhero.classes c on c.id = a.class_id
   where a.id = p_assignment_id and c.teacher_id = p_teacher;
  if not found then
    raise exception 'tarefa não encontrada' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

/** O que o professor vê da tarefa: os campos e, por aluno ativo, a situação (nome só para ele, que é da turma). */
create function violinhero.assignment_teacher_view(p_assignment violinhero.assignments) returns jsonb
language sql stable set search_path = '' as $$
  select violinhero.assignment_fields(p_assignment) || jsonb_build_object(
           'students', coalesce((
             select jsonb_agg(jsonb_build_object('student_id', m.id, 'name', m.display_name)
                              || violinhero.assignment_status(p_assignment, m)
                              order by violinhero.name_key(m.display_name), m.created_at)
               from violinhero.class_members m
              where m.class_id = p_assignment.class_id and m.active), '[]'::jsonb))
$$;

-- ---------- funções do app: professor ----------
/**
 * Cria a tarefa numa turma aberta do professor: música do catálogo com o nível pedido (senão P0002), modo que não seja
 * prática, prazo entre agora e 60 dias, instrução da lista e/ou texto de até 140 letras (senão 22023). Devolve a tarefa
 * no formato de get_assignment.
 */
create function violinhero.create_assignment(
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
    raise exception 'música ou nível não encontrado' using errcode = 'P0002';
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

/** Tarefas de uma turma do professor, as mais novas primeiro, com quantos alunos ativos entregaram e foram revisados. */
create function violinhero.list_class_assignments(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class violinhero.classes := violinhero.own_class(p_class_id, violinhero.require_teacher());
begin
  return coalesce((
    select jsonb_agg(violinhero.assignment_fields(a) || jsonb_build_object(
             'student_count', (select count(*) from violinhero.class_members m where m.class_id = a.class_id and m.active),
             'submitted_count', (select count(*) from violinhero.submissions s
                                   join violinhero.class_members m on m.id = s.member_id and m.active
                                  where s.assignment_id = a.id),
             'reviewed_count', (select count(*) from violinhero.submissions s
                                  join violinhero.class_members m on m.id = s.member_id and m.active
                                  join violinhero.reviews r on r.submission_id = s.id
                                 where s.assignment_id = a.id))
           order by a.created_at desc, a.id)
      from violinhero.assignments a where a.class_id = v_class.id), '[]'::jsonb);
end $$;

/** A tarefa com a situação de cada aluno ativo, só para o professor da turma (de outro ou inexistente, P0002). */
create function violinhero.get_assignment(p_assignment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return violinhero.assignment_teacher_view(violinhero.own_assignment(p_assignment_id, violinhero.require_teacher()));
end $$;

/**
 * Revisa (ou revisa de novo) a entrega: nota de 1 a 5 ou conceito, nunca os dois nem nenhum, e comentário de até 280
 * letras (senão 22023). Entrega de turma de outro professor ou inexistente, P0002. A retenção do áudio conta 30 dias
 * a partir da última revisão. Devolve a revisão.
 */
create function violinhero.review_submission(p_submission_id uuid, p_grade int, p_concept text, p_comment text default '')
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
    raise exception 'entrega não encontrada' using errcode = 'P0002';
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

-- ---------- funções do app: aluno ----------
/** Tarefas da turma do aluno da sessão (ativo), as de prazo mais perto primeiro, com a situação dele em cada uma. */
create function violinhero.get_my_assignments() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(violinhero.assignment_fields(a) || violinhero.assignment_status(a, m)
                     order by a.due_at <= now(), a.due_at, a.id)
      from violinhero.class_members m
      join violinhero.assignments a on a.class_id = m.class_id
     where m.user_id = v_uid and m.active), '[]'::jsonb);
end $$;

/**
 * Entrega a tarefa: `p_play_id` é a partida escolhida (precisa contar para a tarefa, senão 22023); nula, o servidor
 * pega a melhor que conta (nenhuma, 22023). `p_audio_path` é o caminho já enviado ao bucket submissions, sempre na
 * pasta <turma>/<aluno>/<tarefa>/ do próprio aluno (senão 22023). Entregar de novo troca partida e áudio até a revisão;
 * depois dela, 22023. Tarefa fora da turma do aluno ativo, P0002; turma encerrada, 22023. A entrega pode chegar depois
 * do prazo (o áudio pode ter ficado na fila sem rede): o que vale o prazo é a partida. Devolve a tarefa como em
 * get_my_assignments.
 */
create function violinhero.submit_assignment(p_assignment_id uuid, p_play_id uuid default null, p_audio_path text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_assignment violinhero.assignments;
  v_member     violinhero.class_members;
  v_closed     timestamptz;
  v_play       violinhero.plays;
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
  if exists (select 1 from violinhero.submissions s join violinhero.reviews r on r.submission_id = s.id
              where s.assignment_id = v_assignment.id and s.member_id = v_member.id) then
    raise exception 'entrega já revisada' using errcode = '22023';
  end if;
  insert into violinhero.submissions (assignment_id, member_id, play_id, audio_path)
  values (v_assignment.id, v_member.id, v_play.id, p_audio_path)
  on conflict (assignment_id, member_id) do update
    set play_id = excluded.play_id, audio_path = excluded.audio_path, submitted_at = now();
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
grant execute on function violinhero.submit_assignment(uuid, uuid, text) to authenticated;
