import React from 'react';
import styled, { useTheme } from 'styled-components';
import { STRING_LETTERS, type StringIndex } from '../../game/notation/violin';
import { noteName } from '../CountIn/countIn';
import { clampLines, Kicker } from '../Screen/Screen';
import { holdText, placeLine } from './nowPlaying';

const Panel = styled.section`
  display: flex;
  align-items: center;
  gap: 1.75rem;
  min-width: 0;
  padding: 1.125rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    gap: 0.75rem;
    padding: 0.375rem 0.75rem;
  }
`;

const Strings = styled.div`
  flex: none;
  display: flex;
  gap: 0.875rem;
  align-items: flex-end;

  > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  i {
    width: 6px;
    height: 7.5rem;
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 1rem;
    line-height: 1;
  }

  @media (max-height: 500px) {
    gap: 0.5rem;

    i {
      height: 3rem;
    }

    span {
      font-size: 0.75rem;
    }
  }
`;

const Text = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 500;
    font-size: 4rem;
    line-height: 1;
  }

  > span {
    ${clampLines(1)}
    font-size: 1.0625rem;
  }

  small {
    ${clampLines(1)}
    font-size: 0.875rem;
    padding-top: 0.5rem;
    border-top: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    color: ${({ theme }) => theme.colors.textMuted};
  }

  small b {
    font-family: inherit;
    font-weight: 600;
    font-size: inherit;
  }

  @media (max-height: 500px) {
    gap: 0.125rem;

    > ${Kicker} {
      display: none;
    }

    b {
      font-size: 1.75rem;
    }

    > span {
      font-size: 0.75rem;
    }

    small {
      font-size: 0.75rem;
      padding-top: 0.125rem;
    }
  }
`;

export interface PlayingNote {
  midi: number;
  string: StringIndex;
  finger: number;
  /** Duração em tempos da música. */
  beats: number;
}

export interface NowPlayingProps {
  now: PlayingNote | null;
  next: PlayingNote | null;
  className?: string;
}

/** Painel "Nota atual" da 5b: a corda acesa, a nota da vez com dedo e duração, e a próxima. */
export const NowPlaying: React.FC<NowPlayingProps> = ({ now, next, className }) => {
  const theme = useTheme();
  const color = (s: StringIndex) => theme.game.strings[STRING_LETTERS[s]].main;
  return (
    <Panel aria-label="Nota atual" className={className}>
      <Strings aria-hidden="true">
        {([0, 1, 2, 3] as const).map((s) => (
          <div key={s}>
            <i style={now?.string === s ? { background: color(s) } : undefined} />
            <span style={{ color: color(s) }}>{STRING_LETTERS[s]}</span>
          </div>
        ))}
      </Strings>
      <Text>
        <Kicker>Agora</Kicker>
        <b style={{ color: now ? color(now.string) : theme.colors.textMuted }}>{now ? noteName(now.midi) : '—'}</b>
        <span>{now ? `${placeLine(now.string, now.finger)} · segure ${holdText(now.beats)}` : 'Fim da música'}</span>
        {next && (
          <small>
            Próxima: <b style={{ color: color(next.string) }}>{noteName(next.midi)}</b> · {placeLine(next.string, next.finger)}
          </small>
        )}
      </Text>
    </Panel>
  );
};
