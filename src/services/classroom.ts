import type { SupabaseClient } from '@supabase/supabase-js';
import { LEVELS, type Level } from '../game/notation/song';
import { deviceData, type DeviceData } from './deviceData';
import type { PlayMode } from './progress';
import type { SessionState } from './session';

export { isStudentEmail } from './session';

/**
 * Turmas (ciclo 5): o contrato que as telas de professor, aluno e responsável usam. O servidor decide tudo
 * (supabase/migrations/0011–0014, Edge Function class-login): quem vê o quê, limites do plano, qual partida conta para
 * a tarefa. O nome do aluno é dado de criança: só o professor da turma, o próprio aluno e o responsável dele recebem;
 * lá fora (ranking, desafio) o aluno é o nome gerado de sempre. Nada de e-mail em resposta nenhuma.
 *
 * Papéis: professor e responsável são contas com e-mail (nem anônimas nem de aluno; senão 'needs-account'). O aluno
 * entra sem e-mail por studentLogin (código da turma + nome + PIN) e vira um usuário próprio do aparelho, como quem
 * entra numa conta: a fila do anônimo que estava aqui sobe antes, na conta anônima, e nada dele passa para o aluno.
 *
 * Telas testam com fakeClassroom (classroomFake.ts), que segue as mesmas regras em memória.
 */

// ---------- planos ----------
export interface Plan {
  id: string;
  name: string;
  /** Turmas abertas ao mesmo tempo (encerrada não conta). */
  maxOpenClasses: number;
  /** Alunos ativos por turma. */
  maxStudentsPerClass: number;
}

export interface MyPlan {
  plan: Plan;
  openClasses: number;
}

// ---------- turma ----------
export interface ClassStudent {
  id: string;
  /** Como o professor cadastrou; o aluno digita igual no login (acento, maiúscula e espaço não contam). */
  name: string;
  /** Inativo: tirado da turma; não entra, não aparece nas tarefas nem para o responsável. */
  active: boolean;
  /** Já entrou ao menos uma vez (tem usuário). */
  joined: boolean;
  createdAt: string;
}

export interface ClassDetail {
  id: string;
  name: string;
  /** 8 símbolos (sem 0/O/1/I); a tela pode mostrar como ABCD-EFGH, o login aceita com ou sem hífen. */
  code: string;
  createdAt: string;
  closedAt: string | null;
  /** Ativos primeiro, por nome. */
  students: ClassStudent[];
}

export interface ClassSummary {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  closedAt: string | null;
  studentCount: number;
}

/** O PIN só existe nesta resposta (e na de resetStudentPin): o banco guarda o hash. */
export interface NewStudent {
  student: ClassStudent;
  pin: string;
}

/** A turma do aluno da sessão. */
export interface MyClass {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  closedAt: string | null;
}

// ---------- tarefas ----------
/** Instruções prontas da tarefa (mesmos ids do check de violinhero.assignments). */
export const ASSIGNMENT_INSTRUCTIONS = {
  'tocar-inteira': 'Toque a música inteira, do começo ao fim.',
  'capricha-afinacao': 'Capriche na afinação.',
  'devagar-primeiro': 'Pratique devagar antes de tocar valendo.',
  'atencao-ritmo': 'Preste atenção no ritmo.',
  'grave-com-calma': 'Grave com calma, num lugar silencioso.',
} as const;
export type InstructionKey = keyof typeof ASSIGNMENT_INSTRUCTIONS;
export const INSTRUCTION_TEXT_MAX = 140;

/** Conceitos da revisão (mesmos ids do check de violinhero.reviews); a outra opção é nota de 1 a 5. */
export const REVIEW_CONCEPTS = {
  otimo: 'Ótimo',
  'muito-bom': 'Muito bom',
  bom: 'Bom',
  'precisa-praticar': 'Precisa praticar',
} as const;
export type ReviewConcept = keyof typeof REVIEW_CONCEPTS;
export const REVIEW_COMMENT_MAX = 280;

/** Prática não vale para tarefa (não termina valendo). */
export type AssignmentMode = Exclude<PlayMode, 'practice'>;

