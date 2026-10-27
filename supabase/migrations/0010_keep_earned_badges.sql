-- O selo pertence ao jogador, mesmo quando a música e a partida que o originou são apagadas.
-- play_days e streaks são agregados por submit_play; excluir a música não altera minutos nem sequência.
alter table violinhero.badges_earned
  drop constraint badges_earned_play_id_fkey,
  alter column play_id drop not null,
  add constraint badges_earned_play_id_fkey foreign key (play_id)
    references violinhero.plays(id) on delete set null;

-- Fecho de toda migração: o app executa somente as funções permitidas, uma a uma.
revoke execute on all functions in schema violinhero from public, anon, authenticated;
grant execute on function violinhero.get_song(text, violinhero.chart_level) to authenticated;
grant execute on function violinhero.ensure_my_profile() to authenticated;
grant execute on function violinhero.submit_play(jsonb) to authenticated;
grant execute on function violinhero.get_ranking(text, violinhero.chart_level, text, int) to authenticated;
grant execute on function violinhero.create_challenge(uuid, int) to authenticated;
grant execute on function violinhero.get_challenge(text) to authenticated;
grant execute on function violinhero.accept_challenge(text) to authenticated;
grant execute on function violinhero.list_my_challenges() to authenticated;
