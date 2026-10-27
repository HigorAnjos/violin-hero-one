-- 0008_challenges.sql — Desafio por link.
-- Quem tem conta cria um desafio a partir de uma partida sua que vale ranking (música, nível e pontos a bater, prazo de
-- 1 a 7 dias). O link (/desafio/<código>) abre para qualquer sessão, anônima inclusive, mas a leitura pública sai só por
-- get_challenge: música, nível, pontos, prazo e o nome gerado do desafiante (ranking_name), nunca user_id, e-mail nem
-- partidas. Aceitar exige conta. A partida de quem aceitou conta pelo servidor, a partir de plays: mesma música e nível,
-- valendo ranking e chegada ao servidor entre o aceite e o prazo. Nada de texto livre (o público inclui crianças).

-- Abertos ao mesmo tempo por conta, contra abuso
create function violinhero.challenge_open_limit() returns int
language sql immutable set search_path = '' as $$ select 20 $$;

create table violinhero.challenges (
  id            uuid primary key default gen_random_uuid(),
  -- 9 bytes aleatórios em base64url (72 bits): o link não se adivinha nem se percorre
  code          text not null unique check (code ~ '^[A-Za-z0-9_-]{12}$'),
  creator_id    uuid not null references auth.users on delete cascade,
  play_id       uuid not null references violinhero.plays on delete cascade,
  song_id       text not null references violinhero.songs on delete cascade,
  level         violinhero.chart_level not null,
  -- A pontuação da partida do desafiante (não os pontos de ranking: música e nível são os mesmos)
  target_score  int not null check (target_score >= 0),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  constraint challenges_deadline check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

create index challenges_creator_idx on violinhero.challenges (creator_id, expires_at desc);
create index challenges_play_idx on violinhero.challenges (play_id);

create table violinhero.challenge_entries (
  challenge_id uuid not null references violinhero.challenges on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  accepted_at  timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index challenge_entries_user_idx on violinhero.challenge_entries (user_id, accepted_at desc);

alter table violinhero.challenges enable row level security;
alter table violinhero.challenge_entries enable row level security;

-- Detalhes só para as partes: quem criou e quem aceitou. Saber o código não abre a tabela.
create policy challenges_select_party on violinhero.challenges for select to authenticated
  using (creator_id = auth.uid()
         or exists (select 1 from violinhero.challenge_entries e where e.challenge_id = challenges.id and e.user_id = auth.uid()));
-- Cada um lê só o próprio aceite: o desafiante vê quem aceitou pelo nome gerado (get_challenge), nunca pelo user_id
create policy challenge_entries_select_own on violinhero.challenge_entries for select to authenticated
  using (user_id = auth.uid());

-- Só leitura, e de challenges sem o criador nem a partida dele: escrever é das funções
grant select (id, code, song_id, level, target_score, created_at, expires_at) on violinhero.challenges to authenticated;
grant select on violinhero.challenge_entries to authenticated;

/** Conta de verdade (não anônima) da sessão; sem sessão 42501, anônimo 28000 (o app pede a conta). */
create function violinhero.require_account() returns uuid
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
  return v_uid;
end $$;

/**
 * Melhor pontuação que conta para o desafio de `p_user`: partida que vale ranking, na música e no nível do desafio,
 * jogada depois do aceite (played_at, que submit_play já limita a now()) e que chegou ao servidor até o prazo
 * (created_at; o relógio do aparelho não estica o prazo). Partida feita sem rede antes de aceitar não conta.
 */
create function violinhero.challenge_best(p_challenge violinhero.challenges, p_user uuid, p_accepted_at timestamptz)
returns int
language sql stable set search_path = '' as $$
  select max(p.score)
    from violinhero.plays p
   where p.user_id = p_user and p.song_id = p_challenge.song_id and p.level = p_challenge.level
     and p.counts_for_record and p.played_at >= p_accepted_at and p.created_at >= p_accepted_at
     and p.created_at <= p_challenge.expires_at
$$;

/**
 * Resultado do lado de quem aceitou: 'won' assim que passa os pontos (a pontuação do desafiante não muda mais);
 * 'tie' e 'lost' só no fim do prazo; null enquanto pode mudar.
 */
create function violinhero.challenge_result(p_target int, p_best int, p_closed boolean) returns text
language sql immutable set search_path = '' as $$
  select case
           when p_best > p_target then 'won'
           when not p_closed then null
           when p_best = p_target then 'tie'
           else 'lost'
         end
$$;

/** O que uma parte do desafio vê: o público mais quem aceitou (nome gerado, melhor pontuação, resultado). */
create function violinhero.challenge_view(p_challenge violinhero.challenges, p_uid uuid) returns jsonb
language sql stable set search_path = '' as $$
  with me as (
    select p_challenge.creator_id = p_uid as is_creator,
           (select e.accepted_at from violinhero.challenge_entries e
             where e.challenge_id = p_challenge.id and e.user_id = p_uid) as accepted_at,
           p_challenge.expires_at <= now() as closed
  ), entries as (
    -- O criador vê todos que aceitaram; quem aceitou vê só a própria linha
    select e.accepted_at, violinhero.ranking_name(pr.animal, pr.nickname_tag) as name, e.user_id = p_uid as is_me,
           violinhero.challenge_best(p_challenge, e.user_id, e.accepted_at) as best
      from violinhero.challenge_entries e
      join violinhero.profiles pr on pr.id = e.user_id
     cross join me
     where e.challenge_id = p_challenge.id and (me.is_creator or e.user_id = p_uid)
  )
  select jsonb_build_object(
           'code', p_challenge.code,
           'song_id', p_challenge.song_id,
           'song_title', s.title,
           'level', p_challenge.level,
           'target_score', p_challenge.target_score,
           'expires_at', p_challenge.expires_at,
           'closed', me.closed,
           'challenger_name', violinhero.ranking_name(pr.animal, pr.nickname_tag),
           'role', case when me.is_creator then 'creator' when me.accepted_at is not null then 'entrant' else 'visitor' end,
           'entries', case when me.is_creator or me.accepted_at is not null then coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'name', en.name, 'is_me', en.is_me, 'accepted_at', en.accepted_at, 'best_score', en.best,
                       'result', violinhero.challenge_result(p_challenge.target_score, en.best, me.closed))
                     order by en.accepted_at, en.name)
                from entries en), '[]'::jsonb) end)
    from me
    join violinhero.songs s on s.id = p_challenge.song_id
    join violinhero.profiles pr on pr.id = p_challenge.creator_id
