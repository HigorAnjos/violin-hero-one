import React from 'react';
import styled, { useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import { formatCents, formatHz } from '../OpenStringCard/openStringCheck';
import { Kicker } from '../Screen/Screen';
import { DEFAULT_BANDS, type TuningBands } from '../Tuner/tuner';
import { TRACE_SECONDS, type TracePoint } from '../TuningCard/TuningCard';

const W = 352;
const H = 120;

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  min-width: 0;
  padding: 1.125rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};

  > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: ${({ theme }) => theme.spacing.sm};
  }

  output {
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 0;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  }

  @media (max-height: 500px) {
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;

    output {
      font-size: 0.875rem;
    }

    svg {
      height: 2.5rem;
    }
  }
`;

const Status = styled.span<{ $color: string }>`
  font-weight: 600;
  font-size: 0.8125rem;
  letter-spacing: 0.14em;
  color: ${({ $color }) => $color};
`;

/** Traço dos últimos 2 s na caixa W×H, com ±tolerância do nível na altura toda. */
export function liveTrace(trace: readonly TracePoint[], bands: TuningBands): { x: number; y: number }[] {
  const px = H / 2 / bands.good;
  return trace
    .filter((p) => p.age >= 0 && p.age <= TRACE_SECONDS)
    .map((p) => ({ x: (W - 10) * (1 - p.age / TRACE_SECONDS), y: H / 2 - Math.max(-bands.good, Math.min(bands.good, p.cents)) * px }));
}

/** "AFINADO", "ALTO ▴" ou "BAIXO ▾" pela faixa Perfeito do nível. */
export function liveWord(cents: number, bands: TuningBands): { word: string; zone: 'perfect' | 'great' | 'off' } {
  const off = Math.abs(cents);
  if (off <= bands.perfect) return { word: 'AFINADO', zone: 'perfect' };
  return { word: cents > 0 ? 'ALTO ▴' : 'BAIXO ▾', zone: off <= bands.great ? 'great' : 'off' };
}

export interface LiveTuningProps {
  trace: readonly TracePoint[];
  liveCents: number | null;
  /** Frequência da nota da vez no Lá da partida; null sem nota. */
  targetHz: number | null;
  bands?: TuningBands;
  /** "Mostrar linha de afinação": desligada, só o ponto de agora. */
  showLine?: boolean;
  className?: string;
}

/** Painel "Afinação ao vivo" da 5b: Hz, traço com as faixas do nível e para que lado corrigir. */
export const LiveTuning: React.FC<LiveTuningProps> = ({ trace, liveCents, targetHz, bands = DEFAULT_BANDS, showLine = true, className }) => {
  const theme = useTheme();
  const px = H / 2 / bands.good;
  const points = liveTrace(trace, bands);
  const last = points.at(-1);
  const status = liveCents === null ? null : liveWord(liveCents, bands);
  const color = !status ? theme.colors.textMuted : status.zone === 'perfect' ? theme.colors.text : status.zone === 'great' ? theme.colors.info.text : theme.colors.warning.text;
  const hz = liveCents !== null && targetHz !== null ? targetHz * 2 ** (liveCents / 1200) : null;

  return (
    <Panel aria-label="Afinação ao vivo" className={className}>
      <div>
        <Kicker>Afinação ao vivo</Kicker>
        <output>{hz === null ? '— Hz' : formatHz(hz)}</output>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Linha de afinação dos últimos 2 segundos, agora ${liveCents === null ? 'sem som' : `em ${formatCents(liveCents)}`}`} style={{ background: theme.game.track }}>
        <rect x="0" y={H / 2 - bands.great * px} width={W} height={bands.great * px * 2} fill={rgba(theme.colors.info.main, 0.1)} />
        <rect x="0" y={H / 2 - bands.perfect * px} width={W} height={bands.perfect * px * 2} fill={rgba(theme.colors.text, 0.1)} />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={theme.colors.text} strokeOpacity="0.5" />
        {showLine && points.length > 1 && (
          <polyline points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={theme.colors.info.main} strokeWidth="2.5" strokeLinejoin="round" />
        )}
        {last && <circle cx={last.x} cy={last.y} r="5" fill={theme.colors.text} />}
      </svg>
      <div>
        <output>{liveCents === null ? '— ¢' : formatCents(liveCents)}</output>
        <Status $color={color}>{status ? status.word : 'ESPERANDO O ARCO'}</Status>
      </div>
    </Panel>
  );
};
