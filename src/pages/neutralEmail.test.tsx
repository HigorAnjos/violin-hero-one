import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../services/session';
import { accountUrl } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { GuestPrompt } from './GuestPrompt';
import { Login } from './Login';

/**
 * Do auth até a tela, sem trocar o serviço de conta: o GoTrue responde "já tem conta" (email_exists) ou "não tem
 * conta" (otp_disabled) de um jeito e "mandei" de outro; a tela tem de dizer exatamente a mesma coisa.
 */
const auth = vi.hoisted(() => ({ known: new Set<string>() }));
vi.mock('../services/supabase', () => {
  const answer = (error: { code: string; status: number } | null) => Promise.resolve({ data: {}, error });
  return {
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabase: {
      auth: {
        updateUser: ({ email }: { email: string }) => answer(auth.known.has(email) ? { code: 'email_exists', status: 422 } : null),
        signInWithOtp: ({ email }: { email: string }) => answer(auth.known.has(email) ? null : { code: 'otp_disabled', status: 422 }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

afterEach(() => localStorage.clear());

const anon: SessionState = { status: 'signed-in', userId: 'anon-1', anonymous: true };
auth.known.add('tem@t.test');

function openWith(ui: React.ReactElement, path: string, route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], anon);
  queryClient.setQueryData(['auth-providers'], { google: false });
  return renderScreen(ui, { path, route, queryClient });
}

async function answerFor(email: string, screenName: 'login' | 'conta'): Promise<string> {
  const { unmount } =
    screenName === 'login' ? openWith(<Login />, '/entrar', '/entrar') : openWith(<GuestPrompt />, accountUrl('ranking', '/ranking'), '/conta');
  await userEvent.click(screen.getByRole('button', { name: screenName === 'login' ? 'Entrar com e-mail' : 'Usar e-mail' }));
  await userEvent.type(screen.getByLabelText('E-mail'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
  const status = await screen.findByText(/Confira a caixa de entrada/);
  const text = `${status.textContent} | alertas: ${screen.queryAllByRole('alert').length}`;
  unmount();
  return text;
}

describe('e-mail com e sem conta: a mesma resposta', () => {
  it('entrar (Login): "tem conta" e "não tem conta" mostram o mesmo texto, sem alerta', async () => {
    const withAccount = await answerFor('tem@t.test', 'login');
    const without = await answerFor('nao-tem@t.test', 'login');
    expect(withAccount).toBe(without);
    expect(withAccount).toBe('Se houver conta com esse e-mail, mandamos o link. Confira a caixa de entrada. | alertas: 0');
  });

  it('criar conta (GuestPrompt): e-mail de outra conta e e-mail livre mostram o mesmo texto, sem alerta', async () => {
    const taken = await answerFor('tem@t.test', 'conta');
    const free = await answerFor('livre@t.test', 'conta');
    expect(taken).toBe(free);
    expect(taken).toBe('Se esse e-mail puder ser usado, mandamos o link para criar a conta. Confira a caixa de entrada. | alertas: 0');
  });
});