$$;

/**
 * Cria o desafio a partir de uma partida do jogador que vale ranking, numa música pública, com prazo de 1 a 7 dias.
 * Pedir de novo para a mesma partida com desafio aberto devolve o mesmo (toque duplo não gasta o limite). Partida
 * alheia, inexistente ou de música importada dão P0002; prazo fora de 1–7, partida que não vale ranking ou o limite
 * de abertos, 22023.
 */
create function violinhero.create_challenge(p_play_id uuid, p_days int) returns jsonb
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
    raise exception 'partida não encontrada' using errcode = 'P0002';
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

/** Leitura pelo código, para qualquer sessão (anônima inclusive). Código desconhecido dá P0002. */
create function violinhero.get_challenge(p_code text) returns jsonb
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
    raise exception 'desafio não encontrado' using errcode = 'P0002';
  end if;
  return violinhero.challenge_view(v_row, v_uid);
end $$;

/**
 * Aceita o desafio (precisa de conta). Aceitar de novo devolve o mesmo; o próprio desafiante e desafio encerrado dão
 * 22023, código desconhecido P0002.
 */
create function violinhero.accept_challenge(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := violinhero.require_account();
  v_row violinhero.challenges;
begin
  select * into v_row from violinhero.challenges where code = p_code;
  if not found then
    raise exception 'desafio não encontrado' using errcode = 'P0002';
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

/** Desafios do jogador (criados e aceitos), os mais novos primeiro: até 20, no formato de get_challenge. */
create function violinhero.list_my_challenges() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(violinhero.challenge_view(c, v_uid) order by c.created_at desc, c.id)
      from violinhero.challenges c
     where c.id in (select m.id from violinhero.challenges m
                     where m.creator_id = v_uid
                        or exists (select 1 from violinhero.challenge_entries e where e.challenge_id = m.id and e.user_id = v_uid)
                     order by m.created_at desc, m.id
                     limit 20)), '[]'::jsonb);
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
