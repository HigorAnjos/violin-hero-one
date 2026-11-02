import { REVIEW_CONCEPTS, type Review, type StudentAssignment } from '../../services/classroom';

export type TaskStatus = 'todo' | 'submitted' | 'reviewed' | 'missed';

/** Só a situação do próprio aluno: revisada > entregue > prazo acabou sem entrega > a fazer. */
export function taskStatus(task: Pick<StudentAssignment, 'submission' | 'review' | 'closed'>): TaskStatus {
  if (task.review) return 'reviewed';
  if (task.submission) return 'submitted';
  return task.closed ? 'missed' : 'todo';
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Para fazer',
  submitted: 'Entregue · esperando',
  reviewed: 'Revisada',
  missed: 'Prazo acabou',
};

/** "Muito bom" ou "Nota 4 de 5". */
export function reviewMark(review: Pick<Review, 'grade' | 'concept'>): string {
  if (review.concept) return REVIEW_CONCEPTS[review.concept];
  return review.grade === null ? '' : `Nota ${review.grade} de 5`;
}

const DAY = 86400e3;

/** "1/11": dia e mês, sem zero na frente (o toLocaleDateString do pt-BR põe). */
export const shortDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "até hoje, 18:00", "até amanhã", "até sexta", "até 21/11"; passado: "prazo foi 21/11". */
export function dueLabel(dueAt: string, now: Date = new Date()): string {
  const due = new Date(dueAt);
  const date = shortDate(due);
  if (due.getTime() <= now.getTime()) return `prazo foi ${date}`;
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days === 0) return `até hoje, ${due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (days === 1) return 'até amanhã';
  if (days < 7) return `até ${due.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/-feira$/, '')}`;
  return `até ${date}`;
}

/** "94,1%" */
export const percent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
