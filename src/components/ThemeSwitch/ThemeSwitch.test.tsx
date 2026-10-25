import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { THEME_STORAGE_KEY } from '../../assets/styles/themes';
import { ThemeChoiceProvider } from '../../shell/ThemeChoice';
import { ThemeSwitch } from './ThemeSwitch';

const renderSwitch = () =>
  render(
    <ThemeChoiceProvider>
      <ThemeSwitch />
    </ThemeChoiceProvider>
  );

describe('ThemeSwitch', () => {
  afterEach(() => window.localStorage.clear());

  it('começa no Caderno, marcado como escolhido', () => {
    renderSwitch();
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Caderno de música' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Palco' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('troca para o Palco na hora e guarda a escolha no aparelho', async () => {
    renderSwitch();
    await userEvent.click(screen.getByRole('button', { name: 'Palco' }));
    expect(screen.getByRole('button', { name: 'Palco' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Caderno de música' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.theme).toBe('palco');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('palco');
  });
});
