-- 0009_import_song.sql — Música importada (arquivo) ou escrita no editor: a Edge Function import-song é a única
-- escritora. Ela converte no servidor e grava por violinhero.import_song, que só o servidor (service_role) executa:
-- o app perde o insert/update direto em songs e song_sources que a 0004 dava ao dono (ler e apagar a sua continuam).
-- Música do jogador é privada e fica fora de ranking e de desafio (decisão do Higor, ciclo 4).

-- Original do .mxl (zip, em base64) e do editor (o JSON da melodia). Valores novos só são usados fora desta transação.
alter type violinhero.source_format add value if not exists 'mxl';
alter type violinhero.source_format add value if not exists 'song';

-- Escrita direta do app sai: só leitura e remoção da própria música
revoke insert, update on violinhero.songs from authenticated;
revoke insert, update on violinhero.song_sources from authenticated;
drop policy songs_insert_own on violinhero.songs;
drop policy songs_update_own on violinhero.songs;
drop policy song_sources_all_own on violinhero.song_sources;

-- O original do catálogo não tem dono: fica só para o servidor
create policy song_sources_select_own on violinhero.song_sources for select to authenticated
  using (exists (
    select 1 from violinhero.songs s
     where s.id = song_sources.song_id and s.owner_id = auth.uid() and s.origin <> 'catalog'));

create policy song_sources_delete_own on violinhero.song_sources for delete to authenticated
  using (exists (
    select 1 from violinhero.songs s
     where s.id = song_sources.song_id and s.owner_id = auth.uid() and s.origin <> 'catalog'));

/** Músicas do jogador (importadas e do editor, somadas). O mesmo número de IMPORT_LIMITS.songsPerUser (importScore.ts). */
create function violinhero.own_song_limit() returns int
language sql immutable set search_path = '' as $$ select 50 $$;

/**
 * Grava a música convertida pela Edge Function: ficha, charts por nível (o hash sai da coluna gerada) e o original.
 * `p_replace` regrava uma música do editor do mesmo dono (salvar de novo não gasta vaga). Só o servidor chama: o
 * dono vem do JWT conferido pela função, nunca do app. Erros: VHLIM limite atingido, P0002 música a regravar não
 * encontrada, 22023 entrada inválida.
 */
create function violinhero.import_song(
  p_owner   uuid,
  p_song_id text,
  p_origin  text,
  p_sheet   jsonb,
  p_charts  jsonb,
  p_source  jsonb,
  p_replace boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_level text;
  v_chart jsonb;
  v_song  violinhero.songs;
begin
  if p_owner is null or not exists (select 1 from auth.users u where u.id = p_owner) then
    raise exception 'jogador desconhecido' using errcode = '22023';
  end if;
  if p_origin is null or p_origin not in ('imported', 'editor') then
    raise exception 'origem inválida: %', p_origin using errcode = '22023';
  end if;
  if jsonb_typeof(p_charts) is distinct from 'object' or p_charts = '{}'::jsonb then
    raise exception 'música sem chart' using errcode = '22023';
  end if;

  -- Um pedido por vez do mesmo jogador: o limite não escapa em paralelo
  perform pg_advisory_xact_lock(hashtext('violinhero.import_song'), hashtext(p_owner::text));

  if p_replace then
    select * into v_song from violinhero.songs
     where id = p_song_id and owner_id = p_owner and origin = 'editor' and p_origin = 'editor'
     for update;
    if not found then
      raise exception 'música não encontrada' using errcode = 'P0002';
    end if;
    update violinhero.songs set
      title = p_sheet->>'title', composer = coalesce(p_sheet->>'composer', ''), bpm = (p_sheet->>'bpm')::numeric,
      time_beats = (p_sheet->>'time_beats')::int, time_unit = (p_sheet->>'time_unit')::int,
      key = coalesce(p_sheet->>'key', ''), duration_seconds = (p_sheet->>'duration_seconds')::numeric
     where id = p_song_id
    returning * into v_song;
    delete from violinhero.song_charts where song_id = p_song_id;
  else
    if (select count(*) from violinhero.songs where owner_id = p_owner) >= violinhero.own_song_limit() then
      raise exception 'limite de % músicas', violinhero.own_song_limit() using errcode = 'VHLIM';
    end if;
    insert into violinhero.songs (id, title, composer, bpm, time_beats, time_unit, key, duration_seconds, origin, owner_id, visibility)
    values (p_song_id, p_sheet->>'title', coalesce(p_sheet->>'composer', ''), (p_sheet->>'bpm')::numeric,
            (p_sheet->>'time_beats')::int, (p_sheet->>'time_unit')::int, coalesce(p_sheet->>'key', ''),
            (p_sheet->>'duration_seconds')::numeric, p_origin::violinhero.song_origin, p_owner, 'private')
    returning * into v_song;
  end if;

  for v_level, v_chart in select key, value from jsonb_each(p_charts) loop
    insert into violinhero.song_charts (song_id, level, format_version, chart)
    values (v_song.id, v_level::violinhero.chart_level, (v_chart->>'formatVersion')::int, v_chart);
  end loop;

  insert into violinhero.song_sources (song_id, format, file_name, content)
  values (v_song.id, (p_source->>'format')::violinhero.source_format, p_source->>'file_name', p_source->>'content')
  on conflict (song_id) do update set format = excluded.format, file_name = excluded.file_name, content = excluded.content;

  return jsonb_build_object(
    'id', v_song.id, 'title', v_song.title, 'composer', v_song.composer, 'bpm', v_song.bpm,
    'time_beats', v_song.time_beats, 'time_unit', v_song.time_unit, 'key', v_song.key,
    'duration_seconds', v_song.duration_seconds, 'origin', v_song.origin,
    'levels', (select jsonb_agg(c.level order by c.level) from violinhero.song_charts c where c.song_id = v_song.id),
    -- chave do cache offline de cada nível, a mesma que get_song devolve
    'hashes', (select jsonb_object_agg(c.level, c.hash) from violinhero.song_charts c where c.song_id = v_song.id));
end $$;

-- Ranking só de música pública: a do jogador (privada) dá "não encontrada" até para o dono. O resto é o da 0007.
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
-- import_song fica de fora de propósito: só a Edge Function (service_role) grava música do jogador.
revoke execute on all functions in schema violinhero from public, anon, authenticated;
grant execute on function violinhero.get_song(text, violinhero.chart_level) to authenticated;
grant execute on function violinhero.ensure_my_profile() to authenticated;
grant execute on function violinhero.submit_play(jsonb) to authenticated;
grant execute on function violinhero.get_ranking(text, violinhero.chart_level, text, int) to authenticated;
grant execute on function violinhero.create_challenge(uuid, int) to authenticated;
grant execute on function violinhero.get_challenge(text) to authenticated;
grant execute on function violinhero.accept_challenge(text) to authenticated;
grant execute on function violinhero.list_my_challenges() to authenticated;
