import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClassroom, type FakeClassroom } from '../services/classroomFake';
import type { SessionState } from '../services/session';
import { setClassroomShell } from '../shell/classroom';
import { fakeClassroomShell } from '../shell/simulatedClassroom';
import { renderScreen } from '../shell/testing';
import { StudentTasks } from './StudentTasks';

vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));

const DAY = 86400e3;
const SONGS = { 'escala-re-maior': 'Escala de Ré maior', 'ode-a-alegria': 'Ode à Alegria', brilha: 'Brilha, brilha' };

let fake: FakeClassroom;
let ana: { userId: string; studentId: string; classId: string };
let ids: Record<'escala' | 'ode' | 'brilha', string>;

beforeEach(async () => {
  fake = fakeClassroom({ songs: SONGS, userId: 'professora' });
  const turma = await fake.createClass('Iniciantes · sábado');
  const { pin } = await fake.addStudent(turma.id, 'Ana Clara');
  const bruno = await fake.addStudent(turma.id, 'Bruno');
  const due = (d: number) => new Date(Date.now() + d * DAY).toISOString();
  const brilha = await fake.createAssignment({ classId: turma.id, songId: 'brilha', level: 'easy', mode: 'arcade', dueAt: due(2) });
  const ode = await fake.createAssignment({ classId: turma.id, songId: 'ode-a-alegria', level: 'medium', mode: 'sheet', dueAt: due(4), instructionKey: 'capricha-afinacao', instructionText: 'Atenção no compasso 4.' });
  const escala = await fake.createAssignment({ classId: turma.id, songId: 'escala-re-maior', level: 'easy', mode: 'arcade', dueAt: due(6) });
  ids = { brilha: brilha.id, ode: ode.id, escala: escala.id };
  // O Bruno entregou a da escala: a situação dele NÃO aparece para a Ana
  fake.login({ code: turma.code, name: 'Bruno', pin: bruno.pin });
  fake.addPlay({ songId: 'escala-re-maior' });
  await fake.submitAssignment({ assignmentId: escala.id });
  const login = fake.login({ code: turma.code, name: 'Ana Clara', pin });
  fake.addPlay({ songId: 'brilha', accuracy: 91 });
  const sub = await fake.submitAssignment({ assignmentId: brilha.id });
  fake.actAs('professora');
  await fake.reviewSubmission({ submissionId: sub.submission!.id, concept: 'muito-bom', comment: 'Ritmo ótimo, cuide da nota longa.' });
  fake.actAs(login.userId);
  ana = { userId: login.userId, studentId: login.student.id, classId: turma.id };
  setClassroomShell(fakeClassroomShell(fake));
});

afterEach(() => setClassroomShell(null));

function open(session: SessionState = { status: 'signed-in', userId: ana.userId, anonymous: false }, path = '/tarefas') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], session);
  renderScreen(<StudentTasks />, { path, route: '/tarefas', queryClient });
}

describe('StudentTasks (A2)', () => {
  it('lista as tarefas com prazo e só a situação da própria aluna; abre a primeira a fazer', async () => {
    open();
    const list = await screen.findByRole('navigation', { name: 'Tarefas' });
    const cards = within(list).getAllByRole('button');
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringMatching(/^Revisada.*Brilha, brilha.*Muito bom · o professor comentou/),
      expect.stringMatching(/^Para fazer.*Ode à Alegria/),
      // O Bruno entregou; para a Ana ainda está a fazer
      expect.stringMatching(/^Para fazer.*Escala de Ré maior/),
    ]);
    expect(within(list).getByRole('button', { name: /Ode à Alegria/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Iniciantes · sábado · Ana Clara')).toBeInTheDocument();
    expect(screen.queryByText(/Bruno/)).not.toBeInTheDocument();
  });

  it('a tarefa aberta mostra modo, nível e o que o professor pediu; tocar leva à partida da tarefa gravando', async () => {
    open();
    const panel = await screen.findByRole('region', { name: 'Ode à Alegria' });
    expect(within(panel).getByText('Modo Partitura · Médio')).toBeInTheDocument();
    expect(within(panel).getByRole('group', { name: 'O que o professor pediu' })).toHaveTextContent('Capriche na afinação. Atenção no compasso 4.');
    await userEvent.click(within(panel).getByRole('link', { name: /Tocar a tarefa/ }));
    const location = screen.getByTestId('location');
    expect(location).toHaveTextContent('/tocar/carregando?modo=partitura&musica=ode-a-alegria&nivel=medio');
    expect(JSON.parse(location.dataset.state ?? '{}')).toEqual({
      recordAudio: true,
      task: { assignmentId: ids.ode, classId: ana.classId, studentId: ana.studentId, dueAt: expect.any(String), songTitle: 'Ode à Alegria' },
    });
  });

  it('a revisada mostra o conceito e o comentário, e não chama para tocar valendo; tarefa desconhecida no endereço abre a primeira a fazer', async () => {
    open(undefined, '/tarefas?tarefa=sumiu');
    await userEvent.click(await screen.findByRole('button', { name: /Brilha, brilha/ }));
    const panel = screen.getByRole('region', { name: 'Brilha, brilha' });
    expect(within(panel).getByRole('group', { name: 'Revisão do professor' })).toHaveTextContent('O professor revisou: Muito bom');
    expect(within(panel).getByText('“Ritmo ótimo, cuide da nota longa.”')).toBeInTheDocument();
    expect(within(panel).getByText('91% de precisão')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: /Tocar/ })).not.toBeInTheDocument();
  });

  it('convidado ou conta com e-mail vai para a entrada da turma', () => {
    open({ status: 'signed-in', userId: 'anon', anonymous: true });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/turma$/);
  });

  it('sem rede, avisa e deixa tentar de novo', async () => {
    fake.failNext('offline');
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão. As tarefas precisam de internet');
  });
});
