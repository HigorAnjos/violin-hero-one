-- 0006_badges_streak.sql — Selos e sequência: uma regra só.
-- A regra dos selos sai de dentro de submit_play para violinhero.play_badges, a mesma de badgesFor
-- (src/game/engine/badges.ts); os casos de src/game/engine/badgeCases.json rodam nos dois lados.
-- Prática passa a não marcar dia de sequência (o tempo do dia continua somando), e o reenvio
-- (duplicate) devolve os selos na ordem de BADGES, como a primeira resposta.

/** Ids na ordem de BADGES (badges.ts): a ordem das respostas e da coleção. */
create function violinhero.badge_order() returns text[]
language sql immutable set search_path = '' as $$
  select array['primeira-musica', 'sem-erros', 'combo-25', 'combo-50', 'combo-100', 'afinacao-de-ouro']
$$;

/**
 * Selos que a partida merece, na ordem de BADGES (sem tirar os já conquistados). Prática não dá selo.
 * Afinação de ouro: média de até 10 ¢ (com as duas casas que plays guarda) acertando 90% ou mais.
 */
create function violinhero.play_badges(p_practice boolean, p_finished boolean, p_perfect int, p_great int, p_good int,
                                       p_miss int, p_max_combo int, p_mean_abs_cents numeric) returns text[]
language sql immutable set search_path = '' as $$
  with h as (select p_perfect + p_great + p_good as hits, p_perfect + p_great + p_good + p_miss as total)
  select coalesce(array_agg(b order by i), '{}')
    from h, unnest(violinhero.badge_order()) with ordinality o(b, i)
   where not p_practice
     and case b
           when 'primeira-musica' then p_finished and h.total > 0
           when 'sem-erros' then p_finished and h.total > 0 and p_miss = 0
           when 'combo-25' then p_max_combo >= 25
           when 'combo-50' then p_max_combo >= 50
           when 'combo-100' then p_max_combo >= 100
           when 'afinacao-de-ouro' then p_finished and p_mean_abs_cents is not null
                                        and round(p_mean_abs_cents, 2) <= 10 and h.hits * 10 >= 9 * h.total
         end
$$;

/**
 * Igual à de 0005 menos três pontos: os selos vêm de play_badges, prática não marca dia de sequência
 * e o reenvio devolve os selos na ordem de BADGES (e streak null quando não há sequência).
 */
create or replace function violinhero.submit_play(p_play jsonb) returns jsonb
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
  v_badges    text[];
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
      'badges', coalesce((select jsonb_agg(b order by i) from unnest(violinhero.badge_order()) with ordinality o(b, i)
                           where exists (select 1 from violinhero.badges_earned e
                                          where e.user_id = v_uid and e.play_id = v_play.id and e.badge_id = b)),
                         '[]'::jsonb),
      'streak', case when v_streak.user_id is not null then jsonb_build_object(
                  'current_days', v_streak.current_days, 'best_days', v_streak.best_days,
                  'last_day', v_streak.last_day) end);
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

  -- Combo e pontos coerentes com as contagens. Só um erro quebra o combo, menos na partida comum
  -- que virou prática ao mudar a velocidade (Decisões): a prática começa com combo zero, uma quebra a mais
  if v_combo > v_hits
     or (v_hits > 0 and v_combo < ceil(v_hits::numeric / (v_miss + case when v_mode = 'practice' then 2 else 1 end))) then
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

  begin
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
  exception when unique_violation then
    -- O mesmo client_id chegou em paralelo (fila reenviando antes da resposta): a outra venceu, vale a dela
    return violinhero.submit_play(p_play);
  end;

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

  -- Selos: a regra de badgesFor (badges.ts), com a afinação já em duas casas
  v_badges := violinhero.play_badges(v_mode = 'practice', v_finished, v_perfect, v_great, v_good, v_miss, v_combo, v_mean_abs);
  with ins as (
    insert into violinhero.badges_earned (user_id, badge_id, play_id)
    select v_uid, b, v_play.id from unnest(v_badges) b
    on conflict (user_id, badge_id) do nothing
    returning badge_id
  )
  select coalesce(array_agg(badge_id), '{}') into v_new from ins;
  -- Na ordem de BADGES
  v_new := array(select b from unnest(v_badges) with ordinality t(b, i) where b = any(v_new) order by i);

  -- Minutos do dia e sequência; partida sem nota julgada e prática não marcam o dia (o tempo soma)
  insert into violinhero.play_days (user_id, day, seconds, plays)
  values (v_uid, v_day, v_duration / 1000, case when v_total > 0 and v_mode <> 'practice' then 1 else 0 end)
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
