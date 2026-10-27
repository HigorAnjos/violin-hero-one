import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { pixelTheme } from '../../assets/styles/themes/specials';
import { cadernoTheme } from '../../assets/styles/themes';
import { shiftDay } from '../../services/history';
import { todayInBrazil, type ProgressClient } from '../../services/progress';
import { renderScreen } from '../../shell/testing';
import { StreakPill, streakText } from './StreakPill';

function client(streak: { current_days: number; best_days: number; last_day: string } | null): ProgressClient {
  const session = { user: { id: 'u1', is_anonymous: true } };
  const result = { data: streak, error: null };
  return {
    auth: { getSession: async () => ({ data: { session }, error: null }), signInAnonymously: async () => ({ data: { session }, error: null }) },
    from: () => ({ select: () => ({ maybeSingle: async () => result }) }),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ProgressClient;
}

describe('StreakPill', () => {
  it('1 dia, 2 dias', () => {
    expect(streakText(1)).toBe('1 dia');
    expect(streakText(12)).toBe('12 dias');
  });

  for (const theme of [cadernoTheme, palcoTheme, pixelTheme]) {
    it(`${theme.name}: a sequência do servidor, que vale até ontem`, async () => {
      renderScreen(<StreakPill client={client({ current_days: 12, best_days: 20, last_day: shiftDay(todayInBrazil(), 1) })} />, { theme });
      await waitFor(() => expect(screen.getByTestId('sequencia')).toHaveTextContent('Sequência: 12 dias'));
    });
  }

  it('sequência que caiu (último dia antes de ontem), sem sequência ou sem servidor: não aparece', async () => {
    const { unmount } = renderScreen(<StreakPill client={client({ current_days: 5, best_days: 5, last_day: shiftDay(todayInBrazil(), 2) })} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('sequencia')).not.toBeInTheDocument();
    unmount();
    renderScreen(<StreakPill client={client(null)} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('sequencia')).not.toBeInTheDocument();
    renderScreen(<StreakPill client={null} />);
    expect(screen.queryByTestId('sequencia')).not.toBeInTheDocument();
  });
});