/** Prazo da tarefa: até 60 dias depois de criada. */
export const ASSIGNMENT_MAX_DAYS = 60;

export interface Assignment {
  id: string;
  classId: string;
  songId: string;
  songTitle: string;
  level: Level;
  mode: AssignmentMode;
  instructionKey: InstructionKey | null;
  /** Texto do professor, visível só na turma. */
  instructionText: string | null;
  createdAt: string;
  dueAt: string;
  /** Prazo passou: partida nova não conta mais (a entrega da que contou ainda pode chegar). */
  closed: boolean;
}

/**
 * Melhor partida do aluno que conta para a tarefa: terminada, música + nível + modo da tarefa, jogada depois de a
 * tarefa existir e chegada ao servidor até o prazo (partida feita sem rede que só subiu depois do prazo não conta).
 */
export interface BestPlay extends PlayTuning {
  playId: string;
  score: number;
  accuracy: number;
  playedAt: string;
}

/** Afinação e duração da partida (0017); opcionais para quem monta a situação sem elas (fakes, testes antigos). */
export interface PlayTuning {
  /** Desvio médio absoluto dos acertos, em cents; null sem acerto. */
  meanAbsCents?: number | null;
  /** Afinação média por corda (Sol, Ré, Lá, Mi), em cents com sinal (+ alto, − baixo); null na corda sem acerto. */
  stringCents?: (number | null)[];
  durationMs?: number | null;
}

export interface Submission extends PlayTuning {
  id: string;
  playId: string | null;
  score: number | null;
  accuracy: number | null;
  submittedAt: string;
  /** Caminho no bucket submissions; null sem gravação ou depois da retenção. */
  audioPath: string | null;
  /** A retenção já apagou o áudio (30 dias depois da revisão). */
  audioDeleted: boolean;
  /** Duração que o aparelho gravou (o webm do MediaRecorder sai sem duração); null sem ela. */
  audioDurationMs?: number | null;
}

export interface Review {
  /** Nota de 1 a 5, ou null quando a revisão é por conceito. */
  grade: number | null;
  concept: ReviewConcept | null;
  comment: string;
  reviewedAt: string;
}

export interface AssignmentStatus {
  best: BestPlay | null;
  submission: Submission | null;
  review: Review | null;
}

/** A tarefa do ponto de vista de um aluno (o próprio, ou o filho para o responsável). */
export type StudentAssignment = Assignment & AssignmentStatus;

export type AssignmentStudentRow = AssignmentStatus & { studentId: string; name: string };

/** A tarefa para o professor: a situação de cada aluno ativo. */
export type AssignmentDetail = Assignment & { students: AssignmentStudentRow[] };

export type AssignmentSummary = Assignment & { studentCount: number; submittedCount: number; reviewedCount: number };

export interface NewAssignment {
  classId: string;
  songId: string;
  level: Level;
  mode: AssignmentMode;
  dueAt: string;
  instructionKey?: InstructionKey | null;
  instructionText?: string | null;
}

export interface ReviewInput {
  submissionId: string;
  /** Uma das duas: nota de 1 a 5 ou conceito. */
  grade?: number | null;
  concept?: ReviewConcept | null;
  comment?: string;
}

export interface SubmitInput {
  assignmentId: string;
  /** Partida escolhida (precisa contar); sem ela, o servidor pega a melhor que conta. */
  playId?: string | null;
  /** Caminho já enviado com uploadSubmissionAudio (submissionAudioPath); sem gravação, nada. */
  audioPath?: string | null;
  /** O durationMs da gravação (só vale com audioPath). */
  audioDurationMs?: number | null;
}

// ---------- responsável ----------
export interface GuardianInvite {
  /** 10 símbolos, uso único, vale 7 dias; pedir de novo devolve o mesmo enquanto valer. */
  code: string;
  expiresAt: string;
}

export interface Child {
  studentId: string;
  name: string;
  className: string;
  classClosed: boolean;
}

export interface ProgressRecord {
  songId: string;
  songTitle: string;
  level: Level;
  score: number;
  accuracy: number;
  updatedAt: string;
}

