import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cadernoTheme } from '../../assets/styles/themes';
import type { AuthClient } from '../../services/session';
import { SessionStatus, sessionLabel } from './SessionStatus';

const renderStatus = (client: { auth: AuthClient } | null) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={cadernoTheme}>
        <SessionStatus client={client} />
      </ThemeProvider>
    </QueryClientProvider>
  );

const clientWithUser = (user: { id: string; is_anonymous: boolean } | null) => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: user ? { user } : null }, error: null }),
    signInAnonymously: vi.fn(),
  } as unknown as AuthClient,
});

describe('sessionLabel', () => {
  it('cobre os quatro estados da sessão', () => {
    expect(sessionLabel(undefined).text).toBe('Conectando…');
    expect(sessionLabel({ status: 'offline' }).text).toBe('Offline');
    expect(sessionLabel({ status: 'signed-in', userId: 'u', anonymous: true }).text).toBe('Jogando como convidado');
    expect(sessionLabel({ status: 'signed-in', userId: 'u', anonymous: false }).text).toBe('Conta ligada');
  });
});

describe('SessionStatus', () => {
  it('sem Supabase configurado mostra "Offline", sem erro', async () => {
    renderStatus(null);
    expect(screen.getByRole('status')).toHaveTextContent('Conectando…');
    expect(await screen.findByText('Offline')).toBeInTheDocument();
  });

  it('usuário anônimo joga como convidado', async () => {
    renderStatus(clientWithUser({ id: 'anon', is_anonymous: true }));
    expect(await screen.findByText('Jogando como convidado')).toBeInTheDocument();
  });

  it('usuário com e-mail ou Google aparece como conta ligada', async () => {
    renderStatus(clientWithUser({ id: 'u1', is_anonymous: false }));
    expect(await screen.findByText('Conta ligada')).toBeInTheDocument();
  });

  it('em StrictMode garante a sessão uma vez só (não cria dois anônimos)', async () => {
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { user: { id: 'anon', is_anonymous: true } }, error: null }),
    };
    render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient()}>
          <ThemeProvider theme={cadernoTheme}>
            <SessionStatus client={{ auth: auth as unknown as AuthClient }} />
            <SessionStatus client={{ auth: auth as unknown as AuthClient }} />
          </ThemeProvider>
        </QueryClientProvider>
      </StrictMode>
    );
    expect(await screen.findAllByText('Jogando como convidado')).toHaveLength(2);
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it('se a consulta falhar (sem rede), mostra "Offline"', async () => {
    const auth = { getSession: vi.fn().mockRejectedValue(new Error('network')), signInAnonymously: vi.fn() };
    renderStatus({ auth: auth as unknown as AuthClient });
    expect(await screen.findByText('Offline')).toBeInTheDocument();
  });
});
