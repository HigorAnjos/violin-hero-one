import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, it, expect } from 'vitest';
import { AppRouter } from './AppRouter';
import { markOnboarded } from './services/profile';
import { createFakeEar } from './shell/fakeEar';

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
  afterEach(() => window.localStorage.clear());

  it('primeira vez: a raiz leva ao nível', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Quanto você já toca?' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/primeira-vez/nivel');
  });

  it('depois da primeira vez, a raiz vai para a tela de teste', async () => {
    markOnboarded();
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /Violin/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/teste');
  });

  it('sair das cordas para o menu fecha o microfone', async () => {
    const ear = renderApp('/primeira-vez/cordas');
    await waitFor(() => expect(ear.open).toBe(true));
    await userEvent.click(screen.getByRole('link', { name: 'Pular por agora' }));
    expect(await screen.findByRole('heading', { name: /Violin/ })).toBeInTheDocument();
    expect(ear.open).toBe(false);
  });

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
  });
});