export interface ProgressPlay {
  playId: string;
  songId: string;
  songTitle: string;
  level: Level;
  mode: PlayMode;
  score: number;
  accuracy: number;
  finished: boolean;
  playedAt: string;
}

/** Progresso do aluno para o professor da turma e o responsável; só músicas do catálogo (as próprias são privadas). */
export interface StudentProgress {
  student: Child;
  streak: { currentDays: number; bestDays: number; lastDay: string } | null;
  minutesLast7Days: number;
  records: ProgressRecord[];
  /** As 20 mais recentes. */
  recentPlays: ProgressPlay[];
  assignments: StudentAssignment[];
}

// ---------- erros ----------
export type ClassroomErrorKind =
  | 'offline'
  | 'needs-account'
  | 'not-found'
  | 'refused'
  | 'duplicate'
  | 'limit'
  | 'invalid-credentials'
  | 'too-many-attempts'
  | 'class-closed'
  | 'server';

const MESSAGES: Record<ClassroomErrorKind, string> = {
  offline: 'Sem conexão. Turmas precisam de internet.',
  'needs-account': 'Para isso é preciso uma conta com e-mail.',
  'not-found': 'Não encontramos isso. Confira o código ou peça um novo ao professor.',
  refused: 'Isso não pode ser feito agora.',
  duplicate: 'Já existe um aluno com esse nome na turma.',
  limit: 'Você chegou ao limite do seu plano.',
  'invalid-credentials': 'Código da turma, nome ou PIN não conferem.',
  'too-many-attempts': 'Muitas tentativas. Espere 15 minutos ou peça um PIN novo ao professor.',
  'class-closed': 'Essa turma foi encerrada pelo professor.',
  server: 'Não foi possível falar com o servidor agora. Tente de novo em instantes.',
};

export class ClassroomError extends Error {
  readonly kind: ClassroomErrorKind;

  constructor(kind: ClassroomErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'ClassroomError';
    this.kind = kind;
  }
}

/**
 * Códigos das funções de 0011–0014; sem código, a requisição nem chegou ao banco. "Não encontrado" é PT404 (HTTP 404,
 * 0021); P0002 é o de antes, para o banco ainda sem a 0021.
 */
export function classroomErrorKind(error: { code?: string }): ClassroomErrorKind {
  switch (error.code) {
    case '28000':
      return 'needs-account';
    case 'PT404':
    case 'P0002':
      return 'not-found';
    case '22023':
      return 'refused';
    case '23505':
      return 'duplicate';
    case 'VHLIM':
      return 'limit';
    case '42501':
    case undefined:
    case '':
      return 'offline';
    default:
      return 'server';
  }
}

// ---------- áudio ----------
/** Bucket privado do áudio das entregas (supabase/storage/0001_submissions.sql). */
export const SUBMISSIONS_BUCKET = 'submissions';
/** O mesmo limite do bucket. */
export const SUBMISSION_AUDIO_MAX_BYTES = 10 * 1024 * 1024;

const AUDIO_TYPES = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' } as const;
export type SubmissionAudioType = keyof typeof AUDIO_TYPES;

/** Tipo que o bucket aceita para o que o MediaRecorder gravou ('audio/webm;codecs=opus' → 'audio/webm'); null se nenhum. */
export function submissionAudioType(mime: string): SubmissionAudioType | null {
  const base = mime.split(';')[0].trim().toLowerCase();
  return base in AUDIO_TYPES ? (base as SubmissionAudioType) : null;
}

/**
 * Caminho do arquivo no bucket: <turma>/<aluno>/<tarefa>/<id>.<ext>. A policy só deixa o próprio aluno subir na pasta
 * dele; entregar de novo sobe outro arquivo (o antigo sai na limpeza). `fileId`: letras, números, - e _.
 */
export function submissionAudioPath(classId: string, studentId: string, assignmentId: string, type: SubmissionAudioType, fileId: string = crypto.randomUUID()): string {
  return `${classId}/${studentId}/${assignmentId}/${fileId}.${AUDIO_TYPES[type]}`;
}

