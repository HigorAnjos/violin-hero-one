import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { portrait, PORTRAIT_QUERY } from '../assets/styles/media';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import { PinNotice } from '../components/PinNotice/PinNotice';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { StudentAvatar } from '../components/StudentAvatar/StudentAvatar';
import { TaskProgress, taskSummary } from '../components/TaskProgress/TaskProgress';
import {
  classroomKeys,
  type AssignmentDetail,
  type AssignmentSummary,
  type ClassDetail,
  type ClassroomApi,
  type ClassStudent,
  type ClassSummary,
  type GuardianInvite,
} from '../services/classroom';
import { copyText, shareLink, type ShareOutcome } from '../services/share';
import { newAssignmentUrl, reviewUrl, ROUTES, teacherClassUrl } from '../shell/routes';
import { useMediaQuery } from '../shell/useMediaQuery';
import {
  classroomErrorOf,
  errorText,
  useClassAssignments,
  useClassDetail,
  useMyClasses,
  useMyPlan,
  useOpenAssignmentDetails,
  useTeacherMutation,
  type TeacherAccess,
  type TeacherCache,
} from '../shell/useTeacher';
import {
  Actions,
  Alert,
  Column,
  Header,
  Input,
  LimitNotice,
  Muted,
  Panel,
  PanelHead,
  PlansLink,
  TeacherGate,
  TeacherPage,
  Text,
} from './teacherLayout';
import { centsText, dueText, formatClassCode, MODE_NAMES, percent, sentText, TASK_STATE_NAMES, taskState, type StudentTaskState } from './teacherText';

type Ready = Extract<TeacherAccess, { status: 'ready' }>;

// ---------- coluna das turmas ----------
const Nav = styled.nav`
  flex: none;
  width: 13.125rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  overflow-y: auto;

  > b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.25rem;

    span {
      color: ${({ theme }) => theme.colors.info.text};
    }
  }

  @media (max-height: 500px) {
    width: 11rem;
    gap: 0.25rem;

    > b {
      display: none;
    }
  }

  ${portrait} {
    width: auto;
    overflow: visible;
  }
`;

