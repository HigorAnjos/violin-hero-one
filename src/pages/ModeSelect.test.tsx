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
  it('Arcade marcado; Cordas 3D em breve e fora da escolha', () => {
    renderModes();
    expect(screen.getByRole('heading', { level: 1, name: 'Escolha o modo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Arcade' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Partitura' })).toHaveAttribute('aria-checked', 'false');
    const soon = screen.getByRole('radio', { name: 'Cordas 3D, em breve' });
    expect(soon).toHaveAttribute('aria-disabled', 'true');
    expect(soon).toHaveAttribute('tabindex', '-1');
  });

  it('clicar em Cordas 3D não muda nada', async () => {
    renderModes();
    await userEvent.click(screen.getByRole('radio', { name: 'Cordas 3D, em breve' }));
    expect(screen.getByRole('radio', { name: 'Arcade' })).toHaveAttribute('aria-checked', 'true');
  });

  it('setas trocam e o botão acompanha; continuar leva à música com o modo', async () => {
    renderModes(ROUTES.modes, palcoTheme);
    screen.getByRole('radio', { name: 'Arcade' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Partitura' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Partitura' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Continuar com Partitura/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=partitura');
  });

  it('Enter no cartão confirma', async () => {
    renderModes();
    screen.getByRole('radio', { name: 'Arcade' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=arcade');
  });

  it('volta com o modo que veio na URL', () => {
    renderModes('/tocar?modo=partitura');
    expect(screen.getByRole('radio', { name: 'Partitura' })).toHaveAttribute('aria-checked', 'true');
  });
});
