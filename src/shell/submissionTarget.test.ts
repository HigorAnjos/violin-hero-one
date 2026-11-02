import { describe, expect, it, vi } from 'vitest';
import { ClassroomError, type ClassroomApi } from '../services/classroom';
import { fakeClassroom } from '../services/classroomFake';
import { createRecordingUploads, memoryRecordingQueueStore, UploadError, type SignedInSession } from '../services/recordingUpload';
import { submissionUploadTarget } from './submissionTarget';

const DAY = 86400e3;

async function scene() {
  const fake = fakeClassroom({ songs: { canon: 'Canon' }, userId: 'professora' });
  const turma = await fake.createClass('Iniciantes');
  const { pin } = await fake.addStudent(turma.id, 'Ana Clara');
  const outra = await fake.addStudent(turma.id, 'Bruno');
  const tarefa = await fake.createAssignment({ classId: turma.id, songId: 'canon', level: 'easy', mode: 'arcade', dueAt: new Date(Date.now() + 3 * DAY).toISOString() });
  const { userId, student } = fake.login({ code: turma.code, name: 'Ana Clara', pin });
  const playId = fake.addPlay({ songId: 'canon' });
  const session: SignedInSession = { status: 'signed-in', userId, anonymous: false };
  const meta = { classId: turma.id, studentId: student.id, taskId: tarefa.id, dueAt: tarefa.dueAt, playId };
  const item = { id: 'entrega-1', blob: new Blob(['som'], { type: 'audio/webm;codecs=opus' }), mimeType: 'audio/webm;codecs=opus', durationMs: 48_250.4, meta };
  return { fake, turma, tarefa, outra, session, item, playId };
}

describe('destino das gravações da entrega', () => {
  it('sobe o áudio na pasta do aluno, com o tipo sem parâmetros, e entrega a tarefa com a partida que vale', async () => {
    const { fake, session, item, playId } = await scene();
    const upload = vi.spyOn(fake, 'uploadSubmissionAudio');
    const submit = vi.spyOn(fake, 'submitAssignment');
    const flushPlays = vi.fn(async () => {});
    await submissionUploadTarget(fake, flushPlays).upload(session, item);
    const path = `${item.meta.classId}/${item.meta.studentId}/${item.meta.taskId}/entrega-1.webm`;
    expect(flushPlays).toHaveBeenCalledWith(session.userId);
    expect(upload).toHaveBeenCalledWith(path, item.blob, 'audio/webm');
    expect(submit).toHaveBeenCalledWith({ assignmentId: item.meta.taskId, playId, audioPath: path, audioDurationMs: 48_250 });
    const [mine] = await fake.getMyAssignments();
    expect(mine.submission).toMatchObject({ playId, audioPath: path });
    expect(fake.audio.has(path)).toBe(true);
  });

  it('sem partida conhecida, o servidor escolhe a melhor que conta', async () => {
    const { fake, session, item, playId } = await scene();
    const { playId: _known, ...meta } = item.meta;
    await submissionUploadTarget(fake, async () => {}).upload(session, { ...item, meta });
    expect((await fake.getMyAssignments())[0].submission?.playId).toBe(playId);
  });

  it('o arquivo que já está lá (409) conta como enviado e a entrega segue', async () => {
    const { fake, session, item } = await scene();
    const api: ClassroomApi = { ...fake, uploadSubmissionAudio: async () => Promise.reject(new ClassroomError('server', { statusCode: '409' })) };
    const submit = vi.spyOn(api, 'submitAssignment');
    await submissionUploadTarget(api, async () => {}).upload(session, item);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('partida que ainda não subiu: a gravação espera, sem subir o áudio', async () => {
    const { fake, session, item } = await scene();
    const upload = vi.spyOn(fake, 'uploadSubmissionAudio');
    const target = submissionUploadTarget(fake, async () => Promise.reject(new Error('1 partida ficou')));
    await expect(target.upload(session, item)).rejects.toMatchObject({ kind: 'transient' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('sem rede espera a fila inteira; servidor fora, só esta; tarefa de outro ou tipo que o bucket não aceita NÃO entram nunca', async () => {
    const { fake, session, item, outra } = await scene();
    const target = submissionUploadTarget(fake, async () => {});
    fake.failNext('offline');
    await expect(target.upload(session, item)).rejects.toMatchObject({ kind: 'offline' });
    fake.failNext('server');
    await expect(target.upload(session, item)).rejects.toMatchObject({ kind: 'transient' });
    // Na pasta do Bruno: a policy (e o fake) recusa
    await expect(target.upload(session, { ...item, meta: { ...item.meta, studentId: outra.student.id } })).rejects.toMatchObject({ kind: 'rejected' });
    await expect(target.upload(session, { ...item, mimeType: 'audio/wav' })).rejects.toBeInstanceOf(UploadError);
    await expect(target.upload(session, { ...item, mimeType: 'audio/wav' })).rejects.toMatchObject({ kind: 'rejected' });
    expect((await fake.getMyAssignments())[0].submission).toBeNull();
  });

  it('na fila: a entrega sem rede fica guardada e sobe quando a rede volta', async () => {
    const { fake, session, item } = await scene();
    let online = false;
    const uploads = createRecordingUploads({
      store: memoryRecordingQueueStore(),
      user: () => session.userId,
      session: async () => session,
      target: () => submissionUploadTarget(fake, async () => {}),
      online: () => online,
    });
    await uploads.enqueue(item);
    await uploads.flush();
    expect(uploads.status('entrega-1')).toBe('queued');
    expect(await uploads.pending(session.userId)).toBe(1);
    online = true;
    await uploads.flush();
    expect(uploads.status('entrega-1')).toBe('sent');
    expect((await fake.getMyAssignments())[0].submission?.audioPath).toMatch(/entrega-1\.webm$/);
  });
});