/** .vh-cls do design: a turma aberta ganha fundo e o filete ciano. */
const ClassLink = styled(Link)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.125rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  border-left: 3px solid transparent;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};

  b {
    ${clampLines(1)}
    font-weight: 800;
    font-size: 0.875rem;
  }

  small {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  &[aria-current='page'] {
    background-color: ${({ theme }) => theme.colors.surface};
    border-left-color: ${({ theme }) => theme.colors.info.main};
  }
`;

/** O código para os alunos (o quadro tracejado no pé da coluna). */
const CodeBox = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px dashed ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  > strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.5rem;
    line-height: 1.2;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.info.text};
    white-space: nowrap;
  }

  > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.5rem;
  }

  @media (max-height: 500px) {
    padding: 0.375rem 0.5rem;

    > strong {
      font-size: 1.125rem;
    }
  }
`;

const NewClass = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const SHARE_TEXT: Record<ShareOutcome, string> = {
  shared: 'Enviado.',
  copied: 'Copiado.',
  downloaded: '',
  cancelled: '',
  failed: 'Não deu para copiar: anote o código.',
};

const CLASS_NAME_MAX = 60;

function NewClassForm({ ready, autoFocus = false }: { ready: Ready; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(autoFocus);
  const [name, setName] = React.useState('');
  // A turma nova abre com o que a criação devolveu: ainda sem tarefa
  const create = useTeacherMutation(ready, (n: string) => ready.api.createClass(n), (cache, created) => {
    cache.set(classroomKeys.class(created.id), created);
    cache.set(classroomKeys.assignments(created.id), []);
    cache.stale(classroomKeys.classes, classroomKeys.plan);
  });
  const id = React.useId();

  if (!open)
    return (
      <Button type="button" $variant="link" onClick={() => setOpen(true)}>
        ＋ Nova turma
      </Button>
    );
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(name.trim(), {
      onSuccess: (created) => {
        setName('');
        setOpen(false);
        navigate(teacherClassUrl(created.id));
      },
    });
  };
  const kind = classroomErrorOf(create.error);
  return (
    <NewClass onSubmit={submit} aria-label="Nova turma">
      <label htmlFor={id}>
        <Muted>Nome da turma</Muted>
      </label>
      <Input id={id} value={name} maxLength={CLASS_NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ex.: Iniciantes · sábado" />
      <Button type="submit" disabled={create.isPending || !name.trim()}>
        Criar turma
      </Button>
      {kind === 'limit' ? <LimitNotice back="Turmas">Seu plano já tem todas as turmas abertas que cabem.</LimitNotice> : kind && <Alert role="alert">{errorText(create.error)}</Alert>}
    </NewClass>
  );
}

function ClassCode({ klass }: { klass: ClassDetail | ClassSummary }) {
  const [status, setStatus] = React.useState('');
  const code = formatClassCode(klass.code);
  if (klass.closedAt)
    return (
      <CodeBox>
        <Muted>Turma encerrada: o código não vale mais.</Muted>
      </CodeBox>
    );
  const text = `Código da turma ${klass.name} no Violin Hero: ${code}. Abra o app, toque em “Tenho um código da turma” e entre com o código, seu nome e o PIN que o professor passou.`;
  return (
    <CodeBox>
      <Muted id="codigo-turma">Código para alunos entrarem</Muted>
      <strong aria-describedby="codigo-turma">{code}</strong>
      <div>
        <Button type="button" $variant="link" onClick={async () => setStatus(SHARE_TEXT[await copyText(code)])}>
          Copiar código
        </Button>
        <Button
          type="button"
          $variant="link"
          onClick={async () => setStatus(SHARE_TEXT[await shareLink(`${window.location.origin}${ROUTES.login}`, { title: 'Turma no Violin Hero', text })])}
        >
          Compartilhar
        </Button>
      </div>
      <Muted role="status">{status}</Muted>
    </CodeBox>
  );
}

// ---------- painel da turma ----------
const ClassColumn = styled(Column)`
  @media (max-height: 500px) {
    overflow-y: auto;

    > header {
      flex: none;
      order: -1;
    }
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.15fr 1fr 0.8fr;
  gap: 0.875rem;
  min-height: 0;
  max-height: 14.5rem;

  @media (max-height: 500px) {
    flex: none;
    order: 1;
    grid-template-columns: 1fr 1fr;
    max-height: none;
    gap: 0.5rem;

    > :last-child {
      display: none;
    }
  }

  ${portrait} {
    flex: none;
    grid-template-columns: minmax(0, 1fr);
    max-height: none;
  }
`;

/** .vh-inb do design: uma entrega na caixa "Para revisar". */
const InboxItem = styled(Link)`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.625rem;
  align-items: center;
  min-height: 2.75rem;
  padding: 0.375rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  border: 1.5px solid transparent;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};

  b {
    ${clampLines(1)}
    font-size: 0.875rem;
    font-weight: 800;
  }

  @media (hover: hover) {
    &:hover {
      background-color: ${({ theme }) => theme.colors.background};
      border-color: ${({ theme }) => theme.colors.surfaceBorder};
    }
  }
`;

/** .vh-tk do design: uma tarefa com a barra. */
const TaskItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  &:last-child {
    border-bottom: 0;
  }

  > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  b {
    ${clampLines(1)}
    font-size: 0.875rem;
    font-weight: 800;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;

  th {
    text-align: left;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    white-space: nowrap;
  }

  td {
    padding: 0.125rem 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    vertical-align: middle;
  }

  td:first-child > span {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  td:last-child {
    white-space: nowrap;
    text-align: right;
  }

  tr[data-inactive] td:first-child {
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    th[data-task],
    td[data-task] {
      display: none;
    }
  }

  /* Em pé, como deitado: a situação da tarefa fica no painel de tarefas; as ações empilham na própria célula */
  ${portrait} {
    th[data-task],
    td[data-task] {
      display: none;
    }

    td:last-child {
      white-space: normal;
      padding-right: 0;

      > button {
        display: flex;
        margin-left: auto;
      }
    }
  }
`;

/** Os chips de situação do design (REVISADA, REVISAR, SEM ENTREGA). */
const Chip = styled.span<{ $state: StudentTaskState }>`
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 800;
  font-size: 0.75rem;
  line-height: 1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  ${({ theme, $state }) =>
    $state === 'reviewed'
      ? `background-color: ${theme.colors.info.main}; color: ${theme.colors.background};`
      : $state === 'to-review'
        ? `background-color: ${theme.colors.text}; color: ${theme.colors.background};`
        : `border: 1px solid ${theme.colors.warning.main}; color: ${theme.colors.warning.text};`}
`;

const AddStudent = styled.form`
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;

  > label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  @media (max-height: 500px) {
    > label > span {
      display: none;
    }
  }
`;

const Students = styled(Panel)`
  flex: 1;
  min-height: 7rem;

  @media (max-height: 500px) {
    flex: none;
    overflow: visible;
  }

  ${portrait} {
    flex: none;
  }
`;

const Confirm = styled.div`
  order: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.danger.main};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.875rem;
`;

const Danger = styled(Button)`
  flex: none;
  order: 2;
  color: ${({ theme }) => theme.colors.danger.text};
`;

/** O convite do responsável é informação, não alerta: o tom ciano do tema, como o código da turma. */
const InviteBox = styled(Confirm)`
  border-color: ${({ theme }) => theme.colors.info.border};
  background-color: ${({ theme }) => theme.colors.info.surface};

  > strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.125rem;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.info.text};
  }
`;

function GuardianInviteNotice({ name, invite, onClose }: { name: string; invite: GuardianInvite; onClose: () => void }) {
  const [status, setStatus] = React.useState('');
  const until = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(Date.parse(invite.expiresAt));
  // Sem o nome do aluno: o texto sai do app (WhatsApp, e-mail) e o nome fica só na turma; depois do aceite o app mostra
  const text = `Convite do responsável no Violin Hero: ${invite.code}. Abra o app, toque em “Sou responsável” e digite o código. Vale até ${until}, uma vez só.`;
  return (
    // status: quem usa leitor de tela ouve o convite ao aparecer e o "Copiado." depois
    <InviteBox role="status" aria-label={`Convite do responsável de ${name}`}>
      <span>
        Convite para o responsável de <b>{name}</b>, vale até {until}. Passe só para o responsável; ele entra em “Sou responsável”.
      </span>
      <strong>{invite.code}</strong>
      <Button type="button" $variant="link" onClick={async () => setStatus(SHARE_TEXT[await copyText(invite.code)])}>
        Copiar código
      </Button>
      <Button
        type="button"
        $variant="link"
        onClick={async () => setStatus(SHARE_TEXT[await shareLink(`${window.location.origin}${ROUTES.parent}`, { title: 'Convite do responsável no Violin Hero', text })])}
      >
        Compartilhar
      </Button>
      <Button type="button" $variant="link" onClick={onClose}>
        Fechar
      </Button>
      <Muted>{status}</Muted>
    </InviteBox>
  );
}

const STUDENT_NAME_MAX = 40;

interface InboxRow {
  task: AssignmentDetail;
  row: AssignmentDetail['students'][number];
}

function ReviewInbox({ details }: { details: (AssignmentDetail | undefined)[] }) {
  const rows: InboxRow[] = details
    .flatMap((task) => (task ? task.students.filter((s) => s.submission && !s.review).map((row) => ({ task, row })) : []))
    .sort((a, b) => a.row.submission!.submittedAt.localeCompare(b.row.submission!.submittedAt));
  return (
    <Panel $tone="strong" aria-label="Para revisar">
      <PanelHead>
        <Kicker>Para revisar · {rows.length}</Kicker>
        {rows.length > 1 && <Muted>mais antigas primeiro</Muted>}
      </PanelHead>
      {!rows.length && <Muted>Nenhuma entrega esperando. As novas aparecem aqui.</Muted>}
      {rows.map(({ task, row }) => {
        const sub = row.submission!;
        return (
          <InboxItem key={`${task.id}:${row.studentId}`} to={reviewUrl(task.id, row.studentId)}>
            <StudentAvatar id={row.studentId} name={row.name} />
            <span>
              <b>
                {row.name} · {task.songTitle}
              </b>
              <Muted>
                {sub.accuracy == null ? 'sem partida' : percent(sub.accuracy)} · {centsText(sub.meanAbsCents)}
              </Muted>
            </span>
            <Muted>{sentText(sub.submittedAt)}</Muted>
          </InboxItem>
        );
      })}
    </Panel>
  );
}

const taskTitle = (t: Pick<AssignmentSummary, 'songTitle' | 'level' | 'mode'>) => `${t.songTitle} · ${LEVEL_NAMES[t.level]} · ${MODE_NAMES[t.mode]}`;

function TaskList({ tasks }: { tasks: AssignmentSummary[] }) {
  return (
    <Panel aria-label="Tarefas">
      <Kicker>Tarefas</Kicker>
      {!tasks.length && <Muted>Nenhuma tarefa ainda. Crie a primeira em “Nova tarefa”.</Muted>}
      {tasks.map((t) => (
        <TaskItem key={t.id}>
          <div>
            <b>{taskTitle(t)}</b>
            <Muted>{dueText(t)}</Muted>
          </div>
          <TaskProgress studentCount={t.studentCount} submittedCount={t.submittedCount} reviewedCount={t.reviewedCount} />
          <div>
            <Muted>{taskSummary(t)}</Muted>
            <Button as={Link} to={reviewUrl(t.id)} $variant="link" aria-label={`Entregas de ${taskTitle(t)}`}>
              Entregas <span aria-hidden="true">▸</span>
            </Button>
          </div>
        </TaskItem>
      ))}
    </Panel>
  );
}

function PlanPanel({ ready, className }: { ready: Ready; className: string }) {
  const plan = useMyPlan(ready);
  return (
    <Panel $tone="warning" aria-label="Seu plano">
      <Kicker>Seu plano</Kicker>
      {plan.data ? (
        <>
          <Text>
            <b>{plan.data.plan.name}</b>
          </Text>
          <Text>
            {plan.data.openClasses} de {plan.data.plan.maxOpenClasses} turmas abertas
          </Text>
          <Text>Até {plan.data.plan.maxStudentsPerClass} alunos ativos por turma</Text>
          <PlansLink back={className} />
        </>
      ) : (
        <Muted role="status">{plan.error ? errorText(plan.error) : 'Carregando…'}</Muted>
      )}
    </Panel>
  );
}

type Shown = { kind: 'pin'; name: string; pin: string; reset: boolean } | { kind: 'invite'; name: string; invite: GuardianInvite };

function StudentRows({ ready, klass, tasks }: { ready: Ready; klass: ClassDetail; tasks: AssignmentDetail[] }) {
  const { api } = ready;
  const [name, setName] = React.useState('');
  const [shown, setShown] = React.useState<Shown | null>(null);
  const [problem, setProblem] = React.useState<unknown>(null);
  const plan = useMyPlan(ready);
  // Quem está na turma conta na lista de turmas, nas tarefas e na situação de cada tarefa aberta
  const rosterChanged = (cache: TeacherCache) =>
    cache.stale(classroomKeys.class(klass.id), classroomKeys.classes, ...tasks.map((t) => classroomKeys.assignment(t.id)));
  const add = useTeacherMutation(ready, (n: string) => api.addStudent(klass.id, n), (cache, { student }) => {
    cache.update<ClassDetail>(classroomKeys.class(klass.id), (k) => ({ ...k, students: [...k.students, student] }));
    rosterChanged(cache);
  });
  // PIN e convite não mudam nada que a tela mostre
  const reset = useTeacherMutation(ready, (s: ClassStudent) => api.resetStudentPin(s.id));
  const active = useTeacherMutation(ready, ({ s, on }: { s: ClassStudent; on: boolean }) => api.setStudentActive(s.id, on), (cache, detail) => {
    cache.set(classroomKeys.class(klass.id), detail);
    rosterChanged(cache);
  });
  const invite = useTeacherMutation(ready, (s: ClassStudent) => api.createGuardianInvite(s.id));
  const remove = useTeacherMutation(ready, (s: ClassStudent) => api.removeStudent(s.id), (cache, _, gone) => {
    cache.update<ClassDetail>(classroomKeys.class(klass.id), (k) => ({ ...k, students: k.students.filter((s) => s.id !== gone.id) }));
    rosterChanged(cache);
  });
  // Apagar o aluno (o caminho de exclusão da conta dele): só fora da turma ou com a turma encerrada, e confirmado antes
  const [erasing, setErasing] = React.useState<ClassStudent | null>(null);
  // Redefinir o PIN também pede confirmação: o PIN que o aluno usa para de valer na hora
  const [resetting, setResetting] = React.useState<ClassStudent | null>(null);
  const keep = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (erasing || resetting) keep.current?.focus();
  }, [erasing, resetting]);
  const nameField = React.useRef<HTMLInputElement>(null);
  const closed = !!klass.closedAt;
  const activeCount = klass.students.filter((s) => s.active).length;
  const max = plan.data?.plan.maxStudentsPerClass;

  const fail = (cause: unknown) => setProblem(cause);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setProblem(null);
    add.mutate(clean, {
      onSuccess: ({ student, pin }) => {
        setName('');
        setShown({ kind: 'pin', name: student.name, pin, reset: false });
      },
      onError: fail,
    });
  };
  const kind = classroomErrorOf(problem);
  const columns = tasks.slice(0, 2);

  return (
    <Students aria-label="Alunos">
      <PanelHead>
        <Kicker>
          Alunos · {activeCount}
          {max ? ` de ${max}` : ''}
        </Kicker>
        <Muted>Só a turma vê o nome. O aluno entra com o código, o nome e o PIN.</Muted>
      </PanelHead>
      {!closed && (
        <AddStudent onSubmit={submit} aria-label="Cadastrar aluno">
          <label>
            <Muted>Nome do aluno (como ele vai digitar)</Muted>
            <Input ref={nameField} value={name} maxLength={STUDENT_NAME_MAX} onChange={(e) => setName(e.target.value)} aria-label="Nome do aluno" placeholder="Ex.: Ana" autoComplete="off" />
          </label>
          <Button type="submit" disabled={add.isPending || !name.trim()}>
            Cadastrar
          </Button>
        </AddStudent>
      )}
      {kind === 'limit' ? <LimitNotice back={klass.name}>A turma já tem todos os alunos que o seu plano permite.</LimitNotice> : kind && <Alert role="alert">{errorText(problem)}</Alert>}
      {klass.students.length ? (
        <Table>
          <thead>
            <tr>
              <th scope="col">Aluno</th>
              <th scope="col">Entrada</th>
              {columns.map((t) => (
                <th key={t.id} scope="col" data-task="">
                  {t.songTitle}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {klass.students.map((s) => (
              <tr key={s.id} data-inactive={s.active ? undefined : ''}>
                <td>
                  <span>
                    <StudentAvatar id={s.id} name={s.name} size={1.75} />
                    {s.name}
                  </span>
                </td>
                <td>
                  <Muted>{!s.active ? 'fora da turma' : s.joined ? 'já entrou' : 'ainda não entrou'}</Muted>
                </td>
                {columns.map((t) => {
                  const row = t.students.find((r) => r.studentId === s.id);
                  const state = row ? taskState(row) : null;
                  return (
                    <td key={t.id} data-task="">
                      {state && <Chip $state={state}>{TASK_STATE_NAMES[state]}</Chip>}
                    </td>
                  );
                })}
                <td>
                  {!closed && s.active && (
                    <>
                      <Button
                        type="button"
                        $variant="link"
                        aria-label={`Redefinir PIN de ${s.name}`}
                        onClick={() => {
                          setProblem(null);
                          setErasing(null);
                          setResetting(s);
                        }}
                      >
                        Redefinir PIN
                      </Button>
                      <Button
                        type="button"
                        $variant="link"
                        aria-label={`Convite do responsável de ${s.name}`}
                        onClick={() => invite.mutate(s, { onSuccess: (i) => setShown({ kind: 'invite', name: s.name, invite: i }), onError: fail })}
                      >
                        Responsável
                      </Button>
                    </>
                  )}
                  {!closed && (
                    <Button
                      type="button"
                      $variant="link"
                      aria-label={`${s.active ? 'Desativar' : 'Reativar'} ${s.name}`}
                      onClick={() => {
                        setProblem(null);
                        active.mutate({ s, on: !s.active }, { onError: fail });
                      }}
                    >
                      {s.active ? 'Desativar' : 'Reativar'}
                    </Button>
                  )}
                  {(closed || !s.active) && (
                    <Button
                      type="button"
                      $variant="link"
                      aria-label={`Apagar ${s.name}`}
                      onClick={() => {
                        setProblem(null);
                        setResetting(null);
                        setErasing(s);
                      }}
                    >
                      Apagar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Muted>Nenhum aluno ainda. Cadastre pelo nome: o PIN aparece uma vez, para você anotar.</Muted>
      )}
      {shown?.kind === 'pin' && (
        <PinNotice
          name={shown.name}
          pin={shown.pin}
          reset={shown.reset}
          onClose={() => {
            setShown(null);
            nameField.current?.focus();
          }}
        />
      )}
      {erasing && (
        <Confirm role="alertdialog" aria-label={`Apagar ${erasing.name}`}>
          <span>
            Apagar <b>{erasing.name}</b> para sempre? Saem o cadastro, as entregas, o vínculo do responsável e a conta do aluno com todo o progresso. Não dá
            para desfazer.
          </span>
          <Button ref={keep} type="button" $variant="ghost" onClick={() => setErasing(null)}>
            Manter
          </Button>
          <Danger
            type="button"
            $variant="link"
            disabled={remove.isPending}
            onClick={() => remove.mutate(erasing, { onSuccess: () => setErasing(null), onError: (cause) => (setErasing(null), fail(cause)) })}
          >
            Apagar para sempre
          </Danger>
        </Confirm>
      )}
      {resetting && (
        <Confirm role="alertdialog" aria-label={`Redefinir PIN de ${resetting.name}`}>
          <span>
            Redefinir o PIN de <b>{resetting.name}</b>? O PIN de agora para de funcionar na hora: {resetting.name} só entra com o novo, que aparece uma vez.
          </span>
          <Button ref={keep} type="button" $variant="ghost" onClick={() => setResetting(null)}>
            Manter o PIN
          </Button>
          <Danger
            type="button"
            $variant="link"
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(resetting, {
                onSuccess: ({ pin }) => (setResetting(null), setShown({ kind: 'pin', name: resetting.name, pin, reset: true })),
                onError: (cause) => (setResetting(null), fail(cause)),
              })
            }
          >
            Redefinir PIN
          </Danger>
        </Confirm>
      )}
      {shown?.kind === 'invite' && <GuardianInviteNotice name={shown.name} invite={shown.invite} onClose={() => setShown(null)} />}
    </Students>
  );
}

function CloseClass({ ready, klass }: { ready: Ready; klass: ClassDetail }) {
  const [asking, setAsking] = React.useState(false);
  const close = useTeacherMutation(ready, () => ready.api.closeClass(klass.id), (cache, closed) => {
    cache.set(classroomKeys.class(klass.id), closed);
    cache.stale(classroomKeys.classes, classroomKeys.plan, classroomKeys.assignments(klass.id));
  });
  const keep = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);
  if (klass.closedAt) return null;
  if (!asking)
    return (
      <Danger type="button" $variant="link" onClick={() => setAsking(true)}>
        Encerrar turma
      </Danger>
    );
  return (
    <Confirm role="alertdialog" aria-label="Encerrar turma">
      <span>Encerrar “{klass.name}”? Os alunos não entram mais, não recebem tarefa e não dá para reabrir.</span>
      <Button ref={keep} type="button" $variant="ghost" onClick={() => setAsking(false)}>
        Manter aberta
      </Button>
      <Danger type="button" $variant="link" disabled={close.isPending} onClick={() => close.mutate(undefined, { onSuccess: () => setAsking(false) })}>
        Encerrar
      </Danger>
      {close.error ? <Alert role="alert">{errorText(close.error)}</Alert> : null}
    </Confirm>
  );
}

function ClassView({ ready, classId }: { ready: Ready; classId: string }) {
  const detail = useClassDetail(ready, classId);
  const list = useClassAssignments(ready, classId);
  const tasks = list.data ?? [];
  const open = tasks.filter((t) => !t.closed);
  const details = useOpenAssignmentDetails(ready, tasks);
  const loaded = details.map((d) => d.data);
  const openDetails = loaded.filter((d): d is AssignmentDetail => !!d && !d.closed);
  const klass = detail.data;
  const portraitView = useMediaQuery(PORTRAIT_QUERY);
  // A turma abriu sem aluno ativo? Vale até sair dela: o cadastro não pula de lugar entre um aluno e outro
  const [startedEmpty, setStartedEmpty] = React.useState<boolean | null>(null);
  if (klass && startedEmpty === null) setStartedEmpty(!klass.students.some((s) => s.active));

  if (detail.error)
    return (
      <Column>
        <Header>
          <div>
            <h1>Turma</h1>
          </div>
          <Actions>
            <BackLink to={ROUTES.teacher} label="Turmas" />
          </Actions>
        </Header>
        <Alert role="alert">{errorText(detail.error)}</Alert>
      </Column>
    );
  if (!klass)
    return (
      <Column>
        <Text role="status">Carregando a turma…</Text>
      </Column>
    );
  const activeCount = klass.students.filter((s) => s.active).length;
  // Em pé, turma sem aluno: o primeiro passo (cadastrar) logo depois do código e do nome, não no fim da página.
  // Quem troca de lugar são os painéis: o cadastro fica montado e não perde o PIN que acabou de mostrar
  const studentsFirst = portraitView && !!startedEmpty && !klass.closedAt;
  const panels = (
    <Grid>
      <ReviewInbox details={loaded} />
      <TaskList tasks={tasks} />
      <PlanPanel ready={ready} className={klass.name} />
    </Grid>
  );
  return (
    <ClassColumn>
      <Header>
        <div>
          <Kicker>{klass.closedAt ? 'Turma encerrada' : `${activeCount} ${activeCount === 1 ? 'aluno' : 'alunos'} · ${open.length} ${open.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}`}</Kicker>
          <h1>{klass.name}</h1>
        </div>
        <Actions>
          <BackLink />
          {!klass.closedAt && (
            <Button as={Link} to={newAssignmentUrl(klass.id)}>
              ＋ Nova tarefa
            </Button>
          )}
        </Actions>
      </Header>
      {!studentsFirst && panels}
      <StudentRows ready={ready} klass={klass} tasks={openDetails} />
      {studentsFirst && panels}
      <CloseClass ready={ready} klass={klass} />
    </ClassColumn>
  );
}

function TeacherArea({ ready }: { ready: Ready }) {
  const { turma } = useParams();
  const classes = useMyClasses(ready);
  const list = classes.data ?? [];
  const current = list.find((k) => k.id === turma) ?? (turma ? null : (list.find((k) => !k.closedAt) ?? list[0] ?? null));
  const selectedId = turma ?? current?.id ?? null;

  return (
    <TeacherPage>
      <Nav aria-label="Turmas">
        <b>
          Violin <span>Hero</span>
        </b>
        <Kicker>Modo professor</Kicker>
        {list.map((k) => (
          <ClassLink key={k.id} to={teacherClassUrl(k.id)} aria-current={k.id === selectedId ? 'page' : undefined}>
            <b>{k.name}</b>
            <small>
              {k.closedAt ? 'encerrada' : `${k.studentCount} ${k.studentCount === 1 ? 'aluno' : 'alunos'}`}
            </small>
          </ClassLink>
        ))}
        {list.length > 0 && <NewClassForm ready={ready} />}
        {current && <ClassCode klass={current} />}
      </Nav>
      {classes.error ? (
        <Column>
          <Alert role="alert">{errorText(classes.error)}</Alert>
        </Column>
      ) : !classes.data ? (
        <Column>
          <Text role="status">Carregando suas turmas…</Text>
        </Column>
      ) : selectedId ? (
        <ClassView key={selectedId} ready={ready} classId={selectedId} />
      ) : (
        <Column>
          <Header>
            <div>
              {/* "Modo professor" já está logo acima, na marca da barra das turmas */}
              <Kicker>Primeiro passo</Kicker>
              <h1>Crie sua primeira turma</h1>
            </div>
            <Actions>
              <BackLink />
            </Actions>
          </Header>
          <Panel aria-label="Primeira turma">
            <Text>Dê um nome à turma. Depois você cadastra os alunos pelo nome e passa para cada um o código da turma e o PIN dele: ninguém precisa de e-mail.</Text>
            <NewClassForm ready={ready} autoFocus />
          </Panel>
        </Column>
      )}
    </TeacherPage>
  );
}

/** P1 · Painel do professor: as turmas, o código, os alunos com PIN, as tarefas e o que espera revisão. */
export const Teacher: React.FC<{ api?: ClassroomApi }> = ({ api }) => <TeacherGate api={api}>{(ready) => <TeacherArea ready={ready} />}</TeacherGate>;
