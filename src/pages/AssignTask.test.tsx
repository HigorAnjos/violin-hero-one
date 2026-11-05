import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { FIXED_SONGS } from '../game/notation/songs';
import { INSTRUCTION_TEXT_MAX, type AssignmentSummary } from '../services/classroom';
import { fakeClassroom } from '../services/classroomFake';
import { renderScreen } from '../shell/testing';
import { AssignTask } from './AssignTask';

vi.mock('../services/supabase', () => ({ supabase: null }));

afterEach(() => vi.unstubAllGlobals());

const SONGS = Object.fromEntries(FIXED_SONGS.map((s) => [s.id, s.title]));

async function scene() {
  const api = fakeClassroom({ songs: SONGS });
  const klass = await api.createClass('Iniciantes · sábado');
  for (const name of ['Ana', 'Bruno', 'Carla']) await api.addStudent(klass.id, name);
  return { api, klass };
}

function mount(api: ReturnType<typeof fakeClassroom>, classId: string, theme = cadernoTheme) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['session'], { status: 'signed-in', userId: 'professor-1', anonymous: false, email: 'p@exemplo.com' });
  renderScreen(<AssignTask api={api} />, { path: `/professor/turma/${classId}/nova-tarefa`, route: '/professor/turma/:turma/nova-tarefa', queryClient, theme });
  return queryClient;
}

/** Daqui em diante toda leitura de turma fica presa até `release` (o servidor lento: a mutação responde, a releitura não). */
function holdReads(api: ReturnType<typeof fakeClassroom>) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  for (const read of ['getClass', 'listClassAssignments', 'getAssignment', 'listMyClasses', 'getMyPlan'] as const) {
    const real = api[read].bind(api) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(api, read).mockImplementation((async (...args: unknown[]) => {
      await held;
      return real(...args);
    }) as never);
  }
  return release;
}

describe.each([cadernoTheme, palcoTheme, pixelTheme])('P2 · nova tarefa: $name', (theme) => {
  it.each([
    [1280, 720],
    [844, 390],
  ])('%i × %i: música, modo, prazo e recado pronto; volta para a turma com a tarefa', async (width, height) => {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
    const { api, klass } = await scene();
    const user = userEvent.setup();
    mount(api, klass.id, theme);
    await screen.findByRole('heading', { name: 'Nova tarefa' });
    const song = await screen.findByRole('combobox');
    await waitFor(() => expect(song).not.toBeDisabled());
    await user.selectOptions(song, FIXED_SONGS[1].id);
    await user.click(within(screen.getByRole('group', { name: 'Modo de jogo' })).getByRole('button', { name: 'Partitura' }));
    await user.click(screen.getByRole('button', { name: 'Preste atenção no ritmo.' }));
    const preview = screen.getByRole('region', { name: 'Como o aluno vai ver' });
    expect(preview).toHaveTextContent(`Tarefa nova: ${FIXED_SONGS[1].title}`);
    expect(preview).toHaveTextContent('Preste atenção no ritmo.');
    await user.click(screen.getByRole('button', { name: /Enviar para 3 alunos/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/professor/turma/${klass.id}`));
    const [task] = await api.listClassAssignments(klass.id);
    expect([task.songId, task.mode, task.instructionKey, task.studentCount]).toEqual([FIXED_SONGS[1].id, 'sheet', 'atencao-ritmo', 3]);
  });
});

describe('P2 · nova tarefa', () => {
  it('recado próprio até o limite; a lista da turma mostra entregas e revisões', async () => {
    const { api, klass } = await scene();
    await api.createAssignment({ classId: klass.id, songId: FIXED_SONGS[0].id, level: 'easy', mode: 'arcade', dueAt: new Date(Date.now() + 86400e3).toISOString() });
    const user = userEvent.setup();
    mount(api, klass.id);
    const list = await screen.findByRole('region', { name: 'Tarefas da turma' });
    expect(await within(list).findByText(/0 de 3 entregaram · 0 revisadas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Escrever o meu' }));
    const own = screen.getByPlaceholderText(/4º dedo/);
    expect(own).toHaveAttribute('maxLength', String(INSTRUCTION_TEXT_MAX));
    expect(screen.getByRole('button', { name: /Enviar para/ })).toBeDisabled();
    await user.type(own, 'Duas vezes seguidas');
    await user.click(screen.getByRole('button', { name: /Enviar para/ }));
    await waitFor(async () => expect((await api.listClassAssignments(klass.id))[0].instructionText).toBe('Duas vezes seguidas'));
  });

  it('turma sem aluno: "Enviar à turma" e o aviso de que vale para quem entrar depois', async () => {
    const api = fakeClassroom({ songs: SONGS });
    const klass = await api.createClass('Vazia');
    const user = userEvent.setup();
    mount(api, klass.id);
    expect(await screen.findByText('A turma ainda não tem aluno: a tarefa vale para quem entrar depois.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar para/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: /^Enviar à turma/ }));
    await waitFor(async () => expect(await api.listClassAssignments(klass.id)).toHaveLength(1));
  });

  it('volta para a turma assim que o servidor confirma, sem esperar a releitura', async () => {
    const { api, klass } = await scene();
    const user = userEvent.setup();
    const queryClient = mount(api, klass.id);
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
    await screen.findByRole('button', { name: /Enviar para 3 alunos/ });
    const release = holdReads(api);
    await user.click(screen.getByRole('button', { name: /Enviar para 3 alunos/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(`/professor/turma/${klass.id}`));
    // A turma abre com a tarefa nova, tirada da resposta da criação
    const list = queryClient.getQueryData<AssignmentSummary[]>(['classroom', 'class', klass.id, 'assignments', 'professor-1']);
    expect(list?.map((t) => [t.mode, t.studentCount, t.submittedCount])).toEqual([['arcade', 3, 0]]);
    release();
  });

  it('prazo no passado: aviso do app em pt-BR ao lado do campo e Enviar desligado, sem o balão do navegador', async () => {
    const { api, klass } = await scene();
    const user = userEvent.setup();
    mount(api, klass.id);
    const due = (await screen.findByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)) as HTMLInputElement;
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
    expect(due.closest('form')).toHaveAttribute('novalidate');
    fireEvent.change(due, { target: { value: '2020-01-01' } });
    expect(due).toHaveAccessibleName('Prazo');
    expect(due).toHaveAttribute('aria-invalid', 'true');
    expect(due).toHaveAccessibleDescription('O prazo não pode ser antes de hoje.');
    expect(screen.getByRole('button', { name: /Enviar para 3 alunos/ })).toBeDisabled();
    fireEvent.change(due, { target: { value: '' } });
    expect(due).toHaveAccessibleDescription('Escolha o prazo.');
    fireEvent.change(due, { target: { value: due.max } });
    expect(due).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Enviar para 3 alunos/ }));
    await waitFor(async () => expect(await api.listClassAssignments(klass.id)).toHaveLength(1));
  });

  it('o prazo vai até 59 dias e o erro do servidor aparece', async () => {
    const { api, klass } = await scene();
    const user = userEvent.setup();
    mount(api, klass.id);
    const due = (await screen.findByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)) as HTMLInputElement;
    const days = (Date.parse(due.max) - Date.parse(due.min)) / 86400e3;
    expect(Math.round(days)).toBe(59);
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
    api.failNext('offline');
    await user.click(screen.getByRole('button', { name: /Enviar para/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
  });
});
