-- 0013_guardians.sql — Responsável pelo aluno e o progresso que professor e responsável veem.
-- O professor gera um convite (código de uso único, 7 dias) para um aluno ativo; o responsável, com conta de e-mail
-- (nem anônima nem de aluno), aceita e fica ligado àquele aluno. Ele vê só o próprio filho: nome cadastrado, turma,
-- progresso (recordes, sequência, partidas recentes do catálogo), tarefas, entregas e revisões; e ouve as entregas
-- (policy do Storage na 0014). O professor da turma vê o mesmo progresso de qualquer aluno dela. Músicas próprias do
-- aluno (importadas ou do editor) ficam fora do progresso: são privadas dele.

create table violinhero.guardian_invites (
  -- 10 símbolos do alfabeto da turma (50 bits): não se adivinha
  code       text primary key check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  member_id  uuid not null references violinhero.class_members on delete cascade,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references auth.users on delete set null
);

create index guardian_invites_member_idx on violinhero.guardian_invites (member_id, expires_at desc);

create table violinhero.guardian_links (
  guardian_id uuid not null references auth.users on delete cascade,
  member_id   uuid not null references violinhero.class_members on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (guardian_id, member_id)
);

create index guardian_links_member_idx on violinhero.guardian_links (member_id);

alter table violinhero.guardian_invites enable row level security;
alter table violinhero.guardian_links enable row level security;

-- ---------- regras ----------
/** Responsáveis por aluno, contra convite repassado adiante. */
create function violinhero.guardian_limit() returns int
language sql immutable set search_path = '' as $$ select 4 $$;

/** Responsável: conta de verdade que não é de aluno (sem sessão 42501; anônimo ou aluno 28000). */
create function violinhero.require_guardian() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true)
     or exists (select 1 from violinhero.class_members m where m.user_id = v_uid) then
    raise exception 'responsável precisa de conta com e-mail' using errcode = '28000';
  end if;
  return v_uid;
end $$;

/**
 * Aluno que o jogador da sessão pode acompanhar: o professor da turma (aluno ativo ou não) ou um responsável ligado a
 * ele (só enquanto ativo). Para qualquer outro, ou aluno inexistente, P0002.
 */
create function violinhero.watched_member(p_member_id uuid) returns violinhero.class_members
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
    raise exception 'aluno não encontrado' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

/** O filho como o responsável o vê na lista. */
create function violinhero.child_view(p_member violinhero.class_members) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('student_id', p_member.id, 'name', p_member.display_name, 'class_name', c.name,
                            'class_closed', c.closed_at is not null)
    from violinhero.classes c where c.id = p_member.class_id
$$;

-- ---------- funções do app ----------
/**
 * Convite para o responsável de um aluno ativo de turma aberta do professor (senão P0002 ou 22023). Enquanto houver um
 * convite aberto (não usado e no prazo) para o aluno, devolve o mesmo. Devolve { code, expires_at }.
 */
create function violinhero.create_guardian_invite(p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := violinhero.require_teacher();
  v_member violinhero.class_members := violinhero.own_member(p_member_id, v_uid);
  v_row    violinhero.guardian_invites;
begin
  if not v_member.active or exists (select 1 from violinhero.classes c where c.id = v_member.class_id and c.closed_at is not null) then
    raise exception 'turma encerrada ou aluno inativo' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('violinhero.guardian_invites'), hashtext(v_member.id::text));
  select * into v_row from violinhero.guardian_invites
   where member_id = v_member.id and used_at is null and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    loop
      begin
        insert into violinhero.guardian_invites (code, member_id, created_by, expires_at)
        values ((select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(b, i) % 32 + 1, 1), '' order by i)
                   from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) i),
                v_member.id, v_uid, now() + interval '7 days')
        returning * into v_row;
        exit;
      exception when unique_violation then
        -- código repetido: sorteia de novo
      end;
    end loop;
  end if;
  return jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at);
end $$;

/**
 * O responsável aceita o convite e passa a acompanhar o aluno. Código desconhecido, usado por outro, vencido, de aluno
 * inativo ou turma encerrada dão o mesmo P0002; aceitar de novo o próprio convite devolve o mesmo; passar dos
 * responsáveis por aluno, VHLIM. Devolve o filho, como em list_my_children.
 */
create function violinhero.accept_guardian_invite(p_code text) returns jsonb
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
    raise exception 'convite não encontrado' using errcode = 'P0002';
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

/** Filhos (alunos ativos) que o jogador da sessão acompanha, por nome. */
create function violinhero.list_my_children() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(violinhero.child_view(m) order by violinhero.name_key(m.display_name), m.id)
      from violinhero.guardian_links g
      join violinhero.class_members m on m.id = g.member_id and m.active
     where g.guardian_id = v_uid), '[]'::jsonb);
end $$;

/**
 * Progresso de um aluno para o professor da turma ou um responsável dele (outro qualquer, P0002): o filho/aluno, a
 * sequência de dias, os recordes e as 20 partidas mais recentes em músicas do catálogo, os minutos dos últimos 7 dias
 * e as tarefas da turma com a situação dele. Aluno que ainda não entrou tem progresso vazio.
 */
create function violinhero.get_student_progress(p_member_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member violinhero.class_members := violinhero.watched_member(p_member_id);
  v_user   uuid := v_member.user_id;
begin
  return jsonb_build_object(
    'student', violinhero.child_view(v_member),
    'streak', (select jsonb_build_object('current_days', s.current_days, 'best_days', s.best_days, 'last_day', s.last_day)
                 from violinhero.streaks s where s.user_id = v_user),
    'minutes_last_7_days', coalesce((
      select round(sum(d.seconds) / 60.0)::int from violinhero.play_days d
       where d.user_id = v_user and d.day > violinhero.local_day(now()) - 7), 0),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object('song_id', r.song_id, 'song_title', s.title, 'level', r.level,
                                          'score', r.score, 'accuracy', r.accuracy, 'updated_at', r.updated_at)
                       order by r.updated_at desc, r.song_id, r.level)
        from violinhero.records r
        join violinhero.songs s on s.id = r.song_id and s.visibility = 'public'
       where r.user_id = v_user), '[]'::jsonb),
    'recent_plays', coalesce((
      select jsonb_agg(x.j order by x.played_at desc, x.id)
        from (select p.id, p.played_at,
                     jsonb_build_object('play_id', p.id, 'song_id', p.song_id, 'song_title', s.title, 'level', p.level,
                                        'mode', p.mode, 'score', p.score, 'accuracy', p.accuracy,
                                        'finished', p.finished, 'played_at', p.played_at) as j
                from violinhero.plays p
                join violinhero.songs s on s.id = p.song_id and s.visibility = 'public'
               where p.user_id = v_user
               order by p.played_at desc, p.id
               limit 20) x), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(violinhero.assignment_fields(a) || violinhero.assignment_status(a, v_member)
                       order by a.created_at desc, a.id)
        from violinhero.assignments a where a.class_id = v_member.class_id), '[]'::jsonb));
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
