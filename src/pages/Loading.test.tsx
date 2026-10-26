import { screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { FIXED_SONGS } from '../game/notation/songs';
import { fakeCatalogClient } from '../services/testing';
import { loadingUrl } from '../shell/choice';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Loading } from './Loading';

const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));

const Tuning = () => {
  const state = useLocation().state as PlayState;
  return <p data-testid="afinar">{`${state.song?.id}:${state.song?.level}:${state.mode}`}</p>;
};

const renderLoading = (path: string, theme?: typeof palcoTheme) =>
  renderScreen(
    <Routes>
      <Route path={ROUTES.loading} element={<Loading />} />
      <Route path={ROUTES.calibration} element={<Tuning />} />
    </Routes>,
    { path, theme }
  );

describe('Loading', () => {
  afterEach(() => {
    db.client = null;
  });

  it('sem internet, embutida no Fácil: segue para afinar com a partitura do app', async () => {
    const { id } = FIXED_SONGS[1];
    renderLoading(loadingUrl({ mode: 'Arcade', songId: id, level: 'easy' }));
    expect(await screen.findByTestId('afinar')).toHaveTextContent(`${id}:easy:Arcade`);
  });

  it('com o catálogo: baixa o nível pedido e leva o modo', async () => {
    db.client = fakeCatalogClient().client;
    renderLoading(loadingUrl({ mode: 'Partitura', songId: 'greensleeves', level: 'hard' }), palcoTheme);
    expect(await screen.findByTestId('afinar')).toHaveTextContent('greensleeves:hard:Partitura');
  });

  it('enquanto baixa: título, etapas e progresso', async () => {
    const fake = fakeCatalogClient();
    fake.rpc.mockImplementation(() => new Promise(() => undefined));
    db.client = fake.client;
    renderLoading(loadingUrl({ mode: 'Arcade', songId: 'greensleeves', level: 'medium' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Greensleeves' })).toBeInTheDocument();
    expect(screen.getByText('Preparando · Arcade · Médio')).toBeInTheDocument();
    expect(screen.getByText(/Partitura e notas do nível Médio/)).toHaveTextContent('(carregando)');
    expect(screen.getByRole('progressbar', { name: 'Carregando' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/tocar/musica?modo=arcade&musica=greensleeves');
  });

  it('sem internet e sem embutida: o erro, tentar de novo e escolher outra', async () => {
    renderLoading(loadingUrl({ mode: 'Arcade', songId: 'greensleeves', level: 'medium' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escolher outra' })).toHaveAttribute('href', '/tocar/musica?modo=arcade&musica=greensleeves');
    expect(screen.getByText('Sem internet')).toBeInTheDocument();
  });

  it('tentar de novo pede a partitura outra vez', async () => {
    const fake = fakeCatalogClient({ failRpc: true });
    db.client = fake.client;
    renderLoading(loadingUrl({ mode: 'Arcade', songId: 'greensleeves', level: 'medium' }));
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 8000 });
    const calls = fake.rpc.mock.calls.length;
    retry.click();
    await waitFor(() => expect(fake.rpc.mock.calls.length).toBeGreaterThan(calls));
  }, 15000);

  it('sem música na URL volta para a escolha de modo', () => {
    renderLoading(ROUTES.loading);
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar');
  });
});
