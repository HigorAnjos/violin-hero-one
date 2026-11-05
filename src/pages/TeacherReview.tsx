import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { portrait } from '../assets/styles/media';
import type { StringName } from '../assets/styles/themes/types';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { StudentAvatar } from '../components/StudentAvatar/StudentAvatar';
import { SubmissionPlayer } from '../components/SubmissionPlayer/SubmissionPlayer';
import {
  classroomKeys,
  REVIEW_COMMENT_MAX,
  REVIEW_CONCEPTS,
  type AssignmentDetail,
  type ClassroomApi,
  type ReviewConcept,
  type ReviewInput,
} from '../services/classroom';
import { reviewUrl, ROUTES, teacherClassUrl } from '../shell/routes';
import { errorText, useAssignmentDetail, useTeacherMutation, type TeacherAccess } from '../shell/useTeacher';
import { Actions, Alert, Chips, Column, Header, Muted, Panel, TeacherGate, TeacherPage, Text, fieldStyles } from './teacherLayout';
import {
  audioGoneText,
  centsText,
  hardestString,
  instructionOf,
  MODE_NAMES,
  percent,
  reviewText,
  sentText,
  signedCents,
  STRING_NAMES,
  STRINGS,
  TASK_STATE_NAMES,
  taskState,
} from './teacherText';

type Ready = Extract<TeacherAccess, { status: 'ready' }>;
type Row = AssignmentDetail['students'][number];

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1rem;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }

  /* Em pé: alunos, a entrega e a revisão, um embaixo do outro */
  ${portrait} {
    flex: none;
    flex-direction: column;
    gap: 1rem;
  }
`;

const RecordingPanel = styled(Panel)`
  flex: none;
  overflow: visible;
`;

const MeasuresArea = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  overflow-y: auto;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }

  ${portrait} {
    overflow: visible;
  }
`;

/** A lista da tarefa: cada aluno com a situação. */
const Roster = styled.nav`
  flex: none;
  width: 13rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow-y: auto;

  @media (max-height: 500px) {
    width: 9.5rem;
  }

  ${portrait} {
    width: auto;
    overflow: visible;
  }
`;

const RosterLink = styled(Link)`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
  min-height: 2.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  border-left: 3px solid transparent;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};

  b {
    ${clampLines(1)}
    font-size: 0.875rem;
    font-weight: 800;
  }

  &[aria-current='page'] {
    background-color: ${({ theme }) => theme.colors.surface};
    border-left-color: ${({ theme }) => theme.colors.info.main};
  }
`;

/** As medidas da partida (.vh-m do design). */
const Metrics = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.625rem;

  > div {
    display: flex;
    flex-direction: column-reverse;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    background-color: ${({ theme }) => theme.colors.background};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    min-width: 0;
  }

  dt {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  dd {
    ${clampLines(1)}
    font-weight: 800;
    font-size: 1.125rem;
    font-variant-numeric: tabular-nums;
  }

  @media (max-height: 500px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.375rem;

    > div {
      padding: 0.25rem 0.5rem;
    }

    dd {
      font-size: 0.9375rem;
    }
  }

  ${portrait} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }
`;

const StringDot = styled.i<{ $string: StringName }>`
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  margin-right: 0.375rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme, $string }) => theme.game.strings[$string].main};
`;

const Aside = styled(Panel)`
  flex: none;
  width: 23.75rem;
  gap: 0.75rem;

  @media (max-height: 500px) {
    width: 15.5rem;
    gap: 0.375rem;
  }

  ${portrait} {
    width: auto;
  }
`;

const Comment = styled.textarea`
  ${fieldStyles}
  min-height: 5.75rem;
  padding: 0.625rem 0.75rem;
  resize: vertical;
  border: 2px solid ${({ theme }) => theme.colors.text};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.25rem;

  @media (max-height: 500px) {
    min-height: 3rem;
  }
`;

const Done = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.625rem 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.success.main};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.success.surface};
  color: ${({ theme }) => theme.colors.success.text};
`;

const Submit = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const QUICK = ['Som lindo!', 'Arco reto', 'Respira antes', 'Capriche na afinação'];

