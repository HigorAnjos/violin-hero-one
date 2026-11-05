import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { fakeClassroom, type FakeClassroom } from '../services/classroomFake';
import type { SessionState } from '../services/session';
import { renderScreen } from '../shell/testing';
import { Teacher } from './Teacher';

vi.mock('../services/supabase', () => ({ supabase: null }));

const TEACHER: SessionState = { status: 'signed-in', userId: 'professor-1', anonymous: false, email: 'prof@exemplo.com' };

function client(session: SessionState | undefined = TEACHER) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (session) qc.setQueryData(['session'], session);
  return qc;
}

function mount(api?: FakeClassroom, { path = '/professor', session = TEACHER as SessionState | undefined, theme = cadernoTheme } = {}) {
  // As duas rotas do AppRouter (/professor e /professor/turma/:turma) numa só
  return renderScreen(<Teacher api={api} />, { path, route: '/professor/turma?/:turma?', queryClient: client(session), theme });
}

afterEach(() => vi.unstubAllGlobals());

const SIZES = [
  [1280, 720],
  [844, 390],
] as const;

describe.each([cadernoTheme, palcoTheme, pixelTheme])('P1 · painel do professor: $name', (theme) => {
  it.each(SIZES)('%i × %i: cria a turma, cadastra 3 alunos vendo o PIN uma vez e mostra o código', async (width, height) => {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
    const api = fakeClassroom();
    const user = userEvent.setup();
    mount(api, { theme });
    await screen.findByRole('heading', { name: 'Crie sua primeira turma' });
    await user.type(screen.getByLabelText('Nome da turma'), 'Iniciantes · sábado');
    await user.click(screen.getByRole('button', { name: 'Criar turma' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/professor\/turma\/turma-1$/));
    expect(await screen.findByRole('heading', { name: 'Iniciantes · sábado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Iniciantes · sábado/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Código para alunos entrarem')).toBeInTheDocument();
    for (const name of ['Ana', 'Bruno', 'Carla']) {
      await user.type(screen.getByRole('textbox', { name: 'Nome do aluno' }), name);
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
      await user.click(await screen.findByRole('button', { name: 'Anotei o PIN' }));
    }
    expect(await screen.findByText('Alunos · 3 de 10')).toBeInTheDocument();
  });
});

describe('P1 · painel do professor', () => {
  it('sem turma: "Modo professor" uma vez só, na marca; o título tem o próprio kicker', async () => {
    mount(fakeClassroom());
    await screen.findByRole('heading', { name: 'Crie sua primeira turma' });
    expect(screen.getAllByText('Modo professor')).toHaveLength(1);
    expect(screen.getByText('Primeiro passo')).toBeInTheDocument();
  });

  async function withClass() {
    const api = fakeClassroom();
    const klass = await api.createClass('Iniciantes · sábado');
    return { api, klass };
  }

  it('alunos: PIN aparece uma vez com aviso, redefinir mostra outro, desativar e reativar', async () => {
    const { api, klass } = await withClass();
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${klass.id}` });
    await screen.findByRole('heading', { name: 'Iniciantes · sábado' });
    for (const name of ['Ana', 'Bruno', 'Carla']) {
      await user.type(screen.getByRole('textbox', { name: 'Nome do aluno' }), name);
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
      const dialog = await screen.findByRole('alertdialog', { name: `PIN de ${name}` });
      expect(dialog).toHaveTextContent('não aparece de novo');
      await user.click(within(dialog).getByRole('button', { name: 'Anotei o PIN' }));
    }
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByText('1000')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redefinir PIN de Bruno' }));
    expect(await screen.findByRole('alertdialog', { name: 'PIN de Bruno' })).toHaveTextContent('1003');
    await user.click(screen.getByRole('button', { name: 'Anotei o PIN' }));
    await user.click(screen.getByRole('button', { name: 'Desativar Carla' }));
    expect(await screen.findByRole('button', { name: 'Reativar Carla' })).toBeInTheDocument();
    expect(screen.getByText('fora da turma')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reativar Carla' }));
    expect(await screen.findByRole('button', { name: 'Desativar Carla' })).toBeInTheDocument();
  });

  it('apagar o aluno: só fora da turma, confirmado antes (Manter é o padrão), e ele some da lista', async () => {
    const { api, klass } = await withClass();
    const ana = (await api.addStudent(klass.id, 'Ana')).student;
    await api.addStudent(klass.id, 'Bruno');
    await api.setStudentActive(ana.id, false);
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${klass.id}` });
    await screen.findByRole('button', { name: 'Reativar Ana' });
    expect(screen.queryByRole('button', { name: 'Apagar Bruno' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar Ana' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Apagar Ana' });
    expect(dialog).toHaveTextContent('a conta do aluno com todo o progresso');
    expect(within(dialog).getByRole('button', { name: 'Manter' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar Ana' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar Ana' }));
    await user.click(await screen.findByRole('button', { name: 'Apagar para sempre' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reativar Ana' })).not.toBeInTheDocument());
    expect((await api.getClass(klass.id)).students.map((s) => s.name)).toEqual(['Bruno']);
  });

  it('turma encerrada: todo aluno pode ser apagado', async () => {
    const { api, klass } = await withClass();
    await api.addStudent(klass.id, 'Ana');
    await api.closeClass(klass.id);
    mount(api, { path: `/professor/turma/${klass.id}` });
    expect(await screen.findByRole('button', { name: 'Apagar Ana' })).toBeInTheDocument();
  });

  it('o código da turma aparece em dois blocos e copia', async () => {
    const { api, klass } = await withClass();
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${klass.id}` });
    const code = `${klass.code.slice(0, 4)}-${klass.code.slice(4)}`;
    expect(await screen.findByText(code)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    // O user-event põe um clipboard de mentira no navigator
    expect(await navigator.clipboard.readText()).toBe(code);
    expect(screen.getByText('Copiado.')).toBeInTheDocument();
  });

  it('limite do plano: a mensagem e o link para os planos', async () => {
    const api = fakeClassroom();
    await api.createClass('Uma');
    const second = await api.createClass('Duas');
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${second.id}` });
    expect(await screen.findByText('2 de 2 turmas abertas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '＋ Nova turma' }));
    await user.type(screen.getByLabelText('Nome da turma'), 'Três');
    await user.click(screen.getByRole('button', { name: 'Criar turma' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('todas as turmas abertas');
    expect(within(alert).getByRole('link', { name: /Ver planos/ })).toHaveAttribute('href', '/planos');
  });

  it('para revisar: a entrega chega na caixa e leva para a revisão', async () => {
    const { api, klass } = await withClass();
    const { pin, student } = await api.addStudent(klass.id, 'Ana');
    const task = await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha', level: 'easy', mode: 'arcade', dueAt: new Date(Date.now() + 86400e3).toISOString() });
    api.login({ code: klass.code, name: 'Ana', pin });
    api.addPlay({ songId: 'brilha-brilha', accuracy: 94.1, meanAbsCents: 11 });
    await api.submitAssignment({ assignmentId: task.id });
    api.actAs('professor-1');
    mount(api, { path: `/professor/turma/${klass.id}` });
    const inbox = await screen.findByRole('region', { name: 'Para revisar' });
    const item = await within(inbox).findByRole('link', { name: /Ana · Brilha, brilha estrelinha/ });
    expect(item).toHaveTextContent('94,1% · ±11 ¢');
    expect(item).toHaveAttribute('href', `/professor/tarefa/${task.id}?aluno=${student.id}`);
    expect(screen.getAllByText('Revisar').length).toBeGreaterThan(0);
  });

  it('encerrar turma pede confirmação, com "Manter aberta" como padrão', async () => {
    const { api, klass } = await withClass();
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${klass.id}` });
    await user.click(await screen.findByRole('button', { name: 'Encerrar turma' }));
    expect(screen.getByRole('button', { name: 'Manter aberta' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(await screen.findByText('Turma encerrada: o código não vale mais.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nova tarefa/ })).not.toBeInTheDocument();
  });

  it('anônimo vai para o pedido de conta com o motivo professor; conta de aluno não vira professor', async () => {
    mount(undefined, { session: { status: 'signed-in', userId: 'a', anonymous: true } });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/conta?motivo=professor&depois=%2Fprofessor&voltar=%2F'));
  });

  it('conta de aluno (sem e-mail) vê o aviso, não a área', async () => {
    mount(undefined, { session: { status: 'signed-in', userId: 'aluno', anonymous: false } });
    expect(await screen.findByRole('heading', { name: 'Esta é uma conta de aluno' })).toBeInTheDocument();
  });
});
