import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { AppRouter } from './AppRouter';
import { markOnboarded } from './services/profile';
import { createFakeEar } from './shell/fakeEar';

// O perfil que o servidor teria para o jogador (os testes não têm Supabase): null é o jogador novo
const server = vi.hoisted(() => ({ level: null as string | null }));
vi.mock('./services/profileSync', async (importOriginal) => {
  const real = await importOriginal<typeof import('./services/profileSync')>();
  return {
    ...real,
    syncProfileNow: async () => {
      if (!server.level) return null;
      const row = real.readProfileRow({ level: server.level, animal: 'cat', a4_hz: 442 });
      real.applyProfile(row);
      return row;
    },
  };
});

/** Fluxos que montam várias telas do app inteiro: com a suíte toda em paralelo, 5 s não bastam. */
const APP_FLOW_TIMEOUT_MS = 15000;

const renderApp = (path = '/') => {
  window.history.replaceState(null, '', path);
  const ear = createFakeEar();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppRouter ear={ear} />
    </QueryClientProvider>
  );
  return ear;
};

describe('AppRouter', () => {
  afterEach(() => {
    window.localStorage.clear();
    server.level = null;
  });

  it('aparelho novo de quem já jogou: o perfil do servidor pula o onboarding', async () => {
    server.level = 'some_songs';
    renderApp('/');
    expect(await screen.findByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('primeira vez: a raiz leva ao nível', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Quanto você já toca?' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/primeira-vez/nivel');
  });

  it('depois da primeira vez, a raiz é a tela inicial', async () => {
    markOnboarded();
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /Violin/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('sair das cordas para o menu fecha o microfone', async () => {
    const ear = renderApp('/primeira-vez/cordas');
    await waitFor(() => expect(ear.open).toBe(true));
    await userEvent.click(screen.getByRole('link', { name: 'Pular por agora' }));
    expect(await screen.findByRole('heading', { name: /Violin/ })).toBeInTheDocument();
    expect(ear.open).toBe(false);
  }, APP_FLOW_TIMEOUT_MS);

  it('caminho desconhecido volta para a raiz', async () => {
    renderApp('/nao-existe');
    expect(await screen.findByRole('heading', { name: 'Quanto você já toca?' })).toBeInTheDocument();
  });

  it('o fluxo da primeira vez é navegável de ponta a ponta', async () => {
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    expect(screen.getByRole('heading', { name: 'Precisamos ouvir seu violino' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Permitir microfone/ }));
    expect(await screen.findByRole('heading', { name: 'Toque cada corda solta com o arco' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Abrir ajustes de microfone' }));
    expect(await screen.findByRole('alertdialog', { name: 'Não estou te ouvindo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Toque cada corda solta com o arco' })).toBeInTheDocument();
  }, APP_FLOW_TIMEOUT_MS);
});