function Measures({ row }: { row: Row }) {
  const play = row.submission ?? row.best;
  if (!play) return null;
  const hard = hardestString(play.stringCents);
  const better = row.best && row.submission && row.best.playId !== row.submission.playId && row.best.score > (row.submission.score ?? 0) ? row.best : null;
  return (
    <>
      <Metrics aria-label={row.submission ? 'Partida enviada' : 'Melhor partida'}>
        <div>
          <dt>Pontos</dt>
          <dd>{play.score == null ? '—' : play.score.toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Precisão</dt>
          <dd>{play.accuracy == null ? '—' : percent(play.accuracy)}</dd>
        </div>
        <div>
          <dt>Afinação média</dt>
          <dd>{centsText(play.meanAbsCents)}</dd>
        </div>
        <div>
          <dt>Corda mais difícil</dt>
          <dd>{hard ? `${STRING_NAMES[hard.string]} · ${hard.side}` : 'nenhuma'}</dd>
        </div>
      </Metrics>
      <Metrics aria-label="Afinação por corda">
        {STRINGS.map((s, i) => (
          <div key={s}>
            <dt>
              <StringDot aria-hidden="true" $string={s} />
              Corda {STRING_NAMES[s]} ({s})
            </dt>
            <dd>{signedCents(play.stringCents?.[i])}</dd>
          </div>
        ))}
      </Metrics>
      {better && <Muted>A melhor partida que conta tem {better.score.toLocaleString('pt-BR')} pontos; o aluno enviou outra.</Muted>}
    </>
  );
}

function Recording({ ready, row }: { ready: Ready; row: Row }) {
  const sub = row.submission;
  if (!sub) return null;
  const duration = sub.audioDurationMs ?? sub.durationMs ?? 0;
  return (
    <RecordingPanel aria-label="Gravação">
      <Kicker>Gravação</Kicker>
      {sub.audioDeleted ? (
        <Text>O áudio desta entrega já foi apagado, 30 dias depois da revisão.</Text>
      ) : sub.audioPath ? (
        <>
          <SubmissionPlayer key={sub.audioPath} label={`gravação de ${row.name}`} durationMs={duration} load={() => ready.api.submissionAudioUrl(sub.audioPath!)} />
          <Muted>{audioGoneText(row.review?.reviewedAt ?? null)} Só o aluno, você e o responsável dele ouvem.</Muted>
        </>
      ) : (
        <Text>Entrega sem gravação: só a partida.</Text>
      )}
    </RecordingPanel>
  );
}

function ReviewForm({ ready, task, row, next }: { ready: Ready; task: Pick<AssignmentDetail, 'id' | 'classId'>; row: Row; next: Row | null }) {
  const [concept, setConcept] = React.useState<ReviewConcept | null>(null);
  const [comment, setComment] = React.useState('');
  // A revisão entra na linha do aluno na hora; a lista da turma (quantas revisadas) relê por fora
  const review = useTeacherMutation(ready, (input: ReviewInput) => ready.api.reviewSubmission(input), (cache, { submissionId, ...done }) => {
    cache.update<AssignmentDetail>(classroomKeys.assignment(task.id), (t) => ({
      ...t,
      students: t.students.map((s) => (s.submission?.id === submissionId ? { ...s, review: done } : s)),
    }));
    cache.stale(classroomKeys.assignment(task.id), classroomKeys.assignments(task.classId));
  });
  const id = React.useId();

  if (!row.submission)
    return (
      <Aside aria-label="Sua revisão">
        <Kicker>Sua revisão</Kicker>
        <Text>{row.best ? `${row.name} já tocou, mas ainda não enviou.` : `${row.name} ainda não tocou esta tarefa.`}</Text>
        <Muted>A revisão abre quando a entrega chegar.</Muted>
      </Aside>
    );
  if (row.review)
    return (
      <Aside aria-label="Sua revisão">
        <Kicker>Sua revisão</Kicker>
        <Done role="status">
          <b>{reviewText(row.review)}</b>
          {row.review.comment && <span>{row.review.comment}</span>}
          <Muted>Revisada em {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(Date.parse(row.review.reviewedAt))}. A entrega não muda mais.</Muted>
        </Done>
        {next && <NextLink row={next} />}
      </Aside>
    );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!concept) return;
    review.mutate({ submissionId: row.submission!.id, concept, comment: comment.trim() });
  };
  const add = (quick: string) => setComment((c) => (c.trim() ? `${c.trim()} ${quick}` : quick).slice(0, REVIEW_COMMENT_MAX));
  return (
    <Aside as="form" aria-label="Sua revisão" onSubmit={submit}>
      <Kicker>Conceito</Kicker>
      <Chips role="group" aria-label="Conceito">
        {(Object.keys(REVIEW_CONCEPTS) as ReviewConcept[]).map((c) => (
          <button key={c} type="button" aria-pressed={concept === c} onClick={() => setConcept(c)}>
            {REVIEW_CONCEPTS[c]}
          </button>
        ))}
      </Chips>
      <label htmlFor={id}>
        <Kicker>Comentário</Kicker>
      </label>
      <Chips role="group" aria-label="Comentários prontos">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => add(q)}>
            {q}
          </button>
        ))}
      </Chips>
      <Comment id={id} value={comment} maxLength={REVIEW_COMMENT_MAX} onChange={(e) => setComment(e.target.value)} placeholder="O que o app não ouve: postura, arco, som…" />
      <Muted aria-live="polite">
        {comment.length} de {REVIEW_COMMENT_MAX}
      </Muted>
      {review.error ? <Alert role="alert">{errorText(review.error)}</Alert> : null}
      <Submit>
        <Button type="submit" disabled={!concept || review.isPending}>
          Enviar revisão
        </Button>
        <Muted>Depois de revisada, a entrega não muda mais. O áudio é apagado 30 dias depois.</Muted>
      </Submit>
    </Aside>
  );
}

