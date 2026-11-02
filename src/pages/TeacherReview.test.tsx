import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { REVIEW_COMMENT_MAX } from '../services/classroom';
import { fakeClassroom } from '../services/classroomFake';
import { renderScreen } from '../shell/testing';
import { TeacherReview } from './TeacherReview';

vi.mock('../services/supabase', () => ({ supabase: null }));

afterEach(() => vi.restoreAllMocks());

/** Turma com Ana (entregou com gravação), Bruno (entregou sem gravação) e Carla (sem entrega). */
async function scene() {
  const api = fakeClassroom();
  const klass = await api.createClass('Iniciantes');
  const pins = new Map<string, string>();
  for (const name of ['Ana', 'Bruno', 'Carla']) pins.set(name, (await api.addStudent(klass.id, name)).pin);
  const task = await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha', level: 'easy', mode: 'sheet', dueAt: new Date(Date.now() + 86400e3).toISOString() });
  const ana = api.login({ code: klass.code, name: 'Ana', pin: pins.get('Ana')! });
  api.addPlay({ songId: 'brilha-brilha', mode: 'sheet', score: 4200, accuracy: 94.1, meanAbsCents: 11, stringCents: [-3, 6, -14, 9], durationMs: 48_000 });
  const path = `${klass.id}/${ana.student.id}/${task.id}/take.webm`;
  await api.uploadSubmissionAudio(path, new Blob(['a']), 'audio/webm');
  await api.submitAssignment({ assignmentId: task.id, audioPath: path, audioDurationMs: 47_500 });
  api.login({ code: klass.code, name: 'Bruno', pin: pins.get('Bruno')! });
  api.addPlay({ songId: 'brilha-brilha', mode: 'sheet', score: 3000, accuracy: 88 });
  await api.submitAssignment({ assignmentId: task.id });
  api.actAs('professor-1');
  return { api, klass, task, ana: ana.student, path };
}

function mount(api: ReturnType<typeof fakeClassroom>, path: string, theme = cadernoTheme) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['session'], { status: 'signed-in', userId: 'professor-1', anonymous: false, email: 'p@exemplo.com' });
  return renderScreen(<TeacherReview api={api} />, { path, route: '/professor/tarefa/:tarefa', queryClient, theme });
}

describe.each([cadernoTheme, palcoTheme, pixelTheme])('P3 · revisar entrega: $name', (theme) => {
  it.each([
    [1280, 720],
    [844, 390],
  ])('%i × %i: a lista com a situação, a partida, a afinação por corda e o player com a duração gravada', async (width, height) => {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
    const { api, task } = await scene();
    mount(api, `/professor/tarefa/${task.id}`, theme);
    expect(await screen.findByRole('heading', { name: 'Ana · Brilha, brilha estrelinha' })).toBeInTheDocument();
    const roster = screen.getByRole('navigation', { name: 'Alunos da tarefa' });
    expect(within(roster).getAllByRole('link').map((l) => l.textContent)).toEqual(['ANAnaRevisar', 'BRBrunoRevisar', 'CACarlaSem entrega']);
    const played = screen.getByLabelText('Partida enviada');
    expect(played).toHaveTextContent('4.200');
    expect(played).toHaveTextContent('94,1%');
    expect(played).toHaveTextContent('±11 ¢');
    expect(played).toHaveTextContent('Lá · baixa');
    expect(screen.getByLabelText('Afinação por corda')).toHaveTextContent(/−3 ¢.*\+6 ¢.*−14 ¢.*\+9 ¢/);
    expect(screen.getByText('0:00 / 0:47')).toBeInTheDocument();
    expect(screen.getByText(/30 dias depois da sua revisão/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe('P3 · revisar entrega', () => {
  it('o áudio só é pedido no play; o conceito e o comentário fecham a revisão e levam para a próxima', async () => {
    const { api, task, path } = await scene();
    const signed = vi.spyOn(api, 'submissionAudioUrl');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const user = userEvent.setup();
    mount(api, `/professor/tarefa/${task.id}`);
    await screen.findByRole('heading', { name: 'Ana · Brilha, brilha estrelinha' });
    expect(signed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Tocar gravação de Ana' }));
    await waitFor(() => expect(signed).toHaveBeenCalledWith(path));
    expect(screen.getByRole('button', { name: 'Enviar revisão' })).toBeDisabled();
    await user.click(within(screen.getByRole('group', { name: 'Conceito' })).getByRole('button', { name: 'Muito bom' }));
    await user.click(screen.getByRole('button', { name: 'Som lindo!' }));
    const comment = screen.getByRole('textbox', { name: 'Comentário' });
    expect(comment).toHaveAttribute('maxLength', String(REVIEW_COMMENT_MAX));
    await user.type(comment, ' Cuidado no compasso 4.');
    await user.click(screen.getByRole('button', { name: 'Enviar revisão' }));
    const done = await screen.findByRole('status');
    expect(done).toHaveTextContent('Muito bom');
    expect(done).toHaveTextContent('Som lindo! Cuidado no compasso 4.');
    expect(screen.getByText(/O áudio será apagado em/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Próxima: Bruno/ }));
    expect(await screen.findByRole('heading', { name: 'Bruno · Brilha, brilha estrelinha' })).toBeInTheDocument();
    expect(screen.getByText('Entrega sem gravação: só a partida.')).toBeInTheDocument();
    const row = (await api.getAssignment(task.id)).students.find((s) => s.name === 'Ana')!;
    expect([row.review?.concept, row.review?.comment]).toEqual(['muito-bom', 'Som lindo! Cuidado no compasso 4.']);
  });

  it('aluno sem entrega: a situação, sem formulário', async () => {
    const { api, task } = await scene();
    const carla = (await api.getAssignment(task.id)).students.find((s) => s.name === 'Carla')!;
    mount(api, `/professor/tarefa/${task.id}?aluno=${carla.studentId}`);
    expect(await screen.findByText('Carla ainda não tocou esta tarefa.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar revisão' })).not.toBeInTheDocument();
  });

  it('tarefa de outro professor: não encontrada', async () => {
    const { api, task } = await scene();
    api.actAs('outro-professor');
    mount(api, `/professor/tarefa/${task.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontramos isso');
  });
});
