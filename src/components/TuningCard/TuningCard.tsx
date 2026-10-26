import React from 'react';
import styled, { useTheme } from 'styled-components';
import { midiToFrequency, STRING_LETTERS } from '../../game/notation/violin';
import { noteName } from '../CountIn/countIn';
import { JudgmentHint } from '../JudgmentHint/JudgmentHint';
import { placeOf, type Explanation, type TargetNote } from '../JudgmentHint/explain';
import { formatCents, formatHz } from '../OpenStringCard/openStringCheck';
import { Kicker } from '../Screen/Screen';
import { DEFAULT_BANDS, type TuningBands } from '../Tuner/tuner';

/** Janela do traço de afinação, em segundos. */
export const TRACE_SECONDS = 2;
const W = 264;
const H = 80;
/** ±tolerância do nível ocupa a altura toda; a faixa afinada é a do Perfeito. */
const pxPerCent = (bands: TuningBands) => H / 2 / bands.good;

export interface TracePoint {
  /** Há quantos segundos foi ouvido. */
  age: number;
  cents: number;
}

export function tracePoints(trace: readonly TracePoint[], bands: TuningBands = DEFAULT_BANDS): string {
  const px = pxPerCent(bands);
  return trace
    .filter((p) => p.age >= 0 && p.age <= TRACE_SECONDS)
    .map((p) => `${(W * (1 - p.age / TRACE_SECONDS)).toFixed(1)},${(H / 2 - Math.max(-bands.good, Math.min(bands.good, p.cents)) * px).toFixed(1)}`)
    .join(' ');
}

export function tuningStatus(cents: number, bands: TuningBands = DEFAULT_BANDS): { text: string; tuned: boolean } {
  if (Math.abs(cents) <= bands.perfect) return { text: `Afinado! ${formatCents(cents)}`, tuned: true };
  return { text: `${cents > 0 ? 'Alto' : 'Baixo'} · ${formatCents(cents)}`, tuned: false };
}

/** "Ré" (sem oitava), como no "Toque" do design. */
const solfege = (midi: number) => noteName(midi).replace(/-?\d+$/, '');

const Card = styled.section`
  position: absolute;
  right: 2.5rem;
  top: 2rem;
  width: 18.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.surfaceBorder};

  svg {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 0.625rem;
  }

  @media (max-width: 1100px) {
    right: 1rem;
    width: 15rem;
  }

  @media (max-height: 500px) {
    right: max(0.875rem, env(safe-area-inset-right));
    top: 4.125rem;
    width: 10.625rem;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
    border-width: 1px;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    box-shadow: none;

    svg {
      display: none;
    }
  }
`;

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;

  > div {
    display: flex;
    flex-direction: column;
  }

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2.625rem;
    line-height: 1;
  }

  > span {
    font-weight: 700;
    font-size: 0.875rem;
    text-align: right;
    white-space: pre-line;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    b {
      font-size: 1.5rem;
    }

    ${Kicker} {
      display: none;
    }

    > span {
      font-size: 0.75rem;
    }
  }
`;

const Status = styled.span<{ $color: string }>`
  font-weight: 800;
  font-size: 0.9375rem;
  color: ${({ $color }) => $color};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
  }
`;

export interface TuningCardProps {
  target: TargetNote | null;
  trace: readonly TracePoint[];
  /** Desvio da leitura mais recente para a nota da vez; null sem som. */
  liveCents: number | null;
  a4: number;
  explanation: Explanation | null;
  compact?: boolean;
  /** Faixas da tolerância do nível; padrão: as do motor. */
  bands?: TuningBands;
  /** "Mostrar linha de afinação" (Pausa, Configurações): desligada, só o ponto de agora, sem o traço. */
  showLine?: boolean;
}

/** Cartão "Afinação" da Gameplay: a nota da vez, o traço dos últimos 2 s e o motivo do último erro (5d). */
export const TuningCard: React.FC<TuningCardProps> = ({ target, trace, liveCents, a4, explanation, compact = false, bands = DEFAULT_BANDS, showLine = true }) => {
  const theme = useTheme();
  const color = target ? theme.game.strings[STRING_LETTERS[target.string]].main : theme.colors.textMuted;
  const status = liveCents === null ? null : tuningStatus(liveCents, bands);
  const px = pxPerCent(bands);
  const statusColor = status?.tuned ? theme.colors.info.text : theme.colors.warning.text;
  const traceColor = status && !status.tuned ? theme.colors.warning.main : theme.colors.info.main;
  const points = tracePoints(trace, bands);
  const last = points.split(' ').pop()?.split(',');

  return (
    <Card aria-label="Afinação">
      <Head>
        <div>
          <Kicker>Toque</Kicker>
          <b style={{ color }}>{target ? (compact ? noteName(target.midi) : solfege(target.midi)) : '—'}</b>
        </div>
        {target && (
          <span>
            {compact ? formatHz(midiToFrequency(target.midi, a4)) : placeOf(target.string, target.finger).replace(', ', '\n')}
          </span>
        )}
      </Head>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sua afinação nos últimos 2 segundos: ${status ? (status.tuned ? 'afinado' : status.text.toLowerCase()) : 'sem som'}`} style={{ background: theme.colors.background }}>
        <rect x="0" y={H / 2 - bands.perfect * px} width={W} height={bands.perfect * px * 2} fill={theme.colors.info.surface} />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={theme.colors.textMuted} strokeDasharray="4 4" />
        {points && showLine && <polyline points={points} fill="none" stroke={traceColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
        {last && last.length === 2 && <circle cx={last[0]} cy={last[1]} r="6" fill={theme.colors.surface} stroke={traceColor} strokeWidth="3" />}
      </svg>
      <Status $color={status ? statusColor : theme.colors.textMuted} aria-live="off">
        {status ? (compact ? `${formatCents(liveCents ?? 0)} · ${status.tuned ? 'AFINADO' : liveCents! > 0 ? 'ALTO' : 'BAIXO'}` : status.text) : 'Esperando o arco'}
      </Status>
      {explanation && <JudgmentHint explanation={explanation} compact={compact} />}
    </Card>
  );
};
