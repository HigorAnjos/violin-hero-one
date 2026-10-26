import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { StringName } from '../../assets/styles/themes';

const Frame = styled.div`
  position: relative;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.background};

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
`;

const ORDER: StringName[] = ['D', 'A', 'G', 'E'];

/** Mesma música, mesma capa: um número estável a partir do id. */
export function coverSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Capa desenhada a partir do id (as músicas não têm arte): sol com faixas, colunas ou ondas, nas cores das cordas.
 * Decoração: fora do leitor de tela. `children` vai por cima (selos como "No aparelho").
 */
export const SongCover: React.FC<{ id: string; className?: string; children?: React.ReactNode }> = ({ id, className, children }) => {
  const { colors, game } = useTheme();
  const seed = coverSeed(id);
  const main = game.strings[ORDER[seed % 4]].main;
  const second = game.strings[ORDER[((seed % 4) + 1 + ((seed >>> 2) % 3)) % 4]].main;
  const pattern = (seed >>> 4) % 3;
  const paper = colors.background;
  const card = colors.surface;
  return (
    <Frame className={className}>
      <svg viewBox="0 0 270 104" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {pattern === 0 && (
          <>
            <circle cx="135" cy="104" r="70" fill={main} />
            <rect x="60" y="62" width="150" height="3" fill={paper} />
            <rect x="60" y="74" width="150" height="5" fill={paper} />
            <rect x="60" y="88" width="150" height="7" fill={paper} />
            <rect x="8" y="80" width="40" height="24" fill={card} />
            <rect x="222" y="66" width="40" height="38" fill={card} />
          </>
        )}
        {pattern === 1 &&
          [40, 80, 120, 160, 200].map((x, i) => {
            const height = 40 + ((seed >>> (i * 3)) % 7) * 9;
            return <rect key={x} x={x} y={104 - height} width="10" height={height} fill={i % 2 ? second : main} />;
          })}
        {pattern === 2 && (
          <>
            <path d="M0 70 Q45 40 90 70 T180 70 T270 70 V104 H0 Z" fill={main} />
            <path d="M0 86 Q45 62 90 86 T180 86 T270 86 V104 H0 Z" fill={second} />
            <circle cx={60 + (seed % 150)} cy="30" r="12" fill={main} />
          </>
        )}
      </svg>
      {children}
    </Frame>
  );
};
