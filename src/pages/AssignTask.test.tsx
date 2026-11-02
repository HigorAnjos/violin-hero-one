import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { FIXED_SONGS } from '../game/notation/songs';
import { INSTRUCTION_TEXT_MAX } from '../services/classroom';
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
  return renderScreen(<AssignTask api={api} />, { path: `/professor/turma/${classId}/nova-tarefa`, route: '/professor/turma/:turma/nova-tarefa', queryClient, theme });
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
