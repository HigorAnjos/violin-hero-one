import React from 'react';
import styled, { useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import type { OrchestraSection } from '../../assets/styles/themes/types';
import { CENTER_X, isLit, orchestraLabel, stageRows, type OrchestraLevel, type Seat } from './stage';

const ROWS = stageRows();
const DIM = 0.25;

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: auto;

  g[data-section] {
    transition: opacity 0.4s;
  }
`;

const Instrument: React.FC<{ section: OrchestraSection; seat: Seat; head: number; index: number; color: string; ink: string }> = ({
  section,
  seat: { x, y },
  head,
  index,
  color,
  ink,
}) => {
  switch (section) {
    case 'strings':
      return (
        <>
          <ellipse cx={x + 8} cy={y + 11} rx="6" ry="3.5" transform={`rotate(-30 ${x + 8} ${y + 11})`} fill={color} />
          <line x1={x - 4} y1={y + 2} x2={x + 14} y2={y + 20} stroke={ink} strokeWidth="1.5" />
        </>
      );
    case 'woodwinds':
      return <line x1={x - 1.8} y1={y + 2.7} x2={x + 10.8} y2={y + 16.2} stroke={color} strokeWidth="2.7" strokeLinecap="round" />;
    case 'brass':
      return <circle cx={x + 7.4} cy={y + 10.7} r="4.5" fill={color} stroke={ink} strokeWidth="1.2" />;
    case 'percussion':
      return index % 2 === 0 ? (
        <ellipse cx={x} cy={y + 18.8} rx="9" ry="3.8" fill={color} stroke={ink} strokeWidth="1.1" />
      ) : (
        <rect x={x + 3.7} y={y - 2.2} width="7.5" height="7.5" rx="2" fill={color} stroke={ink} strokeWidth="1.1" />
      );
    default:
      return head ? null : null;
  }
};

export interface OrchestraProps {
  /** Quantos naipes tocam: 0 (parada) a 4 (completa). */
  level: OrchestraLevel;
  /** Maestro no centro (pausa e "a orquestra parou"). */
  maestro?: boolean;
  /** Notas flutuando sobre os naipes que tocam. */
  notes?: boolean;
  /** Decorativa (atrás da pista): some da leitura de tela. */
  decorative?: boolean;
  className?: string;
}

/** Faixa da orquestra (Orchestra.dc): músicos em arco; cada naipe acende com a energia da partida. */
export const Orchestra: React.FC<OrchestraProps> = ({ level, maestro = false, notes = true, decorative = false, className }) => {
  const theme = useTheme();
  const ink = theme.colors.text;
  const ring = rgba(theme.colors.surfaceBorder, 0.45);
  return (
    <Svg
      viewBox="0 0 1280 330"
      className={className}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': orchestraLabel(level) })}
    >
      <g fill={ring}>
        <path d="M943.8 312.4 A305.5 130 0 0 0 336.2 312.4 L453 317.6 A188 80 0 0 1 827 317.6 Z" />
        <path d="M1158.8 302.8 A521.7 222 0 0 0 121.2 302.8 L228.7 307.6 A413.6 176 0 0 1 1051.3 307.6 Z" />
      </g>
      <g fill={theme.game.track}>
        <path d="M1051.3 307.6 A413.6 176 0 0 0 228.7 307.6 L336.2 312.4 A305.5 130 0 0 1 943.8 312.4 Z" />
        <path d="M1266.3 298 A629.8 268 0 0 0 13.7 298 L121.2 302.8 A521.7 222 0 0 1 1158.8 302.8 Z" />
      </g>
      {ROWS.map(({ section, head, seats, notes: noteSeats }) => {
        const lit = isLit(level, section);
        const color = theme.game.orchestra[section];
        const size = head * 2.57;
        return (
          <g key={section} data-section={section} data-lit={lit || undefined} opacity={lit ? 1 : DIM}>
            {seats.map((seat, i) => (
              <g key={i}>
                <circle cx={seat.x} cy={seat.y} r={head} fill={theme.colors.background} stroke={ink} strokeWidth={head * 0.28} />
                <rect x={seat.x - size / 2} y={seat.y + head * 1.14} width={size} height={size} rx={head} fill={theme.colors.surface} stroke={ink} strokeWidth={head * 0.28} />
                <Instrument section={section} seat={seat} head={head} index={i} color={color} ink={ink} />
              </g>
            ))}
            {notes && lit && (
              <g fill={color} stroke={color}>
                {noteSeats.map(({ x, y }, i) => (
                  <g key={i}>
                    <ellipse cx={x} cy={y} rx="5" ry="3.8" transform={`rotate(-20 ${x} ${y})`} stroke="none" />
                    <line x1={x + 4.5} y1={y} x2={x + 4.5} y2={y - 18} strokeWidth="1.8" />
                  </g>
                ))}
              </g>
            )}
          </g>
        );
      })}
      {maestro && (
        <g data-maestro="">
          <rect x={CENTER_X - 30} y="306" width="60" height="18" rx="4" fill={theme.colors.surfaceBorder} stroke={ink} strokeWidth="2" />
          <rect x={CENTER_X - 12} y="270" width="24" height="38" rx="9" fill={ink} />
          <circle cx={CENTER_X} cy="260" r="9" fill={theme.colors.background} stroke={ink} strokeWidth="2.4" />
          <path d={`M${CENTER_X - 10} 278 L${CENTER_X - 28} 252`} stroke={ink} strokeWidth="5" strokeLinecap="round" />
          <path d={`M${CENTER_X + 10} 278 L${CENTER_X + 30} 250`} stroke={ink} strokeWidth="5" strokeLinecap="round" />
          <line x1={CENTER_X + 30} y1="250" x2={CENTER_X + 54} y2="226" stroke={ink} strokeWidth="2" />
        </g>
      )}
    </Svg>
  );
};
