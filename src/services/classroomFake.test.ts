import { describe, expect, it } from 'vitest';
import { fakeClassroom } from './classroomFake';

const SONG = 'brilha-brilha';
const tomorrow = () => new Date(Date.now() + 86400e3).toISOString();

/** Professor com turma e Ana cadastrada; `api` termina como o professor. */
async function scene() {
  const api = fakeClassroom({ userId: 'prof' });
  const cls = await api.createClass('Manhã');
  const { student, pin } = await api.addStudent(cls.id, 'Ana Luísa');
  return { api, cls, student, pin };
}

describe('fakeClassroom (as regras do banco que as telas veem)', () => {
  it('professor precisa de conta; turma de outro professor não existe', async () => {
    const { api, cls } = await scene();
    api.actAs('anon', { anonymous: true });
    await expect(api.createClass('X')).rejects.toMatchObject({ kind: 'needs-account' });
    api.actAs('outro-prof');
    await expect(api.getClass(cls.id)).rejects.toMatchObject({ kind: 'not-found' });
    expect(await api.listMyClasses()).toEqual([]);
  });

  it('limites do free, nome repetido sem acento e PIN visto uma vez', async () => {
    const { api, cls, pin } = await scene();
    expect(pin).toMatch(/^\d{4}$/);
    await expect(api.addStudent(cls.id, 'ana luisa')).rejects.toMatchObject({ kind: 'duplicate' });
    await api.createClass('Tarde');
    await expect(api.createClass('Noite')).rejects.toMatchObject({ kind: 'limit' });
    expect(JSON.stringify(await api.getClass(cls.id))).not.toContain(pin);
  });

  it('login do aluno: certo entra, 5 erros bloqueiam, PIN novo desbloqueia, turma encerrada recusa', async () => {
    const { api, cls, student, pin } = await scene();
    const wrong = pin === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) expect(() => api.login({ code: cls.code, name: 'Ana Luísa', pin: wrong })).toThrow(/não conferem/);
    expect(() => api.login({ code: cls.code, name: 'Ana Luísa', pin })).toThrow(/Muitas tentativas/);
    api.actAs('prof');
    const fresh = await api.resetStudentPin(student.id);
    const r = api.login({ code: cls.code.toLowerCase(), name: ' ana luisa ', pin: fresh.pin });
    expect(r.student).toMatchObject({ id: student.id, name: 'Ana Luísa', className: 'Manhã' });
    expect((await api.getMyClass())?.studentId).toBe(student.id);
    api.actAs('prof');
    await api.closeClass(cls.id);
    expect(() => api.login({ code: cls.code, name: 'Ana Luísa', pin: fresh.pin })).toThrow(/encerrada/);
  });

  it('tarefa: só conta a partida certa; entrega, revisão e depois nada muda', async () => {
    const { api, cls, pin } = await scene();
    const task = await api.createAssignment({ classId: cls.id, songId: SONG, level: 'easy', mode: 'arcade', dueAt: tomorrow(), instructionKey: 'tocar-inteira' });
    await expect(api.createAssignment({ classId: cls.id, songId: SONG, level: 'easy', mode: 'practice' as 'arcade', dueAt: tomorrow() })).rejects.toMatchObject({ kind: 'refused' });
    const { student } = api.login({ code: cls.code, name: 'Ana Luísa', pin });
    api.addPlay({ songId: SONG, level: 'hard', score: 999 });
    await expect(api.submitAssignment({ assignmentId: task.id })).rejects.toMatchObject({ kind: 'refused' });
    api.addPlay({ songId: SONG, score: 300 });
    const path = `${cls.id}/${student.id}/${task.id}/take.webm`;
    await api.uploadSubmissionAudio(path, new Blob(['a']), 'audio/webm');
    const sent = await api.submitAssignment({ assignmentId: task.id, audioPath: path });
    expect([sent.best?.score, sent.submission?.score, sent.submission?.audioPath]).toEqual([300, 300, path]);
    api.actAs('prof');
    expect(await api.submissionAudioUrl(path)).toBe(`fake-audio://${path}`);
    await api.reviewSubmission({ submissionId: sent.submission!.id, grade: 5, comment: 'Lindo' });
    const row = (await api.getAssignment(task.id)).students[0];
    expect([row.name, row.review?.grade]).toEqual(['Ana Luísa', 5]);
    api.actAs('outro-prof');
    await expect(api.submissionAudioUrl(path)).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('entrega traz a afinação e a duração da partida e a do áudio, que só fica com gravação', async () => {
    const { api, cls, pin } = await scene();
    const task = await api.createAssignment({ classId: cls.id, songId: SONG, level: 'easy', mode: 'arcade', dueAt: tomorrow() });
    const { student } = api.login({ code: cls.code, name: 'Ana Luísa', pin });
    api.addPlay({ songId: SONG, meanAbsCents: 11, stringCents: [-4, 6, null, 12], durationMs: 48_000 });
    const path = `${cls.id}/${student.id}/${task.id}/take.webm`;
    const sent = await api.submitAssignment({ assignmentId: task.id, audioPath: path, audioDurationMs: 47_500 });
    const { meanAbsCents, stringCents, durationMs, audioDurationMs } = sent.submission!;
    expect([meanAbsCents, stringCents, durationMs, audioDurationMs]).toEqual([11, [-4, 6, null, 12], 48_000, 47_500]);
    expect(sent.best?.stringCents).toEqual([-4, 6, null, 12]);
    const plain = await api.submitAssignment({ assignmentId: task.id, audioDurationMs: 47_500 });
    expect(plain.submission?.audioDurationMs).toBeNull();
  });

  it('responsável: convite de uso único, vê só o filho e ouve a entrega dele', async () => {
    const { api, cls, student } = await scene();
    const { student: bia } = await api.addStudent(cls.id, 'Bia');
    const { code } = await api.createGuardianInvite(student.id);
    api.actAs('mae');
    expect((await api.acceptGuardianInvite(code)).name).toBe('Ana Luísa');
    expect((await api.listMyChildren()).map((c) => c.name)).toEqual(['Ana Luísa']);
    await expect(api.getStudentProgress(bia.id)).rejects.toMatchObject({ kind: 'not-found' });
    api.actAs('outra-mae');
    await expect(api.acceptGuardianInvite(code)).rejects.toMatchObject({ kind: 'not-found' });
    await expect(api.getStudentProgress(student.id)).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('failNext faz a próxima chamada falhar com o motivo pedido', async () => {
    const api = fakeClassroom();
    api.failNext('offline');
    await expect(api.listMyClasses()).rejects.toMatchObject({ kind: 'offline' });
    expect(await api.listMyClasses()).toEqual([]);
  });
});
