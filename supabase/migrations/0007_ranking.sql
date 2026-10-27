-- 0007_ranking.sql — Ranking global por música e nível, da semana e geral.
-- Só conta com conta (anônimo joga, mas não aparece); nome público é ranking_name (bicho + número),
-- nunca o apelido digitado nem o e-mail. Ninguém lê plays de outro: o ranking sai só por get_ranking,
-- que devolve posição, nome, pontos, precisão e se a linha é do próprio jogador.

-- Semana do ranking: começa na segunda 00:00 de Brasília (a mesma conta que submit_play grava em plays.week)
create function violinhero.ranking_week(p_at timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', violinhero.local_day(p_at))::date
$$;

-- Sem índice novo: o plays_ranking_song_idx da 0005 (song_id, level, week, ranking_points) já atende a semana e o
-- geral. Com 120 mil partidas, o planejador lê só as linhas da música e do nível por ele e ordena o resto em memória
-- (0,8 ms na semana, 6 ms no geral); índices por jogador ficaram fora do plano e só pesariam em cada submit_play.

/**
 * Ranking de uma música num nível: `p_period` 'week' (semana corrente) ou 'all' (geral). Uma linha por conta,
 * com a melhor partida dela (não a soma); empate fica com quem chegou primeiro ao servidor. Devolve as `p_limit`
 * primeiras (1 a 100) e, se o jogador da sessão estiver fora delas, a linha dele no fim. Música que o jogador não
 * pode ler dá P0002, igual a inexistente.
 */
create function violinhero.get_ranking(p_song_id text, p_level violinhero.chart_level, p_period text, p_limit int default 20)
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
     where s.id = p_song_id and (s.visibility = 'public' or s.owner_id = v_uid)) then
    raise exception 'música ou nível não encontrado' using errcode = 'P0002';
  end if;
  v_week := case when p_period = 'week' then violinhero.ranking_week(now()) end;

  return query
  with best as (
    select distinct on (p.user_id) p.user_id, p.ranking_points, p.accuracy, p.created_at
      from violinhero.plays p
     where p.song_id = p_song_id and p.level = p_level and p.counts_for_record
       and (v_week is null or p.week = v_week)
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
