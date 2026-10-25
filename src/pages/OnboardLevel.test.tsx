import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { loadLocalProfile, PROFILE_STORAGE_KEY } from '../services/profile';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { OnboardLevel } from './OnboardLevel';

const renderLevel = (theme = undefined as typeof palcoTheme | undefined) =>
  renderScreen(<OnboardLevel />, { path: ROUTES.level, route: ROUTES.level, theme });

describe('OnboardLevel', () => {
  afterEach(() => window.localStorage.clear());

  it('começa em "Estou começando" e mostra o que isso ajusta', () => {
    renderLevel();
    expect(screen.getByRole('heading', { level: 1, name: 'Quanto você já toca?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Estou começando/ })).toHaveAttribute('aria-checked', 'true');
    const summary = screen.getByRole('region', { name: 'Como vai ficar' });
    expect(within(summary).getByText('Dificuldade 2')).toBeInTheDocument();
    expect(within(summary).getByText('Afinação ±30 ¢')).toBeInTheDocument();
  });

  it('primeiro acesso não tem "Voltar"; "Pular" vai para o microfone sem gravar nada', async () => {
    renderLevel();
    expect(screen.queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Pular' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.mic);
    expect(window.localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('escolher outro nível atualiza o resumo', async () => {
    renderLevel(palcoTheme);
    await userEvent.click(screen.getByRole('radio', { name: /Nunca toquei/ }));
    expect(screen.getByRole('radio', { name: /Nunca toquei/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Dificuldade 1')).toBeInTheDocument();
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
