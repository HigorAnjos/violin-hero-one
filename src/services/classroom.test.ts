import { describe, expect, it, vi } from 'vitest';
import {
  ClassroomError,
  classroomErrorKind,
  studentLogin,
  submissionAudioPath,
  submissionAudioType,
  supabaseClassroom,
  type ClassroomClient,
  type StudentLoginClient,
} from './classroom';
import type { DeviceData } from './deviceData';
import { signedIn } from './session';

const SESSION = { status: 'signed-in', userId: 'anon-1', anonymous: true } as const;

function rpcClient(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://x/assinada' }, error: null });
  const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
  const client = { rpc, from: vi.fn(), storage: { from: storageFrom } } as unknown as ClassroomClient;
  return { client, rpc, upload, createSignedUrl, storageFrom };
}

function device(flush: DeviceData['flush'] = async () => {}): DeviceData & { flush: ReturnType<typeof vi.fn> } {
  return { flush: vi.fn(flush), forget: vi.fn(), use: vi.fn(), pending: vi.fn(async () => 0) } as never;
}

describe('classroomErrorKind', () => {
  it('traduz os códigos das funções do banco', () => {
    expect(['28000', 'P0002', '22023', '23505', 'VHLIM', '42501', undefined, 'XX000'].map((code) => classroomErrorKind({ code }))).toEqual([
      'needs-account', 'not-found', 'refused', 'duplicate', 'limit', 'offline', 'offline', 'server',
    ]);
  });
});

