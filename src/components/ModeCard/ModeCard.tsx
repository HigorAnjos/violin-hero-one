import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { RadioProps } from '../RadioGroup/useRadioGroup';

export type ModeArtKind = 'arcade' | 'sheet' | 'strings3d';

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition:
    border-color 0.12s,
    box-shadow 0.12s;

  &[aria-checked='true'] {
    border-color: ${({ theme }) => theme.colors.primary.main};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary.border};
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }

  @media (hover: hover) {
    &:not([aria-disabled='true']):hover {
      border-color: ${({ theme }) => theme.colors.primary.main};
    }
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => theme.spacing.sm};
  }
`;

const Art = styled.div`
  position: relative;
  height: 12.5rem;
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: 3px;

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  @media (max-height: 640px) {
    height: 7rem;
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Tag = styled.span<{ $muted: boolean }>`
  position: absolute;
  top: 0.625rem;
  right: 0.625rem;
  padding: 0.25rem 0.625rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 700;
  font-size: 0.6875rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background-color: ${({ theme, $muted }) => ($muted ? theme.colors.textMuted : theme.colors.primary.main)};
  color: ${({ theme, $muted }) => ($muted ? theme.colors.surface : theme.colors.primary.text)};
`;

const Name = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 1.5rem;
  line-height: 1.75rem;

  @media (max-height: 500px) {
    font-size: 1.125rem;
    line-height: 1.375rem;
  }
`;

const InlineTag = styled(Tag)`
  position: static;
  display: none;

  @media (max-height: 500px) {
    display: inline-block;
  }
`;

const Description = styled.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.8125rem;
    line-height: 1.125rem;
  }
`;

const Audience = styled.span`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  small {
    font-weight: 600;
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  b {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  @media (max-height: 500px) {
    gap: 0;
    padding-top: ${({ theme }) => theme.spacing.xxs};

    b {
      font-size: 0.8125rem;
    }
  }
`;

const ModeArt: React.FC<{ kind: ModeArtKind }> = ({ kind }) => {
  const { colors, game } = useTheme();
  const s = game.strings;
  const edge = { fill: colors.surfaceHover, stroke: colors.primary.main, strokeWidth: 1.5 };
  if (kind === 'arcade') {
    return (
      <svg viewBox="0 0 240 120" aria-hidden="true">
        <path d="M100 8 H140 L196 116 H44 Z" {...edge} />
        <rect x="84" y="74" width="20" height="7" rx="3" fill={s.G.main} />
        <rect x="108" y="40" width="14" height="5" rx="2" fill={s.D.main} />
        <rect x="128" y="58" width="16" height="6" rx="3" fill={s.A.main} />
        <rect x="140" y="24" width="10" height="4" rx="2" fill={s.E.main} />
      </svg>
    );
  }
  if (kind === 'sheet') {
    return (
      <svg viewBox="0 0 240 120" aria-hidden="true">
        <g stroke={colors.textMuted} strokeWidth="1" opacity="0.7">
          {[40, 52, 64, 76, 88].map((y) => (
            <line key={y} x1="0" x2="240" y1={y} y2={y} />
          ))}
        </g>
        <line x1="64" x2="64" y1="24" y2="104" stroke={s.A.main} strokeWidth="2" />
        <ellipse cx="64" cy="94" rx="7" ry="5" fill={s.D.main} />
        <ellipse cx="104" cy="70" rx="7" ry="5" fill={s.A.main} />
        <ellipse cx="140" cy="58" rx="7" ry="5" fill={s.A.main} />
        <ellipse cx="176" cy="40" rx="7" ry="5" fill={s.E.main} />
        <ellipse cx="212" cy="100" rx="7" ry="5" fill={s.G.main} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 120" aria-hidden="true">
      <path d="M100 10 H140 L206 108 H34 Z" {...edge} />
      {(['G', 'D', 'A', 'E'] as const).map((name, i) => (
        <line key={name} x1="16" x2="224" y1={44 + i * 18} y2={44 + i * 18} stroke={s[name].main} strokeWidth="2" />
      ))}
      <line x1="96" x2="96" y1="62" y2="108" stroke={s.D.main} strokeWidth="1.5" />
      <rect x="84" y="54" width="24" height="16" rx="3" fill={s.D.main} />
      <line x1="128" x2="128" y1="22" y2="32" stroke={s.A.main} strokeWidth="1" />
      <rect x="122" y="16" width="12" height="8" rx="2" fill={s.A.main} />
    </svg>
  );
};

interface Props {
  art: ModeArtKind;
  name: string;
  description: string;
  audience: string;
  /** Opção do radiogroup; sem ela, o cartão aparece desabilitado ("Em breve"). */
  radio?: RadioProps;
  onConfirm?: () => void;
}

/** Cartão da escolha de modo (2): desenho, nome, como se lê e para quem é. */
export const ModeCard: React.FC<Props> = ({ art, name, description, audience, radio, onConfirm }) => {
  const checked = radio?.['aria-checked'] ?? false;
  const tag = radio ? (checked ? 'Selecionado' : null) : 'Em breve';
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && radio) {
      event.preventDefault();
      onConfirm?.();
      return;
    }
    radio?.onKeyDown(event);
  };
  return (
    <Card
      {...(radio ?? { role: 'radio', 'aria-checked': false, 'aria-disabled': true, tabIndex: -1 })}
      onKeyDown={onKeyDown}
      aria-label={radio ? name : `${name}, em breve`}
    >
      <Art>
        <ModeArt kind={art} />
        {tag && <Tag $muted={!radio}>{tag}</Tag>}
      </Art>
      <Name>
        {name}
        {!radio && <InlineTag $muted>Em breve</InlineTag>}
      </Name>
      <Description>{description}</Description>
      <Audience>
        <small>Para quem</small>
        <b>{audience}</b>
      </Audience>
    </Card>
  );
};
