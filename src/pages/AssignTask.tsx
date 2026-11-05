import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { portrait } from '../assets/styles/media';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { TaskProgress } from '../components/TaskProgress/TaskProgress';
import { LEVELS, type Level } from '../game/notation/song';
import {
  ASSIGNMENT_INSTRUCTIONS,
  ASSIGNMENT_MAX_DAYS,
  INSTRUCTION_TEXT_MAX,
  type AssignmentMode,
  type ClassroomApi,
  type InstructionKey,
  type NewAssignment,
} from '../services/classroom';
import { useShelf } from '../services/shelf';
import { teacherClassUrl } from '../shell/routes';
import { classroomErrorOf, errorText, useClassAssignments, useClassDetail, useTeacherMutation, type TeacherAccess } from '../shell/useTeacher';
import { Actions, Alert, Chips, Column, Field, Header, Input, LimitNotice, Muted, Panel, Select, TeacherGate, TeacherPage, Text } from './teacherLayout';
import { ASSIGNMENT_MODES, dateInputValue, dueAtFromDate, dueText, defaultDueDate, instructionOf, MODE_NAMES } from './teacherText';

type Ready = Extract<TeacherAccess, { status: 'ready' }>;

const Body = styled.form`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.25rem;

  @media (max-height: 500px) {
    gap: 0.625rem;
  }

  /* Em pé: o formulário e, embaixo, como o aluno vai ver */
  ${portrait} {
    flex: none;
    flex-direction: column;
    gap: 1rem;
  }
`;

const Form = styled(Panel)`
  flex: 1;
  gap: 0.875rem;
  padding: 1.125rem 1.25rem;

  @media (max-height: 500px) {
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
  }

  ${portrait} {
    padding: 1rem;
  }
`;

const Pair = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 0.875rem 1.25rem;

  ${portrait} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Aside = styled.aside`
  flex: none;
  width: 20.625rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;

  @media (max-height: 500px) {
    width: 15rem;
    gap: 0.5rem;
  }

  ${portrait} {
    width: auto;
  }
`;

/** "Como o aluno vai ver": o cartão da tarefa na tela inicial do aluno. */
const Preview = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.875rem;
  background-color: ${({ theme }) => theme.colors.warning.surface};
  border: 2px solid ${({ theme }) => theme.colors.warning.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text};

  b {
    ${clampLines(2)}
    font-weight: 800;
    font-size: 0.875rem;
  }
`;

const Task = styled.li`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  &:last-child {
    border-bottom: 0;
  }

  b {
    ${clampLines(1)}
    font-size: 0.8125rem;
    font-weight: 800;
  }
`;

const Counter = styled(Muted)`
  align-self: flex-end;
