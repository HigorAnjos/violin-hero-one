import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '../assets/styles/themes';
import { levelSettings } from '../game/engine/levels';
import { findFixedSong, FIXED_SONGS } from '../game/notation/songs';
import { A4_STORAGE_KEY } from '../services/playerAudio';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import { renderScreen } from '../shell/testing';
import { ThemeChoiceProvider } from '../shell/ThemeChoice';
import { Main as MainScreen } from './Main';

const Main = () => (
  <ThemeChoiceProvider>
    <MainScreen />
  </ThemeChoiceProvider>
);

const menu = () => within(screen.getByRole('navigation', { name: 'Menu principal' }));

describe('Main', () => {
  afterEach(() => window.localStorage.clear());

  it('marca, menu e a música sugerida para quem está começando', async () => {
    renderScreen(<Main />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Violin\s*Hero/);
    const title = findFixedSong(levelSettings('beginner').firstSongId)!.title;
    expect(menu().getByRole('link', { name: new RegExp(`^Tocar ${title}`) })).toBeInTheDocument();
    expect(menu().getByRole('link', { name: 'Afinar Lá 442' })).toBeInTheDocument();
    // Sem banco no teste: a estante são as embutidas
    expect(await menu().findByRole('link', { name: `Biblioteca ${FIXED_SONGS.length}` }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('a sugestão segue o nível guardado e o Lá segue a afinação salva', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'never' }));
    window.localStorage.setItem(A4_STORAGE_KEY, '440');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'palco');
    renderScreen(<Main />);
    expect(screen.getByRole('button', { name: 'Palco' })).toHaveAttribute('aria-pressed', 'true');
    const title = findFixedSong(levelSettings('never').firstSongId)!.title;
    expect(menu().getByRole('link', { name: new RegExp(`^Tocar ${title}`) })).toBeInTheDocument();
    expect(menu().getByRole('link', { name: 'Afinar Lá 440' })).toBeInTheDocument();
  });

  it('Tocar leva à escolha de modo; Biblioteca, à biblioteca', async () => {
    renderScreen(<Main />);
    await userEvent.click(menu().getByRole('link', { name: /^Tocar/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar');
  });

  it('tema no canto, sessão Offline sem banco', async () => {
    renderScreen(<Main />);
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument();
    expect(await screen.findByText('Offline', undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});
