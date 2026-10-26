import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ThemeProvider } from 'styled-components';
import { afterEach, describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { guestLoss, lossWarning, useSwitchConfirm } from './useSwitchConfirm';

afterEach(() => localStorage.clear());

type Api = ReturnType<typeof useSwitchConfirm>;
const latest: { current: Api | null } = { current: null };
const api = () => latest.current!;

const Probe: React.FC<{ outRef: typeof latest }> = ({ outRef }) => {
  const value = useSwitchConfirm();
  React.useEffect(() => {
    outRef.current = value;
  });
  return <>{value.dialog}</>;
};

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={cadernoTheme}>
        <Probe outRef={latest} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('useSwitchConfirm', () => {
  it('conta músicas diferentes e selos do convidado', () => {
    const records = [
      { songId: 'a', level: 'easy' as const, score: 1 },
      { songId: 'a', level: 'hard' as const, score: 2 },
      { songId: 'b', level: 'easy' as const, score: 3 },
    ];
    expect(guestLoss({ records, badges: ['primeira-musica'] })).toEqual({ songs: 2, badges: 1 });
    expect(lossWarning({ songs: 2, badges: 1 })).toBe('O que este convidado fez (2 músicas e 1 selo) não vai para essa conta. Fica guardado só com o convidado.');
    expect(lossWarning({ songs: 1, badges: 0 })).toMatch(/\(1 música\)/);
  });

  it('convidado sem progresso: segue sem perguntar', async () => {
    mount();
    await expect(api().ask()).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('com progresso: pergunta, Ficar é o padrão e cancela; "Entrar mesmo assim" segue', async () => {
    localStorage.setItem('vh:recordes', JSON.stringify({ 'brilha:easy': 900 }));
    mount();
    let answer!: Promise<boolean>;
    act(() => {
      answer = api().ask();
    });
    expect(await screen.findByRole('alertdialog', { name: 'Entrar em outra conta' })).toHaveTextContent('(1 música)');
    expect(screen.getByRole('button', { name: 'Ficar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    act(() => {
      answer = api().ask();
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar mesmo assim' }));
    await expect(answer).resolves.toBe(true);
  });
});
