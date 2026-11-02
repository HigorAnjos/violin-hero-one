-- 0011_classes.sql — Turmas: planos do professor, turmas, alunos e a entrada do aluno sem e-mail.
-- O professor (conta com e-mail, nunca anônima nem de aluno) cria a turma e cadastra cada aluno pelo nome; o servidor
-- gera um PIN de 4 dígitos que o professor vê uma vez só e guarda apenas o hash (bcrypt). O aluno entra pela Edge
-- Function class-login com código da turma + nome + PIN; a conferência e o bloqueio por tentativas moram aqui
-- (class_login_check, só service_role). O nome cadastrado é dado pessoal de criança: só o professor da turma, o próprio
-- aluno e o responsável dele leem, sempre por função; nenhuma tabela desta migração é legível direto pelo app (fora o
-- catálogo de planos). Ranking, desafio e qualquer tela pública continuam com ranking_name (bicho + número).
-- Planos não têm cobrança (decisão do Higor, ciclo 5): o modelo e os limites ficam no banco, o provedor vem depois.

-- ---------- planos ----------
create table violinhero.plans (
  id                     text primary key check (id ~ '^[a-z][a-z0-9-]{0,31}$'),
  name                   text not null check (length(name) between 1 and 40),
  -- Turmas abertas ao mesmo tempo (encerrada não conta) e alunos ativos por turma
  max_open_classes       int not null check (max_open_classes > 0),
  max_students_per_class int not null check (max_students_per_class > 0),
  sort                   smallint not null unique
);

insert into violinhero.plans (id, name, max_open_classes, max_students_per_class, sort) values
  ('free', 'Grátis', 2, 10, 0),
  ('pro', 'Pro professor', 20, 40, 1);

-- Plano de cada professor; sem linha, free. Só o servidor escreve (o provedor de pagamento, quando entrar).
create table violinhero.teacher_plans (
  teacher_id uuid primary key references auth.users on delete cascade,
  plan_id    text not null references violinhero.plans,
  updated_at timestamptz not null default now()
);

create trigger teacher_plans_touch before update on violinhero.teacher_plans
  for each row execute function violinhero.touch_updated_at();

-- ---------- turmas e alunos ----------
create table violinhero.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users on delete cascade,
  name       text not null check (name = btrim(name) and length(name) between 1 and 60),
  -- 8 símbolos de um alfabeto sem 0/O e 1/I (40 bits): não se adivinha nem se percorre; o bloqueio por IP faz o resto
  code       text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);

create index classes_teacher_idx on violinhero.classes (teacher_id, created_at desc);

/**
 * Chave de comparação do nome do aluno: sem espaços sobrando, sem acento e em minúscula ("  João  Pedro" e "joao pedro"
 * são o mesmo aluno). É por ela que o login acha o aluno e que a turma não aceita dois alunos ativos com o mesmo nome.
 */
