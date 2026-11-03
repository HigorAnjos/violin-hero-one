-- 0020_song_category.sql — Categoria da música: música ou exercício técnico (grupo próprio na Biblioteca).
-- Vem do MusicXML do catálogo pelo seed (<miscellaneous-field name="categoria">); a importada e a do editor são
-- sempre música. O exercício do catálogo vale ranking e selo como qualquer música: nada além da estante olha a coluna.

create type violinhero.song_category as enum ('musica', 'exercicio');

alter table violinhero.songs
  add column category violinhero.song_category not null default 'musica',
  -- Exercício só no catálogo; o app não grava a coluna (os GRANTs de insert e update da 0004 são por coluna)
  add constraint songs_category_catalog check (origin = 'catalog' or category = 'musica');

-- get_song passa a devolver a categoria; mudar o retorno pede drop. O resto é o da 0004.
drop function violinhero.get_song(text, violinhero.chart_level);

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
  category         violinhero.song_category,
  level            violinhero.chart_level,
  format_version   int,
  chart            jsonb,
  hash             text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.composer, s.bpm, s.time_beats, s.time_unit, s.key, s.duration_seconds,
         s.origin, s.visibility, s.category, c.level, c.format_version, c.chart, c.hash
    from violinhero.songs s
    join violinhero.song_charts c on c.song_id = s.id and c.level = p_level
   where s.id = p_song_id
     and (s.visibility = 'public' or s.owner_id = auth.uid())
$$;

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
