import React from 'react';
import styled, { useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import type { StringName } from '../../assets/styles/themes';
import type { PlayerLevel } from '../../services/profile';

/** Cor de cada nível: a mesma corda que pinta a ilustração. */
const LEVEL_STRING: Record<PlayerLevel, StringName> = { never: 'G', beginner: 'A', some_songs: 'D', years: 'E' };

const Card = styled.button`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  min-width: 0;
  padding: 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2.5px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 4px 0 ${({ theme }) => theme.colors.surfaceBorder};
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  transition:
    border-color 0.12s,
    box-shadow 0.12s;

  &[aria-checked='true'] {
    border-color: ${({ theme }) => theme.colors.text};
    box-shadow: 0 5px 0 ${({ theme }) => theme.colors.text};
  }

  @media (hover: hover) {
    &:hover {
      background-color: ${({ theme }) => theme.colors.surfaceHover};
    }
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => theme.spacing.sm};
  }
`;

const Illustration = styled.span<{ $tint: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 5.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ $tint }) => $tint};

  @media (max-height: 500px) {
    display: none;
  }
`;

const Title = styled.b`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.1875rem;
  line-height: 1.15;

  @media (max-height: 500px) {
    font-size: 1rem;
  }
`;

const Description = styled.span`
  font-size: 0.875rem;
  line-height: 1.1875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.8125rem;
    line-height: 1.0625rem;
  }
`;

const STAFF = [20, 30, 40, 50, 60];
const NOTES: Partial<Record<PlayerLevel, [number, number][]>> = {
  beginner: [
    [30, 55],
    [60, 45],
    [90, 35],
  ],
  some_songs: [
    [18, 50],
    [38, 40],
    [58, 30],
    [78, 35],
    [98, 25],
  ],
};

const Drawing: React.FC<{ level: PlayerLevel }> = ({ level }) => {
  const theme = useTheme();
  const color = theme.game.strings[LEVEL_STRING[level]].main;
  if (level === 'never') {
    return (
      <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true">
        {(['G', 'D', 'A', 'E'] as const).map((s, i) => (
          <line key={s} x1={20 + i * 26.7} y1="10" x2={20 + i * 26.7} y2="60" stroke={theme.game.strings[s].main} strokeWidth="4" strokeLinecap="round" />
        ))}
      </svg>
    );
  }
  if (level === 'years') {
    return (
      <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true">
        <path d="M60 8l8 17 18 2-13 12 4 18-17-9-17 9 4-18-13-12 18-2z" fill={color} />
      </svg>
    );
  }
  const notes = NOTES[level] ?? [];
  const rx = notes.length > 3 ? 6 : 7;
  return (
    <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true">
      <g stroke={theme.colors.textMuted} strokeOpacity="0.6" strokeWidth="1.5">
        {STAFF.map((y) => (
          <line key={y} x1="0" y1={y} x2="120" y2={y} />
        ))}
      </g>
      {notes.map(([cx, cy]) => (
        <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={rx * 0.72} fill={color} />
      ))}
    </svg>
  );
};

type RadioProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> };

/** Cartão de nível (radio): ilustração, nome e o que muda. As props de radio vêm do useRadioGroup. */
export const LevelCard: React.FC<{ level: PlayerLevel; title: string; description: string; radio: RadioProps }> = ({
  level,
  title,
  description,
  radio,
}) => {
  const theme = useTheme();
  const id = React.useId();
  return (
    <Card type="button" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} {...radio}>
      <Illustration $tint={rgba(theme.game.strings[LEVEL_STRING[level]].main, 0.1)} aria-hidden="true">
        <Drawing level={level} />
      </Illustration>
      <Title id={`${id}-t`}>{title}</Title>
      <Description id={`${id}-d`}>{description}</Description>
    </Card>
  );
};
