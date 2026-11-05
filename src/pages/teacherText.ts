import type { StringName } from '../assets/styles/themes/types';
import { ASSIGNMENT_INSTRUCTIONS, REVIEW_CONCEPTS, type Assignment, type AssignmentMode, type AssignmentStatus, type Review } from '../services/classroom';

/** Os modos que a tarefa pede, na ordem do design (prática não vale para tarefa). */
export const ASSIGNMENT_MODES: readonly AssignmentMode[] = ['arcade', 'sheet', 'strings3d'];

export { MODE_NAMES, taskLabel, taskVariant } from '../shell/taskLabel';

/** O código da turma como o design mostra: ABCD-EFGH (o login aceita com ou sem hífen). */
export function formatClassCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** A instrução da tarefa: o texto do professor, senão a pronta, senão nada. */
export function instructionOf(task: Pick<Assignment, 'instructionKey' | 'instructionText'>): string | null {
  return task.instructionText ?? (task.instructionKey ? ASSIGNMENT_INSTRUCTIONS[task.instructionKey] : null);
}

const DAY = 86_400_000;
const startOfDay = (t: number) => new Date(new Date(t).toDateString()).getTime();

/** "até sex, 23/10"; vencida, "encerrada". */
export function dueText(task: Pick<Assignment, 'dueAt' | 'closed'>, now: number = Date.now()): string {
  const due = Date.parse(task.dueAt);
  if (task.closed || due <= now) return 'encerrada';
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(due).replace('.', '');
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(due);
  return `até ${weekday}, ${date}`;
}

/** Quando chegou: "16:40" hoje, "ontem", senão "23/10". */
export function sentText(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(at);
  if (days === 1) return 'ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(at);
}

/** Prazo padrão de tarefa nova: daqui a 7 dias, às 23:59, no formato do <input type="date">. */
export function defaultDueDate(now: number = Date.now()): string {
  return dateInputValue(now + 7 * DAY);
}

export function dateInputValue(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O fim do dia escolhido (23:59:59 na hora do aparelho), em ISO. */
export function dueAtFromDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** "±11 ¢"; sem medida, "—". */
export const centsText = (value: number | null | undefined) => (value == null ? '—' : `±${Math.round(value)} ¢`);

/** "+6 ¢", "−14 ¢", "0 ¢"; sem acerto na corda, "—". */
export function signedCents(value: number | null | undefined): string {
  if (value == null) return '—';
  const r = Math.round(value);
  return r === 0 ? '0 ¢' : `${r > 0 ? '+' : '−'}${Math.abs(r)} ¢`;
}

export const STRINGS: readonly StringName[] = ['G', 'D', 'A', 'E'];
export const STRING_NAMES: Record<StringName, string> = { G: 'Sol', D: 'Ré', A: 'Lá', E: 'Mi' };

/** A corda mais longe do afinado (|cents| maior, a partir de 5 ¢) e para que lado; null se todas estão boas. */
export function hardestString(cents: readonly (number | null)[] | undefined): { string: StringName; side: 'alta' | 'baixa' } | null {
  let worst: { string: StringName; value: number } | null = null;
  STRINGS.forEach((s, i) => {
    const v = cents?.[i];
    if (v != null && Math.abs(v) >= 5 && (!worst || Math.abs(v) > Math.abs(worst.value))) worst = { string: s, value: v };
  });
  const found = worst as { string: StringName; value: number } | null;
  return found ? { string: found.string, side: found.value > 0 ? 'alta' : 'baixa' } : null;
}

export type StudentTaskState = 'reviewed' | 'to-review' | 'played' | 'missing';

/** A situação de um aluno numa tarefa, como os chips do design. */
export function taskState(status: AssignmentStatus): StudentTaskState {
  if (status.review) return 'reviewed';
  if (status.submission) return 'to-review';
  if (status.best) return 'played';
  return 'missing';
}

export const TASK_STATE_NAMES: Record<StudentTaskState, string> = {
  reviewed: 'Revisada',
  'to-review': 'Revisar',
  played: 'Tocou, não enviou',
  missing: 'Sem entrega',
};

export const reviewText = (review: Pick<Review, 'grade' | 'concept'>) =>
  review.concept ? REVIEW_CONCEPTS[review.concept] : `Nota ${review.grade} de 5`;

/** Quando o áudio some: 30 dias depois da revisão (a retenção do bucket). */
export const AUDIO_RETENTION_DAYS = 30;

export function audioGoneText(reviewedAt: string | null): string {
  if (!reviewedAt) return `O áudio fica guardado até ${AUDIO_RETENTION_DAYS} dias depois da sua revisão; depois disso é apagado.`;
  const until = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(Date.parse(reviewedAt) + AUDIO_RETENTION_DAYS * DAY);
  return `O áudio será apagado em ${until}, ${AUDIO_RETENTION_DAYS} dias depois da revisão.`;
}
