import React from 'react';
import styled, { useTheme } from 'styled-components';
import { barQuarters } from '../../game/notation/editor';
import type { Song } from '../../game/notation/song';
import { STRING_LETTERS } from '../../game/notation/violin';
import { keySignature, ledgerSteps, staffLayout, type StaffNote, type StaffRest } from '../../game/render/staff';
import {
  beamGroups,
  FINGER_Y,
  hitTest,
  measureBox,
  readableSize,
  staffHeight,
  staggeredFingers,
  stepY,
  STAFF_WIDTH,
  systemCount,
  systemTop,
  TOP_LINE_Y,
  xAt,
} from './staffGeometry';
import { useDrawingScale } from './useDrawingScale';

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  touch-action: manipulation;
  cursor: crosshair;
  user-select: none;
`;

const REST_GLYPH: Record<number, string> = { 1: '𝄽', 0.5: '𝄾', 0.25: '𝄿' };
const STEM = 33;

export interface ScoreStaffProps {
  song: Song;
  /** Cursor e nota selecionada, em semínimas desde o começo. */
  cursor: number;
  selectedAt: number | null;
  /** Toque na pauta: o tempo (semínimas) e o grau sob o dedo. */
  onTap(at: number, step: number): void;
}

/**
 * A partitura em edição (ScoreEditor.dc): clave de sol, armadura, sistemas de 4 compassos, figuras e pausas da
 * escrita (staffLayout do render), o dedo sugerido numa bolinha da cor da corda e o cursor onde a próxima nota entra.
 */
export const ScoreStaff: React.FC<ScoreStaffProps> = ({ song, cursor, selectedAt, onTap }) => {
  const theme = useTheme();
  const svg = React.useRef<SVGSVGElement>(null);
  const cursorLine = React.useRef<SVGLineElement>(null);
  const layout = React.useMemo(() => staffLayout(song), [song]);
  const bar = barQuarters(song.timeSignature);
  const q = 4 / song.timeSignature.unit;
  const measures = song.measures.length;
  const { fifths } = layout;
  const height = staffHeight(measures);
  const ink = theme.colors.text;
  const square = theme.game.noteShape === 'square';
  const scale = useDrawingScale(svg, STAFF_WIDTH);
  const label = readableSize(12, scale);

  React.useEffect(() => {
    const line = cursorLine.current;
    if (!line || typeof line.scrollIntoView !== 'function') return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    line.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [cursor]);

  const tap = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    const scale = STAFF_WIDTH / box.width;
    const hit = hitTest((event.clientX - box.left) * scale, (event.clientY - box.top) * scale, measures, bar, fifths);
    onTap(hit.at, hit.step);
  };

  const systems = Array.from({ length: systemCount(measures) }, (_, system) => {
    const top = systemTop(system) + TOP_LINE_Y;
    const lastMeasure = Math.min(measures, (system + 1) * 4) - 1;
    const end = measureBox(lastMeasure, fifths);
    const right = end.x + end.width;
    return (
      <g key={system}>
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={0} x2={right} y1={top + i * 12} y2={top + i * 12} stroke={theme.colors.textMuted} strokeOpacity={0.7} strokeWidth={1.2} />
        ))}
        <text x={2} y={top + 60} fontFamily={theme.fonts.music} fontSize={60} fill={ink}>
          𝄞
        </text>
        {keySignature(fifths).map((k, i) => (
          <text key={i} x={46 + i * 12} y={stepY(k.step, system) + 6} fontFamily={theme.fonts.music} fontSize={18} fill={ink}>
            {k.glyph}
          </text>
        ))}
        {system === 0 && (
          <g fontFamily={theme.fonts.display} fontWeight={800} fontSize={26} fill={ink}>
            <text x={50 + Math.abs(fifths) * 12} y={top + 23}>
              {song.timeSignature.beats}
            </text>
            <text x={50 + Math.abs(fifths) * 12} y={top + 47}>
              {song.timeSignature.unit}
            </text>
          </g>
        )}
      </g>
    );
  });

  const bars = song.measures.map((_, m) => {
    const box = measureBox(m, fifths);
    const top = systemTop(box.system) + TOP_LINE_Y;
    const last = m === measures - 1;
    return (
      <g key={m}>
        <text x={box.x + 4} y={top - 10} fontFamily={theme.fonts.ui} fontWeight={700} fontSize={label} fill={theme.colors.textMuted}>
          {m + 1}
        </text>
        <line x1={box.x + box.width} x2={box.x + box.width} y1={top} y2={top + 48} stroke={ink} strokeWidth={last ? 3 : 1.5} />
      </g>
    );
  });

  const place = (at: number) => xAt(at * q, bar, fifths);

  // Colcheias do mesmo tempo ligadas por barra: haste para o lado da maioria, barra reta na ponta da mais afastada
  const ts = song.timeSignature;
  const beatQuarters = ts.unit === 8 && ts.beats % 3 === 0 && ts.beats > 3 ? 1.5 : q;
  const groups = beamGroups(
    layout.notes.map((n) => ({ at: n.at * q, quarters: n.beats * q, flags: n.stem ? n.flags : 0, measure: n.measure })),
    bar,
    beatQuarters,
  );
  const beamed = new Map<number, { up: boolean; end: number }>();
  const beams = groups.map((group) => {
    const members = group.map((i) => layout.notes[i]);
    const up = members.reduce((sum, n) => sum + n.step, 0) / members.length < 34;
    const { system } = place(members[0].at);
    const ys = members.map((n) => stepY(n.step, system));
    const end = up ? Math.min(...ys) - STEM : Math.max(...ys) + STEM;
    group.forEach((i) => beamed.set(i, { up, end }));
    const stemXs = members.map((n) => place(n.at).x + (up ? 6.2 : -6.2));
    const dir = up ? 1 : -1;
    const secondary = members.flatMap((n, k) => {
      if (n.flags < 2) return [];
      const next = members[k + 1];
      if (next && next.flags >= 2) return [[stemXs[k], stemXs[k + 1]]];
      const previous = members[k - 1];
      if (previous && previous.flags >= 2) return [];
      // Semicolcheia entre colcheias: um toco virado para a vizinha
      return [next ? [stemXs[k], stemXs[k] + 8] : [stemXs[k] - 8, stemXs[k]]];
    });
    return (
      <g key={group[0]} aria-hidden="true">
        <line x1={stemXs[0]} x2={stemXs[stemXs.length - 1]} y1={end} y2={end} stroke={ink} strokeWidth={5} />
        {secondary.map(([a, b], k) => (
          <line key={k} x1={a} x2={b} y1={end + dir * 7} y2={end + dir * 7} stroke={ink} strokeWidth={5} />
        ))}
      </g>
    );
  });

  // O dedo numa bolinha legível no tamanho da tela; vizinhas apertadas se revezam em duas alturas
  const radius = Math.max(9, label * 0.75);
  const fingerLow = staggeredFingers(
    layout.notes.map((n) => place(n.at)),
    2 * radius + 3,
  );

  const noteMarks = layout.notes.map((n: StaffNote, i) => {
    const { x, system } = place(n.at);
    const y = stepY(n.step, system);
    const selected = selectedAt !== null && Math.abs(n.at * q - selectedAt) < 1e-6;
    const color = selected ? theme.colors.primary.main : ink;
    const beam = beamed.get(i);
    const stemUp = beam ? beam.up : n.stemUp;
    const stemX = stemUp ? x + 6.2 : x - 6.2;
    const stemEnd = beam ? beam.end : stemUp ? y - STEM : y + STEM;
    const letter = STRING_LETTERS[n.string];
    const string = theme.game.strings[letter];
    const fingerY = systemTop(system) + FINGER_Y + (fingerLow[i] ? 2 * radius + 2 : 0);
    return (
      <g key={n.index} data-testid="nota" data-selected={selected || undefined} aria-hidden="true">
        {ledgerSteps(n.step).map((s) => (
          <line key={s} x1={x - 11} x2={x + 11} y1={stepY(s, system)} y2={stepY(s, system)} stroke={ink} strokeWidth={1.2} />
        ))}
        {n.accidental && (
          <text x={x - 20} y={y + 6} fontFamily={theme.fonts.music} fontSize={18} fill={color}>
            {n.accidental}
          </text>
        )}
        {square ? (
          <rect x={x - 6} y={y - 5} width={12} height={10} fill={n.hollow ? theme.colors.surface : color} stroke={color} strokeWidth={2} />
        ) : (
          <ellipse cx={x} cy={y} rx={6.8} ry={4.9} transform={`rotate(-20 ${x} ${y})`} fill={n.hollow ? theme.colors.surface : color} stroke={color} strokeWidth={2} />
        )}
        {n.stem && <line x1={stemX} x2={stemX} y1={stemUp ? y - 1 : y + 1} y2={stemEnd} stroke={color} strokeWidth={1.6} />}
        {n.stem &&
          !beam &&
          Array.from({ length: n.flags }, (_, k) => {
            const dir = stemUp ? 1 : -1;
            const y0 = stemEnd + dir * k * 7;
            return <path key={k} d={`M${stemX} ${y0} c1 ${dir * 7} 10 ${dir * 8} 8 ${dir * 19}`} fill="none" stroke={color} strokeWidth={2} />;
          })}
        {n.dotted && <circle cx={x + 11} cy={n.step % 2 === 0 ? y - 3 : y} r={2.2} fill={color} />}
        <circle cx={x} cy={fingerY} r={radius} fill={string.main} />
        <text x={x} y={fingerY} textAnchor="middle" dominantBaseline="central" fontFamily={theme.fonts.ui} fontWeight={800} fontSize={label} fill={string.text}>
          {n.finger}
        </text>
      </g>
    );
  });

  const ties = layout.ties.map((t) => {
    const from = place(t.fromAt);
    const to = place(t.toAt);
    const dy = t.below ? 9 : -9;
    const arc = (x1: number, x2: number, system: number) => {
      const y = stepY(t.step, system) + dy;
      return `M${x1} ${y} Q${(x1 + x2) / 2} ${y + dy} ${x2} ${y}`;
    };
    const d =
      from.system === to.system
        ? arc(from.x + 7 + (t.dotted ? 5 : 0), to.x - 7, from.system)
        : `${arc(from.x + 7, STAFF_WIDTH, from.system)} ${arc(to.x - 30, to.x - 7, to.system)}`;
    return <path key={`${t.from}-${t.to}`} d={d} fill="none" stroke={ink} strokeWidth={1.6} aria-hidden="true" />;
  });

  const rests = layout.rests.map((r: StaffRest, i) => {
    const { x, system } = place(r.at);
    const top = systemTop(system) + TOP_LINE_Y;
    if (r.value >= 2) {
      // Semibreve pendurada na 4ª linha, mínima sentada na do meio; a semibreve do compasso vazio fica no meio dele
      const box = measureBox(Math.floor((r.at * q) / bar + 1e-6), fifths);
      const cx = r.value === 4 && r.beats * q >= bar - 1e-6 ? box.x + box.width / 2 : x;
      return <rect key={i} x={cx - 7} y={r.value === 4 ? top + 12 : top + 18} width={14} height={6} fill={ink} aria-hidden="true" />;
    }
    return (
      <text key={i} x={x} y={top + 24} textAnchor="middle" dominantBaseline="central" fontFamily={theme.fonts.music} fontSize={32} fill={ink} aria-hidden="true">
        {REST_GLYPH[r.value]}
        {r.dotted ? '.' : ''}
      </text>
    );
  });

  const cursorAt = xAt(cursor, bar, fifths);
  const cursorTop = systemTop(cursorAt.system) + TOP_LINE_Y;

  return (
    <Svg ref={svg} viewBox={`0 0 ${STAFF_WIDTH} ${height}`} role="img" aria-label={staffLabel(song)} onPointerUp={tap}>
      <rect x={0} y={0} width={STAFF_WIDTH} height={height} fill="transparent" />
      {systems}
      {bars}
      {rests}
      {ties}
      {beams}
      {noteMarks}
      <line
        ref={cursorLine}
        data-testid="cursor"
        x1={cursorAt.x - 10}
        x2={cursorAt.x - 10}
        y1={cursorTop - 12}
        y2={cursorTop + 60}
        stroke={theme.colors.primary.main}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
};

/** O que o leitor de tela ouve da pauta inteira. */
export function staffLabel(song: Song): string {
  const notes = song.measures.reduce((sum, m) => sum + m.notes.filter((n) => !n.tie).length, 0);
  const measures = song.measures.length;
  return `Partitura de ${measures} ${measures === 1 ? 'compasso' : 'compassos'}, ${notes} ${notes === 1 ? 'nota' : 'notas'}`;
}