create function violinhero.name_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(translate(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'),
                         'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                         'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

create table violinhero.class_members (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references violinhero.classes on delete cascade,
  -- Como o professor cadastrou (e o aluno digita no login): visível só na turma
  display_name text not null check (display_name = btrim(display_name) and length(display_name) between 1 and 40),
  -- Usuário de auth do aluno, criado pela class-login na primeira entrada (um por aluno, sem e-mail real)
  user_id      uuid unique references auth.users on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  joined_at    timestamptz
);

create index class_members_class_idx on violinhero.class_members (class_id);
create unique index class_members_name_key on violinhero.class_members (class_id, violinhero.name_key(display_name)) where active;

-- O hash do PIN fica numa tabela só do servidor: nem o professor nem o aluno leem, nem por função
create table violinhero.class_member_pins (
  member_id  uuid primary key references violinhero.class_members on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);

-- Tentativas erradas da class-login: por IP ('ip:<ip>') e por turma + nome ('who:<sha256>'), exista o aluno ou não,
-- para o bloqueio não revelar quais nomes estão cadastrados
create table violinhero.login_throttle (
  key               text primary key,
  failures          int not null default 0 check (failures >= 0),
  window_started_at timestamptz not null default now(),
  locked_until      timestamptz
);

alter table violinhero.plans enable row level security;
alter table violinhero.teacher_plans enable row level security;
alter table violinhero.classes enable row level security;
alter table violinhero.class_members enable row level security;
alter table violinhero.class_member_pins enable row level security;
alter table violinhero.login_throttle enable row level security;

-- O catálogo de planos é público para quem tem sessão (a tela de planos compara); o resto, só por função
create policy plans_select_all on violinhero.plans for select to authenticated using (true);
grant select on violinhero.plans to authenticated;

-- ---------- regras ----------
/** Limites da class-login: erros seguidos por turma + nome e por IP numa janela, e quanto tempo o bloqueio dura. */
create function violinhero.login_limits(out per_name int, out per_ip int, out win interval, out lock interval)
language sql immutable set search_path = '' as $$
  select 5, 30, interval '15 minutes', interval '15 minutes'
$$;

/** Professor: conta de verdade (sem sessão 42501; anônimo ou conta de aluno 28000). */
create function violinhero.require_teacher() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true) then
    raise exception 'turma pede conta com e-mail' using errcode = '28000';
  end if;
  if exists (select 1 from violinhero.class_members m where m.user_id = v_uid) then
    raise exception 'conta de aluno não abre turma' using errcode = '28000';
  end if;
  return v_uid;
end $$;

/** Plano do professor (sem linha em teacher_plans, free). */
create function violinhero.plan_of(p_teacher uuid) returns violinhero.plans
language sql stable set search_path = '' as $$
  select p.* from violinhero.plans p
   where p.id = coalesce((select tp.plan_id from violinhero.teacher_plans tp where tp.teacher_id = p_teacher), 'free')
$$;

/** Código novo de turma: 8 símbolos do alfabeto de classes.code (cada byte % 32, sem viés). */
create function violinhero.new_class_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(b, i) % 32 + 1, 1), '' order by i)
    from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i
$$;

/** PIN novo de 4 dígitos, de bytes aleatórios do pgcrypto (random() não serve para segredo). */
create function violinhero.new_pin() returns text
language sql volatile set search_path = '' as $$
  select lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 10000)::text, 4, '0')
    from (select extensions.gen_random_bytes(3) as b) r
$$;

/** Chave do bloqueio por turma + nome (o mesmo para aluno que existe e que não existe). */
create function violinhero.login_who_key(p_code text, p_name text) returns text
language sql immutable set search_path = '' as $$
  select 'who:' || encode(sha256(convert_to(upper(p_code) || '|' || violinhero.name_key(p_name), 'UTF8')), 'hex')
$$;

/** O que o professor vê da turma: ficha, código e alunos (nome, ativo, se já entrou), ativos primeiro. */
create function violinhero.class_view(p_class violinhero.classes) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'id', p_class.id,
           'name', p_class.name,
           'code', p_class.code,
           'created_at', p_class.created_at,
           'closed_at', p_class.closed_at,
           'students', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', m.id, 'name', m.display_name, 'active', m.active, 'joined', m.user_id is not null,
                      'created_at', m.created_at)
                    order by not m.active, violinhero.name_key(m.display_name), m.created_at)
               from violinhero.class_members m where m.class_id = p_class.id), '[]'::jsonb))
$$;

/** Turma do professor da sessão; de outro professor ou inexistente, P0002 (o mesmo erro). */
create function violinhero.own_class(p_class_id uuid, p_teacher uuid) returns violinhero.classes
language plpgsql stable set search_path = '' as $$
declare
  v_row violinhero.classes;
begin
  select * into v_row from violinhero.classes where id = p_class_id and teacher_id = p_teacher;
  if not found then
    raise exception 'turma não encontrada' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

/** Aluno de uma turma do professor da sessão; de outra turma ou inexistente, P0002. */
create function violinhero.own_member(p_member_id uuid, p_teacher uuid) returns violinhero.class_members
language plpgsql stable set search_path = '' as $$
declare
  v_row violinhero.class_members;
begin
  select m.* into v_row from violinhero.class_members m
    join violinhero.classes c on c.id = m.class_id
   where m.id = p_member_id and c.teacher_id = p_teacher;
  if not found then
    raise exception 'aluno não encontrado' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

