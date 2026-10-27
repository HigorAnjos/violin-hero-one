import React from 'react';
import styled from 'styled-components';
import { currentStreak, todayInBrazil, useMyStreak, type ProgressClient } from '../../services/progress';
import { supabase } from '../../services/supabase';

const Pill = styled.p`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  min-height: 2.75rem;
  padding: 0 ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  color: ${({ theme }) => theme.colors.text};
  font-weight: 800;
  font-size: 0.9375rem;
  white-space: nowrap;

  svg {
    flex: none;
    fill: ${({ theme }) => theme.colors.danger.main};
  }
`;

/** "12 dias" (Main.dc): a sequência que o servidor guarda, no dia de São Paulo. */
export function streakText(days: number): string {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/**
 * Sequência de dias da tela inicial, como o servidor diz (useMyStreak; o dia é decidido lá, no fuso de São Paulo).
 * Sem servidor ou sem sequência valendo hoje, não aparece: o aparelho não conta dias.
 */
export const StreakPill: React.FC<{ client?: ProgressClient | null }> = ({ client = supabase }) => {
  const streak = useMyStreak(client);
  if (!streak.isSuccess) return null;
  const days = currentStreak(streak.data, todayInBrazil());
  if (!days) return null;
  return (
    <Pill data-testid="sequencia">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2c3 5 7 7 7 13a7 7 0 0 1 -14 0c0 -3 2 -5 3 -7c0 3 1 4 3 4c0 -4 -1 -7 1 -10z" />
      </svg>
      <span className="sr-only">Sequência: </span>
      {streakText(days)}
    </Pill>
  );
};
