import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from './AppRouter';
import { CATALOG_ORDER } from './game/notation/catalog';
import { FIXED_SONGS } from './game/notation/songs';
import { markOnboarded } from './services/profile';
import { fakeChart, fakeCatalogClient } from './services/testing';
import { createFakeEar } from './shell/fakeEar';

const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('./services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));

const FLOW_TIMEOUT_MS = 20000;

function renderApp() {
  markOnboarded();
  window.history.replaceState(null, '', '/');
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppRouter ear={createFakeEar()} />
    </QueryClientProvider>
  );
}

/** Da tela inicial até afinar: Tocar → Arcade → a música → Tocar → carregando → afinar. */
async function playFromHome(title: string) {
  await userEvent.click(within(await screen.findByRole('navigation', { name: 'Menu principal' })).getByRole('link', { name: /^Tocar/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Continuar com Arcade/ }));
  await userEvent.click(await screen.findByRole('radio', { name: title }));
  await userEvent.click(within(screen.getByRole('complementary', { name: 'Detalhes da música' })).getByRole('link', { name: /Tocar/ }));
  return screen.findByRole('heading', { name: 'Afine antes de tocar' }, { timeout: 5000 });
}

describe('da tela inicial até afinar', () => {
  afterEach(() => {
    db.client = null;
    window.localStorage.clear();
  });

  it.each(CATALOG_ORDER)(
    'com o catálogo: %s chega ao afinar no nível sugerido',
    async (id) => {
      db.client = fakeCatalogClient().client;
      renderApp();
      const { title } = fakeChart(id, 'easy');
      await playFromHome(title);
      expect(screen.getByText(`Antes de tocar · ${title} · Fácil`)).toBeInTheDocument();
      expect(window.location.pathname).toBe('/afinar');
    },
    FLOW_TIMEOUT_MS
  );

  it.each(FIXED_SONGS.map((s) => s.title))(
    'sem internet: %s chega ao afinar pela partitura do app',
    async (title) => {
      renderApp();
      await playFromHome(title);
      expect(screen.getByText(`Antes de tocar · ${title} · Fácil`)).toBeInTheDocument();
    },
    FLOW_TIMEOUT_MS
  );
});
