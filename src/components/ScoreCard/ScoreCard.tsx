import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { OrchestraSection } from '../../assets/styles/themes/types';
import { LEVEL_LABEL, PERCUSSION_COMBO, SECTION_ORDER, type OrchestraLevel } from '../../game/synth';
import { Orchestra } from '../Orchestra/Orchestra';
import { SECTION_LABEL } from '../Orchestra/stage';
import { Kicker } from '../Screen/Screen';

const points = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatPoints = (n: number) => points.format(Math.round(n));
export const formatPercent = (n: number) => `${percent.format(n)}%`;

const Card = styled.section`
  position: absolute;
  left: 2.5rem;
  top: 2rem;
  width: 16.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-width: 1100px) {
    left: 1rem;
    width: 13rem;
  }

  @media (max-height: 500px) {
    left: max(0.875rem, env(safe-area-inset-left));
    top: 0.75rem;
    width: 10.625rem;
    gap: 0.5rem;
    padding: 0;
    background: none;
    border: 0;
    box-shadow: none;

    > ${Kicker} {
      display: none;
    }
  }
`;

const Score = styled.span`
  font-weight: 800;
  font-size: 2.25rem;
  line-height: 1;

  @media (max-height: 500px) {
    font-size: 1.625rem;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    gap: 0.5rem;
    font-size: 0.875rem;
  }
`;

const Mult = styled.span`
  padding: 0.375rem 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.warning.main};
  color: ${({ theme }) => theme.colors.background};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.125rem;
  line-height: 1;

  @media (max-height: 500px) {
    padding: 0.25rem 0.625rem;
    font-size: 0.9375rem;
  }
`;

const Band = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-top: 0.625rem;
  border-top: 2px solid ${({ theme }) => theme.colors.surfaceBorder};

  > small {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Sections = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.25rem;
`;

const Chip = styled.span<{ $color: string; $on: boolean }>`
  padding: ${({ $on }) => ($on ? '0.3125rem 0' : '0.25rem 0')};
  text-align: center;
  border-radius: 0.5rem;
  border: ${({ $on, $color }) => ($on ? 'none' : `1.5px dashed ${$color}`)};
  background-color: ${({ $on, $color }) => ($on ? $color : 'transparent')};
  color: ${({ $on, $color, theme }) => ($on ? theme.colors.background : $color)};
  font-weight: 800;
  font-size: 0.6875rem;
`;

const Strip = styled.div`
  display: none;
  overflow: hidden;
  border-radius: 0.625rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-height: 500px) {
    display: block;
  }
`;

/** Frase embaixo dos naipes: o que falta para o próximo entrar. */
export function orchestraHint(level: OrchestraLevel, combo: number): string {
  if (level === 4) return 'Orquestra completa tocando com você';
  if (level === 3) return `A percussão entra em ${Math.max(1, PERCUSSION_COMBO - combo)} acertos seguidos`;
  if (level === 0) return 'Acerte notas para a orquestra voltar';
  return 'Acerte notas para mais naipes entrarem';
}

export interface ScoreCardProps {
  score: number;
  multiplier: number;
  combo: number;
  accuracy: number;
  level: OrchestraLevel;
}

/** Placar da Gameplay: pontos, multiplicador, precisão e os naipes que tocam junto. */
export const ScoreCard: React.FC<ScoreCardProps> = ({ score, multiplier, combo, accuracy, level }) => {
  const sections = SECTION_ORDER.slice(0, level) as OrchestraSection[];
  const label = `${LEVEL_LABEL[level]} tocando; ${orchestraHint(level, combo).toLowerCase()}`;
  return (
    <Card aria-label="Placar">
      <Kicker>Pontos</Kicker>
      <Score>{formatPoints(score)}</Score>
      <Row>
        <Mult aria-label={`multiplicador ${multiplier} vezes`}>×{multiplier}</Mult>
        <span>
          {combo > 1 && <>{combo} · </>}
          {formatPercent(accuracy)} de acertos
        </span>
      </Row>
      <Band>
        <Kicker>Orquestra tocando com você</Kicker>
        <Sections role="img" aria-label={label}>
          {SECTION_ORDER.map((s) => (
            <SectionChip key={s} section={s} on={sections.includes(s)} />
          ))}
        </Sections>
        <small>{orchestraHint(level, combo)}</small>
      </Band>
      <Strip>
        <Orchestra level={level} />
      </Strip>
    </Card>
  );
};

const SectionChip: React.FC<{ section: OrchestraSection; on: boolean }> = ({ section, on }) => {
  const theme = useTheme();
  return (
    <Chip $color={theme.game.orchestra[section]} $on={on} data-on={on || undefined}>
      {SECTION_LABEL[section]}
    </Chip>
  );
};
