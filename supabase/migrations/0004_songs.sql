-- 0004_songs.sql — Biblioteca: ficha da música, charts por nível e arquivo original.
-- Quem lê uma música: o catálogo (visibility = 'public') é de todos os jogadores com sessão,
-- anônimo incluído; a importada só o dono. Ciclo 5 (turmas) estende a mesma regra nos três
-- lugares que a repetem: policy de songs, policy de song_charts e violinhero.get_song.

create type violinhero.song_origin as enum ('catalog', 'imported', 'editor');
create type violinhero.song_visibility as enum ('public', 'private');
create type violinhero.chart_level as enum ('easy', 'medium', 'hard');
create type violinhero.source_format as enum ('musicxml', 'midi', 'abc');

create table violinhero.songs (
  id               text primary key default gen_random_uuid()::text
                   check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  title            text not null check (title = btrim(title) and length(title) between 1 and 120),
  composer         text not null default '' check (length(composer) <= 120),
  bpm              numeric(6, 2) not null check (bpm > 0 and bpm <= 400),
  time_beats       int not null check (time_beats between 1 and 32),
  time_unit        int not null check (time_unit in (2, 4, 8)),
  key              text not null default '' check (length(key) <= 32),
  duration_seconds numeric(8, 2) not null check (duration_seconds > 0),
  origin           violinhero.song_origin not null,
  owner_id         uuid references auth.users on delete cascade default auth.uid(),
  visibility       violinhero.song_visibility not null default 'private',
  -- Ordem na estante do catálogo (CATALOG_ORDER do conversor); nula fora do catálogo. Única só no
  -- commit: o seed reordena a estante linha a linha dentro de uma transação.
  catalog_position int check (catalog_position >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Catálogo é público e sem dono; o resto tem dono e é privado (turma entra no ciclo 5)
  constraint songs_catalog_shape check (
    case when origin = 'catalog'
      then owner_id is null and visibility = 'public'
      else owner_id is not null and visibility = 'private' and catalog_position is null
    end),
  constraint songs_catalog_position_key unique (catalog_position) deferrable initially deferred
);

create index songs_owner_idx on violinhero.songs (owner_id) where owner_id is not null;

create trigger songs_touch before update on violinhero.songs
  for each row execute function violinhero.touch_updated_at();

create table violinhero.song_charts (
  song_id        text not null references violinhero.songs on delete cascade,
  level          violinhero.chart_level not null,
  format_version int not null check (format_version >= 1),
  chart          jsonb not null,
  -- Chave do cache offline, opaca para o app (só compara). jsonb_send é a forma canônica do jsonb
  -- (chaves ordenadas, espaçamento fixo) e, ao contrário de convert_to, é imutável como a coluna
  -- gerada exige: o mesmo chart dá o mesmo hash venha do seed ou de um import.
  hash           text generated always as (encode(sha256(jsonb_send(chart)), 'hex')) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (song_id, level),
  constraint song_charts_matches_row check (
    jsonb_typeof(chart) = 'object'
    and chart->>'id' = song_id
    and chart->>'level' = level::text
    and chart->>'formatVersion' = format_version::text)
);

create trigger song_charts_touch before update on violinhero.song_charts
  for each row execute function violinhero.touch_updated_at();

create table violinhero.song_sources (
  song_id    text primary key references violinhero.songs on delete cascade,
  format     violinhero.source_format not null,
  file_name  text not null check (length(file_name) between 1 and 200),
  -- Texto (MusicXML, ABC); MIDI, quando entrar, vai em base64
  content    text not null check (octet_length(content) <= 2 * 1024 * 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger song_sources_touch before update on violinhero.song_sources
  for each row execute function violinhero.touch_updated_at();

alter table violinhero.songs enable row level security;
alter table violinhero.song_charts enable row level security;
alter table violinhero.song_sources enable row level security;

create policy songs_select_readable on violinhero.songs for select to authenticated
  using (visibility = 'public' or owner_id = auth.uid());

-- O dono escreve só o que é dele e nunca no catálogo; anônimo também importa (conta não é exigida)
create policy songs_insert_own on violinhero.songs for insert to authenticated
  with check (owner_id = auth.uid() and origin <> 'catalog');

create policy songs_update_own on violinhero.songs for update to authenticated
  using (owner_id = auth.uid() and origin <> 'catalog')
  with check (owner_id = auth.uid() and origin <> 'catalog');

create policy songs_delete_own on violinhero.songs for delete to authenticated
  using (owner_id = auth.uid() and origin <> 'catalog');

create policy song_charts_select_readable on violinhero.song_charts for select to authenticated
  using (exists (
    select 1 from violinhero.songs s
     where s.id = song_charts.song_id and (s.visibility = 'public' or s.owner_id = auth.uid())));

-- O original do catálogo não tem dono: fica só para o servidor
create policy song_sources_all_own on violinhero.song_sources for all to authenticated
  using (exists (
    select 1 from violinhero.songs s
     where s.id = song_sources.song_id and s.owner_id = auth.uid() and s.origin <> 'catalog'))
  with check (exists (
    select 1 from violinhero.songs s
     where s.id = song_sources.song_id and s.owner_id = auth.uid() and s.origin <> 'catalog'));

-- Permissões de objeto: id, dono, visibilidade, posição e datas são do servidor
grant select, delete on violinhero.songs to authenticated;
grant insert (title, composer, bpm, time_beats, time_unit, key, duration_seconds, origin)
  on violinhero.songs to authenticated;
grant update (title, composer, bpm, time_beats, time_unit, key, duration_seconds)
  on violinhero.songs to authenticated;

grant select on violinhero.song_charts to authenticated;

grant select, delete on violinhero.song_sources to authenticated;
grant insert (song_id, format, file_name, content) on violinhero.song_sources to authenticated;
grant update (format, file_name, content) on violinhero.song_sources to authenticated;

/**
 * Ficha + chart de um nível, com o hash do chart. Mesma regra de leitura das policies; música
 * inexistente e música que o jogador não pode ler dão o mesmo resultado (nenhuma linha).
 */
create function violinhero.get_song(p_song_id text, p_level violinhero.chart_level)
returns table (
  id               text,
  title            text,
  composer         text,
  bpm              numeric,
  time_beats       int,
  time_unit        int,
  key              text,
  duration_seconds numeric,
  origin           violinhero.song_origin,
  visibility       violinhero.song_visibility,
  level            violinhero.chart_level,
  format_version   int,
  chart            jsonb,
  hash             text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.composer, s.bpm, s.time_beats, s.time_unit, s.key, s.duration_seconds,
         s.origin, s.visibility, c.level, c.format_version, c.chart, c.hash
    from violinhero.songs s
    join violinhero.song_charts c on c.song_id = s.id and c.level = p_level
   where s.id = p_song_id
     and (s.visibility = 'public' or s.owner_id = auth.uid())
$$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
revoke execute on all functions in schema violinhero from public, anon, authenticated;
grant execute on function violinhero.get_song(text, violinhero.chart_level) to authenticated;
