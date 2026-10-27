import React from 'react';
import { useTheme } from 'styled-components';
import { barQuarters } from '../../game/notation/editor';
import { timeline, type Song } from '../../game/notation/song';
import { STRING_LETTERS, STRING_SOLFEGE } from '../../game/notation/violin';
import { readableSize } from '../ScoreStaff/staffGeometry';
import { useDrawingScale } from '../ScoreStaff/useDrawingScale';

const WIDTH = 268;
const HEIGHT = 92;
const HIT_Y = 84;
const LANE = WIDTH / 4;
/** Compassos que aparecem: o do cursor e o seguinte. */
const WINDOW_MEASURES = 2;

/**
 * Notas da janela da prévia, em semínimas desde o começo dela: o compasso de `anchor` (a nota selecionada, ou o
 * cursor) e o seguinte. Com o cursor no vazio depois da música, vale o compasso da última nota antes dele.
 */
export function previewWindow(song: Song, anchor: number) {
  const q = 4 / song.timeSignature.unit;
  const bar = barQuarters(song.timeSignature);
  const all = timeline(song).map((n) => ({ at: n.at * q, length: n.beats * q, string: n.string }));
  const inWindow = (first: number) => all.filter((n) => n.at + n.length > first * bar && n.at < (first + WINDOW_MEASURES) * bar);
  let first = Math.floor(anchor / bar + 1e-6);
  if (!inWindow(first).length) {
    const before = [...all].reverse().find((n) => n.at < anchor);
    if (before) first = Math.max(0, Math.floor(before.at / bar + 1e-6) - (WINDOW_MEASURES - 1));
  }
  const from = first * bar;
  return { first, span: WINDOW_MEASURES * bar, notes: inWindow(first).map((n) => ({ ...n, at: n.at - from })) };
}

/** Prévia na pista (ScoreEditor.dc): como os compassos da nota selecionada descem pelas cordas no Arcade. */
export const TrackPreview: React.FC<{ song: Song; anchor: number }> = ({ song, anchor }) => {
  const theme = useTheme();
  const svg = React.useRef<SVGSVGElement>(null);
  const label = readableSize(12, useDrawingScale(svg, WIDTH));
  const { first, span, notes } = previewWindow(song, anchor);
  const px = HIT_Y / span;
  return (
    <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label={`Prévia na pista: compassos ${first + 1} e ${first + 2}`}>
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={8} fill={theme.game.track} />
      {[1, 2, 3].map((i) => (
        <line key={i} x1={i * LANE} x2={i * LANE} y1={0} y2={HEIGHT} stroke={theme.game.trackLine} />
      ))}
      {notes.map((n, i) => {
        const bottom = HIT_Y - n.at * px;
        const top = Math.max(-8, HIT_Y - (n.at + n.length) * px);
        const shape = theme.game.noteShape === 'square' ? 0 : 4;
        return <rect key={i} data-testid="previa-nota" x={n.string * LANE + 12} y={top + 1} width={LANE - 24} height={Math.max(3, bottom - top - 2)} rx={shape} fill={theme.game.strings[STRING_LETTERS[n.string]].main} />;
      })}
      <line x1={0} x2={WIDTH} y1={HIT_Y} y2={HIT_Y} stroke={theme.game.hitLine} strokeWidth={2.5} />
      <g fontFamily={theme.fonts.ui} fontWeight={800} fontSize={label} fill={theme.colors.textMuted} textAnchor="middle">
        {STRING_SOLFEGE.map((label, i) => (
          <text key={label} x={i * LANE + LANE / 2} y={14}>
            {label.toUpperCase()}
          </text>
        ))}
      </g>
    </svg>
  );
};
