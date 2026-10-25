import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { secondsPerBeat, type Song } from '../../game/notation/song';
import { countInView, type CountInView } from './countIn';

/**
 * Relógio do compasso de entrada: um tick por tempo, a partir do momento em que a tela abre.
 * `onDone` precisa ser estável (useCallback): trocar a função reinicia a contagem.
 */
export function useCountIn(song: Pick<Song, 'bpm' | 'timeSignature'>, onDone: () => void): CountInView {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const beatMs = secondsPerBeat(song) * 1000;
    let timer: ReturnType<typeof setTimeout>;
    let target = beatMs;
    const tick = () => {
      // O relógio do sistema anda em ms inteiros; o tick nunca conta antes da batida agendada
      const now = Math.max(Date.now() - started, target) / 1000;
      setElapsed(now);
      const view = countInView(song, now);
      if (view.done) {
        onDone();
        return;
      }
      target = view.beat * beatMs;
      timer = setTimeout(tick, Math.max(0, target - (Date.now() - started)));
    };
    timer = setTimeout(tick, beatMs);
    return () => clearTimeout(timer);
  }, [song, onDone]);
  return countInView(song, elapsed);
}

const beat = keyframes`
  from { transform: scale(1.12); }
  to { transform: scale(1); }
`;

const Count = styled.span<{ $beatSeconds: number }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(7rem, 30vh, 13.75rem);
  line-height: 0.9;
  color: ${({ theme }) => theme.colors.text};

  @media (prefers-reduced-motion: no-preference) {
    ${({ $beatSeconds }) => css`
      animation: ${beat} ${$beatSeconds}s ease-out;
    `}
  }
`;

const Dots = styled.span`
  display: flex;
  gap: 1.125rem;

  i {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  }

  i[data-on] {
    border-color: ${({ theme }) => theme.colors.primary.main};
    background-color: ${({ theme }) => theme.colors.primary.main};
  }

  @media (max-height: 500px) {
    gap: 0.75rem;

    i {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
`;

/** Número grande (quantos tempos faltam) e as bolinhas do compasso de entrada. */
export const CountIn: React.FC<{ view: CountInView; bpm: number }> = ({ view, bpm }) => {
  const shown = Math.max(1, view.remaining);
  return (
    <>
      <Count key={view.beat} $beatSeconds={60 / bpm} role="timer" aria-label={`Começa em ${shown}`}>
        {shown}
      </Count>
      <Dots role="img" aria-label={`Compasso de entrada: tempo ${Math.min(view.beat, view.total)} de ${view.total}`}>
        {Array.from({ length: view.total }, (_, i) => (
          <i key={i} data-on={i < view.beat || undefined} />
        ))}
      </Dots>
    </>
  );
};
