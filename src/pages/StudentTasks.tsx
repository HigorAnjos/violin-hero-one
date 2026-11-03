import React from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { ClassAvatar } from '../components/ClassBadge/ClassBadge';
import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { dueLabel, percent, reviewMark, shortDate, taskStatus } from '../components/TaskCard/taskStatus';
import { ASSIGNMENT_INSTRUCTIONS, ClassroomError, type StudentAssignment } from '../services/classroom';
import { loadingUrl } from '../shell/choice';
import { taskGameMode, useMyAssignments, useStudent } from '../shell/classroom';
import type { PlayState, TaskPlay } from '../shell/play';
import { ROUTES } from '../shell/routes';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.75rem 2.5rem;
  overflow: hidden;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    gap: 0.375rem;
    padding: 0.5rem max(1rem, env(safe-area-inset-right)) 0.5rem max(1rem, env(safe-area-inset-left));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;

  > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  h1 {
    ${clampLines(1)}
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.875rem;
    line-height: 2.125rem;
  }

  @media (max-height: 500px) {
    align-items: center;

    > div:first-child {
      flex-direction: row;
      align-items: center;
      gap: 0.75rem;
    }

    h1 {
      font-size: 1.25rem;
      line-height: 1.5rem;
    }
  }
`;

const Who = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  span:last-child {
    ${clampLines(1)}
  }

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.375rem;

  @media (max-height: 500px) {
    gap: 0.625rem;
  }
`;

const List = styled.nav`
  width: 21.25rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  overflow-y: auto;
  padding: 0 0.25rem 0.375rem 0;

  @media (max-height: 500px) {
    width: 14.5rem;
    gap: 0.375rem;
  }
`;

/** .ns-panel do design: a tarefa aberta. */
const Panel = styled.section`
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1.25rem 1.375rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};
  overflow-y: auto;

  h2 {
    ${clampLines(2)}
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.5rem;
    line-height: 1.75rem;
  }

  @media (max-height: 500px) {
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;

    h2 {
      font-size: 1.0625rem;
      line-height: 1.25rem;
    }
  }
`;

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;

  > span {
    flex: none;
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    > span {
      font-size: 0.75rem;
    }
  }
`;

const Goals = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.625rem;

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    background-color: ${({ theme }) => theme.colors.background};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
  }

  dt {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  dd {
    ${clampLines(1)}
    font-weight: 800;
    font-size: 1.0625rem;
  }

  @media (max-height: 500px) {
    gap: 0.375rem;

    > div {
      padding: 0.25rem 0.5rem;
      gap: 0;
    }

    dd {
      font-size: 0.875rem;
    }
  }
`;

