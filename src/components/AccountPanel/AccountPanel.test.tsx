import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signOut, unsentBeforeSignOut } from '../../services/account';
import { saveLocalProfile } from '../../services/profile';
import type { SessionState } from '../../services/session';
import { DEVICE_USER_STORAGE_KEY } from '../../shell/accountSwitch';
import { renderScreen } from '../../shell/testing';
import { AccountPanel, unsentWarning } from './AccountPanel';

vi.mock('../../services/account', async (original) => {
  const real = await original<typeof import('../../services/account')>();
  return { ...real, signOut: vi.fn(), unsentBeforeSignOut: vi.fn() };
});

afterEach(() => {
  vi.mocked(signOut).mockReset();
  vi.mocked(unsentBeforeSignOut).mockReset();
  localStorage.clear();
});

const account: SessionState = { status: 'signed-in', userId: 'conta-1', anonymous: false, email: 'lia@t.test' };
const fresh: SessionState = { status: 'signed-in', userId: 'anon-2', anonymous: true };
const client = { auth: {}, rpc: vi.fn() } as never;

function open(session: SessionState) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], session);
  renderScreen(<AccountPanel client={client} back="/configuracoes?secao=conta" />, { path: '/configuracoes', queryClient });
  return queryClient;
}

describe('AccountPanel', () => {
  it('convidado: criar conta (pedido de outro aparelho) ou entrar numa que existe', () => {
    open({ status: 'signed-in', userId: 'anon-1', anonymous: true });
    expect(screen.getByText('Jogando como convidado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/conta?motivo=aparelho&depois=%2Fconfiguracoes%3Fsecao%3Dconta&voltar=%2Fconfiguracoes%3Fsecao%3Dconta');
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
  });

  it('com conta: apelido e e-mail só para o próprio jogador', () => {
    saveLocalProfile({ level: 'beginner', nickname: 'Lia', animal: null });
    open(account);
    expect(screen.getByText('Lia · lia@t.test', { exact: false })).toBeInTheDocument();
  });

  it('sair com a fila enviada: volta a convidado novo, aparelho limpo, tela inicial', async () => {
    localStorage.setItem(DEVICE_USER_STORAGE_KEY, 'conta-1');
    localStorage.setItem('vh:recordes', JSON.stringify({ 'brilha:easy': 900 }));
    vi.mocked(unsentBeforeSignOut).mockResolvedValue(0);
    vi.mocked(signOut).mockResolvedValue(fresh);
    const queryClient = open(account);
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(signOut).toHaveBeenCalledWith(client, account);
    expect(queryClient.getQueryData(['session'])).toEqual(fresh);
    expect(localStorage.getItem('vh:recordes')).toBeNull();
    expect(localStorage.getItem(DEVICE_USER_STORAGE_KEY)).toBe('anon-2');
  });

  it('sem rede com partidas pendentes: pergunta, Ficar é o padrão e não sai', async () => {
    vi.mocked(unsentBeforeSignOut).mockResolvedValue(2);
    open(account);
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sair da conta' });
    expect(dialog).toHaveTextContent('Há 2 partidas ainda não enviadas; sair agora as descarta.');
    expect(screen.getByRole('button', { name: 'Ficar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('"Sair mesmo assim" descarta e sai', async () => {
    vi.mocked(unsentBeforeSignOut).mockResolvedValue(1);
    vi.mocked(signOut).mockResolvedValue(fresh);
    open(account);
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sair mesmo assim' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(unsentWarning(1)).toBe('Há 1 partida ainda não enviada; sair agora a descarta.');
  });
});
