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
  it('Cordas 3D marcado de início; Arcade e Partitura livres, nenhum "em breve"', () => {
    renderModes();
    expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { level: 1, name: 'Escolha o modo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cordas 3D' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Arcade' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Partitura' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('radio', { name: /em breve/ })).not.toBeInTheDocument();
  });

  it('Cordas 3D pelo clique leva à música com o modo', async () => {
    renderModes();
    await userEvent.click(screen.getByRole('radio', { name: 'Cordas 3D' }));
    expect(screen.getByRole('radio', { name: 'Cordas 3D' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Continuar com Cordas 3D/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=cordas-3d');
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

  it('vindo da Biblioteca com a música escolhida, o modo segue junto com ela', async () => {
    renderModes(`${ROUTES.modes}?musica=ode-a-alegria`);
    await userEvent.click(screen.getByRole('radio', { name: 'Cordas 3D' }));
    await userEvent.click(screen.getByRole('button', { name: /Continuar com Cordas 3D/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=cordas-3d&musica=ode-a-alegria');
  });

  it('Enter no cartão confirma', async () => {
    renderModes();
    screen.getByRole('radio', { name: 'Cordas 3D' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar/musica?modo=cordas-3d');
  });

  it('volta com o modo que veio na URL; Prática não é cartão e vira Arcade', () => {
    renderModes('/tocar?modo=partitura');
    expect(screen.getByRole('radio', { name: 'Partitura' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Prática pela URL não é cartão: marca o padrão, Cordas 3D', () => {
    renderModes('/tocar?modo=pratica');
    expect(screen.getByRole('radio', { name: 'Cordas 3D' })).toHaveAttribute('aria-checked', 'true');
  });
});
