-- 0005_plays.sql — Progresso: partidas, recordes, selos e sequência de dias.
-- O app nunca escreve nestas tabelas: tudo entra por violinhero.submit_play, que confere os números
-- contra o chart do banco e calcula recorde, selos, sequência e pontos de ranking no servidor.
-- Leitura: só o próprio jogador (anônimo incluído; conta não é exigida para jogar).

-- Dia e semana do jogador: o público é do Brasil e o app não manda fuso. Um fuso fixo no servidor
-- evita que o aparelho escolha o dia (e "estique" a sequência trocando o relógio).
create function violinhero.local_day(p_at timestamptz) returns date
language sql stable set search_path = '' as $$
  select (p_at at time zone 'America/Sao_Paulo')::date
$$;

create type violinhero.play_mode as enum ('arcade', 'sheet', 'practice', 'strings3d');

create table violinhero.plays (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  -- Id gerado no aparelho: reenvio da fila offline (ciclo3-sync) devolve a mesma partida
  client_id          uuid not null,
  song_id            text not null references violinhero.songs on delete cascade,
  level              violinhero.chart_level not null,
  -- Chart jogado: um recorde de chart que mudou continua apontando para o chart de então
  chart_hash         text not null,
  mode               violinhero.play_mode not null,
  practice           boolean generated always as (mode = 'practice') stored,
  -- Laço A–B ligado em algum momento (só na prática)
  looped             boolean not null default false,
  -- Menor fator de andamento usado, 0,5 a 1 (abaixo de 1 só na prática)
  speed              numeric(3, 2) not null default 1 check (speed between 0.5 and 1),
  -- "Tocar sem falha": a orquestra não para
  no_fail            boolean not null default false,
  finished           boolean not null,
  score              int not null check (score >= 0),
  -- Recalculada no servidor a partir das contagens
  accuracy           numeric(5, 2) not null check (accuracy between 0 and 100),
  perfect            int not null check (perfect >= 0),
  great              int not null check (great >= 0),
  good               int not null check (good >= 0),
  miss               int not null check (miss >= 0),
  max_combo          int not null check (max_combo >= 0),
  -- Desvio médio absoluto dos acertos e afinação média por corda (Sol, Ré, Lá, Mi), em cents
  mean_abs_cents     numeric(5, 2) check (mean_abs_cents between 0 and 100),
  string_cents       numeric(5, 2)[] not null check (cardinality(string_cents) = 4),
  duration_ms        int not null check (duration_ms between 0 and 4 * 3600 * 1000),
  played_at          timestamptz not null,
  created_at         timestamptz not null default now(),
  -- Para o ranking (floor ciclo3-ranking): quem vale, quantos pontos e em que semana
  counts_for_record  boolean generated always as (finished and mode <> 'practice') stored,
  ranking_points     int not null default 0 check (ranking_points >= 0),
  week               date not null,
  constraint plays_client_id_key unique (user_id, client_id),
  constraint plays_practice_shape check (mode = 'practice' or (not looped and speed = 1))
);

create index plays_user_played_idx on violinhero.plays (user_id, played_at desc);
create index plays_ranking_week_idx on violinhero.plays (week, ranking_points desc) where counts_for_record;
create index plays_ranking_song_idx on violinhero.plays (song_id, level, week, ranking_points desc) where counts_for_record;

-- Melhor pontuação por música e nível (substitui vh:recordes quando há sessão)
create table violinhero.records (
  user_id    uuid not null references auth.users on delete cascade,
  song_id    text not null references violinhero.songs on delete cascade,
  level      violinhero.chart_level not null,
  score      int not null check (score >= 0),
  accuracy   numeric(5, 2) not null,
  play_id    uuid not null references violinhero.plays on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, song_id, level)
);

