import { FIXED_SONGS } from '../game/notation/songs';
import type { ClassroomApi } from '../services/classroom';
import { fakeClassroom } from '../services/classroomFake';

export const DEMO_TEACHER = 'professor';
/** A gravação de mentira: 2 s de silêncio (a duração vem da entrega, como na de verdade). */
export const DEMO_AUDIO_MS = 2000;

/** WAV de 8 kHz, 8 bits, mono, em silêncio: toca no player sem servidor e sem som nos alto-falantes. */
function silentWav(ms: number): Blob {
  const samples = Math.round((8000 * ms) / 1000);
  const wav = new Uint8Array(44 + samples);
  const view = new DataView(wav.buffer);
  const word = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + samples, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  word(36, 'data'); view.setUint32(40, samples, true); wav.fill(128, 44);
  return new Blob([wav], { type: 'audio/wav' });
}

/**
 * O professor do ?turmas=simulada: começa sem turma, com as músicas do app. Para dar o que revisar sem outro aparelho,
 * cada tarefa nova recebe na hora a entrega (partida + gravação) dos dois primeiros alunos ativos; o terceiro fica sem
 * entregar.
 */
export function teacherDemo(): ClassroomApi {
  const api = fakeClassroom({ userId: DEMO_TEACHER, songs: Object.fromEntries(FIXED_SONGS.map((s) => [s.id, s.title])) });
  const pins = new Map<string, string>();
  const audio = URL.createObjectURL(silentWav(DEMO_AUDIO_MS));

  const addStudent = api.addStudent.bind(api);
  api.addStudent = async (classId, name) => {
    const created = await addStudent(classId, name);
    pins.set(created.student.id, created.pin);
    return created;
  };
  const resetStudentPin = api.resetStudentPin.bind(api);
  api.resetStudentPin = async (studentId) => {
    const reset = await resetStudentPin(studentId);
    pins.set(studentId, reset.pin);
    return reset;
  };
  const createAssignment = api.createAssignment.bind(api);
  api.createAssignment = async (input) => {
    const task = await createAssignment(input);
    const klass = await api.getClass(input.classId);
    const senders = klass.students.filter((s) => s.active && pins.has(s.id)).slice(0, 2);
    for (const [i, s] of senders.entries()) {
      const { student } = api.login({ code: klass.code, name: s.name, pin: pins.get(s.id)! });
      api.addPlay({
        songId: task.songId, level: task.level, mode: task.mode,
        score: 4200 - i * 600, accuracy: 94.1 - i * 3, meanAbsCents: 11 + i * 4, stringCents: [-3, 6, -14 - i * 4, 9], durationMs: DEMO_AUDIO_MS,
      });
      const path = `${klass.id}/${student.id}/${task.id}/take${i}.webm`;
      await api.uploadSubmissionAudio(path, new Blob(['audio']), 'audio/webm');
      await api.submitAssignment({ assignmentId: task.id, audioPath: path, audioDurationMs: DEMO_AUDIO_MS });
    }
    api.actAs(DEMO_TEACHER);
    return api.getAssignment(task.id);
  };
  const signed = api.submissionAudioUrl.bind(api);
  api.submissionAudioUrl = async (path) => {
    await signed(path);
    return audio;
  };
  return api;
}
