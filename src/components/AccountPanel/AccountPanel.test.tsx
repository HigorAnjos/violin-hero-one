import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountError, deleteAccount, signOut, unsentBeforeSignOut } from '../../services/account';
import { saveLocalProfile } from '../../services/profile';
import type { SessionState } from '../../services/session';
import { DEVICE_USER_STORAGE_KEY } from '../../shell/accountSwitch';
import { renderScreen } from '../../shell/testing';
import { AccountPanel, deleteWarning, unsentWarning } from './AccountPanel';

vi.mock('../../services/account', async (original) => {
  const real = await original<typeof import('../../services/account')>();
  return { ...real, signOut: vi.fn(), unsentBeforeSignOut: vi.fn(), deleteAccount: vi.fn() };
});

afterEach(() => {
  vi.mocked(signOut).mockReset();
  vi.mocked(deleteAccount).mockReset();
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

  it('sem rede com envios pendentes (partidas e gravações): pergunta, Ficar é o padrão e não sai', async () => {
    vi.mocked(unsentBeforeSignOut).mockResolvedValue(2);
    open(account);
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sair da conta' });
    expect(dialog).toHaveTextContent('Há 2 envios pendentes; sair agora os descarta.');
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
    expect(unsentWarning(1)).toBe('Há 1 envio pendente; sair agora o descarta.');
  });

  it('apagar a conta: confirma antes, Cancelar é o padrão e não apaga', async () => {
    open(account);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Apagar minha conta' });
    expect(dialog).toHaveTextContent(deleteWarning(false));
    expect(dialog).toHaveTextContent('as contas dos alunos delas saem junto');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('"Apagar para sempre": o servidor apaga, o aparelho volta a convidado novo na tela inicial', async () => {
    localStorage.setItem(DEVICE_USER_STORAGE_KEY, 'conta-1');
    vi.mocked(deleteAccount).mockResolvedValue(fresh);
    const queryClient = open(account);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar para sempre' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(deleteAccount).toHaveBeenCalledWith(client, account);
    expect(queryClient.getQueryData(['session'])).toEqual(fresh);
    expect(localStorage.getItem(DEVICE_USER_STORAGE_KEY)).toBe('anon-2');
  });

  it('convidado apaga os dados; o erro do servidor aparece e nada muda', async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new AccountError('offline'));
    open({ status: 'signed-in', userId: 'anon-1', anonymous: true });
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(await screen.findByRole('alertdialog', { name: 'Apagar meus dados' })).toHaveTextContent(deleteWarning(true));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(new AccountError('offline').message);
    expect(screen.getByTestId('location')).toHaveTextContent('/configuracoes');
  });

  it('aluno da turma: sem botão de apagar, com quem falar', () => {
    open({ status: 'signed-in', userId: 'aluno-1', anonymous: false });
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
    expect(screen.getByText(/quem apaga é o professor/)).toBeInTheDocument();
  });

  it('a política de privacidade fica a um toque', () => {
    open(account);
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/privacidade');
  });
});
