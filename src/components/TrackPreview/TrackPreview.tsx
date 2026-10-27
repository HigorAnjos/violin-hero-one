import React from 'react';
import { useTheme } from 'styled-components';
import { barQuarters } from '../../game/notation/editor';
import { timeline, type Song } from '../../game/notation/song';
import { STRING_LETTERS, STRING_SOLFEGE } from '../../game/notation/violin';

const WIDTH = 268;
const HEIGHT = 92;
const HIT_Y = 84;
const LANE = WIDTH / 4;
/** Compassos que aparecem: o do cursor e o seguinte. */
const WINDOW_MEASURES = 2;

/** Notas da janela da prévia: as que tocam a partir do compasso do cursor, em semínimas desde o começo dela. */
export function previewWindow(song: Song, cursor: number) {
  const q = 4 / song.timeSignature.unit;
  const bar = barQuarters(song.timeSignature);
  const first = Math.floor(cursor / bar + 1e-6);
  const from = first * bar;
  const to = from + WINDOW_MEASURES * bar;
  const notes = timeline(song)
    .map((n) => ({ at: n.at * q - from, length: n.beats * q, string: n.string }))
    .filter((n) => n.at + n.length > 0 && n.at < to - from);
  return { first, span: to - from, notes };
}

/** Prévia na pista (ScoreEditor.dc): como os compassos do cursor descem pelas cordas no Arcade. */
export const TrackPreview: React.FC<{ song: Song; cursor: number }> = ({ song, cursor }) => {
  const theme = useTheme();
  const { first, span, notes } = previewWindow(song, cursor);
  const px = HIT_Y / span;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label={`Prévia na pista: compassos ${first + 1} e ${first + 2}`}>
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
      <g fontFamily={theme.fonts.ui} fontWeight={800} fontSize={12} fill={theme.colors.textMuted} textAnchor="middle">
        {STRING_SOLFEGE.map((label, i) => (
          <text key={label} x={i * LANE + LANE / 2} y={14}>
            {label.toUpperCase()}
          </text>
        ))}
      </g>
    </svg>
  );
};
