import React from 'react';
import { useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import type { StringName } from '../../assets/styles/themes/types';
import type { Badge as BadgeInfo } from '../../game/engine';

/** Ícone e corda que dá a cor de cada tipo de selo (Badge.dc). */
const KINDS: Record<BadgeInfo['kind'], { string: StringName; icon: string }> = {
  virtuose: { string: 'E', icon: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z' },
  combo: { string: 'G', icon: 'M13 2 L5 13 H11 L10 22 L18 11 H12 Z' },
  afinacao: { string: 'A', icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0' },
};

export function badgeColor(theme: ReturnType<typeof useTheme>, kind: BadgeInfo['kind']): string {
  return theme.game.strings[KINDS[kind].string].main;
}

/** Selo hexagonal; `locked` é o próximo ainda não conquistado. */
export const Badge: React.FC<{ kind: BadgeInfo['kind']; label: string; size?: number; locked?: boolean; decorative?: boolean }> = ({
  kind,
  label,
  size = 44,
  locked = false,
  decorative = false,
}) => {
  const theme = useTheme();
  const color = locked ? theme.colors.surfaceBorder : badgeColor(theme, kind);
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Selo ${label}${locked ? ', bloqueado' : ''}` };
  return (
    <svg width={size} height={Math.round((size * 44) / 40)} viewBox="0 0 40 44" style={{ display: 'block', overflow: 'visible', opacity: locked ? 0.7 : 1 }} {...a11y}>
      <polygon points="20,2 38,12 38,32 20,42 2,32 2,12" fill={theme.colors.background} stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="20,7 33.5,14.5 33.5,29.5 20,37 6.5,29.5 6.5,14.5" fill={locked ? 'transparent' : rgba(color, 0.13)} />
      <g transform="translate(8 10)">
        <path d={KINDS[kind].icon} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
};
