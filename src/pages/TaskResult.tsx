import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { Kicker, SongKicker } from '../components/Screen/Screen';
import { percent } from '../components/TaskCard/taskStatus';
import { RecordingError, type Recording } from '../game/audio';
import { ClassroomError } from '../services/classroom';
import { recordingUploads, usePlayOutcome } from '../services/sync';
import type { UploadStatus } from '../services/recordingUpload';
import { classroomShell, submitPlayOnly } from '../shell/classroom';
import { gameRoute, readResultState, taskCarry, type PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';
import type { SubmissionMeta } from '../shell/submissionTarget';
import { releaseTaskRecording, taskRecording } from '../shell/taskRecording';
import { useSession } from '../shell/useAccount';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  gap: 2.5rem;
  padding: 2.25rem 4rem;
  overflow: hidden;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    gap: 0.75rem;
    padding: 0.5rem max(1rem, env(safe-area-inset-right)) 0.5rem max(1rem, env(safe-area-inset-left));
  }
`;

const Summary = styled.div`
  width: 31.25rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2.875rem;
    line-height: 1.02;

    span {
      color: ${({ theme }) => theme.colors.info.text};
    }
  }

  @media (max-height: 500px) {
    width: 22rem;
    gap: 0.375rem;

    h1 {
      font-size: 1.375rem;
    }
  }
`;

/** .vh-chk do design: o que a partida cumpriu. */
const Checks = styled.ul`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.875rem;
    background-color: ${({ theme }) => theme.colors.surface};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    font-size: 0.9375rem;
  }

  i {
    width: 1.75rem;
    height: 1.75rem;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.info.main};
    color: ${({ theme }) => theme.colors.background};
    font-style: normal;
    font-weight: 800;
  }

  b {
    margin-left: auto;
    font-weight: 800;
    font-size: 1.0625rem;
  }

  @media (max-height: 500px) {
    gap: 0.25rem;

    li {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
    }

    i {
      width: 1.25rem;
      height: 1.25rem;
    }

    b {
      font-size: 0.875rem;
    }
  }
`;

const Tip = styled.p`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  border: 1px dashed ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

const Panel = styled.section`
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1.375rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};
  overflow-y: auto;

  @media (max-height: 500px) {
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
  }
`;

/** .vh-try do design: a gravação desta tentativa, para ouvir antes de mandar. */
const Take = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;

  span:last-child {
    margin-left: auto;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    box-shadow: none;
  }
`;

const Listen = styled(Button)`
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  padding: 0;
`;

const Box = styled.p<{ $tone: 'warning' | 'info' | 'danger' }>`
  padding: 0.75rem 0.875rem;
  background-color: ${({ theme, $tone }) => theme.colors[$tone].surface};
  border: 2px solid ${({ theme, $tone }) => theme.colors[$tone].border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Muted = styled.p`
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;
  margin-top: auto;
`;

/** "0:48" */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Sent = { kind: 'audio'; id: string } | { kind: 'play'; status: 'sending' | 'done' | 'error'; message?: string };

const UPLOAD_TEXT: Record<UploadStatus, { tone: 'info' | 'warning' | 'danger'; text: string }> = {
  queued: { tone: 'warning', text: 'Gravação na fila: sobe sozinha quando houver internet. Pode sair desta tela.' },
  sent: { tone: 'info', text: 'Enviada ✓ O professor já pode ouvir e revisar.' },
  rejected: { tone: 'danger', text: 'A tarefa não recebe mais esta entrega (o prazo acabou ou ela já foi revisada).' },
  expired: { tone: 'danger', text: 'A gravação passou do prazo sem subir e saiu deste aparelho.' },
};

function useUploadStatus(id: string | null): UploadStatus | undefined {
  return React.useSyncExternalStore(recordingUploads.subscribe, () => (id ? recordingUploads.status(id) : undefined));
}

/** O ▶ que toca a gravação aqui mesmo, antes de mandar. */
const Player: React.FC<{ recording: Recording }> = ({ recording }) => {
  const audio = React.useRef<HTMLAudioElement>(null);
  const [url] = React.useState(() => URL.createObjectURL(recording.blob));
  const [playing, setPlaying] = React.useState(false);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  };
  return (
    <Take>
      <Listen type="button" $variant="ghost" aria-label={playing ? 'Pausar a gravação' : 'Ouvir a gravação'} onClick={toggle}>
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </Listen>
      <span>
        <b>Esta tentativa</b> · agora há pouco
      </span>
      <span>{clock(recording.durationMs)}</span>
      <audio ref={audio} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </Take>
  );
};

/**
 * A3 · Aluno: o fim da partida de tarefa. Mostra o que a partida cumpriu e deixa mandar a gravação para o professor
 * (pela fila de envio, que guarda sem rede) ou só marcar a tarefa como feita. Gravação interrompida: tocar de novo;
 * navegador que não grava: vai só a partida.
 */
