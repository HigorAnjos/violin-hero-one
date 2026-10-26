import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { StringName } from '../../assets/styles/themes';

const Svg = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
`;

const STAFF_TOP = [120, 140, 160, 180, 200];
const STAFF_BOTTOM = [560, 580, 600, 620, 640];

const BODY =
  'M100 130 C140 128 172 138 172 182 C172 222 156 236 162 250 L150 256 C141 270 141 288 150 300 L162 306 C172 318 190 330 190 378 C190 432 150 456 100 456 C50 456 10 432 10 378 C10 330 28 318 38 306 L50 300 C59 288 59 270 50 256 L38 250 C44 236 28 222 28 182 C28 138 60 128 100 130 Z';
const SCROLL = 'M92 40 C80 34 82 10 100 8 C118 8 122 30 108 36 C98 40 92 28 102 24';
const F_HOLES = ['M66 284 c-12 12 12 22 0 34 c-10 10 10 20 0 30', 'M134 284 c12 12 -12 22 0 34 c10 10 -10 20 0 30'];
const STRINGS: [StringName, number, number][] = [
  ['G', 94, 95],
  ['D', 98.5, 99],
  ['A', 101.5, 101],
  ['E', 106, 105],
];
const NOTES: { x: number; y: number; string: StringName; flag?: boolean }[] = [
  { x: 660, y: 250, string: 'G' },
  { x: 1150, y: 500, string: 'A' },
  { x: 1120, y: 160, string: 'D', flag: true },
];

/** Cena da tela inicial (1): pauta, violino com as quatro cordas, arco e notas. Cobre o fundo, ancorada à direita. */
export const ViolinArt: React.FC = () => {
  const { colors, game, art } = useTheme();
  const ink = colors.text;
  return (
    <Svg viewBox="0 0 1280 720" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" data-testid="violin-art">
      <g stroke={colors.surfaceBorder} strokeWidth="2">
        {[...STAFF_TOP, ...STAFF_BOTTOM].map((y) => (
          <line key={y} x1="0" y1={y} x2="1280" y2={y} />
        ))}
      </g>
      <circle cx="890" cy="380" r="250" fill={art.halo} />
      <g transform="translate(790 120) rotate(14 100 240) scale(1.02)" stroke={ink} strokeLinejoin="round">
        <path d={BODY} fill={art.wood} strokeWidth="5" />
        <path d="M90 40 L87 250 L113 250 L110 40 Z" fill={art.ebony} strokeWidth="4" />
        <path d={SCROLL} fill="none" strokeWidth="5" strokeLinecap="round" />
        {F_HOLES.map((d) => (
          <path key={d} d={d} fill="none" strokeWidth="4" strokeLinecap="round" />
        ))}
        <path d="M88 356 L112 356 L108 380 L92 380 Z" fill={colors.background} strokeWidth="3.5" />
        <path d="M94 380 L106 380 L112 440 Q100 446 88 440 Z" fill={art.ebony} strokeWidth="3.5" />
        {STRINGS.map(([name, top, bottom]) => (
          <line key={name} x1={top} y1="40" x2={bottom} y2="380" stroke={game.strings[name].main} strokeWidth="3" />
        ))}
      </g>
      <path d="M700 590 Q900 420 1180 250" fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" />
      <rect x="684" y="580" width="40" height="22" rx="5" transform="rotate(-36 704 591)" fill={ink} />
      {NOTES.map(({ x, y, string, flag }) => (
        <g key={string}>
          <ellipse cx={x} cy={y} rx="13" ry="10" transform={`rotate(-20 ${x} ${y})`} fill={game.strings[string].main} />
          <line x1={x + 12} y1={y - 2} x2={x + 12} y2={y - 50} stroke={ink} strokeWidth="4" />
          {flag && <path d={`M${x + 12} ${y - 50} q16 8 10 26`} fill="none" stroke={ink} strokeWidth="4" />}
        </g>
      ))}
    </Svg>
  );
};
