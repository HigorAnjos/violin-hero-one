import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { loadLocalProfile, PROFILE_STORAGE_KEY } from '../services/profile';
import { levelSettings } from '../game/engine/levels';
import { findFixedSong } from '../game/notation/songs';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { OnboardLevel } from './OnboardLevel';

const renderLevel = (theme = undefined as typeof palcoTheme | undefined) =>
  renderScreen(<OnboardLevel />, { path: ROUTES.level, route: ROUTES.level, theme });

describe('OnboardLevel', () => {
  afterEach(() => window.localStorage.clear());

  it('começa em "Estou começando" com os ajustes reais desse nível', () => {
    renderLevel();
    expect(screen.getByRole('heading', { level: 1, name: 'Quanto você já toca?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Estou começando/ })).toHaveAttribute('aria-checked', 'true');
    const summary = screen.getByRole('region', { name: 'Como vai ficar' });
    const s = levelSettings('beginner');
    expect(within(summary).getByText(findFixedSong(s.firstSongId)!.title)).toBeInTheDocument();
    expect(within(summary).getByText(`${Math.round(s.tempoFactor * 100)}% da música`)).toBeInTheDocument();
    expect(within(summary).getByText(`até ${s.toleranceCents} ¢ de folga`)).toBeInTheDocument();
    expect(within(summary).getByText(`até ${s.windows.good} ms de folga`)).toBeInTheDocument();
    expect(within(summary).getByText('Fácil')).toBeInTheDocument();
  });

  it('o cartão acompanha o nível escolhido', async () => {
    renderLevel();
    await userEvent.click(screen.getByRole('radio', { name: /Toco há anos/ }));
    const summary = screen.getByRole('region', { name: 'Como vai ficar' });
    const s = levelSettings('years');
    expect(within(summary).getByText(findFixedSong(s.firstSongId)!.title)).toBeInTheDocument();
    expect(within(summary).getByText('o da música')).toBeInTheDocument();
    expect(within(summary).getByText(`até ${s.toleranceCents} ¢ de folga`)).toBeInTheDocument();
    expect(within(summary).getByText('Difícil')).toBeInTheDocument();
  });

  it('primeiro acesso não tem "Voltar"; "Pular" vai para o microfone sem gravar nada', async () => {
    renderLevel();
    expect(screen.queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Pular' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.mic);
    expect(window.localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('escolher outro nível marca só ele', async () => {
    renderLevel(palcoTheme);
    await userEvent.click(screen.getByRole('radio', { name: /Nunca toquei/ }));
    expect(screen.getByRole('radio', { name: /Nunca toquei/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Estou começando/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('continuar grava nível, apelido e avatar no aparelho e segue para o microfone', async () => {
    renderLevel();
    await userEvent.click(screen.getByRole('radio', { name: /Toco há anos/ }));
    await userEvent.type(screen.getByLabelText('Como te chamamos? (opcional)'), '  Lia ');
    await userEvent.click(screen.getByRole('radio', { name: 'Pinguim' }));
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.mic);
    expect(loadLocalProfile()).toEqual({ level: 'years', nickname: 'Lia', animal: 'penguin' });
  });

  it('volta com o que já estava guardado no aparelho', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'some_songs', nickname: 'Bia', animal: 'cat' }));
    renderLevel();
    expect(screen.getByRole('radio', { name: /Já toco algumas músicas/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Como te chamamos? (opcional)')).toHaveValue('Bia');
    expect(screen.getByRole('radio', { name: 'Gato' })).toHaveAttribute('aria-checked', 'true');
  });
});