// ---------- API ----------
export interface ClassroomApi {
  // professor
  createClass(name: string): Promise<ClassDetail>;
  listMyClasses(): Promise<ClassSummary[]>;
  getClass(classId: string): Promise<ClassDetail>;
  addStudent(classId: string, name: string): Promise<NewStudent>;
  resetStudentPin(studentId: string): Promise<{ studentId: string; pin: string }>;
  setStudentActive(studentId: string, active: boolean): Promise<ClassDetail>;
  closeClass(classId: string): Promise<ClassDetail>;
  createAssignment(input: NewAssignment): Promise<AssignmentDetail>;
  listClassAssignments(classId: string): Promise<AssignmentSummary[]>;
  getAssignment(assignmentId: string): Promise<AssignmentDetail>;
  reviewSubmission(input: ReviewInput): Promise<Review & { submissionId: string }>;
  createGuardianInvite(studentId: string): Promise<GuardianInvite>;
  // planos (qualquer sessão)
  listPlans(): Promise<Plan[]>;
  getMyPlan(): Promise<MyPlan>;
  // aluno
  getMyClass(): Promise<MyClass | null>;
  getMyAssignments(): Promise<StudentAssignment[]>;
  submitAssignment(input: SubmitInput): Promise<StudentAssignment>;
  // responsável
  acceptGuardianInvite(code: string): Promise<Child>;
  listMyChildren(): Promise<Child[]>;
  /** Professor da turma ou responsável do aluno. */
  getStudentProgress(studentId: string): Promise<StudentProgress>;
  // áudio da entrega (o aluno sobe; aluno, professor e responsável ouvem)
  uploadSubmissionAudio(path: string, audio: Blob, type: SubmissionAudioType): Promise<void>;
  /** Endereço temporário (1 hora) para tocar o áudio. */
  submissionAudioUrl(path: string): Promise<string>;
}

// ---------- linhas do banco → tipos ----------
type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const levelOf = (raw: unknown): Level => LEVELS.find((l) => l === raw) ?? 'easy';
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

const toPlan = (r: Row): Plan => ({
  id: str(r.id),
  name: str(r.name),
  maxOpenClasses: num(r.max_open_classes),
  maxStudentsPerClass: num(r.max_students_per_class),
});

const toStudent = (r: Row): ClassStudent => ({
  id: str(r.id),
  name: str(r.name),
  active: !!r.active,
  joined: !!r.joined,
  createdAt: str(r.created_at),
});

const toClass = (r: Row): ClassDetail => ({
  id: str(r.id),
  name: str(r.name),
  code: str(r.code),
  createdAt: str(r.created_at),
  closedAt: strOrNull(r.closed_at),
  students: rows(r.students).map(toStudent),
});

const toAssignment = (r: Row): Assignment => ({
  id: str(r.id),
  classId: str(r.class_id),
  songId: str(r.song_id),
  songTitle: str(r.song_title),
  level: levelOf(r.level),
  mode: str(r.mode) as AssignmentMode,
  instructionKey: (strOrNull(r.instruction_key) as InstructionKey | null),
  instructionText: strOrNull(r.instruction_text),
  createdAt: str(r.created_at),
  dueAt: str(r.due_at),
  closed: !!r.closed,
});

const toReview = (r: Row): Review => ({
  grade: numOrNull(r.grade),
  concept: strOrNull(r.concept) as ReviewConcept | null,
  comment: str(r.comment),
  reviewedAt: str(r.reviewed_at),
});

const toTuning = (r: Row): PlayTuning => ({
  meanAbsCents: numOrNull(r.mean_abs_cents),
  stringCents: Array.isArray(r.string_cents) ? r.string_cents.map(numOrNull) : [],
  durationMs: numOrNull(r.duration_ms),
});

