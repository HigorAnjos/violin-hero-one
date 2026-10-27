import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from './AppRouter';
import { CATALOG_ORDER } from './game/notation/catalog';
import { FIXED_SONGS } from './game/notation/songs';
import { markOnboarded } from './services/profile';
import { fakeChart, fakeCatalogClient } from './services/testing';
import { READY_MODES } from './shell/choice';
import { createFakeEar } from './shell/fakeEar';
import { gameRoute } from './shell/play';

const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('./services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));

const FLOW_TIMEOUT_MS = 40000;

function renderApp() {
  markOnboarded();
  window.history.replaceState(null, '', '/');
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppRouter ear={createFakeEar()} />
    </QueryClientProvider>
  );
}

/** Da tela inicial até afinar: Tocar → Cordas 3D (o padrão) → a música → Tocar → carregando → afinar. */
async function playFromHome(title: string) {
  // Folga larga: com a suíte toda em paralelo, a primeira carga da Calibration (import() preguiçoso) passa de 5 s
  const wait = { timeout: 10000 };
  await userEvent.click(within(await screen.findByRole('navigation', { name: 'Menu principal' }, wait)).getByRole('link', { name: /^Tocar/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Continuar com Cordas 3D/ }, wait));
  await userEvent.click(await screen.findByRole('radio', { name: title }, wait));
  await userEvent.click(within(screen.getByRole('complementary', { name: 'Detalhes da música' })).getByRole('link', { name: /Tocar/ }));
  return screen.findByRole('heading', { name: 'Afine antes de tocar' }, wait);
}

describe('modos que a escolha oferece', () => {
  afterEach(() => window.localStorage.clear());

  // Rota fora do router cai no '*' e volta para o início: aqui é onde um modo novo sem tela quebraria
  it.each(READY_MODES)('%s tem a sua tela no router', async (mode) => {
    const route = gameRoute(mode);
    markOnboarded();
    window.history.replaceState({ usr: { song: FIXED_SONGS[0].song, mode }, key: 'k', idx: 0 }, '', route);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppRouter ear={createFakeEar()} />
      </QueryClientProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(window.location.pathname).toBe(route);
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument();
  });
});

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
