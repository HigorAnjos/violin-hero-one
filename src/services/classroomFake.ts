// Turmas de mentira, em memória, para os testes das telas de professor, aluno e responsável e para o ?turmas=simulada.
//
// ?turmas=simulada (só no dev e no build --mode e2e; DEV_TOOLS): cada área monta a sua cena, cada uma com o seu fake,
// e elas não se enxergam: a do professor (shell/teacherClassroom → teacherDemo, um professor sem turma que recebe as
// entregas na hora), a do aluno (shell/classroom → simulatedClassroom, a Profª Helena com a turma ADGK-NRUX e a entrada
// por código + nome + PIN) e a do responsável (shell/parentClassroom → parentDemo). Pega na primeira tela e vale até
// recarregar. Sempre por import() atrás da condição literal (import.meta.env.DEV || MODE === 'e2e'): o build de
// produção apaga o fake antes de dividir os pedaços.
//
// Segue as regras do banco (0011–0014) que a tela enxerga: quem é professor,
// turma de outro dá 'not-found', limites do plano free, nome repetido, PIN de 4 dígitos visto uma vez, bloqueio depois
// de 5 erros, partida que conta para a tarefa, revisão que fecha a entrega, convite de responsável de uso único.
// Quem está usando muda com actAs (ou com login, como a class-login faria).
import type { Level } from '../game/notation/song';
import {
  ClassroomError,
  type Assignment,
  type AssignmentDetail,
  type AssignmentStatus,
  type Child,
  type ClassDetail,
  type ClassroomApi,
  type ClassroomErrorKind,
  type ClassStudent,
  type InstructionKey,
  type Plan,
  type Review,
  type StudentAssignment,
  type StudentCredentials,
  type StudentLoginResult,
  type StudentProgress,
  type AssignmentMode,
  SUBMISSION_AUDIO_MAX_BYTES,
  ASSIGNMENT_INSTRUCTIONS,
  ASSIGNMENT_MAX_DAYS,
  INSTRUCTION_TEXT_MAX,
  REVIEW_COMMENT_MAX,
  REVIEW_CONCEPTS,
} from './classroom';

export const FAKE_PLANS: Plan[] = [
  { id: 'free', name: 'Grátis', maxOpenClasses: 2, maxStudentsPerClass: 10 },
  { id: 'pro', name: 'Pro professor', maxOpenClasses: 20, maxStudentsPerClass: 40 },
];

interface FakeClass {
  id: string;
  teacherId: string;
  name: string;
  code: string;
  createdAt: string;
  closedAt: string | null;
}

interface FakeMember {
  id: string;
  classId: string;
  name: string;
  userId: string | null;
  active: boolean;
  pin: string;
  createdAt: string;
  failures: number;
}

interface FakePlay {
  id: string;
  userId: string;
  songId: string;
  level: Level;
  mode: string;
  score: number;
  accuracy: number;
  finished: boolean;
  playedAt: string;
  meanAbsCents: number | null;
  stringCents: (number | null)[];
  durationMs: number;
}

interface FakeSubmission {
  id: string;
  assignmentId: string;
  memberId: string;
  playId: string;
  audioPath: string | null;
  audioDurationMs: number | null;
  submittedAt: string;
  review: Review | null;
}

export interface FakePlayInput {
  songId: string;
  level?: Level;
  mode?: string;
  score?: number;
  accuracy?: number;
  finished?: boolean;
  playedAt?: string;
  /** Afinação da partida (o padrão é ±8 ¢, todas as cordas afinadas) e duração (o padrão, 30 s). */
  meanAbsCents?: number | null;
  stringCents?: (number | null)[];
  durationMs?: number;
}

