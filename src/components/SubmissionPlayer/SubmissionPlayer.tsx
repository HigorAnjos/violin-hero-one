import React from 'react';
import styled from 'styled-components';

/** "0:29"; de milissegundos. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;

  > span {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Toggle = styled.button`
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 0;
  background-color: ${({ theme }) => theme.colors.text};
  color: ${({ theme }) => theme.colors.background};
  font-size: 0.875rem;
  cursor: pointer;

  &:disabled {
    cursor: progress;
    opacity: 0.6;
  }
`;

/** A linha do tempo da gravação: arrastar para ouvir de outro ponto. */
const Track = styled.input`
  flex: 1;
  min-width: 0;
  min-height: 2.75rem;
  accent-color: ${({ theme }) => theme.colors.info.main};
  cursor: pointer;
`;

const Alert = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.danger.text};
`;

/**
 * Player da gravação da entrega. O endereço (signed URL de 1 hora) só é pedido no primeiro play. O tamanho vem de
 * `durationMs` (o que o aparelho gravou): o webm do MediaRecorder sai sem duração, e o audio.duration dele é Infinity.
 */
export const SubmissionPlayer: React.FC<{ label: string; durationMs: number; load: () => Promise<string> }> = ({ label, durationMs, load }) => {
  const audio = React.useRef<HTMLAudioElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const pendingPlay = React.useRef(false);

  const start = React.useCallback(async () => {
    const el = audio.current;
    if (!el) return;
    try {
      await el.play();
    } catch {
      setError('Não foi possível tocar a gravação neste aparelho.');
    }
  }, []);

  React.useEffect(() => {
    if (url && pendingPlay.current) {
      pendingPlay.current = false;
      void start();
    }
  }, [url, start]);

  const toggle = async () => {
    setError(null);
    if (playing) {
      audio.current?.pause();
      return;
    }
    if (url) {
      void start();
      return;
    }
    setBusy(true);
    try {
      pendingPlay.current = true;
      setUrl(await load());
    } catch (cause) {
      pendingPlay.current = false;
      setError(cause instanceof Error && cause.name === 'ClassroomError' ? cause.message : 'Não foi possível buscar a gravação. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const seek = (ms: number) => {
    setPosition(ms);
    if (audio.current) audio.current.currentTime = ms / 1000;
  };

  return (
    <>
      <Row>
        <Toggle type="button" onClick={toggle} disabled={busy} aria-label={playing ? `Pausar ${label}` : `Tocar ${label}`}>
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </Toggle>
        <Track
          type="range"
          min={0}
          max={Math.max(1, durationMs)}
          step={100}
          value={Math.min(position, durationMs)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!url}
          aria-label={`Posição em ${label}`}
          aria-valuetext={`${clock(position)} de ${clock(durationMs)}`}
        />
        <span>
          {clock(Math.min(position, durationMs))} / {clock(durationMs)}
        </span>
      </Row>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="auto"
          data-testid="submission-audio"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onTimeUpdate={(e) => setPosition(Math.min(durationMs, e.currentTarget.currentTime * 1000))}
          onError={() => {
            // O endereço assinado vence em 1 hora: o próximo play pede outro
            setUrl(null);
            setPlaying(false);
            setError('Não foi possível tocar a gravação. Toque de novo para tentar outra vez.');
          }}
        />
      )}
      {error && <Alert role="alert">{error}</Alert>}
    </>
  );
};
