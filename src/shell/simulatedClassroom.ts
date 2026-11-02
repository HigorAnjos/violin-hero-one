import { ClassroomError, type ClassroomErrorKind, type StudentLoginClient } from '../services/classroom';
import { fakeClassroom, type FakeClassroom } from '../services/classroomFake';
import { FIXED_SONGS } from '../game/notation/songs';
import { PLAY_MODE_OF } from '../services/progress';
import type { ClassroomShell } from './classroom';

/** O código que a class-login devolve para cada erro (o inverso de LOGIN_ERRORS do contrato). */
const LOGIN_CODES: Partial<Record<ClassroomErrorKind, string>> = {
  'invalid-credentials': 'invalid_credentials',
  'too-many-attempts': 'too_many_attempts',
  'class-closed': 'class_closed',
};

const DAY = 86400e3;

/**
 * Turma de mentira para o desenvolvimento e o e2e (?turmas=simulada, sem backend): a Profª Helena com a turma
 * "Iniciantes · sábado" (código ADGK-NRUX), os alunos Ana Clara (PIN 1000), Bruno (1001) e Davi (1002), duas tarefas
 * a fazer e uma já revisada da Ana. O aparelho começa como convidado; entrar pela turma troca para o aluno. Resolve
 * com a cena montada: uma entrada no meio dela trocaria o usuário do fake antes da hora.
 */
export async function simulatedClassroom(): Promise<ClassroomShell> {
  const titles = Object.fromEntries(FIXED_SONGS.map((s) => [s.id, s.title]));
  const fake = fakeClassroom({ songs: titles, userId: 'professora-helena' });
  const due = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  await (async () => {
    const turma = await fake.createClass('Iniciantes · sábado');
    await fake.addStudent(turma.id, 'Ana Clara');
    await fake.addStudent(turma.id, 'Bruno');
    await fake.addStudent(turma.id, 'Davi');
    const done = await fake.createAssignment({ classId: turma.id, songId: 'brilha-brilha-estrelinha', level: 'easy', mode: 'arcade', dueAt: due(2), instructionKey: 'atencao-ritmo' });
    await fake.createAssignment({ classId: turma.id, songId: 'ode-a-alegria', level: 'easy', mode: 'sheet', dueAt: due(4), instructionText: 'Capriche no ritmo do compasso 4.' });
    await fake.createAssignment({ classId: turma.id, songId: 'escala-re-maior', level: 'easy', mode: 'arcade', dueAt: due(6), instructionKey: 'tocar-inteira' });
    // A Ana já entregou a primeira e a professora revisou
    fake.login({ code: turma.code, name: 'Ana Clara', pin: '1000' });
    fake.addPlay({ songId: 'brilha-brilha-estrelinha', score: 8200, accuracy: 91 });
    const entregue = await fake.submitAssignment({ assignmentId: done.id });
    fake.actAs('professora-helena');
    await fake.reviewSubmission({ submissionId: entregue.submission!.id, concept: 'muito-bom', comment: 'O ritmo está ótimo! Só a nota longa do fim está caindo de afinação.' });
    fake.actAs('convidado', { anonymous: true });
  })().catch((error: unknown) => console.error('[turma simulada] a cena não montou', error));
  return fakeClassroomShell(fake);
}

/** A turma das telas em cima do fake (também nos testes): a class-login vira o login do fake. */
export function fakeClassroomShell(fake: FakeClassroom): ClassroomShell {
  const played = new Set<string>();
  const loginClient = {
    auth: { setSession: async () => ({ data: { session: null, user: null }, error: null }) },
    functions: {
      async invoke(_name: string, { body }: { body: { code: string; name: string; pin: string } }) {
        try {
          const { userId, student } = fake.login(body);
          return {
            data: {
              session: { access_token: userId, refresh_token: userId },
              user_id: userId,
              student: { id: student.id, name: student.name, class_id: student.classId, class_name: student.className },
            },
            error: null,
          };
        } catch (error) {
          const code = error instanceof ClassroomError ? LOGIN_CODES[error.kind] : undefined;
          return { data: null, error: { name: 'FunctionsHttpError', context: { json: async () => ({ error: { code: code ?? 'server' } }) } } };
        }
      },
    },
  } as unknown as StudentLoginClient;

  return {
    api: fake,
    loginClient,
    sessionClient: null,
    // Sem servidor, a partida da tarefa entra direto no fake (o submit_play que a fila faria)
    flushPlays: async () => {},
    playedTask(play) {
      if (played.has(play.clientId)) return;
      played.add(play.clientId);
      fake.addPlay({ songId: play.songId, level: play.level, mode: PLAY_MODE_OF[play.mode], score: play.score, accuracy: play.accuracy });
    },
  };
}
