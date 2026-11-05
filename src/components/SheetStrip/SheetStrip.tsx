import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { Song } from '../../game/notation/song';
import { STRING_LETTERS, STRING_SOLFEGE } from '../../game/notation/violin';
import { Kicker } from '../Screen/Screen';
import { noteName } from '../CountIn/countInTiming';
import { clock, keySignature, ledgerSteps, staffLayout, stepY } from '../../game/render/staff';

const PX_PER_BEAT = 56;
const HEIGHT = 116;
/** Onde fica o "agora" (linha ciano) e a largura da clave. */
const NOW_X = 240;
const CLEF_W = 100;
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
`;

/**
 * Celular deitado: só o andamento, num fio no pé da tela. A pauta sai para a pista ocupar a altura toda: na pista
 * Arcade e nas Cordas 3D cada nota já traz a corda (letra e cor) e o dedo, e ler a pauta é o modo Partitura.
 */
const Thread = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.25rem;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    display: block;
    height: 100%;
    background-color: ${({ theme }) => theme.colors.info.main};
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
  /** Celular deitado: só o fio do andamento (Thread), sem a pauta. */
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

  React.useImperativeHandle(
    ref,
    () => ({
      setBeat(beat) {
        group.current?.setAttribute('transform', `translate(${(NOW_X - beat * PX_PER_BEAT).toFixed(1)} 0)`);
      },
    }),
    []
  );

  const color = (s: number) => theme.game.strings[STRING_LETTERS[s]].main;
  const label = next
    ? `Partitura: agora ${noteName(next.midi)}, corda ${STRING_SOLFEGE[next.string]}${next.finger ? `, ${next.finger}º dedo` : ' solta'}`
    : 'Partitura';
  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  const line = theme.colors.textMuted;

  if (compact) {
    return (
      <Thread role="progressbar" aria-label="Andamento da música" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <i style={{ width: `${progress}%` }} />
      </Thread>
    );
  }

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
            <Bar role="progressbar" aria-label="Andamento da música" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
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
        <g ref={group} transform={`translate(${NOW_X} 0)`}>
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
        <line x1={NOW_X} x2={NOW_X} y1="6" y2="110" stroke={theme.colors.info.main} strokeWidth="3" />
        <rect x="0" y="0" width={CLEF_W} height={HEIGHT} fill={paused ? theme.game.track : theme.colors.surface} />
        <g stroke={line} strokeWidth="1.3" opacity="0.7">
          {STAFF_STEPS.map((s) => (
            <line key={s} x1="0" x2={CLEF_W} y1={stepY(s)} y2={stepY(s)} />
          ))}
        </g>
        <text x="12" y="82" fontSize="60" fill={theme.colors.text} fontFamily={theme.fonts.music}>
          𝄞
        </text>
        {keySignature(layout.fifths).map((k, i) => (
          <text key={i} x={56 + i * 12} y={stepY(k.step) + 6} fontSize="20" fill={theme.colors.text} fontFamily={theme.fonts.music}>
            {k.glyph}
          </text>
        ))}
      </svg>
    </Section>
  );
});