function toStatus(r: Row): AssignmentStatus {
  const best = r.best as Row | null;
  const sub = r.submission as Row | null;
  const review = r.review as Row | null;
  return {
    best: best ? { playId: str(best.play_id), score: num(best.score), accuracy: num(best.accuracy), playedAt: str(best.played_at), ...toTuning(best) } : null,
    submission: sub
      ? {
          id: str(sub.id),
          playId: strOrNull(sub.play_id),
          score: numOrNull(sub.score),
          accuracy: numOrNull(sub.accuracy),
          submittedAt: str(sub.submitted_at),
          audioPath: strOrNull(sub.audio_path),
          audioDeleted: !!sub.audio_deleted,
          audioDurationMs: numOrNull(sub.audio_duration_ms),
          ...toTuning(sub),
        }
      : null,
    review: review ? toReview(review) : null,
  };
}

export const toStudentAssignment = (r: Row): StudentAssignment => ({ ...toAssignment(r), ...toStatus(r) });

const toAssignmentDetail = (r: Row): AssignmentDetail => ({
  ...toAssignment(r),
  students: rows(r.students).map((s) => ({ studentId: str(s.student_id), name: str(s.name), ...toStatus(s) })),
});

const toChild = (r: Row): Child => ({
  studentId: str(r.student_id),
  name: str(r.name),
  className: str(r.class_name),
  classClosed: !!r.class_closed,
});

function toProgress(r: Row): StudentProgress {
  const streak = r.streak as Row | null;
  return {
    student: toChild(r.student as Row),
    streak: streak ? { currentDays: num(streak.current_days), bestDays: num(streak.best_days), lastDay: str(streak.last_day) } : null,
    minutesLast7Days: num(r.minutes_last_7_days),
    records: rows(r.records).map((x) => ({
      songId: str(x.song_id),
      songTitle: str(x.song_title),
      level: levelOf(x.level),
      score: num(x.score),
      accuracy: num(x.accuracy),
      updatedAt: str(x.updated_at),
    })),
    recentPlays: rows(r.recent_plays).map((x) => ({
      playId: str(x.play_id),
      songId: str(x.song_id),
      songTitle: str(x.song_title),
      level: levelOf(x.level),
      mode: str(x.mode) as PlayMode,
      score: num(x.score),
      accuracy: num(x.accuracy),
      finished: !!x.finished,
      playedAt: str(x.played_at),
    })),
    assignments: rows(r.assignments).map(toStudentAssignment),
  };
}

export type ClassroomClient = {
  rpc: SupabaseClient['rpc'];
  from: SupabaseClient['from'];
  storage: Pick<SupabaseClient['storage'], 'from'>;
};

