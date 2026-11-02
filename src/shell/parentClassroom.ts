import { fakeClassroom } from '../services/classroomFake';
import { supabaseClassroom, type ClassroomApi } from '../services/classroom';
import { supabase } from '../services/supabase';
import { DEV_TOOLS } from './devTools';

/** Um cenário só de responsável: o convite ainda não foi aceito ao abrir a página. */
export async function parentDemo() {
  const api = fakeClassroom({ songs: { 'brilha-brilha-estrelinha': 'Brilha Brilha Estrelinha' } });
  api.actAs('professor');
  const klass = await api.createClass('Violino da tarde');
  const { student, pin } = await api.addStudent(klass.id, 'Ana');
  const task = await api.createAssignment({ classId: klass.id, songId: 'brilha-brilha-estrelinha', level: 'easy', mode: 'arcade', dueAt: new Date(Date.now() + 86400000).toISOString() });
  const invite = await api.createGuardianInvite(student.id);
  api.login({ code: klass.code, name: student.name, pin });
  const playId = api.addPlay({ songId: task.songId, accuracy: 92 });
  const path = `${klass.id}/${student.id}/${task.id}/take.webm`;
  await api.uploadSubmissionAudio(path, new Blob(['audio']), 'audio/webm');
  const submitted = await api.submitAssignment({ assignmentId: task.id, playId, audioPath: path });
  api.actAs('professor');
  await api.reviewSubmission({ submissionId: submitted.submission!.id, concept: 'muito-bom', comment: 'Continue praticando com calma!' });
  api.actAs('responsavel');
  // WAV curto e válido: permite exercitar o player nativo sem servidor nem som nos alto-falantes.
  const wav = new Uint8Array(844);
  const view = new DataView(wav.buffer);
  const word = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 836, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  word(36, 'data'); view.setUint32(40, 800, true); wav.fill(128, 44);
  const signed = api.submissionAudioUrl.bind(api);
  api.submissionAudioUrl = async (audioPath) => { await signed(audioPath); return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })); };
  return { api, invite };
}

let demo: ReturnType<typeof parentDemo> | undefined;
export function isParentDemo(search = window.location.search) {
  return DEV_TOOLS && new URLSearchParams(search).get('turmas') === 'simulada';
}
export async function parentClassroom(): Promise<ClassroomApi> {
  if (isParentDemo()) return (await (demo ??= parentDemo())).api;
  return supabaseClassroom(supabase);
}
