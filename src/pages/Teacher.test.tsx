import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PORTRAIT_QUERY } from '../assets/styles/media';
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

/** A cor do tema como o navegador a devolve no getComputedStyle (rgb(…)). */
function colorOf(value: string): string {
  const probe = document.createElement('i');
  probe.style.color = value;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

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
    // Redefinir pede confirmação, com o nome e o efeito; "Manter o PIN" é o padrão e não troca nada
    const reset = vi.spyOn(api, 'resetStudentPin');
    await user.click(screen.getByRole('button', { name: 'Redefinir PIN de Bruno' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Redefinir PIN de Bruno' });
    expect(confirm).toHaveTextContent('O PIN de agora para de funcionar na hora');
    expect(within(confirm).getByRole('button', { name: 'Manter o PIN' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Redefinir PIN de Bruno' }));
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Redefinir PIN de Bruno' })).getByRole('button', { name: 'Redefinir PIN' }));
    expect(await screen.findByRole('alertdialog', { name: 'PIN de Bruno' })).toHaveTextContent('1003');
    expect(reset).toHaveBeenCalledTimes(1);
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

  it('convite do responsável: no tom de informação, com Copiar código e Compartilhar', async () => {
    const { api, klass } = await withClass();
    await api.addStudent(klass.id, 'Ana');
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${klass.id}` });
    await user.click(await screen.findByRole('button', { name: 'Convite do responsável de Ana' }));
    const notice = await screen.findByRole('status', { name: 'Convite do responsável de Ana' });
    const { code } = await api.createGuardianInvite((await api.getClass(klass.id)).students[0].id);
    expect(within(notice).getByText(code)).toBeInTheDocument();
    // Borda e fundo do tom info do tema, nada do vermelho de erro
    const style = getComputedStyle(notice);
    expect(style.borderTopColor).toBe(colorOf(cadernoTheme.colors.info.border));
    expect(style.backgroundColor).toBe(colorOf(cadernoTheme.colors.info.surface));
    expect(style.borderTopColor).not.toBe(colorOf(cadernoTheme.colors.danger.main));
    expect(within(notice).getByRole('button', { name: 'Compartilhar' })).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Copiar código' }));
    expect(await navigator.clipboard.readText()).toBe(code);
    expect(notice).toHaveTextContent('Copiado.');
    // O que sai pela folha de compartilhar leva o código, nunca o nome do aluno (o nome fica só na turma)
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share }));
    await user.click(within(notice).getByRole('button', { name: 'Compartilhar' }));
    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.mock.calls[0][0] as { title: string; text: string; url: string };
    expect(shared.text).toContain(code);
    expect(JSON.stringify(shared)).not.toMatch(/Ana/);
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

  it('em pé, turma sem aluno: o cadastro antes de Para revisar e fica lá ao cadastrar; com alunos, no fim', async () => {
    const portrait = (query: string) => query === PORTRAIT_QUERY;
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: portrait(query), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { api, klass } = await withClass();
    const user = userEvent.setup();
    const before = (a: HTMLElement, b: HTMLElement) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const first = mount(api, { path: `/professor/turma/${klass.id}` });
    const add = await screen.findByRole('form', { name: 'Cadastrar aluno' });
    expect(before(add, screen.getByRole('region', { name: 'Para revisar' }))).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Nome do aluno' }), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    // O PIN aparece onde se digitou, e o cadastro segue em cima para o próximo aluno
    await user.click(await screen.findByRole('button', { name: 'Anotei o PIN' }));
    expect(before(screen.getByRole('form', { name: 'Cadastrar aluno' }), screen.getByRole('region', { name: 'Para revisar' }))).toBe(true);
    first.unmount();

    mount(api, { path: `/professor/turma/${klass.id}` });
    const again = await screen.findByRole('form', { name: 'Cadastrar aluno' });
    expect(before(screen.getByRole('region', { name: 'Para revisar' }), again)).toBe(true);
  });

  it('desktop e deitado, turma sem aluno: a ordem de sempre, cadastro depois dos painéis', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { api, klass } = await withClass();
    mount(api, { path: `/professor/turma/${klass.id}` });
    const add = await screen.findByRole('form', { name: 'Cadastrar aluno' });
    expect(screen.getByRole('region', { name: 'Para revisar' }).compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('"Ver planos" da turma leva aos Planos lembrando a turma, para o voltar', async () => {
    const { api, klass } = await withClass();
    const user = userEvent.setup();
    mount(api, { path: `/professor/turma/${klass.id}` });
    const plan = await screen.findByRole('region', { name: 'Seu plano' });
    await user.click(await within(plan).findByRole('link', { name: /Ver planos/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/planos$/);
    expect(JSON.parse(screen.getByTestId('location').getAttribute('data-state')!)).toEqual({ plansBack: { to: `/professor/turma/${klass.id}`, label: 'Iniciantes · sábado' } });
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
    expect(item).toHaveTextContent('Fácil · Arcade · 94,1% · ±11 ¢');
    expect(item).toHaveAttribute('href', `/professor/tarefa/${task.id}?aluno=${student.id}`);
    expect(screen.getAllByText('Revisar').length).toBeGreaterThan(0);
  });

  it('tarefas da mesma música: o painel mostra a música e, embaixo, nível, modo e prazo', async () => {
    const { api, klass } = await withClass();
    const dueAt = new Date(Date.now() + 86400e3).toISOString();
    await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha', level: 'easy', mode: 'arcade', dueAt });
    await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha', level: 'easy', mode: 'strings3d', dueAt });
    mount(api, { path: `/professor/turma/${klass.id}` });
    const panel = await screen.findByRole('region', { name: 'Tarefas' });
    expect(await within(panel).findAllByText('Brilha, brilha estrelinha')).toHaveLength(2);
    expect(within(panel).getByText(/^Fácil · Arcade · até /)).toBeInTheDocument();
    expect(within(panel).getByText(/^Fácil · Cordas 3D · até /)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Entregas de Brilha, brilha estrelinha · Fácil · Cordas 3D' })).toBeInTheDocument();
  });

  it('tarefas da mesma música: cada coluna da tabela diz nível e modo, e o selo fica na coluna dela', async () => {
    const { api, klass } = await withClass();
    await api.addStudent(klass.id, 'Ana');
    const dueAt = new Date(Date.now() + 86400e3).toISOString();
    await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha', level: 'easy', mode: 'arcade', dueAt });
    await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha', level: 'medium', mode: 'sheet', dueAt });
    mount(api, { path: `/professor/turma/${klass.id}` });
    const table = await screen.findByRole('table');
    const headers = await within(table).findAllByRole('columnheader');
    const names = headers.map((h) => h.getAttribute('aria-label') ?? h.textContent);
    const arcade = names.indexOf('Brilha, brilha estrelinha · Fácil · Arcade');
    const sheet = names.indexOf('Brilha, brilha estrelinha · Médio · Partitura');
    expect(arcade).toBeGreaterThan(-1);
    expect(sheet).toBeGreaterThan(-1);
    expect(headers[sheet]).toHaveTextContent('Médio · Partitura');
    const cells = within(within(table).getByRole('row', { name: /Ana/ })).getAllByRole('cell');
    expect(cells[arcade]).toHaveTextContent('Sem entrega');
    expect(cells[sheet]).toHaveTextContent('Sem entrega');
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