/** A API de verdade: as funções do schema violinhero e o bucket submissions, com a sessão do aparelho. */
export function supabaseClassroom(client: ClassroomClient | null): ClassroomApi {
  async function call<T>(fn: string, args: Record<string, unknown> | undefined, map: (data: Row) => T): Promise<T> {
    if (!client) throw new ClassroomError('offline');
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new ClassroomError(classroomErrorKind(error), error);
    return map(data as Row);
  }
  const list = <T>(map: (r: Row) => T) => (data: unknown) => rows(data).map(map);

  return {
    createClass: (name) => call('create_class', { p_name: name }, toClass),
    listMyClasses: () =>
      call('list_my_classes', undefined, list((r) => ({
        id: str(r.id),
        name: str(r.name),
        code: str(r.code),
        createdAt: str(r.created_at),
        closedAt: strOrNull(r.closed_at),
        studentCount: num(r.student_count),
      }))),
    getClass: (classId) => call('get_class', { p_class_id: classId }, toClass),
    addStudent: (classId, name) =>
      call('add_student', { p_class_id: classId, p_name: name }, (r) => ({ student: toStudent(r.student as Row), pin: str(r.pin) })),
    resetStudentPin: (studentId) =>
      call('reset_student_pin', { p_member_id: studentId }, (r) => ({ studentId: str(r.student_id), pin: str(r.pin) })),
    setStudentActive: (studentId, active) => call('set_student_active', { p_member_id: studentId, p_active: active }, toClass),
    closeClass: (classId) => call('close_class', { p_class_id: classId }, toClass),
    createAssignment: (input) =>
      call('create_assignment', {
        p_class_id: input.classId,
        p_song_id: input.songId,
        p_level: input.level,
        p_mode: input.mode,
        p_due_at: input.dueAt,
        p_instruction_key: input.instructionKey ?? null,
        p_instruction_text: input.instructionText ?? null,
      }, toAssignmentDetail),
    listClassAssignments: (classId) =>
      call('list_class_assignments', { p_class_id: classId }, list((r) => ({
        ...toAssignment(r),
        studentCount: num(r.student_count),
        submittedCount: num(r.submitted_count),
        reviewedCount: num(r.reviewed_count),
      }))),
    getAssignment: (assignmentId) => call('get_assignment', { p_assignment_id: assignmentId }, toAssignmentDetail),
    reviewSubmission: (input) =>
      call('review_submission', {
        p_submission_id: input.submissionId,
        p_grade: input.grade ?? null,
        p_concept: input.concept ?? null,
        p_comment: input.comment ?? '',
      }, (r) => ({ ...toReview(r), submissionId: str(r.submission_id) })),
    createGuardianInvite: (studentId) =>
      call('create_guardian_invite', { p_member_id: studentId }, (r) => ({ code: str(r.code), expiresAt: str(r.expires_at) })),
    async listPlans() {
      if (!client) throw new ClassroomError('offline');
      const { data, error } = await client.from('plans').select('id, name, max_open_classes, max_students_per_class').order('sort');
      if (error) throw new ClassroomError(classroomErrorKind(error), error);
      return rows(data).map(toPlan);
    },
    getMyPlan: () => call('get_my_plan', undefined, (r) => ({ plan: toPlan(r.plan as Row), openClasses: num(r.open_classes) })),
    getMyClass: () =>
      call('get_my_class', undefined, (r) =>
        r
          ? { studentId: str(r.student_id), name: str(r.name), classId: str(r.class_id), className: str(r.class_name), closedAt: strOrNull(r.closed_at) }
          : null),
    getMyAssignments: () => call('get_my_assignments', undefined, list(toStudentAssignment)),
    submitAssignment: (input) =>
      call('submit_assignment', {
        p_assignment_id: input.assignmentId,
        p_play_id: input.playId ?? null,
        p_audio_path: input.audioPath ?? null,
        // Só com valor: o banco tem default (0017) e quem não grava não manda
        ...(input.audioPath && input.audioDurationMs != null ? { p_audio_duration_ms: Math.round(input.audioDurationMs) } : {}),
      }, toStudentAssignment),
    acceptGuardianInvite: (code) => call('accept_guardian_invite', { p_code: code }, toChild),
    listMyChildren: () => call('list_my_children', undefined, list(toChild)),
    getStudentProgress: (studentId) => call('get_student_progress', { p_member_id: studentId }, toProgress),
    async uploadSubmissionAudio(path, audio, type) {
      if (!client) throw new ClassroomError('offline');
      if (audio.size > SUBMISSION_AUDIO_MAX_BYTES) throw new ClassroomError('refused');
      const { error } = await client.storage.from(SUBMISSIONS_BUCKET).upload(path, audio, { contentType: type, upsert: false });
      if (error) throw new ClassroomError(storageErrorKind(error), error);
    },
    async submissionAudioUrl(path) {
      if (!client) throw new ClassroomError('offline');
      const { data, error } = await client.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw new ClassroomError(error ? storageErrorKind(error) : 'server', error);
      return data.signedUrl;
    },
  };
}

/** Storage: policy negada e arquivo inexistente dão o mesmo 'not-found'; tamanho e tipo, 'refused'; sem resposta, 'offline'. */
function storageErrorKind(error: { statusCode?: string | number; status?: number; name?: string }): ClassroomErrorKind {
  const status = Number(error.statusCode ?? error.status ?? 0);
  if (status === 413 || status === 415) return 'refused';
  if (status === 400 || status === 403 || status === 404) return 'not-found';
  if (!status) return 'offline';
  return 'server';
}

// ---------- entrada do aluno ----------
/** Nome da Edge Function (supabase/functions/class-login). */
export const CLASS_LOGIN_FUNCTION = 'class-login';

