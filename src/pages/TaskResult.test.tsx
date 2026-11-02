import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playedResult } from '../components/ResultSummary/testing';
import { ODE } from '../game/engine/testing';
import { RecordingError } from '../game/audio';
import { fakeClassroom, type FakeClassroom } from '../services/classroomFake';
import type { SessionState } from '../services/session';
import { setSessionSource, setUploadTarget } from '../services/sync';
import { setClassroomShell } from '../shell/classroom';
import type { TaskPlay } from '../shell/play';
import { fakeClassroomShell } from '../shell/simulatedClassroom';
import { submissionUploadTarget } from '../shell/submissionTarget';
import { holdTaskRecording } from '../shell/taskRecording';
import { renderScreen } from '../shell/testing';
import { clock, TaskResult } from './TaskResult';

vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));

let fake: FakeClassroom;
let session: SessionState;
let task: TaskPlay;
let clientN = 0;

beforeEach(async () => {
  fake = fakeClassroom({ songs: { [ODE.id]: ODE.title }, userId: 'professora' });
  const turma = await fake.createClass('Iniciantes');
  const { pin } = await fake.addStudent(turma.id, 'Ana Clara');
  const a = await fake.createAssignment({ classId: turma.id, songId: ODE.id, level: ODE.level, mode: 'arcade', dueAt: new Date(Date.now() + 3 * 86400e3).toISOString() });
  const { userId, student } = fake.login({ code: turma.code, name: 'Ana Clara', pin });
  session = { status: 'signed-in', userId, anonymous: false };
  task = { assignmentId: a.id, classId: turma.id, studentId: student.id, dueAt: a.dueAt, songTitle: ODE.title };
  localStorage.setItem('vh:usuario', userId);
  setClassroomShell(fakeClassroomShell(fake));
  setSessionSource(async () => session);
  URL.createObjectURL = vi.fn(() => 'blob:gravacao');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  setClassroomShell(null);
  setUploadTarget(null);
  localStorage.clear();
});

function open(recording?: Parameters<typeof holdTaskRecording>[1], withTask = true) {
  const clientId = `partida-${++clientN}`;
  if (recording) holdTaskRecording(clientId, recording);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], session);
  const result = { ...playedResult(), accuracy: 94.06, meanAbsCents: 11.2 };
  renderScreen(<TaskResult />, { path: '/tarefas/entrega', route: '/tarefas/entrega', queryClient, state: { song: ODE, mode: 'Arcade', result, clientId, recordAudio: true, ...(withTask && { task }) } });
}

const take = () => ({ blob: new Blob(['som'], { type: 'audio/webm;codecs=opus' }), mimeType: 'audio/webm;codecs=opus', durationMs: 48_000 });

describe('TaskResult (A3)', () => {
  it('mostra como foi a partida e a gravação para ouvir; enviar sobe o áudio e entrega a tarefa', async () => {
    setUploadTarget(submissionUploadTarget(fake, async () => {}));
    open(take());
    expect(screen.getByText(`Tarefa · ${ODE.title}`)).toBeInTheDocument();
    const summary = screen.getByRole('list', { name: 'Como foi a partida' });
    expect(summary).toHaveTextContent('Precisão94,1%');
    // Sem meta na tarefa, só a música inteira ganha ✓; precisão e afinação são medidas, não "passou"
    expect(summary.textContent?.match(/✓/g)).toHaveLength(1);
    expect(screen.getByText('±11 ¢')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir a gravação' })).toBeInTheDocument();
    expect(screen.getByText(/o áudio de 0:48/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Enviar para o professor/ }));
    expect(await screen.findByText('Enviada ✓ O professor já pode ouvir e revisar.')).toBeInTheDocument();
    const [mine] = await fake.getMyAssignments();
    expect(mine.submission?.audioPath).toMatch(new RegExp(`^${task.classId}/${task.studentId}/${task.assignmentId}/[\\w-]+\\.webm$`));
    expect(fake.audio.size).toBe(1);
    expect(screen.getByRole('link', { name: /Ver tarefas/ })).toHaveAttribute('href', `/tarefas?tarefa=${task.assignmentId}`);
  });

  it('sem destino (sem rede), a gravação fica na fila e a tela diz', async () => {
    open(take());
    await userEvent.click(screen.getByRole('button', { name: /Enviar para o professor/ }));
    expect(await screen.findByText(/Gravação na fila: sobe sozinha quando houver internet/)).toBeInTheDocument();
    expect(fake.audio.size).toBe(0);
  });

  it('só marcar como feita entrega a partida sem áudio', async () => {
    open(take());
    await userEvent.click(screen.getByRole('button', { name: 'Só marcar como feita' }));
    expect(await screen.findByText(/Marcada como feita ✓/)).toBeInTheDocument();
    const [mine] = await fake.getMyAssignments();
    expect(mine.submission).toMatchObject({ audioPath: null });
  });

  it('gravação interrompida: pede para tocar de novo, que volta à contagem valendo para a tarefa', async () => {
    open(new RecordingError('interrupted', 'hidden'));
    expect(screen.getByText(/A gravação parou no meio/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar para o professor/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tocar de novo/ }));
    const location = screen.getByTestId('location');
    expect(location).toHaveTextContent('/contagem');
    expect(JSON.parse(location.dataset.state ?? '{}')).toMatchObject({ recordAudio: true, task, next: '/jogo' });
  });

  it('navegador que não grava: avisa e envia só a partida', async () => {
    open(new RecordingError('unsupported'));
    expect(screen.getByText(/Este navegador não grava áudio/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Enviar a partida/ }));
    await waitFor(async () => expect((await fake.getMyAssignments())[0].submission).not.toBeNull());
  });

  it('sem tarefa no estado, volta para as tarefas', () => {
    open(take(), false);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tarefas$/);
  });

  it('relógio m:ss', () => {
    expect(clock(48_400)).toBe('0:48');
    expect(clock(61_000)).toBe('1:01');
  });
});
