import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { ModeSelect } from './ModeSelect';

const renderModes = (path: string = ROUTES.modes, theme = undefined as typeof palcoTheme | undefined) =>
  renderScreen(<ModeSelect />, { path, route: ROUTES.modes, theme });

describe('ModeSelect', () => {
  it('Arcade marcado; Partitura e Cordas 3D em breve até terem tela', () => {
    renderModes(ROUTES.modes, palcoTheme);
    expect(screen.getByRole('heading', { level: 1, name: 'Escolha o modo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Arcade' })).toHaveAttribute('aria-checked', 'true');
    for (const name of ['Partitura, em breve', 'Cordas 3D, em breve']) {
      const soon = screen.getByRole('radio', { name });
      expect(soon).toHaveAttribute('aria-disabled', 'true');
      expect(soon).toHaveAttribute('tabindex', '-1');
    }
  });

  it('clicar ou andar com as setas não escolhe modo sem tela', async () => {
    renderModes();
    await userEvent.click(screen.getByRole('radio', { name: 'Partitura, em breve' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Cordas 3D, em breve' }));
    screen.getByRole('radio', { name: 'Arcade' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Arcade' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Continuar com Arcade/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=arcade');
  });

  it('Enter no cartão confirma', async () => {
    renderModes();
    screen.getByRole('radio', { name: 'Arcade' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=arcade');
  });

  it('modo sem tela pedido pela URL vira Arcade', () => {
    renderModes('/tocar?modo=partitura');
    expect(screen.getByRole('radio', { name: 'Arcade' })).toHaveAttribute('aria-checked', 'true');
  });
});
