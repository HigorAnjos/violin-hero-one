import React from 'react';
import styled, { keyframes, useTheme } from 'styled-components';

const wave = keyframes`
  0% { opacity: 0; }
  30% { opacity: 1; }
  100% { opacity: 0; }
`;

const Frame = styled.div`
  position: relative;
  width: 100%;
  max-width: 33.75rem;
  aspect-ratio: 540 / 500;
  background-color: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  overflow: hidden;

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
`;

const Grid = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24%;
  opacity: 0.6;
  background-image:
    linear-gradient(${({ theme }) => theme.colors.surfaceBorder} 1px, transparent 1px),
    linear-gradient(90deg, ${({ theme }) => theme.colors.surfaceBorder} 1px, transparent 1px);
  background-size: 2.5rem 2.5rem;
`;

const Waves = styled.g`
  @media (prefers-reduced-motion: no-preference) {
    animation: ${wave} 1.6s ease-out infinite;
  }
`;

const VIOLIN_BODY =
  'M100 130 C140 128 172 138 172 182 C172 222 156 236 162 250 L150 256 C141 270 141 288 150 300 L162 306 C172 318 190 330 190 378 C190 432 150 456 100 456 C50 456 10 432 10 378 C10 330 28 318 38 306 L50 300 C59 288 59 270 50 256 L38 250 C44 236 28 222 28 182 C28 138 60 128 100 130 Z';
const VIOLIN_LINES = [
  'M92 40 L89 250 L111 250 L108 40 Z',
  'M92 40 C80 34 82 10 100 8 C118 8 122 30 108 36 C98 40 92 28 102 24',
  'M66 284 c-12 12 12 22 0 34 c-10 10 10 20 0 30',
  'M134 284 c12 12 -12 22 0 34 c10 10 -10 20 0 30',
];
const STRINGS = [
  ['G', 94, 95],
  ['D', 98.5, 99],
  ['A', 101.5, 101],
  ['E', 106, 105],
] as const;

/** Violino a 30–60 cm do computador, com as ondas do som chegando ao microfone (0b). */
export const MicSetupIllustration: React.FC = () => {
  const theme = useTheme();
  const body = theme.game.strings.D.main;
  return (
    <Frame>
      <Grid aria-hidden="true" />
      <svg viewBox="0 0 540 500" role="img" aria-label="Violino a cerca de meio metro do microfone do computador">
        <g transform="translate(70 70) rotate(-18 60 140) scale(.62)" strokeLinejoin="round">
          <path d={VIOLIN_BODY} fill={theme.colors.background} stroke={body} strokeWidth="5" />
          {VIOLIN_LINES.map((d) => (
            <path key={d} d={d} fill="none" stroke={body} strokeWidth="4" strokeLinecap="round" />
          ))}
          {STRINGS.map(([s, top, bottom]) => (
            <line key={s} x1={top} y1="40" x2={bottom} y2="376" stroke={theme.game.strings[s].main} strokeWidth="2.5" />
          ))}
        </g>
        <Waves fill="none" stroke={theme.game.strings.A.main} strokeWidth="2.5" strokeLinecap="round">
          <path d="M250 230 q14 20 0 40" />
          <path d="M272 214 q24 36 0 72" />
          <path d="M294 198 q34 52 0 104" />
        </Waves>
        <rect x="350" y="250" width="150" height="96" rx="4" fill={theme.colors.surface} stroke={theme.colors.textMuted} strokeWidth="2" />
        <rect x="362" y="262" width="126" height="72" fill={theme.colors.background} />
        <path d="M330 346 H520 L506 362 H344 Z" fill={theme.colors.surface} stroke={theme.colors.textMuted} strokeWidth="2" />
        <circle cx="425" cy="256" r="3.5" fill={theme.game.strings.A.main} />
        <g stroke={theme.colors.warning.main} strokeWidth="1.5" strokeDasharray="5 5" fill="none">
          <path d="M180 420 H425" />
          <path d="M180 410 v20 M425 410 v20" />
        </g>
        <text x="302" y="448" textAnchor="middle" fontFamily={theme.fonts.ui} fontSize="16" fill={theme.colors.warning.text}>
          30 a 60 cm
        </text>
      </svg>
    </Frame>
  );
};
