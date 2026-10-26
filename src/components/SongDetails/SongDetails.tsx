import React from 'react';
import styled from 'styled-components';
import { LEVEL_NAMES } from '../CountIn/countIn';
import { clampLines, Kicker } from '../Screen/Screen';
import { SongCover } from '../SongCover/SongCover';
import { durationLabel, keyLabel, noteCount, stringShares } from '../SongCover/songFacts';
import type { LevelSettings } from '../../game/engine/levels';
import { LEVELS, type Level } from '../../game/notation/song';
import type { PlayableSong, ShelfSong } from '../../services/shelf';

const Panel = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-height: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => theme.spacing.sm};
    /* Sem altura sobrando (aviso de versão nova embaixo), rola por dentro como a lista ao lado em vez de vazar */
    overflow-y: auto;
  }
`;

const Banner = styled(SongCover)`
  flex: none;
  height: 6.5rem;
  border-radius: 3px;

  @media (max-height: 640px) {
    display: none;
  }
`;

const Title = styled.h2`
  ${clampLines(2)}
  font-weight: 700;
  font-size: 1.375rem;
  line-height: 1.75rem;

  @media (max-height: 500px) {
    ${clampLines(1)}
    font-size: 1.125rem;
    line-height: 1.5rem;
  }
`;

const Meta = styled.p`
  ${clampLines(2)}
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    ${clampLines(1)}
    font-size: 0.8125rem;
  }
`;

const Block = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
  }
`;

const Bars = styled.div`
  display: flex;
  height: 0.5rem;
  gap: 2px;
  background-color: ${({ theme }) => theme.colors.surfaceHover};

  i {
    display: block;
    height: 100%;
  }

  ${({ theme }) =>
    (['G', 'D', 'A', 'E'] as const).map((name) => `i[data-string='${name}'] { background-color: ${theme.game.strings[name].main}; }`).join('\n')}
`;

const StringLetter = styled.b<{ $string: 'G' | 'D' | 'A' | 'E' }>`
  color: ${({ theme, $string }) => theme.game.strings[$string].main};
`;

const Legend = styled.p`
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  b {
    font-weight: 700;
  }

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

const Segments = styled.div`
  display: flex;
  gap: 0.375rem;
`;

const Segment = styled.button`
  flex: 1;
  min-height: 2.75rem;
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
  background-color: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;

  &[aria-pressed='true'] {
    color: ${({ theme }) => theme.colors.text};
    border: 2px solid ${({ theme }) => theme.colors.primary.main};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary.border};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const Note = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 0.625rem;
  margin-top: auto;

  > :first-child {
    flex: 1;
  }
`;

interface Props {
  song: ShelfSong;
  level: Level;
  onLevel: (level: Level) => void;
  playable: PlayableSong;
  settings: LevelSettings;
  /** Botões Tocar e Praticar, montados pela tela (são links de rota). */
  actions: React.ReactNode;
}

/** Painel da música escolhida (3): capa, ficha, cordas usadas, dificuldade e a folga do nível do jogador. */
export const SongDetails: React.FC<Props> = ({ song, level, onLevel, playable, settings, actions }) => {
  const chart = playable.status === 'ready' ? playable.song : null;
  const facts = [song.composer, keyLabel(chart?.key ?? song.key), `${Math.round(song.bpm)} BPM`, durationLabel(song.durationSeconds)];
  if (chart) facts.push(`${noteCount(chart)} notas`);
  const shares = chart ? stringShares(chart) : null;
  const levelLabel = React.useId();

  return (
    <Panel aria-label="Detalhes da música">
      <Banner id={song.id} />
      <div>
        <Title>{song.title}</Title>
        <Meta>{facts.filter(Boolean).join(' · ')}</Meta>
      </div>
      <Block>
        <Kicker>Cordas usadas</Kicker>
        <Bars aria-hidden="true">
          {shares?.map(({ letter, percent }) => (
            <i key={letter} style={{ width: `${percent}%` }} data-string={letter} />
          ))}
        </Bars>
        <Legend aria-busy={!shares}>
          {(shares ?? [{ letter: 'G' }, { letter: 'D' }, { letter: 'A' }, { letter: 'E' }]).map((share) => (
            <span key={share.letter}>
              <StringLetter $string={share.letter}>{share.letter}</StringLetter> {'percent' in share ? `${share.percent}%` : '…'}
            </span>
          ))}
        </Legend>
      </Block>
      <Block>
        <Kicker id={levelLabel}>Dificuldade</Kicker>
        <Segments role="group" aria-labelledby={levelLabel}>
          {LEVELS.map((value) => (
            <Segment
              key={value}
              type="button"
              aria-pressed={value === level}
              disabled={!song.levels.includes(value)}
              onClick={() => onLevel(value)}
            >
              {LEVEL_NAMES[value]}
            </Segment>
          ))}
        </Segments>
        <Note>
          Afinação ±{settings.toleranceCents} ¢ · tempo ±{settings.windows.good} ms
        </Note>
      </Block>
      {playable.status === 'error' && <Note role="alert">{playable.error.message}</Note>}
      <Actions>{actions}</Actions>
    </Panel>
  );
};
