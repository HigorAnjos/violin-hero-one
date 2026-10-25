import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { Song } from '../../game/notation/song';
import { STRING_LETTERS, STRING_SOLFEGE } from '../../game/notation/violin';
import { Kicker } from '../Screen/Screen';
import { noteName } from '../CountIn/countIn';
import { clock, keySignature, ledgerSteps, staffLayout, stepY } from '../../game/render/staff';

const PX_PER_BEAT = 56;
const HEIGHT = 116;
/** Onde fica o "agora" (linha ciano) e a largura da clave. */
const NOW_X = { wide: 240, compact: 150 };
const CLEF_W = { wide: 100, compact: 84 };
const STAFF_STEPS = [30, 32, 34, 36, 38];

const Section = styled.section<{ $paused: boolean }>`
  position: absolute;
  left: 2.5rem;
  right: 2.5rem;
  bottom: 1.25rem;
  height: 9.375rem;
  padding-top: 0.5rem;
  overflow: hidden;
  background-color: ${({ theme, $paused }) => ($paused ? theme.game.track : theme.colors.surface)};
  border: 2px solid ${({ theme, $paused }) => ($paused ? theme.colors.primary.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.surfaceBorder};

  svg {
    display: block;
  }

  @media (max-height: 500px) {
    left: 0;
    right: 0;
    bottom: 0;
    height: 7.25rem;
    padding-top: 0.25rem;
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: none;
    background-color: ${({ theme }) => theme.game.track};

    svg {
      margin-top: -0.75rem;
    }
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  height: 1.375rem;
  padding: 0 1.125rem;
  font-weight: 700;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  > i {
    flex: 1;
  }

  @media (max-height: 500px) {
    height: 0.75rem;

    > :not([data-bar]) {
      display: none;
    }

    > [data-bar] {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      width: auto;
      height: 3px;
      border-radius: 0;
    }
  }
`;

const Bar = styled.div`
  width: 18.75rem;
  height: 0.5rem;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: ${({ theme }) => theme.colors.info.main};
  }
`;

export interface SheetStripHandle {
  /** Posição atual, em tempos desde o começo da música; chamada a cada quadro, sem renderizar. */
  setBeat(beat: number): void;
}

export interface SheetStripProps {
  song: Song;
  /** Compasso atual, a partir de 0. */
  measure: number;
  elapsed: number;
  total: number;
  /** Notas da timeline já julgadas (ficam apagadas). */
  past: number;
  /** A próxima nota, para o rótulo de leitura. */
  next: { midi: number; string: number; finger: number } | null;
  paused?: boolean;
  compact?: boolean;
}

/** Faixa de partitura (SheetStrip.dc): a pauta corre e a linha ciano marca o agora. */
export const SheetStrip = React.forwardRef<SheetStripHandle, SheetStripProps>(function SheetStrip(
  { song, measure, elapsed, total, past, next, paused = false, compact = false },
  ref
) {
  const theme = useTheme();
  const layout = React.useMemo(() => staffLayout(song), [song]);
  const group = React.useRef<SVGGElement>(null);
  const nowX = compact ? NOW_X.compact : NOW_X.wide;
  const clefW = compact ? CLEF_W.compact : CLEF_W.wide;

  React.useImperativeHandle(
    ref,
    () => ({
      setBeat(beat) {
        group.current?.setAttribute('transform', `translate(${(nowX - beat * PX_PER_BEAT).toFixed(1)} 0)`);
      },
    }),
    [nowX]
  );

  const color = (s: number) => theme.game.strings[STRING_LETTERS[s]].main;
  const label = next
    ? `Partitura: agora ${noteName(next.midi)}, corda ${STRING_SOLFEGE[next.string]}${next.finger ? `, ${next.finger}º dedo` : ' solta'}`
    : 'Partitura';
  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  const line = theme.colors.textMuted;

  return (
    <Section aria-label={paused ? 'Partitura parada' : 'Partitura'} $paused={paused}>
      <Head>
        <Kicker>
          {paused ? 'Partitura · parada no compasso' : 'Partitura · compasso'} {measure + 1}
        </Kicker>
        <i />
        {paused ? (
          <span>Você volta tocando a partir da nota marcada</span>
        ) : (
          <>
            <span>{clock(elapsed)}</span>
            <Bar data-bar="" role="progressbar" aria-label="Andamento da música" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <i style={{ width: `${progress}%` }} />
            </Bar>
            <span>{clock(total)}</span>
          </>
        )}
      </Head>
      <svg width="100%" height={HEIGHT} role="img" aria-label={label}>
        <g stroke={line} strokeWidth="1.3" opacity="0.7">
          {STAFF_STEPS.map((s) => (
            <line key={s} x1="0" x2="100%" y1={stepY(s)} y2={stepY(s)} />
          ))}
        </g>
        <g ref={group} transform={`translate(${nowX} 0)`}>
          {layout.bars.slice(1).map((b) => (
            <line key={b} x1={b * PX_PER_BEAT - 14} x2={b * PX_PER_BEAT - 14} y1={stepY(38)} y2={stepY(30)} stroke={line} strokeWidth="1.3" />
          ))}
          {layout.notes.map((n) => {
            const x = n.at * PX_PER_BEAT;
            const y = stepY(n.step);
            const c = color(n.string);
            const stemX = n.stemUp ? x + 6 : x - 6;
            return (
              <g key={n.index} opacity={n.index < past ? 0.35 : 1}>
                {ledgerSteps(n.step).map((s) => (
                  <line key={s} x1={x - 11} x2={x + 11} y1={stepY(s)} y2={stepY(s)} stroke={line} strokeWidth="1.3" />
                ))}
                <line x1={stemX} x2={stemX} y1={y} y2={n.stemUp ? y - 32 : y + 32} stroke={theme.colors.text} strokeWidth="1.8" />
                <ellipse
                  cx={x}
                  cy={y}
                  rx="7.5"
                  ry="5.5"
                  transform={`rotate(-20 ${x} ${y})`}
                  fill={n.hollow ? 'none' : c}
                  stroke={n.hollow ? c : 'none'}
                  strokeWidth="2.4"
                />
                {!n.tie && (
                  <text x={x} y="108" textAnchor="middle" fill={c} fontWeight="800" fontSize="12" fontFamily={theme.fonts.ui}>
                    {n.finger}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <line x1={nowX} x2={nowX} y1="6" y2="110" stroke={theme.colors.info.main} strokeWidth="3" />
        <rect x="0" y="0" width={clefW} height={HEIGHT} fill={paused || compact ? theme.game.track : theme.colors.surface} />
        <g stroke={line} strokeWidth="1.3" opacity="0.7">
          {STAFF_STEPS.map((s) => (
            <line key={s} x1="0" x2={clefW} y1={stepY(s)} y2={stepY(s)} />
          ))}
        </g>
        <text x="12" y="82" fontSize="60" fill={theme.colors.text} fontFamily="'Noto Music', serif">
          𝄞
        </text>
        {keySignature(layout.fifths).map((k, i) => (
          <text key={i} x={56 + i * 12} y={stepY(k.step) + 6} fontSize="20" fill={theme.colors.text} fontFamily="'Noto Music', serif">
            {k.glyph}
          </text>
        ))}
      </svg>
    </Section>
  );
});