describe('supabaseClassroom', () => {
  it('chama a função com os parâmetros do banco e devolve a turma em camelCase', async () => {
    const { client, rpc } = rpcClient({
      id: 't1', name: 'Manhã', code: 'ABCDEFGH', created_at: '2026-11-01T10:00:00Z', closed_at: null,
      students: [{ id: 'a1', name: 'Ana', active: true, joined: false, created_at: '2026-11-01T10:01:00Z' }],
    });
    const cls = await supabaseClassroom(client).createClass('Manhã');
    expect(rpc).toHaveBeenCalledWith('create_class', { p_name: 'Manhã' });
    expect(cls).toEqual({
      id: 't1', name: 'Manhã', code: 'ABCDEFGH', createdAt: '2026-11-01T10:00:00Z', closedAt: null,
      students: [{ id: 'a1', name: 'Ana', active: true, joined: false, createdAt: '2026-11-01T10:01:00Z' }],
    });
  });

  it('tarefa do aluno: melhor partida, entrega e revisão', async () => {
    const { client, rpc } = rpcClient({
      id: 'x', class_id: 't1', song_id: 's', song_title: 'Brilha', level: 'hard', mode: 'arcade', instruction_key: 'tocar-inteira',
      instruction_text: null, created_at: 'c', due_at: 'd', closed: false,
      best: { play_id: 'p1', score: 400, accuracy: '97.50', played_at: 'pa' },
      submission: { id: 'e1', play_id: 'p1', score: 400, accuracy: '97.50', submitted_at: 'sa', audio_path: 't1/a1/x/f.webm', audio_deleted: false },
      review: { grade: null, concept: 'bom', comment: 'Boa', reviewed_at: 'ra' },
    });
    const r = await supabaseClassroom(client).submitAssignment({ assignmentId: 'x', audioPath: 't1/a1/x/f.webm' });
    expect(rpc).toHaveBeenCalledWith('submit_assignment', { p_assignment_id: 'x', p_play_id: null, p_audio_path: 't1/a1/x/f.webm' });
    expect([r.level, r.best?.accuracy, r.submission?.audioPath, r.review?.concept, r.review?.grade]).toEqual(['hard', 97.5, 't1/a1/x/f.webm', 'bom', null]);
  });

  it('afinação e duração da partida e do áudio (0017); a duração só vai com áudio', async () => {
    const { client, rpc } = rpcClient({
      id: 'x', class_id: 't1', song_id: 's', song_title: 'Brilha', level: 'easy', mode: 'arcade', instruction_key: null,
      instruction_text: null, created_at: 'c', due_at: 'd', closed: false,
      best: { play_id: 'p1', score: 400, accuracy: 97.5, played_at: 'pa', mean_abs_cents: '11.50', string_cents: ['-4.00', 6.5, null, 12], duration_ms: 48000 },
      submission: {
        id: 'e1', play_id: 'p1', score: 400, accuracy: 97.5, submitted_at: 'sa', audio_path: 't1/a1/x/f.webm', audio_deleted: false,
        audio_duration_ms: 47500, mean_abs_cents: 11.5, string_cents: [-4, 6.5, null, 12], duration_ms: 48000,
      },
      review: null,
    });
    const api = supabaseClassroom(client);
    const r = await api.submitAssignment({ assignmentId: 'x', audioPath: 't1/a1/x/f.webm', audioDurationMs: 47500.4 });
    expect(rpc).toHaveBeenLastCalledWith('submit_assignment', { p_assignment_id: 'x', p_play_id: null, p_audio_path: 't1/a1/x/f.webm', p_audio_duration_ms: 47500 });
    expect([r.best?.meanAbsCents, r.best?.stringCents, r.best?.durationMs]).toEqual([11.5, [-4, 6.5, null, 12], 48000]);
    expect([r.submission?.audioDurationMs, r.submission?.stringCents]).toEqual([47500, [-4, 6.5, null, 12]]);
    await api.submitAssignment({ assignmentId: 'x', audioDurationMs: 47500 });
    expect(rpc).toHaveBeenLastCalledWith('submit_assignment', { p_assignment_id: 'x', p_play_id: null, p_audio_path: null });
  });

  it('erro do banco vira ClassroomError com o motivo', async () => {
    const { client } = rpcClient(null, { code: 'VHLIM', message: 'limite' });
    await expect(supabaseClassroom(client).addStudent('t1', 'Ana')).rejects.toMatchObject({ kind: 'limit' });
    await expect(supabaseClassroom(null).listMyClasses()).rejects.toMatchObject({ kind: 'offline' });
  });

  it('aluno sem turma recebe null', async () => {
    expect(await supabaseClassroom(rpcClient(null).client).getMyClass()).toBeNull();
  });

  it('áudio: sobe no bucket submissions sem sobrescrever e recusa mais de 10 MB sem chamar o servidor', async () => {
    const { client, upload, storageFrom } = rpcClient(null);
    const api = supabaseClassroom(client);
    await api.uploadSubmissionAudio('t/a/x/f.webm', new Blob(['oi']), 'audio/webm');
    expect(storageFrom).toHaveBeenCalledWith('submissions');
    expect(upload).toHaveBeenCalledWith('t/a/x/f.webm', expect.any(Blob), { contentType: 'audio/webm', upsert: false });
    const big = { size: 10 * 1024 * 1024 + 1 } as Blob;
    await expect(api.uploadSubmissionAudio('t/a/x/g.webm', big, 'audio/webm')).rejects.toMatchObject({ kind: 'refused' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await api.submissionAudioUrl('t/a/x/f.webm')).toBe('https://x/assinada');
  });
});

describe('áudio da entrega', () => {
  it('tipo sem parâmetros e caminho na pasta do aluno', () => {
    expect(submissionAudioType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(submissionAudioType('audio/mp4')).toBe('audio/mp4');
    expect(submissionAudioType('video/webm')).toBeNull();
    expect(submissionAudioPath('t1', 'a1', 'x1', 'audio/mp4', 'take-1')).toBe('t1/a1/x1/take-1.m4a');
    expect(submissionAudioPath('t1', 'a1', 'x1', 'audio/webm')).toMatch(/^t1\/a1\/x1\/[0-9a-f-]{36}\.webm$/);
  });
});

describe('studentLogin', () => {
  const ok = {
    session: { access_token: 'acesso', refresh_token: 'renova' },
    user_id: 'aluno-1',
    student: { id: 'a1', name: 'Ana', class_id: 't1', class_name: 'Manhã' },
  };
  function loginClient(result: { data?: unknown; error?: unknown }) {
    const invoke = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
    const setSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    return { client: { functions: { invoke }, auth: { setSession } } as unknown as StudentLoginClient, invoke, setSession };
  }
  const httpError = (code: string) => ({ name: 'FunctionsHttpError', context: { json: async () => ({ error: { code } }) } });

  it('sobe a fila de quem estava no aparelho antes, chama a class-login e adota a sessão do aluno', async () => {
    const order: string[] = [];
    const data = device(async () => void order.push('flush'));
    const { client, invoke, setSession } = loginClient({ data: ok });
    invoke.mockImplementation(async () => (order.push('invoke'), { data: ok, error: null }));
    const r = await studentLogin(client, SESSION, { code: 'abcd-efgh', name: 'Ana', pin: ' 1234 ' }, data);
    expect(order).toEqual(['flush', 'invoke']);
    expect(data.flush).toHaveBeenCalledWith('anon-1');
    expect(invoke).toHaveBeenCalledWith('class-login', { body: { code: 'abcd-efgh', name: 'Ana', pin: '1234' } });
    expect(setSession).toHaveBeenCalledWith({ access_token: 'acesso', refresh_token: 'renova' });
    expect(r).toEqual({ userId: 'aluno-1', student: { id: 'a1', name: 'Ana', classId: 't1', className: 'Manhã' } });
  });

  it('fila que não sobe: não troca de usuário nem chama a função', async () => {
    const { client, invoke } = loginClient({ data: ok });
    const data = device(async () => {
      throw new Error('sem rede');
    });
    await expect(studentLogin(client, SESSION, { code: 'ABCDEFGH', name: 'Ana', pin: '1234' }, data)).rejects.toMatchObject({ kind: 'offline' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('PIN que não tem 4 dígitos nem sai do aparelho', async () => {
    const { client, invoke } = loginClient({ data: ok });
    await expect(studentLogin(client, SESSION, { code: 'ABCDEFGH', name: 'Ana', pin: '12a4' }, device())).rejects.toMatchObject({ kind: 'invalid-credentials' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_credentials', 'invalid-credentials'],
    ['too_many_attempts', 'too-many-attempts'],
    ['class_closed', 'class-closed'],
    ['server', 'server'],
  ])('resposta %s da função vira %s, sem trocar a sessão', async (code, kind) => {
    const { client, setSession } = loginClient({ error: httpError(code) });
    const error = await studentLogin(client, SESSION, { code: 'ABCDEFGH', name: 'Ana', pin: '1234' }, device()).catch((e) => e);
    expect(error).toBeInstanceOf(ClassroomError);
    expect(error.kind).toBe(kind);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('sem rede até a função: offline', async () => {
    const { client } = loginClient({ error: { name: 'FunctionsFetchError' } });
    await expect(studentLogin(client, SESSION, { code: 'ABCDEFGH', name: 'Ana', pin: '1234' }, device())).rejects.toMatchObject({ kind: 'offline' });
  });
});

describe('signedIn', () => {
  it('o e-mail sintético do aluno nunca vai para a sessão da tela', () => {
    expect(signedIn({ id: 'a', is_anonymous: false, email: 'aluno-1@alunos.violinhero.invalid' })).toEqual({ status: 'signed-in', userId: 'a', anonymous: false });
    expect(signedIn({ id: 'b', email: 'mae@exemplo.com' })).toMatchObject({ email: 'mae@exemplo.com' });
  });
});
