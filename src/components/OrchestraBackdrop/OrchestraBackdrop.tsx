import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { OrchestraSection } from '../../assets/styles/themes/types';

/** Músicos em três fileiras de arco ao redor do maestro: cada fatia é uma seção da orquestra. */
const ROWS = [
  { radius: 230, seats: 14 },
  { radius: 330, seats: 20 },
  { radius: 430, seats: 26 },
];
const SECTIONS: OrchestraSection[] = ['strings', 'woodwinds', 'brass', 'percussion'];
const CENTER = { x: 640, y: 360 };

function seatsOf(radius: number, seats: number) {
  return Array.from({ length: seats }, (_, i) => {
    const angle = Math.PI * (0.12 + (0.76 * i) / (seats - 1));
    const section = SECTIONS[Math.min(3, Math.floor((i / seats) * 4))];
    return { x: CENTER.x - Math.cos(angle) * radius * 1.35, y: CENTER.y - Math.sin(angle) * radius * 0.55, section };
  });
}

const Wrap = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 46%;
  opacity: 0.55;
  pointer-events: none;

  svg {
    width: 100%;
    height: 100%;
  }
`;

/** Orquestra ao fundo da contagem (decorativa): as cores vêm de theme.game.orchestra. */
export const OrchestraBackdrop: React.FC = () => {
  const theme = useTheme();
  return (
    <Wrap aria-hidden="true">
      <svg viewBox="0 0 1280 330" preserveAspectRatio="xMidYMax slice">
        <rect x="0" y="250" width="1280" height="80" fill={theme.game.track} />
        {ROWS.flatMap(({ radius, seats }) =>
          seatsOf(radius, seats).map(({ x, y, section }) => (
            <g key={`${radius}-${x}`} fill={theme.game.orchestra[section]}>
              <circle cx={x} cy={y} r="9" />
              <rect x={x - 11} y={y + 11} width="22" height="18" rx="8" />
            </g>
          ))
        )}
        <g fill={theme.colors.text}>
          <circle cx={CENTER.x} cy="262" r="11" />
          <rect x={CENTER.x - 14} y="276" width="28" height="30" rx="10" />
          <rect x={CENTER.x - 40} y="306" width="80" height="12" rx="3" />
        </g>
      </svg>
    </Wrap>
  );
};
