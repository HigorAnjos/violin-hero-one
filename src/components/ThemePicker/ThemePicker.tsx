import React from 'react';
import styled from 'styled-components';
import { SPECIAL_THEMES, THEMES, type StringName, type Theme } from '../../assets/styles/themes';
import { useThemeChoice } from '../../shell/ThemeChoice';
import { useRadioGroup } from '../RadioGroup/useRadioGroup';
import { Kicker } from '../Screen/Screen';

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  & + & {
    margin-top: ${({ theme }) => theme.spacing.md};
  }

  p {
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};

  @media (max-height: 500px) {
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Card = styled.button`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-height: 2.75rem;
  padding: 0.375rem;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  text-align: left;

  svg {
    display: block;
    width: 100%;
    height: 3.5rem;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
  }

  span {
    display: flex;
    justify-content: space-between;
    gap: 0.25rem;
    padding: 0 0.125rem;
    font-weight: 800;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: ${({ theme }) => theme.colors.text};
  }

  &[aria-checked='true'] {
    border-color: ${({ theme }) => theme.colors.primary.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary.border};
  }

  @media (hover: hover) {
    &:hover {
      border-color: ${({ theme }) => theme.colors.textMuted};
    }

    &[aria-checked='true']:hover {
      border-color: ${({ theme }) => theme.colors.primary.main};
    }
  }

  @media (max-height: 500px) {
    svg {
      height: 2.75rem;
    }
  }
`;

const LANES: StringName[] = ['G', 'D', 'A', 'E'];
// Duas notas por corda, em alturas diferentes, como um pedaço da pista
const NOTES: [number, number][] = [
  [0, 10],
  [1, 30],
  [2, 4],
  [3, 22],
  [1, 2],
];

/**
 * Pedaço da pista pintado com as cores do próprio tema: fundo da pista, as 4 cordas, notas e a linha de acerto. O 8-Bits
 * aparece com nota quadrada e o Neon com o brilho, como na pista de verdade.
 */
export const ThemeThumbnail: React.FC<{ theme: Theme }> = ({ theme }) => {
  const g = theme.game;
  const square = g.noteShape === 'square';
  const lane = (i: number) => 14 + i * 24;
  return (
    <svg viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true" data-thumbnail={theme.id} style={{ background: g.track }}>
      {LANES.map((name, i) => (
        <g key={name}>
          {g.glow > 0 && <line x1={lane(i)} y1="0" x2={lane(i)} y2="56" stroke={g.strings[name].main} strokeWidth="5" strokeOpacity={0.25 * g.glow} />}
          <line x1={lane(i)} y1="0" x2={lane(i)} y2="56" stroke={g.strings[name].main} strokeWidth="1.5" strokeOpacity={g.glow > 0 ? 0.9 : 0.45} />
        </g>
      ))}
      {NOTES.map(([i, y]) => {
        const color = g.strings[LANES[i]].main;
        return (
          <g key={`${i}-${y}`}>
            {g.glow > 0 && <rect x={lane(i) - 11} y={y - 3} width="22" height="16" rx="8" fill={color} fillOpacity={0.3 * g.glow} />}
            <rect x={lane(i) - 8} y={y} width="16" height="10" rx={square ? 0 : 5} fill={color} stroke={g.hitLine} strokeWidth="1.2" />
          </g>
        );
      })}
      <line x1="0" y1="46" x2="100" y2="46" stroke={g.hitLine} strokeWidth="1.5" />
    </svg>
  );
};

const Group: React.FC<{ themes: Theme[]; label: string; current: Theme; onPick: (id: string) => void }> = ({ themes, label, current, onPick }) => {
  const ids = React.useMemo(() => themes.map((t) => t.id), [themes]);
  const radio = useRadioGroup(ids, ids.includes(current.id) ? current.id : null, onPick);
  return (
    <Grid role="radiogroup" aria-label={label}>
      {themes.map((t) => (
        <Card key={t.id} type="button" title={t.tagline} {...radio(t.id)}>
          <ThemeThumbnail theme={t} />
          <span>
            {t.name}
            {t.id === current.id && <i aria-hidden="true">✓</i>}
          </span>
        </Card>
      ))}
    </Grid>
  );
};

/**
 * Seletor de tema das Configurações › Visual: o catálogo (só a cor muda) e, numa seção própria, os especiais, que mudam
 * também a forma (8-Bits) ou o brilho (Neon). Troca na hora, sem salvar.
 */
export const ThemePicker: React.FC = () => {
  const { theme, setThemeId } = useThemeChoice();
  return (
    <>
      <Section aria-labelledby="temas-catalogo">
        <Kicker id="temas-catalogo">Temas</Kicker>
        <Group themes={THEMES} label="Temas" current={theme} onPick={setThemeId} />
      </Section>
      <Section aria-labelledby="temas-especiais">
        <Kicker id="temas-especiais">Especiais</Kicker>
        <p>Mudam mais que a cor: o 8-Bits tem fonte pixel e notas quadradas; o Neon acende as notas e a pista.</p>
        <Group themes={SPECIAL_THEMES} label="Temas especiais" current={theme} onPick={setThemeId} />
      </Section>
    </>
  );
};