export interface StudentCredentials {
  /** Com ou sem hífen, maiúscula ou não. */
  code: string;
  /** Como o professor cadastrou; acento, maiúscula e espaço não contam. */
  name: string;
  /** 4 dígitos. */
  pin: string;
}

export interface StudentLoginResult {
  userId: string;
  student: { id: string; name: string; classId: string; className: string };
}

export type StudentLoginClient = {
  auth: Pick<SupabaseClient['auth'], 'setSession'>;
  functions: Pick<SupabaseClient['functions'], 'invoke'>;
};

const LOGIN_ERRORS: Record<string, ClassroomErrorKind> = {
  invalid_credentials: 'invalid-credentials',
  too_many_attempts: 'too-many-attempts',
  class_closed: 'class-closed',
  bad_request: 'invalid-credentials',
};

async function fromLoginError(error: unknown): Promise<ClassroomError> {
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
  if (!context) return new ClassroomError((error as { name?: string }).name === 'FunctionsFetchError' ? 'offline' : 'server', error);
  const body = (await context.json?.().catch(() => null)) as { error?: { code?: string } } | null | undefined;
  return new ClassroomError(LOGIN_ERRORS[body?.error?.code ?? ''] ?? 'server', error);
}

/**
 * O aluno entra com código da turma + nome + PIN. Antes de trocar de usuário, a fila do jogador que estava no aparelho
 * (anônimo ou não) sobe na conta dele, como no login por e-mail; sem conseguir, não troca ('offline'). Depois a sessão
 * do aluno vira a do aparelho (setSession): o useAccountWatch adota o usuário novo e esquece o anterior (DeviceData).
 * Erros: 'invalid-credentials' (mesma resposta para código, nome ou PIN errados), 'too-many-attempts',
 * 'class-closed', 'offline', 'server'.
 */
export async function studentLogin(
  client: StudentLoginClient | null,
  session: SessionState,
  credentials: StudentCredentials,
  data: DeviceData = deviceData(),
): Promise<StudentLoginResult> {
  if (!client) throw new ClassroomError('offline');
  const pin = credentials.pin.trim();
  if (!credentials.code.trim() || !credentials.name.trim() || !/^\d{4}$/.test(pin)) throw new ClassroomError('invalid-credentials');
  if (session.status === 'signed-in') {
    try {
      await data.flush(session.userId);
    } catch (cause) {
      throw new ClassroomError('offline', cause);
    }
  }
  const { data: body, error } = await client.functions.invoke<{
    session: { access_token: string; refresh_token: string };
    user_id: string;
    student: { id: string; name: string; class_id: string; class_name: string };
  }>(CLASS_LOGIN_FUNCTION, { body: { code: credentials.code, name: credentials.name, pin } });
  if (error) throw await fromLoginError(error);
  if (!body?.session?.access_token) throw new ClassroomError('server');
  const { error: sessionError } = await client.auth.setSession({ access_token: body.session.access_token, refresh_token: body.session.refresh_token });
  if (sessionError) throw new ClassroomError('server', sessionError);
  return {
    userId: body.user_id,
    student: { id: body.student.id, name: body.student.name, classId: body.student.class_id, className: body.student.class_name },
  };
}

/** Chaves do React Query das telas de turma; a troca de usuário já limpa tudo (useAccountWatch invalida as queries). */
export const classroomKeys = {
  all: ['classroom'] as const,
  classes: ['classroom', 'classes'] as const,
  class: (id: string) => ['classroom', 'class', id] as const,
  assignments: (classId: string) => ['classroom', 'class', classId, 'assignments'] as const,
  assignment: (id: string) => ['classroom', 'assignment', id] as const,
  myClass: ['classroom', 'my-class'] as const,
  myAssignments: ['classroom', 'my-assignments'] as const,
  children: ['classroom', 'children'] as const,
  progress: (studentId: string) => ['classroom', 'progress', studentId] as const,
  plan: ['classroom', 'plan'] as const,
  plans: ['classroom', 'plans'] as const,
};