/** O recado do professor (instrução ou revisão): a caixa morna do design. */
const Note = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background-color: ${({ theme }) => theme.colors.warning.surface};
  border: 2px solid ${({ theme }) => theme.colors.warning.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  > div {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  b {
    font-size: 0.9375rem;
  }

  small {
    margin-left: auto;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  p {
    font-size: 0.9375rem;
    line-height: 1.375rem;
  }

  @media (max-height: 500px) {
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;

    b,
    p {
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
  margin-top: auto;

  > span {
    flex: 1;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    > span {
      font-size: 0.75rem;
    }
  }
`;

const Empty = styled.div`
  margin: auto;
  max-width: 32rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;

  p {
    font-size: 1rem;
    line-height: 1.5rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const MODE_NAMES: Record<string, string> = { arcade: 'Arcade', sheet: 'Partitura', strings3d: 'Cordas 3D' };

/** O que a partida de tarefa leva até a entrega. */
function taskPlay(task: StudentAssignment, studentId: string): TaskPlay {
  return { assignmentId: task.id, classId: task.classId, studentId, dueAt: task.dueAt, songTitle: task.songTitle };
}

const Detail: React.FC<{ task: StudentAssignment; studentId: string; className: string; now: Date; classClosed: boolean }> = ({ task, studentId, className, now, classClosed }) => {
  const status = taskStatus(task);
  const instruction = [task.instructionKey && ASSIGNMENT_INSTRUCTIONS[task.instructionKey], task.instructionText].filter(Boolean).join(' ');
  const open = !task.closed && !task.review && !classClosed;
  const play = loadingUrl({ mode: taskGameMode(task.mode), songId: task.songId, level: task.level });
  const practice = loadingUrl({ mode: 'Prática', songId: task.songId, level: task.level });
  const state: PlayState = { recordAudio: true, task: taskPlay(task, studentId) };
  const delivery =
    status === 'reviewed' ? 'Revisada' : status === 'submitted' ? `Entregue em ${shortDate(new Date(task.submission!.submittedAt))}` : status === 'missed' ? 'Não entregue' : 'Falta tocar e enviar';

  return (
    <Panel aria-labelledby="tarefa-aberta">
      <TitleRow>
        <h2 id="tarefa-aberta">{task.songTitle}</h2>
        <span>
          Modo {MODE_NAMES[task.mode] ?? 'Arcade'} · {LEVEL_NAMES[task.level]}
        </span>
      </TitleRow>
      <Goals>
        <div>
          <dt>Prazo</dt>
          <dd>{dueLabel(task.dueAt, now)}</dd>
        </div>
        <div>
          <dt>Sua melhor partida que conta</dt>
          <dd>{task.best ? `${percent(task.best.accuracy)} de precisão` : 'nenhuma ainda'}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>{delivery}</dd>
        </div>
      </Goals>

      {task.review && (
        <Note role="group" aria-label="Revisão do professor">
          <div>
            <ClassAvatar name={className} size={32} />
            <b>O professor revisou: {reviewMark(task.review)}</b>
            <small>{shortDate(new Date(task.review.reviewedAt))}</small>
          </div>
          {task.review.comment && <p>“{task.review.comment}”</p>}
        </Note>
      )}
      {instruction && (
        <Note role="group" aria-label="O que o professor pediu">
          <div>
            <b>O que o professor pediu</b>
          </div>
          <p>{instruction}</p>
        </Note>
      )}

      <Actions>
        {open ? (
          <>
            <Button as={Link} to={practice} $variant="ghost">
              Praticar antes
            </Button>
            <span />
            <Button as={Link} to={play} state={state}>
              {status === 'todo' ? 'Tocar a tarefa' : 'Tocar e enviar de novo'} <span aria-hidden="true">▸</span>
            </Button>
          </>
        ) : (
          <span>
            {classClosed
              ? 'A turma foi encerrada: a tarefa não recebe mais entregas.'
              : task.review
                ? 'A tarefa já foi revisada. Dá para continuar tocando a música por diversão.'
                : 'O prazo acabou: partidas novas não contam mais para esta tarefa.'}
          </span>
        )}
      </Actions>
    </Panel>
  );
};

/** A2 · Aluno: as tarefas da turma, com prazo, a própria situação e o comentário do professor. */
export const StudentTasks: React.FC = () => {
  const { student, myClass, pending, error: classError } = useStudent();
  const tasks = useMyAssignments(student);
  const [params, setParams] = useSearchParams();
  const [now] = React.useState(() => new Date());

  if (pending) return null;
  // Convidado ou conta com e-mail: o caminho é entrar pela turma
  if (!student) return <Navigate to={ROUTES.joinClass} replace />;

  const list = tasks.data ?? [];
  const chosen = list.find((t) => t.id === params.get('tarefa')) ?? list.find((t) => taskStatus(t) === 'todo') ?? list[0];
  const failure = classError ?? tasks.error;
  const offline = failure instanceof ClassroomError && failure.kind === 'offline';
  const className = myClass?.className ?? '';

  return (
    <Page>
      <Header>
        <div>
          <BackLink />
          <h1>Tarefas da turma</h1>
        </div>
        {myClass && (
          <Who>
            <ClassAvatar name={className} />
            <span>
              {className} · {myClass.name}
            </span>
          </Who>
        )}
      </Header>

      {failure ? (
        <Empty role="alert">
          <p>{offline ? 'Sem conexão. As tarefas precisam de internet; o que você tocar fica guardado e sobe depois.' : 'Não foi possível abrir as tarefas agora.'}</p>
          <Button type="button" $variant="ghost" onClick={() => void tasks.refetch()}>
            Tentar de novo
          </Button>
        </Empty>
      ) : tasks.isPending || !myClass ? (
        <Empty>
          <p role="status">Abrindo as tarefas…</p>
        </Empty>
      ) : !chosen ? (
        <Empty>
          <Kicker>{className}</Kicker>
          <p>Nenhuma tarefa por enquanto. Quando o professor passar uma, ela aparece aqui.</p>
          <Button as={Link} to={ROUTES.home} $variant="ghost">
            Tocar por diversão
          </Button>
        </Empty>
      ) : (
        <Body>
          <List aria-label="Tarefas">
            {list.map((t) => (
              <TaskCard key={t.id} task={t} now={now} current={t.id === chosen.id} onSelect={() => setParams({ tarefa: t.id }, { replace: true })} />
            ))}
          </List>
          <Detail task={chosen} studentId={myClass.studentId} className={className} now={now} classClosed={myClass.closedAt !== null} />
        </Body>
      )}
    </Page>
  );
};
