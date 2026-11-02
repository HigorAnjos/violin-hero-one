import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClassroom, type FakeClassroom } from '../services/classroomFake';
import { setDeviceData, type DeviceData } from '../services/deviceData';
import type { SessionState } from '../services/session';
import { setClassroomShell } from '../shell/classroom';
import { fakeClassroomShell } from '../shell/simulatedClassroom';
import { renderScreen } from '../shell/testing';
import { ClassLogin } from './ClassLogin';

vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));

const anon: SessionState = { status: 'signed-in', userId: 'anon-1', anonymous: true };

let fake: FakeClassroom;
let code: string;
let pin: string;
let data: DeviceData & { flush: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  fake = fakeClassroom({ userId: 'professora' });
  const turma = await fake.createClass('Iniciantes · sábado');
  code = turma.code;
  pin = (await fake.addStudent(turma.id, 'Ana Clara')).pin;
  fake.actAs('anon-1', { anonymous: true });
  setClassroomShell(fakeClassroomShell(fake));
  data = { flush: vi.fn(async () => {}), forget: vi.fn(async () => {}), use: vi.fn(), pending: vi.fn(async () => 0) };
  setDeviceData(data);
  localStorage.setItem('vh:usuario', 'anon-1');
});

afterEach(() => {
  setClassroomShell(null);
  setDeviceData(null);
  localStorage.clear();
});

function open(path = `/turma/entrar?codigo=${code}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['session'], anon);
  renderScreen(<ClassLogin />, { path, route: '/turma/entrar', queryClient });
  return queryClient;
}

async function typePin(digits: string) {
  for (const d of digits) await userEvent.click(screen.getByRole('button', { name: d }));
}

describe('ClassLogin (A0)', () => {
  it('com o código do link: nome e PIN pelo teclado, a fila do convidado sobe antes e o aluno vira o usuário do aparelho', async () => {
    const queryClient = open();
    expect(screen.getByText(`código ${code.slice(0, 4)}-${code.slice(4)} ✓`)).toBeInTheDocument();
    expect(screen.queryByLabelText('Código da turma')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'ana clara');
    await typePin(pin);
    expect(screen.getAllByText('●')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tarefas'));
    expect(data.flush).toHaveBeenCalledWith('anon-1');
    const session = queryClient.getQueryData<SessionState>(['session']);
    expect(session).toMatchObject({ status: 'signed-in', anonymous: false });
    expect(session && 'email' in session).toBe(false);
    expect(localStorage.getItem('vh:usuario')).toBe(session?.status === 'signed-in' ? session.userId : '');
  });

  it('sem código no endereço, pede o código também; aceita com hífen e minúscula', async () => {
    open('/turma/entrar');
    await userEvent.type(screen.getByLabelText('Código da turma'), `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'Ana Clara');
    await userEvent.type(screen.getByLabelText('PIN de 4 números'), pin);
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tarefas'));
  });

  it('PIN errado: mensagem neutra (não diz o que errou), o PIN sai e o foco volta para ele; o nome fica', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'Ana Clara');
    await typePin(pin === '9999' ? '0000' : '9999');
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código da turma, nome ou PIN não conferem.');
    expect(screen.getByLabelText('PIN de 4 números')).toHaveValue('');
    expect(screen.getByLabelText('PIN de 4 números')).toHaveFocus();
    expect(screen.getByLabelText('Seu nome, como o professor cadastrou')).toHaveValue('Ana Clara');
    expect(screen.getByTestId('location')).toHaveTextContent('/turma/entrar');
  });

  it('nome que não está na turma dá a mesma mensagem do PIN errado', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'Bruno');
    await typePin(pin);
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código da turma, nome ou PIN não conferem.');
  });

  it('depois de 5 erros, bloqueia com o tempo e o caminho do PIN novo, mesmo com o PIN certo', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'Ana Clara');
    const wrong = pin === '9999' ? '0000' : '9999';
    for (let i = 0; i < 5; i++) {
      await typePin(wrong);
      await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
      await screen.findByRole('alert');
    }
    await typePin(pin);
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Muitas tentativas. Espere 15 minutos ou peça um PIN novo ao professor.'));
  });

  it('turma encerrada avisa sem entrar', async () => {
    fake.actAs('professora');
    const [turma] = await fake.listMyClasses();
    await fake.closeClass(turma.id);
    open();
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'Ana Clara');
    await typePin(pin);
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa turma foi encerrada pelo professor.');
  });

  it('sem rede para subir a fila do convidado, NÃO troca de usuário', async () => {
    data.flush.mockRejectedValueOnce(new Error('offline'));
    const queryClient = open();
    await userEvent.type(screen.getByLabelText('Seu nome, como o professor cadastrou'), 'Ana Clara');
    await typePin(pin);
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão. Turmas precisam de internet.');
    expect(queryClient.getQueryData(['session'])).toEqual(anon);
    expect(localStorage.getItem('vh:usuario')).toBe('anon-1');
  });

  it('faltando campo, pede tudo antes de chamar o servidor', async () => {
    const login = vi.spyOn(fake, 'login');
    open();
    await typePin('12');
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha o código da turma, o seu nome e os 4 números do PIN.');
    expect(login).not.toHaveBeenCalled();
  });

  it('trocar o código abre as casas do código', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(screen.getByLabelText('Código da turma')).toHaveValue(code);
  });
});
