import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountError, linkEmail, linkGoogle, sendLoginLink } from '../services/account';
import { saveLocalProfile } from '../services/profile';
import type { SessionState } from '../services/session';
import { accountUrl } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { GuestPrompt, promptTitle } from './GuestPrompt';

// O .env.local da máquina não decide o teste: sem cliente, as chamadas recebem null
vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));
vi.mock('../services/account', async (original) => {
  const real = await original<typeof import('../services/account')>();
  return { ...real, linkEmail: vi.fn(), linkGoogle: vi.fn(), sendLoginLink: vi.fn() };
});

afterEach(() => {
  vi.mocked(linkEmail).mockReset();
  vi.mocked(linkGoogle).mockReset();
  vi.mocked(sendLoginLink).mockReset();
  localStorage.clear();
});

const anon: SessionState = { status: 'signed-in', userId: 'anon-1', anonymous: true };

function open({ session = anon, google = false, path = accountUrl('ranking', '/ranking', '/perfil') }: { session?: SessionState; google?: boolean; path?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], session);
  queryClient.setQueryData(['auth-providers'], { google });
  return renderScreen(<GuestPrompt />, { path, route: '/conta', queryClient });
}

describe('GuestPrompt (0d)', () => {
  it('pergunta pelo motivo com o apelido, sem nome real, e mostra o que vai junto', async () => {
    saveLocalProfile({ level: 'beginner', nickname: 'Lia', animal: 'fox' });
    localStorage.setItem('vh:recordes', JSON.stringify({ 'brilha:easy': 900, 'brilha:medium': 800, 'ode:easy': 100 }));
    localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica']));
    open();
    expect(screen.getByRole('dialog', { name: 'Quer aparecer no ranking, Lia?' })).toBeInTheDocument();
    expect(screen.getByText('músicas tocadas').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('selo').nextSibling).toHaveTextContent('1');
    expect(promptTitle('aparelho', null)).toBe('Quer usar em outro aparelho?');
    expect(promptTitle('desafio', 'Leo')).toBe('Quer desafiar um amigo, Leo?');
  });

  it('sem Google no projeto, só e-mail; com Google, os dois', () => {
    const { unmount } = open();
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar e-mail' })).toBeInTheDocument();
    unmount();
    open({ google: true });
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument();
  });

  it('e-mail: liga ao mesmo usuário e o link volta para onde a conta foi pedida', async () => {
    vi.mocked(linkEmail).mockResolvedValue();
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Usar e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'lia@t.test');
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
    expect(linkEmail).toHaveBeenCalledWith(null, 'lia@t.test', '/ranking');
    expect(await screen.findByRole('status')).toHaveTextContent('Mandamos um link para lia@t.test');
  });

  it('Google: linkIdentity no mesmo usuário', async () => {
    vi.mocked(linkGoogle).mockResolvedValue();
    open({ google: true });
    await userEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }));
    expect(linkGoogle).toHaveBeenCalledWith(null, '/ranking');
  });

  it('quem ainda não jogou não vê o bloco com zeros', () => {
    open();
    expect(screen.queryByText('O que já é seu e vai junto')).not.toBeInTheDocument();
  });

  it('e-mail que já tem conta: oferece entrar nela, avisando que o progresso do convidado não vai junto', async () => {
    vi.mocked(linkEmail).mockRejectedValue(new AccountError('taken'));
    vi.mocked(sendLoginLink).mockResolvedValue();
    localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica']));
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Usar e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'lia@t.test');
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse e-mail já tem uma conta');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar nessa conta' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('(1 selo) não vai para essa conta');
    expect(sendLoginLink).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar mesmo assim' }));
    expect(sendLoginLink).toHaveBeenCalledWith(null, anon, 'lia@t.test', '/ranking');
  });

  it('"Agora não" volta para onde estava; Esc também', async () => {
    const { unmount } = open();
    await userEvent.click(screen.getByRole('link', { name: 'Agora não' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/perfil$/);
    unmount();
    open();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/perfil$/);
  });

  it('já tem conta: segue direto para onde ia', () => {
    open({ session: { status: 'signed-in', userId: 'u1', anonymous: false } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/ranking$/);
  });

  it('sem conexão: avisa e não oferece botão que não funcionaria', () => {
    open({ session: { status: 'offline' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.queryByRole('button', { name: 'Usar e-mail' })).not.toBeInTheDocument();
  });
});
