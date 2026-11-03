-- 0021_public_name_not_found.sql — Nome público sem repetição.
-- O nome público (ranking_name) era bicho + 4 dígitos e, sem bicho, 'Violinista NNNN': 10 mil combinações por bicho,
-- e já colidiu. Agora todo perfil tem bicho (sorteado quando não escolheu; o jogador troca no Perfil) e o número tem 5
-- dígitos. Os números de antes ganham um dígito no fim (Gato 4821 vira Gato 4821x), o nome segue reconhecível, e
-- bicho + número nunca se repete: índice único, com o trigger sorteando outro número quando o par já é de alguém.

-- A lista de bichos do app (src/services/profile.ts: ANIMALS); muda junto com ela e com ranking_name
create function violinhero.random_animal() returns text
language sql volatile set search_path = '' as $$
  select (array['fox', 'penguin', 'cat'])[1 + floor(random() * 3)::int]
$$;

create function violinhero.random_nickname_tag() returns int
language sql volatile set search_path = '' as $$
  select 10000 + floor(random() * 90000)::int
$$;

-- Trava a tabela antes de converter: perfil novo no meio da conversão ficaria com o número de 4 dígitos
lock table violinhero.profiles in access exclusive mode;
-- A conversão não é edição do jogador: updated_at fica como estava
alter table violinhero.profiles disable trigger profiles_touch;

alter table violinhero.profiles
  drop constraint profiles_nickname_tag_check,
  drop constraint profiles_animal_check,
  alter column nickname_tag drop default,
  alter column nickname_tag type int;

update violinhero.profiles set animal = violinhero.random_animal()
 where animal is null or animal not in ('fox', 'penguin', 'cat');

-- Cada número de 4 dígitos ganha um dígito sorteado entre os que ninguém do mesmo bicho tem; com os 10 tomados (11
-- contas no mesmo par), um número novo qualquer
create index profiles_public_name_tmp on violinhero.profiles (animal, nickname_tag);
do $$
declare
  r     record;
  v_tag int;
begin
  for r in select id, animal, nickname_tag from violinhero.profiles where nickname_tag < 10000 order by created_at, id loop
    select t into v_tag
      from (select r.nickname_tag * 10 + d as t from generate_series(0, 9) d) c
     where not exists (select 1 from violinhero.profiles p where p.animal = r.animal and p.nickname_tag = c.t)
     order by random() limit 1;
    while v_tag is null or exists (select 1 from violinhero.profiles p where p.animal = r.animal and p.nickname_tag = v_tag) loop
      v_tag := violinhero.random_nickname_tag();
    end loop;
    update violinhero.profiles set nickname_tag = v_tag where id = r.id;
  end loop;
end $$;
drop index violinhero.profiles_public_name_tmp;

alter table violinhero.profiles enable trigger profiles_touch;

alter table violinhero.profiles
  alter column animal set not null,
  add constraint profiles_animal_check check (animal in ('fox', 'penguin', 'cat')),
  alter column nickname_tag set default violinhero.random_nickname_tag(),
  add constraint profiles_nickname_tag_check check (nickname_tag between 10000 and 99999);
create unique index profiles_public_name on violinhero.profiles (animal, nickname_tag);

/**
 * Bicho e número do perfil: sem bicho, sorteia (no insert) ou mantém o que tinha (o app manda animal nulo quando o
 * jogador não escolheu); par que já é de outra conta, sorteia outro número. Definer: o par de outra conta não aparece
 * pela RLS de quem troca o bicho.
 */
create function violinhero.profile_public_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.animal := coalesce(new.animal, old.animal);
    if new.animal = old.animal and new.nickname_tag = old.nickname_tag then
      return new;
    end if;
  end if;
  new.animal := coalesce(new.animal, violinhero.random_animal());
  -- Um sorteio por vez: dois perfis não pegam o mesmo par ao mesmo tempo (o índice único é a última garantia)
  perform pg_advisory_xact_lock(hashtext('violinhero.profiles.public_name'));
  while exists (select 1 from violinhero.profiles p
                 where p.animal = new.animal and p.nickname_tag = new.nickname_tag and p.id <> new.id) loop
    new.nickname_tag := violinhero.random_nickname_tag();
  end loop;
  return new;
end $$;

create trigger profiles_public_name before insert or update of animal, nickname_tag on violinhero.profiles
  for each row execute function violinhero.profile_public_name();

-- O número virou int: a versão smallint sai (as funções que chamam ranking_name passam a achar esta)
drop function violinhero.ranking_name(text, smallint);
create function violinhero.ranking_name(p_animal text, p_tag int) returns text
language sql immutable set search_path = '' as $$
  select case p_animal
           when 'fox' then 'Raposa'
           when 'penguin' then 'Pinguim'
           when 'cat' then 'Gato'
           else 'Violinista'
         end || ' ' || p_tag::text
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
