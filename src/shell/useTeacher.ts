import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClassroomError,
  classroomKeys,
  type AssignmentSummary,
  type ClassroomApi,
  type ClassroomErrorKind,
} from '../services/classroom';
import { isTeacherDemo, teacherClassroom } from './teacherClassroom';
import { useSession } from './useAccount';

/**
 * Quem pode abrir a área do professor: conta com e-mail (nem anônima nem de aluno). `viewer` separa o cache por
 * usuário, para a troca de conta nunca mostrar a turma de outro professor.
 */
export type TeacherAccess =
  | { status: 'loading' }
  | { status: 'needs-account' }
  /** Conta de aluno da turma: sem e-mail, não vira professor. */
  | { status: 'student' }
  | { status: 'offline' }
  | { status: 'ready'; api: ClassroomApi; viewer: string };

export function useTeacherAccess(provided?: ClassroomApi): TeacherAccess {
  const session = useSession();
  const demo = isTeacherDemo();
  const allowed = demo || (session?.status === 'signed-in' && !session.anonymous && !!session.email);
  const api = useQuery({ queryKey: ['teacher-api', demo], queryFn: teacherClassroom, enabled: allowed && !provided, staleTime: Infinity });
  if (demo || provided) {
    const ready = provided ?? api.data;
    return ready ? { status: 'ready', api: ready, viewer: demo ? 'demo' : session?.status === 'signed-in' ? session.userId : 'teste' } : { status: 'loading' };
  }
  if (!session) return { status: 'loading' };
  if (session.status === 'offline') return { status: 'offline' };
  if (session.anonymous) return { status: 'needs-account' };
  if (!session.email) return { status: 'student' };
  return api.data ? { status: 'ready', api: api.data, viewer: session.userId } : { status: 'loading' };
}

/** O motivo do erro de uma chamada de turma; outro erro conta como servidor. */
export function classroomErrorOf(error: unknown): ClassroomErrorKind | null {
  if (!error) return null;
  return error instanceof ClassroomError ? error.kind : 'server';
}

export const errorText = (error: unknown): string =>
  (error instanceof ClassroomError ? error : new ClassroomError('server', error)).message;

type Ready = Extract<TeacherAccess, { status: 'ready' }>;

const keyOf = (key: readonly unknown[], viewer: string) => [...key, viewer];

export function useMyClasses({ api, viewer }: Ready) {
  return useQuery({ queryKey: keyOf(classroomKeys.classes, viewer), queryFn: () => api.listMyClasses(), retry: false });
}

export function useMyPlan({ api, viewer }: Ready) {
  return useQuery({ queryKey: keyOf(classroomKeys.plan, viewer), queryFn: () => api.getMyPlan(), retry: false });
}

export function useClassDetail({ api, viewer }: Ready, classId: string | null) {
  return useQuery({
    queryKey: keyOf(classroomKeys.class(classId ?? ''), viewer),
    queryFn: () => api.getClass(classId!),
    enabled: !!classId,
    retry: false,
  });
}

export function useClassAssignments({ api, viewer }: Ready, classId: string | null) {
  return useQuery({
    queryKey: keyOf(classroomKeys.assignments(classId ?? ''), viewer),
    queryFn: () => api.listClassAssignments(classId!),
    enabled: !!classId,
    retry: false,
  });
}

export function useAssignmentDetail({ api, viewer }: Ready, assignmentId: string) {
  return useQuery({ queryKey: keyOf(classroomKeys.assignment(assignmentId), viewer), queryFn: () => api.getAssignment(assignmentId), retry: false });
}

/** A situação de cada aluno nas tarefas abertas (o painel da turma mostra quem revisar e quem falta). */
export function useOpenAssignmentDetails({ api, viewer }: Ready, assignments: readonly AssignmentSummary[]) {
  return useQueries({
    queries: assignments.map((a) => ({
      queryKey: keyOf(classroomKeys.assignment(a.id), viewer),
      queryFn: () => api.getAssignment(a.id),
      retry: false,
    })),
  });
}

/** Mutação da área do professor: no fim, tudo de turma é relido (lista, turma, tarefas, plano). */
export function useTeacherMutation<I, O>(run: (input: I) => Promise<O>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => queryClient.invalidateQueries({ queryKey: classroomKeys.all }),
  });
}
