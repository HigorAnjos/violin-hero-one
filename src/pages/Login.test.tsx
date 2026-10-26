import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountError, loginWithGoogle, sendLoginLink } from '../services/account';
import { markOnboarded } from '../services/profile';
import type { SessionState } from '../services/session';
import { renderScreen } from '../shell/testing';
import { Login } from './Login';

// O .env.local da máquina não decide o teste: sem cliente, as chamadas recebem null
vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));
vi.mock('../services/account', async (original) => {
  const real = await original<typeof import('../services/account')>();
  return { ...real, loginWithGoogle: vi.fn(), sendLoginLink: vi.fn() };
});

afterEach(() => {
  vi.mocked(loginWithGoogle).mockReset();
  vi.mocked(sendLoginLink).mockReset();
  localStorage.clear();
});

const anon: SessionState = { status: 'signed-in', userId: 'anon-1', anonymous: true };

function open({ session = anon, google = false }: { session?: SessionState; google?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], session);
  queryClient.setQueryData(['auth-providers'], { google });
  return renderScreen(<Login />, { path: '/entrar', route: '/entrar', queryClient });
}

describe('Login (0)', () => {
  it('começar sem cadastro leva ao nível; já com onboarding, à tela inicial', () => {
    const { unmount } = open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Violin Hero');
    expect(screen.getByRole('link', { name: /Começar a tocar/ })).toHaveAttribute('href', '/primeira-vez/nivel');
    unmount();
    markOnboarded();
    open();
    expect(screen.getByRole('link', { name: /Começar a tocar/ })).toHaveAttribute('href', '/');
  });

  it('o botão do Google só aparece com o provedor ligado', () => {
    const { unmount } = open();
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).not.toBeInTheDocument();
    unmount();
    open({ google: true });
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });

  it('entrar com e-mail manda o link de uma conta que já existe, a partir do convidado do aparelho', async () => {
    vi.mocked(sendLoginLink).mockResolvedValue();
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'lia@t.test');
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
    expect(sendLoginLink).toHaveBeenCalledWith(null, anon, 'lia@t.test', '/');
    expect(await screen.findByRole('status')).toHaveTextContent('Mandamos um link');
  });

  it('convidado com progresso: avisa que ele não vai para a conta; Ficar não manda o link', async () => {
    vi.mocked(sendLoginLink).mockResolvedValue();
    localStorage.setItem('vh:recordes', JSON.stringify({ 'brilha:easy': 900 }));
    localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica', 'combo-25']));
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'lia@t.test');
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('(1 música e 2 selos) não vai para essa conta');
    await userEvent.click(screen.getByRole('button', { name: 'Ficar' }));
    expect(sendLoginLink).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar mesmo assim' }));
    expect(sendLoginLink).toHaveBeenCalledWith(null, anon, 'lia@t.test', '/');
  });

  it('fila do convidado sem subir: não troca e explica', async () => {
    vi.mocked(sendLoginLink).mockRejectedValue(new AccountError('pending'));
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'lia@t.test');
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('As partidas deste aparelho ainda não subiram');
  });

  it('Google entra pela conta Google', async () => {
    vi.mocked(loginWithGoogle).mockResolvedValue();
    open({ google: true });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(loginWithGoogle).toHaveBeenCalledWith(null, anon, '/');
  });

  it('já numa conta: vai para a tela inicial (ou ao nível, sem a primeira vez feita, sem laço com a raiz)', () => {
    const { unmount } = open({ session: { status: 'signed-in', userId: 'u1', anonymous: false } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/primeira-vez\/nivel$/);
    unmount();
    markOnboarded();
    open({ session: { status: 'signed-in', userId: 'u1', anonymous: false } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