-- Mesmos ids de BADGES em src/game/engine/badges.ts
create table violinhero.badges_earned (
  user_id   uuid not null references auth.users on delete cascade,
  badge_id  text not null check (badge_id in
    ('primeira-musica', 'sem-erros', 'combo-25', 'combo-50', 'combo-100', 'afinacao-de-ouro')),
  play_id   uuid not null references violinhero.plays on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- Tempo tocado por dia (local_day); a sequência sai daqui
create table violinhero.play_days (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  seconds int not null default 0 check (seconds >= 0),
  plays   int not null default 0 check (plays >= 0),
  primary key (user_id, day)
);

-- Dias seguidos até o último dia com partida. O app mostra 0 se last_day ficou antes de ontem.
create table violinhero.streaks (
  user_id      uuid primary key references auth.users on delete cascade,
  current_days int not null check (current_days >= 0),
  best_days    int not null check (best_days >= current_days),
  last_day     date not null,
  updated_at   timestamptz not null default now()
);

alter table violinhero.plays enable row level security;
alter table violinhero.records enable row level security;
alter table violinhero.badges_earned enable row level security;
alter table violinhero.play_days enable row level security;
alter table violinhero.streaks enable row level security;

create policy plays_select_own on violinhero.plays for select to authenticated using (user_id = auth.uid());
create policy records_select_own on violinhero.records for select to authenticated using (user_id = auth.uid());
create policy badges_earned_select_own on violinhero.badges_earned for select to authenticated using (user_id = auth.uid());
create policy play_days_select_own on violinhero.play_days for select to authenticated using (user_id = auth.uid());
create policy streaks_select_own on violinhero.streaks for select to authenticated using (user_id = auth.uid());

-- Só leitura: escrever é do servidor (submit_play)
grant select on violinhero.plays, violinhero.records, violinhero.badges_earned, violinhero.play_days,
  violinhero.streaks to authenticated;

-- Apelido do ranking: bicho do perfil + número, nunca digitado (o nickname livre não vai a público)
alter table violinhero.profiles
  add column nickname_tag smallint not null default (1000 + floor(random() * 9000))::smallint
    check (nickname_tag between 1000 and 9999);

create function violinhero.ranking_name(p_animal text, p_tag smallint) returns text
language sql immutable set search_path = '' as $$
  select case p_animal
           when 'fox' then 'Raposa'
           when 'penguin' then 'Pinguim'
           when 'cat' then 'Gato'
           else 'Violinista'
         end || ' ' || p_tag::text
$$;

/**
 * Perfil de quem já estava em auth.users antes do trigger de 0001 (o banco é compartilhado com
 * outro app): cria se faltar e devolve o perfil do jogador da sessão.
 */
create function violinhero.ensure_my_profile() returns violinhero.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row violinhero.profiles;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  insert into violinhero.profiles (id, is_anonymous)
  select u.id, coalesce(u.is_anonymous, false) from auth.users u where u.id = v_uid
  on conflict (id) do nothing;
  select * into v_row from violinhero.profiles where id = v_uid;
  return v_row;
end $$;

/** Ataques (notas sem ligadura), notas no total, compasso mais cheio e notas por segundo no compasso mais denso. */
create function violinhero.chart_stats(p_chart jsonb, out attacks int, out notes int, out max_measure_notes int,
                                       out max_rate numeric)
language sql immutable set search_path = '' as $$
  with m as (
    select (mm->>'beats')::numeric as beats, coalesce(mm->'notes', '[]'::jsonb) as ns
      from jsonb_array_elements(p_chart->'measures') mm
  ), per as (
    select beats, jsonb_array_length(ns) as total,
           (select count(*) from jsonb_array_elements(ns) n where coalesce((n->>'tie')::boolean, false) is not true) as atk
      from m
  )
  select coalesce(sum(atk), 0)::int, coalesce(sum(total), 0)::int, coalesce(max(total), 0)::int,
         coalesce(max(total / nullif(beats * 60 / (p_chart->>'bpm')::numeric, 0)), 0)
    from per
$$;

/**
 * Teto de pontos para estas contagens. O multiplicador sobe a cada 10 acertos seguidos (score.ts:
 * multiplierFor), então o máximo vem dos acertos em sequências tão longas quanto o combo máximo
 * deixa, com os Perfeitos nos multiplicadores mais altos.
 */
create function violinhero.max_score(p_perfect int, p_great int, p_good int, p_max_combo int) returns bigint
language sql immutable set search_path = '' as $$
  with h as (
    select p_perfect + p_great + p_good as hits, greatest(p_max_combo, 1) as run
  ), mult as (
    select least(4, 1 + (i - 1) / 10) as m
      from h
     cross join lateral generate_series(0, (h.hits - 1) / h.run) r
     cross join lateral generate_series(1, least(h.run, h.hits - r * h.run)) i
     where h.hits > 0
  ), ranked as (
    select m, row_number() over (order by m desc) as k from mult
  )
  select coalesce(sum(m * case when k <= p_perfect then 100 when k <= p_perfect + p_great then 70 else 40 end), 0)
    from ranked
$$;

create function violinhero.json_int(p jsonb, k text) returns int
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric <> trunc((p->>k)::numeric) then
    raise exception 'partida inválida: % precisa ser inteiro', k using errcode = '22023';
  end if;
  return (p->>k)::int;
end $$;

/**
 * Grava uma partida do jogador da sessão e devolve o que ela rendeu. Confere os números contra o
 * chart do banco e recusa o impossível (errcode 22023); música ou nível que o jogador não pode
 * ler dá P0002, igual a inexistente. Reenvio com o mesmo client_id devolve a partida já gravada.
 *
 * p_play: client_id, song_id, level, mode, finished, no_fail, looped, speed, score, accuracy,
 * counts {perfect, great, good, miss}, max_combo, mean_abs_cents, string_cents [4], duration_ms,
 * played_at. Resposta: play_id, accuracy, record {previous, improved} | null, badges [ids novos],
 * streak {current_days, best_days, last_day}, duplicate.
 */
create function violinhero.submit_play(p_play jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_client    uuid;
  v_song      text := p_play->>'song_id';
  v_level     violinhero.chart_level;
  v_mode      violinhero.play_mode;
  v_chart     jsonb;
  v_hash      text;
  v_stats     record;
  v_counts    jsonb := p_play->'counts';
  v_perfect   int;
  v_great     int;
  v_good      int;
  v_miss      int;
  v_hits      int;
  v_total     int;
  v_score     int;
  v_combo     int;
  v_duration  int;
  v_finished  boolean;
  v_no_fail   boolean;
  v_looped    boolean;
  v_speed     numeric;
  v_accuracy  numeric;
  v_sent_acc  numeric;
  v_mean_abs  numeric;
  v_cents     numeric(5, 2)[];
  v_played_at timestamptz;
  v_day       date;
  v_play      violinhero.plays;
  v_prev      violinhero.records;
  v_record    jsonb := null;
  v_badges    text[] := '{}';
  v_new       text[];
  v_streak    violinhero.streaks;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if jsonb_typeof(p_play) is distinct from 'object' or jsonb_typeof(v_counts) is distinct from 'object' then
    raise exception 'partida inválida: formato' using errcode = '22023';
  end if;

  begin
    v_client := (p_play->>'client_id')::uuid;
    v_level := (p_play->>'level')::violinhero.chart_level;
    v_mode := (p_play->>'mode')::violinhero.play_mode;
    v_played_at := (p_play->>'played_at')::timestamptz;
  exception when others then
    raise exception 'partida inválida: client_id, level, mode ou played_at' using errcode = '22023';
  end;
  if v_client is null or v_song is null or v_level is null or v_mode is null or v_played_at is null then
    raise exception 'partida inválida: campo obrigatório vazio' using errcode = '22023';
  end if;

  -- Reenvio da fila offline: a mesma partida, sem contar de novo
  select * into v_play from violinhero.plays where user_id = v_uid and client_id = v_client;
  if found then
    select * into v_streak from violinhero.streaks where user_id = v_uid;
    return jsonb_build_object(
      'play_id', v_play.id, 'accuracy', v_play.accuracy, 'duplicate', true,
      'record', case when v_play.counts_for_record then jsonb_build_object(
                  'previous', null,
                  'improved', exists (select 1 from violinhero.records r where r.play_id = v_play.id)) end,
      'badges', coalesce((select jsonb_agg(b.badge_id order by b.badge_id) from violinhero.badges_earned b
                           where b.play_id = v_play.id), '[]'::jsonb),
      'streak', jsonb_build_object('current_days', v_streak.current_days, 'best_days', v_streak.best_days,
                                   'last_day', v_streak.last_day));
  end if;

  -- Mesma regra de leitura de get_song: inexistente e alheia dão o mesmo erro
  select c.chart, c.hash into v_chart, v_hash
    from violinhero.songs s
    join violinhero.song_charts c on c.song_id = s.id and c.level = v_level
   where s.id = v_song and (s.visibility = 'public' or s.owner_id = v_uid);
  if not found then
    raise exception 'música ou nível não encontrado' using errcode = 'P0002';
  end if;
  v_stats := violinhero.chart_stats(v_chart);

  v_perfect := violinhero.json_int(v_counts, 'perfect');
  v_great := violinhero.json_int(v_counts, 'great');
  v_good := violinhero.json_int(v_counts, 'good');
  v_miss := violinhero.json_int(v_counts, 'miss');
  v_score := violinhero.json_int(p_play, 'score');
  v_combo := violinhero.json_int(p_play, 'max_combo');
  v_duration := violinhero.json_int(p_play, 'duration_ms');
  if least(v_perfect, v_great, v_good, v_miss, v_score, v_combo, v_duration) < 0 then
    raise exception 'partida inválida: número negativo' using errcode = '22023';
  end if;
  v_hits := v_perfect + v_great + v_good;
  v_total := v_hits + v_miss;

  if jsonb_typeof(p_play->'finished') is distinct from 'boolean'
     or jsonb_typeof(p_play->'no_fail') is distinct from 'boolean'
     or jsonb_typeof(p_play->'looped') is distinct from 'boolean'
     or jsonb_typeof(p_play->'speed') is distinct from 'number'
     or jsonb_typeof(p_play->'accuracy') is distinct from 'number' then
    raise exception 'partida inválida: finished, no_fail, looped, speed ou accuracy' using errcode = '22023';
  end if;
  v_finished := (p_play->>'finished')::boolean;
  v_no_fail := (p_play->>'no_fail')::boolean;
  v_looped := (p_play->>'looped')::boolean;
  v_speed := (p_play->>'speed')::numeric;
  v_sent_acc := (p_play->>'accuracy')::numeric;

  if v_mode <> 'practice' and (v_looped or v_speed <> 1) then
    raise exception 'partida inválida: laço ou velocidade fora da prática' using errcode = '22023';
  end if;
  if v_speed < 0.5 or v_speed > 1 then
    raise exception 'partida inválida: velocidade' using errcode = '22023';
  end if;

  -- Quantidade de notas: a partida inteira julga cada ataque do chart uma vez; a prática repete
  -- trechos, então o teto é o compasso mais denso tocado durante toda a duração
  if v_mode <> 'practice' then
    if v_total > v_stats.attacks or (v_finished and v_total <> v_stats.attacks) then
      raise exception 'partida inválida: % notas julgadas, o chart tem %', v_total, v_stats.attacks using errcode = '22023';
    end if;
  elsif v_total > ceil(v_stats.max_rate * v_duration / 1000.0) + v_stats.max_measure_notes then
    raise exception 'partida inválida: notas demais para a duração da prática' using errcode = '22023';
  end if;

  -- Combo e pontos coerentes com as contagens
  if v_combo > v_hits or (v_hits > 0 and v_combo < ceil(v_hits::numeric / (v_miss + 1))) then
    raise exception 'partida inválida: combo máximo' using errcode = '22023';
  end if;
  if v_score % 10 <> 0
     or v_score < 100 * v_perfect + 70 * v_great + 40 * v_good
     or v_score > violinhero.max_score(v_perfect, v_great, v_good, v_combo) then
    raise exception 'partida inválida: pontos fora do possível' using errcode = '22023';
  end if;

  v_accuracy := case when v_total > 0 then (100 * v_perfect + 70 * v_great + 40 * v_good)::numeric / v_total else 0 end;
  if abs(v_sent_acc - v_accuracy) > 0.01 then
    raise exception 'partida inválida: precisão não bate com as contagens' using errcode = '22023';
  end if;

  -- Afinação: nada sem acerto; dentro de 100 ¢ (além disso a nota é outra)
  if jsonb_typeof(p_play->'string_cents') is distinct from 'array' or jsonb_array_length(p_play->'string_cents') <> 4
     or exists (select 1 from jsonb_array_elements(p_play->'string_cents') e
                 where jsonb_typeof(e) not in ('number', 'null')
                    or (jsonb_typeof(e) = 'number' and (abs(e::text::numeric) > 100 or v_hits = 0))) then
    raise exception 'partida inválida: afinação por corda' using errcode = '22023';
  end if;
  v_cents := array(select case when jsonb_typeof(e) = 'number' then round(e::text::numeric, 2) end
                     from jsonb_array_elements(p_play->'string_cents') with ordinality t(e, i) order by i);
  if jsonb_typeof(p_play->'mean_abs_cents') = 'number' then
    v_mean_abs := round((p_play->>'mean_abs_cents')::numeric, 2);
  elsif jsonb_typeof(coalesce(p_play->'mean_abs_cents', 'null')) <> 'null' then
    raise exception 'partida inválida: mean_abs_cents' using errcode = '22023';
  end if;
  if (v_hits = 0) <> (v_mean_abs is null) or v_mean_abs < 0 or v_mean_abs > 100 then
    raise exception 'partida inválida: afinação média' using errcode = '22023';
  end if;

  -- Relógio do aparelho: futuro vira agora; mais de 30 dias na fila não entra (sequência e semana)
  v_played_at := least(v_played_at, now());
  if v_played_at < now() - interval '30 days' then
    raise exception 'partida inválida: antiga demais' using errcode = '22023';
  end if;
  v_day := violinhero.local_day(v_played_at);

  -- Quem jogou sem perfil (usuário antigo do banco compartilhado) ganha um agora
  insert into violinhero.profiles (id, is_anonymous)
  select u.id, coalesce(u.is_anonymous, false) from auth.users u where u.id = v_uid
  on conflict (id) do nothing;

  insert into violinhero.plays (user_id, client_id, song_id, level, chart_hash, mode, looped, speed, no_fail, finished,
                                score, accuracy, perfect, great, good, miss, max_combo, mean_abs_cents, string_cents,
                                duration_ms, played_at, ranking_points, week)
  values (v_uid, v_client, v_song, v_level, v_hash, v_mode, v_looped, v_speed, v_no_fail, v_finished,
          v_score, round(v_accuracy, 2), v_perfect, v_great, v_good, v_miss, v_combo, v_mean_abs, v_cents,
          v_duration, v_played_at,
          -- Pontos de ranking: a pontuação pesada pelo nível; prática e partida interrompida não valem
          case when v_finished and v_mode <> 'practice'
               then round(v_score * case v_level when 'easy' then 1 when 'medium' then 1.25 else 1.5 end)::int
               else 0 end,
          date_trunc('week', v_day)::date)
  returning * into v_play;

  -- Recorde por música e nível
  if v_play.counts_for_record then
    select * into v_prev from violinhero.records where user_id = v_uid and song_id = v_song and level = v_level for update;
    v_record := jsonb_build_object('previous', v_prev.score, 'improved', v_prev.score is null or v_score > v_prev.score);
    insert into violinhero.records (user_id, song_id, level, score, accuracy, play_id)
    values (v_uid, v_song, v_level, v_score, v_play.accuracy, v_play.id)
    on conflict (user_id, song_id, level) do update
      set score = excluded.score, accuracy = excluded.accuracy, play_id = excluded.play_id, updated_at = now()
      where violinhero.records.score < excluded.score;
  end if;

  -- Selos: mesma regra de badgesFor (src/game/engine/badges.ts); prática não dá selo
  if v_mode <> 'practice' then
    if v_finished and v_total > 0 then v_badges := array_append(v_badges, 'primeira-musica'); end if;
    if v_finished and v_total > 0 and v_miss = 0 then v_badges := array_append(v_badges, 'sem-erros'); end if;
    if v_combo >= 25 then v_badges := array_append(v_badges, 'combo-25'); end if;
    if v_combo >= 50 then v_badges := array_append(v_badges, 'combo-50'); end if;
    if v_combo >= 100 then v_badges := array_append(v_badges, 'combo-100'); end if;
    if v_finished and v_mean_abs is not null and v_mean_abs <= 10 and v_hits >= 0.9 * v_total then
      v_badges := array_append(v_badges, 'afinacao-de-ouro');
    end if;
  end if;
  with ins as (
    insert into violinhero.badges_earned (user_id, badge_id, play_id)
    select v_uid, b, v_play.id from unnest(v_badges) b
    on conflict (user_id, badge_id) do nothing
    returning badge_id
  )
  select coalesce(array_agg(badge_id), '{}') into v_new from ins;
  -- Na ordem de BADGES
  v_new := array(select b from unnest(v_badges) with ordinality t(b, i) where b = any(v_new) order by i);

  -- Minutos do dia e sequência; partida sem nota julgada não marca o dia
  insert into violinhero.play_days (user_id, day, seconds, plays)
  values (v_uid, v_day, v_duration / 1000, case when v_total > 0 then 1 else 0 end)
  on conflict (user_id, day) do update
    set seconds = violinhero.play_days.seconds + excluded.seconds, plays = violinhero.play_days.plays + excluded.plays;

  -- Recalcula das linhas (a fila offline pode entregar dias fora de ordem): ilhas de dias seguidos
  with d as (
    select day, day - (row_number() over (order by day))::int as island
      from violinhero.play_days where user_id = v_uid and plays > 0
  ), runs as (
    select count(*)::int as len, max(day) as last from d group by island
  )
  insert into violinhero.streaks (user_id, current_days, best_days, last_day)
  select v_uid, (select len from runs order by last desc limit 1), max(len), max(last) from runs
  having count(*) > 0
  on conflict (user_id) do update
    set current_days = excluded.current_days, best_days = excluded.best_days, last_day = excluded.last_day,
        updated_at = now();
  select * into v_streak from violinhero.streaks where user_id = v_uid;

  return jsonb_build_object(
    'play_id', v_play.id, 'accuracy', v_play.accuracy, 'duplicate', false, 'record', v_record,
    'badges', to_jsonb(v_new),
    'streak', case when v_streak.user_id is not null then jsonb_build_object(
                'current_days', v_streak.current_days, 'best_days', v_streak.best_days,
                'last_day', v_streak.last_day) end);
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
revoke execute on all functions in schema violinhero from public, anon, authenticated;
grant execute on function violinhero.get_song(text, violinhero.chart_level) to authenticated;
grant execute on function violinhero.ensure_my_profile() to authenticated;
grant execute on function violinhero.submit_play(jsonb) to authenticated;