export const TaskResult: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const state = readResultState(location.state);
  const carry = taskCarry((location.state ?? {}) as PlayState);
  const clientId = (location.state as { clientId?: string } | null)?.clientId;
  const outcome = usePlayOutcome(clientId);
  const [recording] = React.useState(() => taskRecording(clientId));
  const [sent, setSent] = React.useState<Sent | null>(null);
  const upload = useUploadStatus(sent?.kind === 'audio' ? sent.id : null);
  const task = carry.task;

  // Sem servidor (turma simulada), a partida entra direto no fake
  React.useEffect(() => {
    if (!state || !task || !clientId) return;
    const { song, mode, result } = state;
    void classroomShell().then((shell) => shell.playedTask?.({ clientId, songId: song.id, level: song.level, mode, score: result.score, accuracy: result.accuracy }));
    // Uma vez por partida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state || !task) return <Navigate to={ROUTES.tasks} replace />;
  const { song, result } = state;
  const userId = session?.status === 'signed-in' ? session.userId : null;
  const good = recording && !(recording instanceof RecordingError) ? recording : null;
  const failure = recording instanceof RecordingError ? recording.kind : recording ? null : 'missing';
  const busy = sent !== null && !(sent.kind === 'play' && sent.status === 'error');
  const again: PlayState & { next: string } = { song, mode: state.mode, latencyMs: state.latencyMs, next: gameRoute(state.mode), ...carry };

  const sendAudio = async () => {
    if (!good) return;
    const id = crypto.randomUUID();
    const meta: SubmissionMeta = { classId: task.classId, studentId: task.studentId, taskId: task.assignmentId, dueAt: task.dueAt, ...(outcome?.playId && { playId: outcome.playId }) };
    try {
      await recordingUploads.enqueue({ id, blob: good.blob, mimeType: good.mimeType, durationMs: good.durationMs, meta: { ...meta } });
      releaseTaskRecording(clientId);
      setSent({ kind: 'audio', id });
    } catch {
      setSent({ kind: 'play', status: 'error', message: 'Não foi possível guardar a gravação neste aparelho. Tente de novo.' });
    }
  };

  const sendPlay = async () => {
    if (!userId) {
      setSent({ kind: 'play', status: 'error', message: new ClassroomError('offline').message });
      return;
    }
    setSent({ kind: 'play', status: 'sending' });
    try {
      await submitPlayOnly(userId, task, outcome?.playId ?? null);
      releaseTaskRecording(clientId);
      setSent({ kind: 'play', status: 'done' });
    } catch (error) {
      const message =
        error instanceof ClassroomError && error.kind !== 'offline' ? error.message : 'Sem conexão. A partida fica guardada; marque como feita quando a internet voltar.';
      setSent({ kind: 'play', status: 'error', message });
    }
  };

  return (
    <Page>
      <Summary>
        <SongKicker>Tarefa · {task.songTitle}</SongKicker>
        <h1>
          Tarefa tocada! <span>{good ? 'Bora mostrar?' : 'Bora entregar?'}</span>
        </h1>
        <Checks aria-label="O que a partida cumpriu">
          <li>
            <i aria-hidden="true">✓</i>Música inteira, do começo ao fim
          </li>
          <li>
            <i aria-hidden="true">✓</i>Precisão<b>{percent(result.accuracy)}</b>
          </li>
          {result.meanAbsCents !== null && (
            <li>
              <i aria-hidden="true">✓</i>Afinação média<b>±{Math.round(result.meanAbsCents)} ¢</b>
            </li>
          )}
        </Checks>
        <Tip>
          <span aria-hidden="true">🎻</span>
          <span>A partida já conta para a tarefa. Enviar a gravação ajuda o professor a corrigir o que o app não ouve: postura, som, arco.</span>
        </Tip>
        <Button as={Link} to={ROUTES.results} state={state} replace $variant="link">
          Ver o resultado completo <span aria-hidden="true">▸</span>
        </Button>
      </Summary>

      <Panel aria-labelledby="enviar-professor">
        <Kicker id="enviar-professor">Enviar para o professor</Kicker>
        {good && !sent && <Player recording={good} />}
        {failure === 'unsupported' && <Box $tone="warning">Este navegador não grava áudio. A partida vai sem gravação; o professor vê pontos, precisão e afinação.</Box>}
        {failure && failure !== 'unsupported' && !sent && (
          <Box $tone="warning">
            {failure === 'interrupted'
              ? 'A gravação parou no meio (o microfone fechou: tela bloqueada ou outra aba). Toque de novo para mandar com áudio.'
              : 'A gravação desta partida não ficou pronta. Toque de novo para mandar com áudio.'}
          </Box>
        )}
        {good && !sent && <Muted>Vai junto: a partida (pontos, precisão e afinação) e o áudio de {clock(good.durationMs)}. Só você, o professor da turma e seu responsável ouvem.</Muted>}

        <div aria-live="polite">
          {sent?.kind === 'audio' && upload && <Box $tone={UPLOAD_TEXT[upload].tone}>{UPLOAD_TEXT[upload].text}</Box>}
          {sent?.kind === 'play' && sent.status === 'sending' && <Muted>Enviando…</Muted>}
          {sent?.kind === 'play' && sent.status === 'done' && <Box $tone="info">Marcada como feita ✓ O professor já vê sua partida.</Box>}
          {sent?.kind === 'play' && sent.status === 'error' && <Box $tone="danger" role="alert">{sent.message}</Box>}
        </div>

        <Actions>
          {busy ? (
            <Button as={Link} to={`${ROUTES.tasks}?${new URLSearchParams({ tarefa: task.assignmentId })}`} replace>
              Ver tarefas <span aria-hidden="true">▸</span>
            </Button>
          ) : good ? (
            <>
              <Button type="button" $variant="ghost" onClick={() => void sendPlay()}>
                Só marcar como feita
              </Button>
              <Button type="button" onClick={() => void sendAudio()}>
                Enviar para o professor <span aria-hidden="true">▸</span>
              </Button>
            </>
          ) : failure === 'unsupported' ? (
            <Button type="button" onClick={() => void sendPlay()}>
              Enviar a partida <span aria-hidden="true">▸</span>
            </Button>
          ) : (
            <>
              <Button type="button" $variant="ghost" onClick={() => void sendPlay()}>
                Enviar só a partida
              </Button>
              <Button type="button" onClick={() => navigate(ROUTES.countdown, { replace: true, state: again })}>
                Tocar de novo <span aria-hidden="true">▸</span>
              </Button>
            </>
          )}
        </Actions>
      </Panel>
    </Page>
  );
};