`;

const DAY = 86_400_000;

type Instruction = InstructionKey | 'own' | null;

function AssignForm({ ready, classId }: { ready: Ready; classId: string }) {
  const navigate = useNavigate();
  const shelf = useShelf();
  const klass = useClassDetail(ready, classId);
  const tasks = useClassAssignments(ready, classId);
  const songs = shelf.status === 'ready' ? shelf.songs : [];
  const [songId, setSongId] = React.useState<string>('');
  const [level, setLevel] = React.useState<Level>('easy');
  const [mode, setMode] = React.useState<AssignmentMode>('arcade');
  const [due, setDue] = React.useState(defaultDueDate);
  const [instruction, setInstruction] = React.useState<Instruction>('tocar-inteira');
  const [ownText, setOwnText] = React.useState('');
  const create = useTeacherMutation((input: NewAssignment) => ready.api.createAssignment(input));

  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const levels = song ? LEVELS.filter((l) => song.levels.includes(l)) : [];
  const chosenLevel = levels.includes(level) ? level : (levels[0] ?? 'easy');
  const activeCount = klass.data?.students.filter((s) => s.active).length ?? 0;
  // O prazo vai de hoje a 59 dias (o fim do 60º passaria das 60 × 24 h que o banco aceita)
  const [[today, last]] = React.useState(() => [dateInputValue(Date.now()), dateInputValue(Date.now() + (ASSIGNMENT_MAX_DAYS - 1) * DAY)]);
  const text = instruction === 'own' ? ownText.trim() : '';
  const preview = instruction === 'own' ? text || null : instruction ? ASSIGNMENT_INSTRUCTIONS[instruction] : null;
  const back = teacherClassUrl(classId);
  const closed = !!klass.data?.closedAt;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!song || closed) return;
    create.mutate(
      {
        classId,
        songId: song.id,
        level: chosenLevel,
        mode,
        dueAt: dueAtFromDate(due),
        instructionKey: instruction && instruction !== 'own' ? instruction : null,
        instructionText: text || null,
      },
      { onSuccess: () => navigate(teacherClassUrl(classId)) }
    );
  };
  const kind = classroomErrorOf(create.error);

  return (
    <TeacherPage>
      <Column>
        <Header>
          <div>
            <Kicker>{klass.data?.name ?? 'Turma'}</Kicker>
            <h1>Nova tarefa</h1>
          </div>
          <Actions>
            <BackLink to={back} label={klass.data?.name ?? 'Turma'} />
            <Button type="submit" form="nova-tarefa" disabled={!song || create.isPending || closed || (instruction === 'own' && !text)}>
              Enviar para {activeCount} {activeCount === 1 ? 'aluno' : 'alunos'} <span aria-hidden="true">▸</span>
            </Button>
          </Actions>
        </Header>
        {klass.error && <Alert role="alert">{errorText(klass.error)}</Alert>}
        {closed && <Alert role="alert">Esta turma foi encerrada: não recebe tarefa nova.</Alert>}
        <Body id="nova-tarefa" onSubmit={submit} aria-label="Nova tarefa">
          <Form as="div">
            <Pair>
              <Field>
                <span>Música</span>
                <Select value={song?.id ?? ''} onChange={(e) => setSongId(e.target.value)} disabled={!songs.length}>
                  {!songs.length && <option value="">{shelf.status === 'loading' ? 'Carregando…' : 'Nenhuma música'}</option>}
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <span>Prazo</span>
                <Input type="date" value={due} min={today} max={last} required onChange={(e) => setDue(e.target.value)} />
              </Field>
            </Pair>
            <Pair>
              <Field as="div" role="group" aria-label="Nível">
                <span>Nível</span>
                <Chips>
                  {levels.map((l) => (
                    <button key={l} type="button" aria-pressed={l === chosenLevel} onClick={() => setLevel(l)}>
                      {LEVEL_NAMES[l]}
                    </button>
                  ))}
                </Chips>
              </Field>
              <Field as="div" role="group" aria-label="Modo de jogo">
                <span>Modo</span>
                <Chips>
                  {ASSIGNMENT_MODES.map((m) => (
                    <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)}>
                      {MODE_NAMES[m]}
                    </button>
                  ))}
                </Chips>
              </Field>
            </Pair>
            <Field as="div" role="group" aria-label="Recado para os alunos">
              <span>Recado para os alunos</span>
              <Chips>
                {(Object.keys(ASSIGNMENT_INSTRUCTIONS) as InstructionKey[]).map((k) => (
                  <button key={k} type="button" aria-pressed={instruction === k} onClick={() => setInstruction(instruction === k ? null : k)}>
                    {ASSIGNMENT_INSTRUCTIONS[k]}
                  </button>
                ))}
                <button type="button" aria-pressed={instruction === 'own'} onClick={() => setInstruction(instruction === 'own' ? null : 'own')}>
                  Escrever o meu
                </button>
              </Chips>
            </Field>
            {instruction === 'own' && (
              <Field>
                <span>Seu recado</span>
                <Input
                  value={ownText}
                  maxLength={INSTRUCTION_TEXT_MAX}
                  autoFocus
                  onChange={(e) => setOwnText(e.target.value)}
                  placeholder="Ex.: Mi com o 4º dedo bem em cima"
                />
                <Counter aria-live="polite">
                  {ownText.length} de {INSTRUCTION_TEXT_MAX}
                </Counter>
              </Field>
            )}
            <Muted>Vale a melhor partida terminada nesta música, nível e modo, feita até o prazo. O aluno escolhe enviar com a gravação para você revisar.</Muted>
            {kind === 'limit' ? <LimitNotice /> : kind && <Alert role="alert">{errorText(create.error)}</Alert>}
          </Form>

          <Aside>
            <Panel aria-label="Como o aluno vai ver">
              <Kicker>Como o aluno vai ver</Kicker>
              <Preview>
                <b>Tarefa nova{song ? `: ${song.title}` : ''}</b>
                <Muted>
                  {LEVEL_NAMES[chosenLevel]} · {MODE_NAMES[mode]} · {dueText({ dueAt: dueAtFromDate(due), closed: false })}
                </Muted>
                {preview && <Text>{preview}</Text>}
              </Preview>
            </Panel>
            <Panel aria-label="Tarefas da turma">
              <Kicker>Tarefas da turma</Kicker>
              {tasks.data && !tasks.data.length && <Muted>Esta é a primeira.</Muted>}
              <ul>
                {tasks.data?.map((t) => (
                  <Task key={t.id}>
                    <b>{t.songTitle}</b>
                    <TaskProgress studentCount={t.studentCount} submittedCount={t.submittedCount} reviewedCount={t.reviewedCount} />
                    <Muted>
                      {t.submittedCount} de {t.studentCount} entregaram · {t.reviewedCount} {t.reviewedCount === 1 ? 'revisada' : 'revisadas'} · {dueText(t)}
                    </Muted>
                    {instructionOf(t) && <Muted>{instructionOf(t)}</Muted>}
                  </Task>
                ))}
              </ul>
            </Panel>
          </Aside>
        </Body>
      </Column>
    </TeacherPage>
  );
}

/** P2 · Nova tarefa: música do catálogo, nível, modo, prazo e o recado (pronto ou curto). */
export const AssignTask: React.FC<{ api?: ClassroomApi }> = ({ api }) => {
  const { turma = '' } = useParams();
  return <TeacherGate api={api}>{(ready) => <AssignForm ready={ready} classId={turma} />}</TeacherGate>;
};
