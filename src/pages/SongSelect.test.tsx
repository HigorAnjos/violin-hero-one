import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { levelSettings } from '../game/engine/levels';
import { CATALOG_ORDER } from '../game/notation/catalog';
import { findFixedSong, FIXED_SONGS } from '../game/notation/songs';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import { fakeCatalogClient } from '../services/testing';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { SongSelect, startingLevel } from './SongSelect';

const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));

const renderSongs = (path = `${ROUTES.songs}?modo=arcade`, theme?: typeof palcoTheme) =>
  renderScreen(<SongSelect />, { path, route: ROUTES.songs, theme });

const details = () => within(screen.getByRole('complementary', { name: 'Detalhes da música' }));

describe('SongSelect', () => {
  afterEach(() => {
    db.client = null;
    window.localStorage.clear();
  });

  it('nível de chart: o do jogador ou o mais perto que a música tem', () => {
    expect(startingLevel(['easy', 'medium', 'hard'], 'medium')).toBe('medium');
    expect(startingLevel(['easy'], 'hard')).toBe('easy');
    expect(startingLevel(['medium', 'hard'], 'easy')).toBe('medium');
  });

  it('sem internet: as embutidas, o aviso e só o Fácil', async () => {
    renderSongs();
    expect(await screen.findByText('Sem internet', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(FIXED_SONGS.length);
    const first = findFixedSong(levelSettings('beginner').firstSongId)!;
    expect(screen.getByRole('radio', { name: first.title })).toHaveAttribute('aria-checked', 'true');
    expect(details().getByRole('heading', { name: first.title })).toBeInTheDocument();
    expect(details().getByRole('button', { name: 'Fácil' })).toHaveAttribute('aria-pressed', 'true');
    expect(details().getByRole('button', { name: 'Médio' })).toBeDisabled();
    expect(details().getByRole('link', { name: /Tocar/ })).toHaveAttribute(
      'href',
      `/tocar/carregando?modo=arcade&musica=${first.id}&nivel=facil`
    );
    // a partitura embutida já está aqui: cordas e notas aparecem
    expect(await details().findByText(/\d+ notas/, undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('com o catálogo: as 10, nível do jogador, e Tocar leva música, nível e modo', async () => {
    db.client = fakeCatalogClient().client;
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'some_songs' }));
    renderSongs(`${ROUTES.songs}?modo=arcade`, palcoTheme);
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(CATALOG_ORDER.length));
    expect(screen.queryByText('Sem internet')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Greensleeves' }));
    expect(screen.getByTestId('location')).toHaveTextContent('musica=greensleeves');
    expect(details().getByRole('button', { name: 'Médio' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(details().getByRole('button', { name: 'Difícil' }));
    expect(details().getByRole('link', { name: /Tocar/ })).toHaveAttribute('href', '/tocar/carregando?modo=arcade&musica=greensleeves&nivel=dificil');
    // Prática ainda sem tela (floor ciclo2-telas-jogo)
    expect(details().getByRole('button', { name: 'Praticar trecho, em breve' })).toBeDisabled();
    expect(await details().findByText(/\d+ notas/, undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('setas andam pela lista', async () => {
    db.client = fakeCatalogClient().client;
    renderSongs(`${ROUTES.songs}?modo=arcade&musica=${CATALOG_ORDER[0]}`);
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(CATALOG_ORDER.length));
    screen.getAllByRole('radio')[0].focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('radio')[1]).toHaveFocus();
    expect(screen.getByTestId('location')).toHaveTextContent(`musica=${CATALOG_ORDER[1]}`);
  });

  it('busca sem acento; sem resultado avisa', async () => {
    db.client = fakeCatalogClient().client;
    renderSongs();
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(CATALOG_ORDER.length));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar música' }), 'GREEN');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar música' }), 'zzz');
    expect(screen.getByText(/Nenhuma música com/)).toBeInTheDocument();
  });

  it('Voltar devolve à escolha de modo com o modo atual', async () => {
    renderSongs(`${ROUTES.songs}?modo=arcade`);
    expect(screen.getByText('Passo 2 de 3 · Modo Arcade')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Voltar/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar?modo=arcade');
  });

  it('modo sem tela pedido pela URL vira Arcade', () => {
    renderSongs(`${ROUTES.songs}?modo=partitura`);
    expect(screen.getByText('Passo 2 de 3 · Modo Arcade')).toBeInTheDocument();
  });
});
