import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { LapSummary } from '../../game/engine';
import { CLEAN_LAP } from './lapRules';

/** Passadas mostradas: as últimas, mais a que está tocando. */
export const SHOWN_LAPS = 6;

const Chart = styled.div`
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  height: 5.75rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  > div {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 0.25rem;
  }

  > div > span {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  > div > i {
    width: 100%;
  }

  @media (max-height: 500px) {
    height: 3.25rem;
    gap: 0.375rem;

    > div > span {
      font-size: 0.625rem;
    }
  }
`;

const Goal = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed ${({ theme }) => theme.colors.warning.main};
  pointer-events: none;

  span {
    position: absolute;
    right: 0;
    bottom: 2px;
    font-size: 0.6875rem;
    color: ${({ theme }) => theme.colors.warning.text};
  }
`;

export interface LapChartProps {
  laps: readonly LapSummary[];
  /** Índice em `laps` da melhor; destacada. */
  best: number | null;
  /** Há uma passada tocando agora (a barra tracejada). */
  playing: boolean;
}

/** Precisão por passada com a meta de 90%; a melhor em destaque e a da vez tracejada. */
export const LapChart: React.FC<LapChartProps> = ({ laps, best, playing }) => {
  const theme = useTheme();
  const first = Math.max(0, laps.length - (playing ? SHOWN_LAPS - 1 : SHOWN_LAPS));
  const shown = laps.slice(first);
  const label = shown.length ? `Precisão por passada: ${shown.map((l) => `${Math.round(l.accuracy)}%`).join(', ')}` : 'Nenhuma passada fechada ainda';
  return (
    <Chart role="img" aria-label={label}>
      <Goal style={{ bottom: `${CLEAN_LAP * 0.9}%` }}>
        <span>META {CLEAN_LAP}%</span>
      </Goal>
      {shown.map((lap, i) => {
        const isBest = first + i === best;
        return (
          <div key={lap.lap}>
            <span style={isBest ? { color: theme.colors.text } : undefined}>{Math.round(lap.accuracy)}</span>
            <i style={{ height: `${Math.max(4, lap.accuracy * 0.9)}%`, background: isBest ? theme.colors.info.main : theme.colors.surfaceBorder }} />
          </div>
        );
      })}
      {playing && (
        <div>
          <span style={{ color: theme.colors.primary.main }}>···</span>
          <i style={{ height: '33%', border: `1.5px dashed ${theme.colors.primary.main}` }} />
        </div>
      )}
    </Chart>
  );
};
