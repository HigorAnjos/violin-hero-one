import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { BADGES } from '../game/engine';
import { FIXED_SONGS } from '../game/notation/songs';
import { BADGES_STORAGE_KEY } from '../services/badges';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import { RECORDS_STORAGE_KEY } from '../shell/records';
import { renderScreen } from '../shell/testing';
import { Profile } from './Profile';

afterEach(() => localStorage.clear());

describe('Profile', () => {
  it('aparelho novo: nome padrão, nada conquistado e convite para tocar', () => {
    renderScreen(<Profile />);
    expect(screen.getByRole('heading', { name: 'Violinista' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(/primeiro recorde/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Sequência' })).getByText('—')).toBeInTheDocument();
    const achievements = within(screen.getByRole('region', { name: 'Conquistas' }));
    expect(achievements.getAllByRole('img', { name: /bloqueado/ })).toHaveLength(BADGES.length);
  });

  it('mostra nome, bicho, nível, recordes e selos do aparelho', () => {
    const [song] = FIXED_SONGS;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'beginner', nickname: 'Lia', animal: 'fox' }));
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ [`${song.id}:easy`]: 1234567, 'outra:hard': 10 }));
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['primeira-musica', 'combo-25']));
    renderScreen(<Profile />);
    expect(screen.getByRole('heading', { name: 'Lia' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Raposa' })).toBeInTheDocument();
    expect(screen.getByText('Estou começando')).toBeInTheDocument();
    const best = within(screen.getByRole('region', { name: 'Melhor pontuação' }));
    expect(best.getByText('1.234.567')).toBeInTheDocument();
    expect(best.getByText(`${song.title} · Fácil`)).toBeInTheDocument();
    const records = within(screen.getByRole('region', { name: 'Seus recordes' })).getAllByRole('listitem');
    expect(records.map((li) => li.textContent)).toEqual([`${song.title}Fácil1.234.567`, 'outraDifícil10']);
    expect(screen.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('img', { name: 'Selo Primeira música' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Selo Sem erros, bloqueado' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Selos' })).getByText('Próximo: Sem erros')).toBeInTheDocument();
  });

  it('Menu, Configurações e Tocar', async () => {
    renderScreen(<Profile />);
    await userEvent.click(screen.getByRole('link', { name: 'Configurações' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/configuracoes');
    expect(screen.getByRole('link', { name: /Menu/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Tocar' })).toHaveAttribute('href', expect.stringMatching(/^\/tocar/));
  });
});