export interface FakeClassroom extends ClassroomApi {
  /** Quem está usando: professor, aluno (o userId que login devolveu) ou responsável. */
  actAs(userId: string, options?: { anonymous?: boolean }): void;
  /** O que a class-login faria; o aluno vira o usuário atual. */
  login(credentials: StudentCredentials): StudentLoginResult;
  /** Partida do usuário atual, como submit_play gravaria (agora, terminada, arcade, fácil, 100 pontos). */
  addPlay(play: FakePlayInput): string;
  /** Plano do professor (o padrão é free). */
  setPlan(teacherId: string, planId: string): void;
  /** A próxima chamada falha com esse motivo. */
  failNext(kind: ClassroomErrorKind): void;
  /** O que foi enviado ao bucket, por caminho. */
  readonly audio: Map<string, Blob>;
}

const NAME_KEY = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * `songs`: músicas do catálogo que a tarefa pode pedir (id → título, com os 3 níveis). `userId`: quem começa usando.
 * Códigos, PINs e ids saem em sequência (previsíveis nos testes): turma AAAA2345…, PIN 1000, 1001…
 */
export function fakeClassroom({
  songs = { 'brilha-brilha': 'Brilha, brilha estrelinha' },
  userId = 'professor-1',
  anonymous = false,
  now = () => new Date(),
}: { songs?: Record<string, string>; userId?: string; anonymous?: boolean; now?: () => Date } = {}): FakeClassroom {
  let me = userId;
  let meAnonymous = anonymous;
  let failure: ClassroomErrorKind | null = null;
  let seq = 0;
  let pinSeq = 1000;
  const next = (prefix: string) => `${prefix}-${++seq}`;
  const iso = () => now().toISOString();

  const classes: FakeClass[] = [];
  const members: FakeMember[] = [];
  const assignments: Assignment[] = [];
  const plays: FakePlay[] = [];
  const submissions: FakeSubmission[] = [];
  const invites = new Map<string, { memberId: string; expiresAt: string; usedBy: string | null }>();
  const guardians: { guardianId: string; memberId: string }[] = [];
  const plans = new Map<string, string>();
  const audio = new Map<string, Blob>();

  const fail = (kind: ClassroomErrorKind): never => {
    throw new ClassroomError(kind);
  };
  async function run<T>(fn: () => T): Promise<T> {
    if (failure) {
      const kind = failure;
      failure = null;
      fail(kind);
    }
    return fn();
  }

  const isStudent = (uid: string) => members.some((m) => m.userId === uid);
  const requireAccount = () => {
    if (meAnonymous || isStudent(me)) fail('needs-account');
    return me;
  };
  const planOf = (teacherId: string) => FAKE_PLANS.find((p) => p.id === (plans.get(teacherId) ?? 'free')) ?? FAKE_PLANS[0];
  const ownClass = (classId: string) => classes.find((k) => k.id === classId && k.teacherId === requireAccount()) ?? fail('not-found');
  const ownMember = (memberId: string) => {
    const m = members.find((x) => x.id === memberId) ?? fail('not-found');
    ownClass(m.classId);
    return m;
  };
  const classOfMember = (m: FakeMember) => classes.find((k) => k.id === m.classId)!;
  const myMember = () => members.find((m) => m.userId === me && m.active) ?? null;

  const student = (m: FakeMember): ClassStudent => ({ id: m.id, name: m.name, active: m.active, joined: m.userId !== null, createdAt: m.createdAt });
  const classView = (k: FakeClass): ClassDetail => ({
    ...k,
    students: members
      .filter((m) => m.classId === k.id)
      .sort((a, b) => Number(!a.active) - Number(!b.active) || NAME_KEY(a.name).localeCompare(NAME_KEY(b.name)))
      .map(student),
  });

  const checkStudentLimit = (k: FakeClass) => {
    if (members.filter((m) => m.classId === k.id && m.active).length >= planOf(k.teacherId).maxStudentsPerClass) fail('limit');
  };
  const checkName = (k: FakeClass, name: string, except?: string) => {
    if (members.some((m) => m.classId === k.id && m.active && m.id !== except && NAME_KEY(m.name) === NAME_KEY(name))) fail('duplicate');
  };
  const newPin = () => String(pinSeq++ % 10000).padStart(4, '0');

  const counts = (p: FakePlay, a: Assignment, uid: string | null) =>
    p.userId === uid && p.finished && p.songId === a.songId && p.level === a.level && p.mode === a.mode &&
    p.playedAt >= a.createdAt && p.playedAt <= a.dueAt;
  const best = (a: Assignment, uid: string | null) =>
    plays.filter((p) => counts(p, a, uid)).sort((x, y) => y.score - x.score)[0] ?? null;
  const fresh = (a: Assignment): Assignment => ({ ...a, closed: a.dueAt <= iso() });
  const tuning = (p: FakePlay) => ({ meanAbsCents: p.meanAbsCents, stringCents: p.stringCents, durationMs: p.durationMs });
  const status = (a: Assignment, m: FakeMember): AssignmentStatus => {
    const b = best(a, m.userId);
    const s = submissions.find((x) => x.assignmentId === a.id && x.memberId === m.id);
    const play = s ? plays.find((p) => p.id === s.playId) : undefined;
    return {
      best: b ? { playId: b.id, score: b.score, accuracy: b.accuracy, playedAt: b.playedAt, ...tuning(b) } : null,
      submission: s
        ? {
            id: s.id, playId: s.playId, score: play?.score ?? null, accuracy: play?.accuracy ?? null, submittedAt: s.submittedAt,
            audioPath: s.audioPath, audioDeleted: false, audioDurationMs: s.audioDurationMs,
            ...(play ? tuning(play) : { meanAbsCents: null, stringCents: [], durationMs: null }),
          }
        : null,
      review: s?.review ?? null,
    };
  };
  const detail = (a: Assignment): AssignmentDetail => ({
    ...fresh(a),
    students: members
      .filter((m) => m.classId === a.classId && m.active)
      .sort((x, y) => NAME_KEY(x.name).localeCompare(NAME_KEY(y.name)))
      .map((m) => ({ studentId: m.id, name: m.name, ...status(a, m) })),
  });
  const studentAssignment = (a: Assignment, m: FakeMember): StudentAssignment => ({ ...fresh(a), ...status(a, m) });
  const child = (m: FakeMember): Child => {
    const k = classOfMember(m);
    return { studentId: m.id, name: m.name, className: k.name, classClosed: k.closedAt !== null };
  };
  const audioParts = (path: string) => {
    const [classId, memberId, assignmentId, file, extra] = path.split('/');
    return extra === undefined && file && /^[A-Za-z0-9_-]{1,64}\.(webm|ogg|m4a|mp4)$/.test(file) ? { classId, memberId, assignmentId } : null;
  };
  const canRead = (path: string) => {
    const parts = audioParts(path);
    const m = parts && members.find((x) => x.id === parts.memberId && x.classId === parts.classId);
    if (!m || !assignments.some((a) => a.id === parts.assignmentId && a.classId === m.classId)) return false;
    return m.userId === me || classOfMember(m).teacherId === me || (m.active && guardians.some((g) => g.memberId === m.id && g.guardianId === me));
  };

  return {
    audio,
    actAs(userId, options = {}) {
      me = userId;
      meAnonymous = options.anonymous ?? false;
    },
    login({ code, name, pin }) {
      const k = classes.find((x) => x.code === code.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
      const m = k && members.find((x) => x.classId === k.id && x.active && NAME_KEY(x.name) === NAME_KEY(name));
      if (m && m.failures >= 5) fail('too-many-attempts');
      if (!m || m.pin !== pin) {
        if (m) m.failures++;
        fail('invalid-credentials');
      }
      m!.failures = 0;
      if (k!.closedAt) fail('class-closed');
      m!.userId ??= next('aluno');
      me = m!.userId!;
      meAnonymous = false;
      return { userId: me, student: { id: m!.id, name: m!.name, classId: k!.id, className: k!.name } };
    },
    addPlay({
      songId, level = 'easy', mode = 'arcade', score = 100, accuracy = 100, finished = true, playedAt = iso(),
      meanAbsCents = 8, stringCents = [0, 0, 0, 0], durationMs = 30_000,
    }) {
      const id = next('partida');
      plays.push({ id, userId: me, songId, level, mode, score, accuracy, finished, playedAt, meanAbsCents, stringCents, durationMs });
      return id;
    },
    setPlan(teacherId, planId) {
      plans.set(teacherId, planId);
    },
    failNext(kind) {
      failure = kind;
    },

    createClass: (name) =>
      run(() => {
        const teacherId = requireAccount();
        const clean = name.trim().replace(/\s+/g, ' ');
        if (!clean || clean.length > 60) fail('refused');
        if (classes.filter((k) => k.teacherId === teacherId && !k.closedAt).length >= planOf(teacherId).maxOpenClasses) fail('limit');
        const n = classes.length;
        const code = Array.from({ length: 8 }, (_, i) => CODE_ALPHABET[(n * 7 + i * 3 + (i < 4 ? 0 : n)) % 32]).join('');
        const k: FakeClass = { id: next('turma'), teacherId, name: clean, code, createdAt: iso(), closedAt: null };
        classes.push(k);
        return classView(k);
      }),
    listMyClasses: () =>
      run(() =>
        classes
          .filter((k) => k.teacherId === me)
          .map((k) => ({ ...k, studentCount: members.filter((m) => m.classId === k.id && m.active).length }))
          .reverse(),
      ),
    getClass: (classId) => run(() => classView(ownClass(classId))),
    addStudent: (classId, name) =>
      run(() => {
        const k = ownClass(classId);
        if (k.closedAt) fail('refused');
        const clean = name.trim().replace(/\s+/g, ' ');
        if (!clean || clean.length > 40) fail('refused');
        checkStudentLimit(k);
        checkName(k, clean);
        const m: FakeMember = { id: next('aluno-turma'), classId, name: clean, userId: null, active: true, pin: newPin(), createdAt: iso(), failures: 0 };
        members.push(m);
        return { student: student(m), pin: m.pin };
      }),
    resetStudentPin: (studentId) =>
      run(() => {
        const m = ownMember(studentId);
        if (classOfMember(m).closedAt || !m.active) fail('refused');
        m.pin = newPin();
        m.failures = 0;
        return { studentId: m.id, pin: m.pin };
      }),
    setStudentActive: (studentId, active) =>
      run(() => {
        const m = ownMember(studentId);
        const k = classOfMember(m);
        if (k.closedAt) fail('refused');
        if (active && !m.active) {
          checkStudentLimit(k);
          checkName(k, m.name, m.id);
        }
        m.active = active;
        return classView(k);
      }),
    removeStudent: (studentId) =>
      run(() => {
        const m = ownMember(studentId);
        members.splice(members.indexOf(m), 1);
        for (let i = submissions.length - 1; i >= 0; i--) if (submissions[i].memberId === m.id) submissions.splice(i, 1);
        for (let i = guardians.length - 1; i >= 0; i--) if (guardians[i].memberId === m.id) guardians.splice(i, 1);
      }),
    closeClass: (classId) =>
      run(() => {
        const k = ownClass(classId);
        k.closedAt ??= iso();
        return classView(k);
      }),
    createAssignment: (input) =>
      run(() => {
        const k = ownClass(input.classId);
        if (k.closedAt) fail('refused');
        if (!(input.songId in songs)) fail('not-found');
        const due = new Date(input.dueAt).getTime();
        if ((input.mode as string) === 'practice' || !(due > now().getTime()) || due > now().getTime() + ASSIGNMENT_MAX_DAYS * 86400e3) fail('refused');
        if (input.instructionKey && !(input.instructionKey in ASSIGNMENT_INSTRUCTIONS)) fail('refused');
        const text = input.instructionText?.trim().replace(/\s+/g, ' ') || null;
        if (text && text.length > INSTRUCTION_TEXT_MAX) fail('refused');
        const a: Assignment = {
          id: next('tarefa'),
          classId: k.id,
          songId: input.songId,
          songTitle: songs[input.songId],
          level: input.level,
          mode: input.mode as AssignmentMode,
          instructionKey: (input.instructionKey ?? null) as InstructionKey | null,
          instructionText: text,
          createdAt: iso(),
          dueAt: new Date(due).toISOString(),
          closed: false,
        };
        assignments.push(a);
        return detail(a);
      }),
    listClassAssignments: (classId) =>
      run(() => {
        ownClass(classId);
        return assignments
          .filter((a) => a.classId === classId)
          .reverse()
          .map((a) => {
            const d = detail(a);
            return {
              ...fresh(a),
              studentCount: d.students.length,
              submittedCount: d.students.filter((s) => s.submission).length,
              reviewedCount: d.students.filter((s) => s.review).length,
            };
          });
      }),
    getAssignment: (assignmentId) =>
      run(() => {
        const a = assignments.find((x) => x.id === assignmentId) ?? fail('not-found');
        ownClass(a.classId);
        return detail(a);
      }),
    reviewSubmission: ({ submissionId, grade = null, concept = null, comment = '' }) =>
      run(() => {
        requireAccount();
        const s = submissions.find((x) => x.id === submissionId) ?? fail('not-found');
        ownClass(assignments.find((a) => a.id === s.assignmentId)!.classId);
        const clean = comment.trim().replace(/\s+/g, ' ');
        if ((grade === null) === (concept === null)) fail('refused');
        if (grade !== null && !(Number.isInteger(grade) && grade >= 1 && grade <= 5)) fail('refused');
        if (concept !== null && !(concept in REVIEW_CONCEPTS)) fail('refused');
        if (clean.length > REVIEW_COMMENT_MAX) fail('refused');
        s.review = { grade, concept, comment: clean, reviewedAt: iso() };
        return { ...s.review, submissionId: s.id };
      }),
    createGuardianInvite: (studentId) =>
      run(() => {
        const m = ownMember(studentId);
        if (!m.active || classOfMember(m).closedAt) fail('refused');
        const open = [...invites.entries()].find(([, i]) => i.memberId === m.id && !i.usedBy && i.expiresAt > iso());
        if (open) return { code: open[0], expiresAt: open[1].expiresAt };
        const code = `RESP${String(invites.size + 1).padStart(6, '2')}`.replace(/[01]/g, '2');
        const expiresAt = new Date(now().getTime() + 7 * 86400e3).toISOString();
        invites.set(code, { memberId: m.id, expiresAt, usedBy: null });
        return { code, expiresAt };
      }),
    listPlans: () => run(() => FAKE_PLANS),
    getMyPlan: () =>
      run(() => ({ plan: planOf(me), openClasses: classes.filter((k) => k.teacherId === me && !k.closedAt).length })),
    getMyClass: () =>
      run(() => {
        const m = myMember();
        if (!m) return null;
        const k = classOfMember(m);
        return { studentId: m.id, name: m.name, classId: k.id, className: k.name, closedAt: k.closedAt };
      }),
    getMyAssignments: () =>
      run(() => {
        const m = myMember();
        if (!m) return [];
        return assignments
          .filter((a) => a.classId === m.classId)
          .map((a) => studentAssignment(a, m))
          .sort((x, y) => Number(x.closed) - Number(y.closed) || x.dueAt.localeCompare(y.dueAt));
      }),
    submitAssignment: ({ assignmentId, playId = null, audioPath = null, audioDurationMs = null }) =>
      run(() => {
        const m = myMember();
        const a = assignments.find((x) => x.id === assignmentId && x.classId === m?.classId) ?? fail('not-found');
        if (classOfMember(m!).closedAt) fail('refused');
        const play = playId ? plays.find((p) => p.id === playId && counts(p, a, me)) : best(a, me);
        if (!play) fail('refused');
        const parts = audioPath ? audioParts(audioPath) : null;
        if (audioPath && (!parts || parts.classId !== a.classId || parts.memberId !== m!.id || parts.assignmentId !== a.id)) fail('refused');
        const duration = audioPath ? audioDurationMs : null;
        if (duration !== null && !(duration >= 0 && duration <= 4 * 3600e3)) fail('refused');
        let s = submissions.find((x) => x.assignmentId === a.id && x.memberId === m!.id);
        if (s?.review) fail('refused');
        if (!s) {
          s = { id: next('entrega'), assignmentId: a.id, memberId: m!.id, playId: play!.id, audioPath, audioDurationMs: duration, submittedAt: iso(), review: null };
          submissions.push(s);
        } else Object.assign(s, { playId: play!.id, audioPath, audioDurationMs: duration, submittedAt: iso() });
        return studentAssignment(a, m!);
      }),
    acceptGuardianInvite: (code) =>
      run(() => {
        const guardianId = requireAccount();
        const invite = invites.get(code.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
        const m = invite && members.find((x) => x.id === invite.memberId && x.active);
        if (!invite || !m || classOfMember(m).closedAt || (invite.usedBy && invite.usedBy !== guardianId) || (!invite.usedBy && invite.expiresAt <= iso())) {
          fail('not-found');
        }
        if (!guardians.some((g) => g.guardianId === guardianId && g.memberId === m!.id)) {
          if (guardians.filter((g) => g.memberId === m!.id).length >= 4) fail('limit');
          guardians.push({ guardianId, memberId: m!.id });
        }
        invite!.usedBy = guardianId;
        return child(m!);
      }),
    listMyChildren: () =>
      run(() =>
        guardians
          .filter((g) => g.guardianId === me)
          .map((g) => members.find((m) => m.id === g.memberId && m.active))
          .filter((m): m is FakeMember => !!m)
          .map(child),
      ),
    getStudentProgress: (studentId) =>
      run((): StudentProgress => {
        const m = members.find((x) => x.id === studentId) ?? fail('not-found');
        const k = classOfMember(m);
        const allowed = k.teacherId === me || (m.active && guardians.some((g) => g.memberId === m.id && g.guardianId === me));
        if (!allowed) fail('not-found');
        const mine = plays.filter((p) => p.userId === m.userId && p.songId in songs).sort((x, y) => y.playedAt.localeCompare(x.playedAt));
        const records = new Map<string, FakePlay>();
        for (const p of mine) {
          const key = `${p.songId}:${p.level}`;
          if (p.finished && p.mode !== 'practice' && (!records.has(key) || records.get(key)!.score < p.score)) records.set(key, p);
        }
        return {
          student: child(m),
          streak: mine.length ? { currentDays: 1, bestDays: 1, lastDay: mine[0].playedAt.slice(0, 10) } : null,
          minutesLast7Days: 0,
          records: [...records.values()].map((p) => ({ songId: p.songId, songTitle: songs[p.songId], level: p.level, score: p.score, accuracy: p.accuracy, updatedAt: p.playedAt })),
          recentPlays: mine.slice(0, 20).map((p) => ({
            playId: p.id, songId: p.songId, songTitle: songs[p.songId], level: p.level, mode: p.mode as StudentProgress['recentPlays'][number]['mode'],
            score: p.score, accuracy: p.accuracy, finished: p.finished, playedAt: p.playedAt,
          })),
          assignments: assignments.filter((a) => a.classId === m.classId).reverse().map((a) => studentAssignment(a, m)),
        };
      }),
    uploadSubmissionAudio: (path, blob) =>
      run(() => {
        if (blob.size > SUBMISSION_AUDIO_MAX_BYTES) fail('refused');
        const parts = audioParts(path);
        const m = parts && members.find((x) => x.id === parts.memberId && x.classId === parts.classId && x.userId === me && x.active);
        const reviewed = m && submissions.some((s) => s.memberId === m.id && s.assignmentId === parts!.assignmentId && s.review);
        if (!m || reviewed || classOfMember(m).closedAt || !assignments.some((a) => a.id === parts!.assignmentId && a.classId === m.classId) || audio.has(path)) {
          fail('not-found');
        }
        audio.set(path, blob);
      }),
    submissionAudioUrl: (path) =>
      run(() => {
        if (!audio.has(path) || !canRead(path)) fail('not-found');
        return `fake-audio://${path}`;
      }),
  };
}