function NextLink({ row }: { row: Row }) {
  const { tarefa = '' } = useParams();
  return (
    <Button as={Link} to={reviewUrl(tarefa, row.studentId)} $variant="link">
      Próxima: {row.name} <span aria-hidden="true">▸</span>
    </Button>
  );
}

function ReviewArea({ ready, taskId }: { ready: Ready; taskId: string }) {
  const [params, setParams] = useSearchParams();
  const task = useAssignmentDetail(ready, taskId);
  const picked = params.get('aluno');
  const first = task.data ? (task.data.students.find((s) => s.submission && !s.review) ?? task.data.students[0]) : undefined;
  // Sem ?aluno, o primeiro para revisar fica na URL: revisado, ele sai da fila mas a tela continua nele
  React.useEffect(() => {
    if (!picked && first) setParams({ aluno: first.studentId }, { replace: true });
  }, [picked, first, setParams]);
  if (task.error)
    return (
      <TeacherPage>
        <Column>
          <Header>
            <div>
              <h1>Entregas</h1>
            </div>
            <Actions>
              <BackLink to={ROUTES.teacher} label="Turmas" />
            </Actions>
          </Header>
          <Alert role="alert">{errorText(task.error)}</Alert>
        </Column>
      </TeacherPage>
    );
  if (!task.data)
    return (
      <TeacherPage>
        <Text role="status">Carregando as entregas…</Text>
      </TeacherPage>
    );
  const data = task.data;
  const pending = data.students.filter((s) => s.submission && !s.review);
  const chosen = data.students.find((s) => s.studentId === params.get('aluno')) ?? pending[0] ?? data.students[0] ?? null;
  const at = chosen ? pending.indexOf(chosen) : -1;
  const next = pending.find((s, i) => s !== chosen && (at < 0 || i > at)) ?? pending.find((s) => s !== chosen) ?? null;
  const sub = chosen?.submission;
  const instruction = instructionOf(data);

  return (
    <TeacherPage>
      <Column>
        <Header>
          <div>
            <Kicker>
              {data.songTitle} · {LEVEL_NAMES[data.level]} · Modo {MODE_NAMES[data.mode]}
            </Kicker>
            <h1>{chosen ? `${chosen.name} · ${data.songTitle}` : data.songTitle}</h1>
            <Muted>{sub ? `Enviada ${sentText(sub.submittedAt)}${instruction ? ` · ${instruction}` : ''}` : (instruction ?? '')}</Muted>
          </div>
          <Actions>
            {pending.length > 0 && (
              <Muted>
                {pending.length} para revisar
              </Muted>
            )}
            <BackLink to={teacherClassUrl(data.classId)} label="Para revisar" />
          </Actions>
        </Header>
        <Body>
          <Roster aria-label="Alunos da tarefa">
            {data.students.map((s) => {
              const state = taskState(s);
              return (
                <RosterLink key={s.studentId} to={reviewUrl(data.id, s.studentId)} aria-current={s === chosen ? 'page' : undefined}>
                  <StudentAvatar id={s.studentId} name={s.name} size={1.75} />
                  <span>
                    <b>{s.name}</b>
                    <Muted>{TASK_STATE_NAMES[state]}</Muted>
                  </span>
                </RosterLink>
              );
            })}
            {!data.students.length && <Muted>Nenhum aluno ativo na turma.</Muted>}
          </Roster>
          {chosen ? (
            <>
              <Column>
                {chosen.submission ? (
                  <Recording ready={ready} row={chosen} />
                ) : (
                  <Panel aria-label="Situação">
                    <Kicker>Situação</Kicker>
                    <Text>{TASK_STATE_NAMES[taskState(chosen)]}</Text>
                    {chosen.best && <Muted>A melhor partida que conta até agora:</Muted>}
                  </Panel>
                )}
                <MeasuresArea>
                  <Measures row={chosen} />
                </MeasuresArea>
              </Column>
              <ReviewForm key={chosen.studentId} ready={ready} task={task.data} row={chosen} next={next} />
            </>
          ) : (
            <Column>
              <Text>Nenhuma entrega ainda.</Text>
            </Column>
          )}
        </Body>
      </Column>
    </TeacherPage>
  );
}

/** P3 · Revisar entrega: por tarefa, os alunos com a situação; a partida, a gravação e o conceito com comentário. */
export const TeacherReview: React.FC<{ api?: ClassroomApi }> = ({ api }) => {
  const { tarefa = '' } = useParams();
  return <TeacherGate api={api}>{(ready) => <ReviewArea ready={ready} taskId={tarefa} />}</TeacherGate>;
};