/** Nome de aluno como o professor digitou: sem espaços sobrando, de 1 a 40 letras (senão 22023). */
create function violinhero.clean_student_name(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if length(v_name) not between 1 and 40 then
    raise exception 'nome do aluno inválido' using errcode = '22023';
  end if;
  return v_name;
end $$;

/** Cabe mais um aluno ativo na turma pelo plano do professor? Senão VHLIM. */
create function violinhero.check_student_limit(p_class violinhero.classes) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_plan violinhero.plans := violinhero.plan_of(p_class.teacher_id);
begin
  if (select count(*) from violinhero.class_members where class_id = p_class.id and active) >= v_plan.max_students_per_class then
    raise exception 'limite de % alunos por turma no plano %', v_plan.max_students_per_class, v_plan.id using errcode = 'VHLIM';
  end if;
end $$;

-- ---------- funções do app: professor ----------
/**
 * Cria a turma do professor da sessão, com código de entrada novo. Nome de 1 a 60 letras (senão 22023); passar das
 * turmas abertas do plano dá VHLIM. Devolve a turma no formato de get_class.
 */
create function violinhero.create_class(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := violinhero.require_teacher();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_plan violinhero.plans := violinhero.plan_of(v_uid);
  v_row  violinhero.classes;
begin
  if length(v_name) not between 1 and 60 then
    raise exception 'nome da turma inválido' using errcode = '22023';
  end if;
  -- Um pedido por vez do mesmo professor: o limite não escapa em paralelo
  perform pg_advisory_xact_lock(hashtext('violinhero.classes'), hashtext(v_uid::text));
  if (select count(*) from violinhero.classes where teacher_id = v_uid and closed_at is null) >= v_plan.max_open_classes then
    raise exception 'limite de % turmas abertas no plano %', v_plan.max_open_classes, v_plan.id using errcode = 'VHLIM';
  end if;
  loop
    begin
      insert into violinhero.classes (teacher_id, name, code) values (v_uid, v_name, violinhero.new_class_code())
      returning * into v_row;
      exit;
    exception when unique_violation then
      -- código repetido (1 em 2^40 por turma): sorteia de novo
    end;
  end loop;
  return violinhero.class_view(v_row);
end $$;

/** Turmas do professor da sessão, as mais novas primeiro (abertas e encerradas), com a contagem de alunos ativos. */
create function violinhero.list_my_classes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'name', c.name, 'code', c.code, 'created_at', c.created_at, 'closed_at', c.closed_at,
             'student_count', (select count(*) from violinhero.class_members m where m.class_id = c.id and m.active))
           order by c.closed_at is not null, c.created_at desc, c.id)
      from violinhero.classes c where c.teacher_id = v_uid), '[]'::jsonb);
end $$;

/** A turma com os alunos, só para o professor dela (de outro ou inexistente, P0002). */
create function violinhero.get_class(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return violinhero.class_view(violinhero.own_class(p_class_id, violinhero.require_teacher()));
end $$;

/**
 * Cadastra um aluno pelo nome e gera o PIN dele, que só esta resposta traz (o banco guarda o hash). Turma encerrada ou
 * nome inválido dão 22023; nome igual ao de um aluno ativo da turma (sem contar acento e maiúscula), 23505; passar dos
 * alunos do plano, VHLIM. Devolve { student, pin }.
 */
create function violinhero.add_student(p_class_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_class  violinhero.classes := violinhero.own_class(p_class_id, violinhero.require_teacher());
  v_name   text := violinhero.clean_student_name(p_name);
  v_pin    text := violinhero.new_pin();
  v_member violinhero.class_members;
begin
  if v_class.closed_at is not null then
    raise exception 'turma encerrada' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('violinhero.class_members'), hashtext(v_class.id::text));
  perform violinhero.check_student_limit(v_class);
  insert into violinhero.class_members (class_id, display_name) values (v_class.id, v_name) returning * into v_member;
  insert into violinhero.class_member_pins (member_id, pin_hash) values (v_member.id, extensions.crypt(v_pin, extensions.gen_salt('bf', 10)));
  return jsonb_build_object(
    'student', jsonb_build_object('id', v_member.id, 'name', v_member.display_name, 'active', true, 'joined', false, 'created_at', v_member.created_at),
    'pin', v_pin);
end $$;

/**
 * PIN novo para um aluno ativo (o antigo deixa de valer) e fim do bloqueio por erros dele. Turma encerrada ou aluno
 * inativo, 22023. Devolve { student_id, pin }: o PIN aparece só aqui.
 */
create function violinhero.reset_student_pin(p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member violinhero.class_members := violinhero.own_member(p_member_id, violinhero.require_teacher());
  v_class  violinhero.classes;
  v_pin    text := violinhero.new_pin();
begin
  select * into v_class from violinhero.classes where id = v_member.class_id;
  if v_class.closed_at is not null or not v_member.active then
    raise exception 'turma encerrada ou aluno inativo' using errcode = '22023';
  end if;
  update violinhero.class_member_pins
     set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10)), updated_at = now()
   where member_id = v_member.id;
  delete from violinhero.login_throttle where key = violinhero.login_who_key(v_class.code, v_member.display_name);
  return jsonb_build_object('student_id', v_member.id, 'pin', v_pin);
