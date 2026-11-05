import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import type { Assignment, AssignmentMode } from '../services/classroom';

export const MODE_NAMES: Record<AssignmentMode, string> = { arcade: 'Arcade', sheet: 'Partitura', strings3d: 'Cordas 3D' };

type Variant = Pick<Assignment, 'level' | 'mode'>;

/** "Fácil · Arcade": o que distingue duas tarefas da mesma música. */
export const taskVariant = (task: Variant) => `${LEVEL_NAMES[task.level]} · ${MODE_NAMES[task.mode]}`;

/** "Escala de Ré maior · Fácil · Arcade": o nome da tarefa para professor, aluno e responsável. */
export const taskLabel = (task: Variant & Pick<Assignment, 'songTitle'>) => `${task.songTitle} · ${taskVariant(task)}`;
