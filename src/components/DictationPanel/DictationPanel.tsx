import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { DURATION_NAMES, noteName } from '../../game/notation/editor';
import type { DictationGrid } from '../../game/notation/dictation';
import type { DictationPhase, LiveNote } from '../../shell/useDictation';
import { Button } from '../Button/Button';
import { formatCents } from '../OpenStringCard/openStringCheck';

const pulse = keyframes`
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.9); opacity: 0; }
`;

const Panel = styled.section<{ $active: boolean }>`
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
  margin-top: 0.75rem;
  padding: 0.875rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme, $active }) => ($active ? theme.colors.primary.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 4px 0 ${({ theme, $active }) => ($active ? theme.colors.primary.main : theme.colors.surfaceBorder)};

  @media (max-height: 500px) {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    gap: 0.5rem 0.75rem;
  }
`;

const Mic = styled.div<{ $live: boolean }>`
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  flex: none;

  span {
    position: absolute;
    inset: 0;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme, $live }) => ($live ? theme.colors.primary.main : theme.colors.textMuted)};
  }

  span:first-child {
    opacity: 0;
    ${({ $live }) =>
      $live &&
      css`
        @media (prefers-reduced-motion: no-preference) {
          animation: ${pulse} 1.4s ease-out infinite;
        }
      `}
  }

  span:last-child {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  svg rect {
    fill: ${({ theme }) => theme.colors.primary.text};
  }

  svg path {
    fill: none;
    stroke: ${({ theme }) => theme.colors.primary.text};
    stroke-width: 2;
    stroke-linecap: round;
  }

  @media (max-height: 500px) {
    width: 2.75rem;
    height: 2.75rem;
  }
`;

const Hearing = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 13rem;
  flex: none;

  > span:first-child {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.primary.main};
  }

  @media (max-height: 500px) {
    width: 10rem;
  }
`;

const Big = styled.span`
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  min-height: 2.25rem;

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2.125rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  span {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
    font-variant-numeric: tabular-nums;
  }

  @media (max-height: 500px) {
    min-height: 1.5rem;

    b {
      font-size: 1.5rem;
    }
  }
`;

const Help = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1 1 16rem;
  min-width: 0;

  > p {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  @media (max-height: 500px) {
    > p {
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
`;

const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;

  > span {
    font-size: 0.75rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  button {
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border-radius: ${({ theme }) => theme.borderRadius.md};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
    background-color: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.ui};
    font-weight: 800;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  button[aria-checked='true'] {
    background-color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.text};
    color: ${({ theme }) => theme.colors.background};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: none;
`;

const GRIDS: readonly DictationGrid[] = [0.5, 0.25];

export interface DictationPanelProps {
  phase: DictationPhase;
  live: LiveNote | null;
  grid: DictationGrid;
  onGrid(grid: DictationGrid): void;
  onStart(): void;
  onStop(): void;
  /** Quintas da armadura, para escrever a nota ouvida na grafia da partitura. */
  fifths: number;
  /** "♩ = 72 · 4/4": o andamento e o compasso do ditado. */
  tempo: string;
}

const KICKER: Record<DictationPhase['status'], string> = {
  idle: 'Ditar tocando',
  opening: 'Abrindo o microfone…',
  counting: 'Contagem',
  recording: 'Ouvindo…',
};

/** Ditado pelo microfone (ScoreEditor.dc, aba "Ditar tocando"): a grade, a contagem, a nota ouvida e o parar. */
export const DictationPanel: React.FC<DictationPanelProps> = ({ phase, live, grid, onGrid, onStart, onStop, fifths, tempo }) => {
  const busy = phase.status !== 'idle';
  const recording = phase.status === 'recording';
  return (
    <Panel aria-label="Ditado pelo microfone" $active={busy}>
      <Mic $live={recording} aria-hidden="true">
        <span />
        <span>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0 M12 17v4" />
          </svg>
        </span>
      </Mic>
      <Hearing>
        <span>{KICKER[phase.status]}</span>
        <Big aria-live="off">
          {phase.status === 'counting' ? (
            <b data-testid="contagem">{phase.count}</b>
          ) : recording && live ? (
            <>
              <b>{noteName(live.midi, fifths)}</b>
              <span>
                {Math.round(live.hz)} Hz · {formatCents(live.cents)}
              </span>
            </>
          ) : (
            <b aria-hidden="true">{recording ? '…' : '♪'}</b>
          )}
        </Big>
      </Hearing>
      <Help>
        <p>
          {busy ? (
            <>
              Toque no tempo do clique ({tempo}). Cada nota aparece na pauta quando acaba. <b>Esc</b> ou Parar para terminar e corrigir.
            </>
          ) : (
            <>
              Escolha compasso e andamento lá em cima ({tempo}). Depois de <b>1 compasso de contagem</b>, toque a melodia no tempo: cada nota vai para a
              pauta. Com fone de ouvido o clique não entra no microfone.
            </>
          )}
        </p>
        <Grid role="radiogroup" aria-label="Menor figura do ditado">
          <span aria-hidden="true">Menor figura</span>
          {GRIDS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={g === grid} disabled={busy} onClick={() => onGrid(g)}>
              {DURATION_NAMES[g]}
            </button>
          ))}
        </Grid>
      </Help>
      <Actions>
        {busy ? (
          <Button type="button" $variant="ghost" onClick={onStop}>
            <span aria-hidden="true">■</span>Parar
          </Button>
        ) : (
          <Button type="button" onClick={onStart}>
            Começar ditado
          </Button>
        )}
      </Actions>
    </Panel>
  );
};