end $$;

/**
 * Tira o aluno da turma (inativo: não entra mais, some de tarefas e de quem o vê) ou traz de volta. Voltar confere o
 * nome repetido (23505) e o limite do plano (VHLIM); turma encerrada dá 22023. Devolve a turma, como get_class.
 */
create function violinhero.set_student_active(p_member_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member violinhero.class_members := violinhero.own_member(p_member_id, violinhero.require_teacher());
  v_class  violinhero.classes;
begin
  if p_active is null then
    raise exception 'ativo é obrigatório' using errcode = '22023';
  end if;
  select * into v_class from violinhero.classes where id = v_member.class_id;
  if v_class.closed_at is not null then
    raise exception 'turma encerrada' using errcode = '22023';
  end if;
  if p_active and not v_member.active then
    perform pg_advisory_xact_lock(hashtext('violinhero.class_members'), hashtext(v_class.id::text));
    perform violinhero.check_student_limit(v_class);
  end if;
  update violinhero.class_members set active = p_active where id = v_member.id;
  return violinhero.class_view(v_class);
end $$;

/** Encerra a turma (ninguém mais entra; tarefas e entregas ficam para consulta). Encerrar de novo não muda a data. */
create function violinhero.close_class(p_class_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_class violinhero.classes := violinhero.own_class(p_class_id, violinhero.require_teacher());
begin
  update violinhero.classes set closed_at = coalesce(closed_at, now()) where id = v_class.id returning * into v_class;
  return violinhero.class_view(v_class);
end $$;

/** Plano do jogador da sessão (free sem linha) e quantas turmas abertas ele tem: a tela de planos e o aviso de limite. */
create function violinhero.get_my_plan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_plan violinhero.plans;
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  v_plan := violinhero.plan_of(v_uid);
  return jsonb_build_object(
    'plan', jsonb_build_object('id', v_plan.id, 'name', v_plan.name, 'max_open_classes', v_plan.max_open_classes,
                               'max_students_per_class', v_plan.max_students_per_class),
    'open_classes', (select count(*) from violinhero.classes c where c.teacher_id = v_uid and c.closed_at is null));
end $$;

-- ---------- funções do app: aluno ----------
/** A turma do aluno da sessão (nome dele, nome e estado da turma), ou null para quem não é aluno ativo. */
create function violinhero.get_my_class() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('student_id', m.id, 'name', m.display_name, 'class_id', c.id, 'class_name', c.name,
                              'closed_at', c.closed_at)
      from violinhero.class_members m
      join violinhero.classes c on c.id = m.class_id
     where m.user_id = v_uid and m.active);
end $$;

-- ---------- funções do servidor (class-login, service_role) ----------
/** Mais um erro na chave; ao chegar em `p_max` dentro da janela, bloqueia e zera a contagem. */
create function violinhero.login_fail(p_key text, p_max int) returns void
language sql volatile set search_path = '' as $$
  insert into violinhero.login_throttle as t (key, failures, window_started_at, locked_until)
  values (p_key, case when p_max <= 1 then 0 else 1 end, now(),
          case when p_max <= 1 then now() + (violinhero.login_limits()).lock end)
  on conflict (key) do update set
    failures = case
                 when t.window_started_at + (violinhero.login_limits()).win < now() then 1
                 when t.failures + 1 >= p_max then 0
                 else t.failures + 1
               end,
    locked_until = case
                     when t.window_started_at + (violinhero.login_limits()).win >= now() and t.failures + 1 >= p_max
                       then now() + (violinhero.login_limits()).lock
                     else t.locked_until
                   end,
    window_started_at = case
                          when t.window_started_at + (violinhero.login_limits()).win < now()
                            or t.failures + 1 >= p_max then now()
                          else t.window_started_at
                        end
$$;

/**
 * Confere código da turma + nome + PIN para a class-login. Não lança erro de credencial (o erro desfaria a contagem de
 * tentativas): devolve { status } — 'ok' com member_id, user_id (null na primeira entrada), name, class_id e
 * class_name; 'invalid' (código, nome ou PIN não conferem, aluno inativo: tudo igual); 'locked' (erros demais por
 * turma + nome ou pelo IP: espera ou PIN novo do professor); 'closed' (credenciais certas, turma encerrada).
 * Nome desconhecido gasta o mesmo bcrypt de um PIN conferido, para o tempo de resposta não revelar quem existe.
 */
create function violinhero.class_login_check(p_code text, p_name text, p_pin text, p_ip text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_who    text := violinhero.login_who_key(v_code, p_name);
  v_ip     text := 'ip:' || coalesce(nullif(btrim(p_ip), ''), 'desconhecido');
  v_lim    record;
  v_member violinhero.class_members;
  v_class  violinhero.classes;
  v_hash   text;
  v_ok     boolean;
begin
  select * into v_lim from violinhero.login_limits();
  if exists (select 1 from violinhero.login_throttle where key in (v_who, v_ip) and locked_until > now()) then
    return jsonb_build_object('status', 'locked');
  end if;
  select m.* into v_member
    from violinhero.class_members m
    join violinhero.classes c on c.id = m.class_id
   where c.code = v_code and m.active and violinhero.name_key(m.display_name) = violinhero.name_key(p_name);
  if found then
    select pin_hash into v_hash from violinhero.class_member_pins where member_id = v_member.id;
  end if;
  v_ok := coalesce(p_pin ~ '^[0-9]{4}$', false) and v_hash is not null
          and v_hash = extensions.crypt(p_pin, v_hash);
  if v_hash is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
  end if;
  if not v_ok then
    perform violinhero.login_fail(v_who, v_lim.per_name);
    perform violinhero.login_fail(v_ip, v_lim.per_ip);
    return jsonb_build_object('status', 'invalid');
  end if;
  delete from violinhero.login_throttle where key = v_who;
  select * into v_class from violinhero.classes where id = v_member.class_id;
  if v_class.closed_at is not null then
    return jsonb_build_object('status', 'closed');
  end if;
  return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'user_id', v_member.user_id,
                            'name', v_member.display_name, 'class_id', v_class.id, 'class_name', v_class.name);
end $$;

/**
 * Liga o usuário de auth criado pela class-login ao aluno, se ele ainda não tiver um. Devolve o usuário que ficou: em
 * duas primeiras entradas ao mesmo tempo, a que chegou depois recebe o da outra (e apaga o que criou).
 */
create function violinhero.class_link_user(p_member_id uuid, p_user_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update violinhero.class_members set user_id = p_user_id, joined_at = now()
   where id = p_member_id and user_id is null;
  select user_id into v_user from violinhero.class_members where id = p_member_id;
  if v_user is null then
    raise exception 'aluno não encontrado' using errcode = 'P0002';
  end if;
  -- O perfil nasce pelo trigger de auth.users; aluno é conta (não anônima), mas aparece só pelo nome gerado
  insert into violinhero.profiles (id, is_anonymous) values (v_user, false) on conflict (id) do nothing;
  return v_user;
end $$;

-- Fecho de toda migração: só o servidor executa funções do schema; o app ganha GRANT uma a uma.
-- class_login_check e class_link_user ficam de fora de propósito: só a Edge Function class-login (service_role).
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
