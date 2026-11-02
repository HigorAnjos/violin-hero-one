import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Level } from '../game/notation/song';
import {
  classroomKeys,
  studentLogin,
  supabaseClassroom,
  type ClassroomApi,
  type StudentCredentials,
  type StudentLoginClient,
  type SubmitInput,
} from '../services/classroom';
import { PLAY_MODE_OF } from '../services/progress';
import type { SessionState } from '../services/session';
import { playSync, recordingUploads, setUploadTarget } from '../services/sync';
import { supabase } from '../services/supabase';
import { adoptSession } from './accountSwitch';
import { DEV_TOOLS } from './devTools';
import { GAME_MODES, type GameMode, type TaskPlay } from './play';
import { simulatedClassroom } from './simulatedClassroom';
import { submissionUploadTarget } from './submissionTarget';
import { useSession } from './useAccount';

/** A partida de tarefa que terminou, para o fake (no app de verdade ela sobe pela fila de partidas). */
export interface TaskPlayed {
  /** A partida na fila: a mesma chega uma vez só. */
  clientId: string;
  songId: string;
  level: Level;
  mode: GameMode;
  score: number;
  accuracy: number;
}

/** De onde as telas de aluno tiram a turma: o Supabase, ou a turma simulada do e2e. */
export interface ClassroomShell {
  api: ClassroomApi;
  loginClient: StudentLoginClient | null;
  /** O cliente que adota a sessão do aluno (perfil do servidor); null na simulada. */
  sessionClient: { rpc: SupabaseClient['rpc'] } | null;
  /** Sobe as partidas do aluno antes da entrega; lança se alguma ficou. */
  flushPlays(userId: string): Promise<void>;
  playedTask?(play: TaskPlayed): void;
}

function realClassroom(): ClassroomShell {
  return {
    api: supabaseClassroom(supabase),
    loginClient: supabase,
    sessionClient: supabase,
    flushPlays: (userId) => playSync.flush(userId, { strict: true }),
  };
}

let shell: ClassroomShell | null = null;

/** No desenvolvimento e no e2e, `?turmas=simulada` na primeira tela troca o Supabase pela turma de mentira, até recarregar. */
export function classroomShell(): ClassroomShell {
  shell ??= DEV_TOOLS && new URLSearchParams(window.location.search).get('turmas') === 'simulada' ? simulatedClassroom() : realClassroom();
  return shell;
}

/** Testes: a turma que as telas usam (o fake), ou null para voltar a escolher pela URL. */
export function setClassroomShell(next: ClassroomShell | null): void {
  shell = next;
}

/**
 * Conta de aluno: entrou pela turma, sem e-mail. Conta com e-mail ou Google sempre tem e-mail na sessão; o e-mail
 * sintético do aluno a sessão não leva (signedIn). Vale sem rede também: o aparelho segue sabendo que é de aluno.
 */
export function isStudentSession(session: SessionState | undefined): boolean {
  return session?.status === 'signed-in' && !session.anonymous && !session.email;
}

/** A turma do aluno da sessão; `student` já vale antes da turma chegar (para esconder ranking e desafio). */
export function useStudent() {
  const session = useSession();
  const student = isStudentSession(session);
  const query = useQuery({
    queryKey: classroomKeys.myClass,
    queryFn: () => classroomShell().api.getMyClass(),
    enabled: student,
    staleTime: 5 * 60_000,
  });
  return { session, student, myClass: student ? (query.data ?? null) : null, pending: session === undefined || (student && query.isPending), error: query.error };
}

export function useMyAssignments(enabled: boolean) {
  return useQuery({ queryKey: classroomKeys.myAssignments, queryFn: () => classroomShell().api.getMyAssignments(), enabled });
}

/** Entrar pela turma: a fila de quem estava aqui sobe antes, e a sessão do aluno vira a do aparelho. */
export function useStudentLogin() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (credentials: StudentCredentials) => {
      const { loginClient, sessionClient } = classroomShell();
      const result = await studentLogin(loginClient, session ?? { status: 'offline' }, credentials);
      await adoptSession(queryClient, sessionClient, { status: 'signed-in', userId: result.userId, anonymous: false });
      await queryClient.invalidateQueries({ queryKey: classroomKeys.all });
      return result;
    },
  });
}

/** A entrega sem gravação (ou o navegador que não grava): a partida que vale sobe antes. */
export async function submitPlayOnly(userId: string, task: TaskPlay, playId: string | null): Promise<void> {
  const { api, flushPlays } = classroomShell();
  await flushPlays(userId);
  const input: SubmitInput = { assignmentId: task.assignmentId, playId };
  await api.submitAssignment(input);
}

/** Com sessão de aluno, a fila de gravações sobe para o bucket da turma; sem ela, só guarda. */
export function useStudentUploads(): void {
  const session = useSession();
  const student = isStudentSession(session);
  React.useEffect(() => {
    if (!student) return;
    const { api, flushPlays } = classroomShell();
    setUploadTarget(submissionUploadTarget(api, flushPlays));
    void recordingUploads.flush().catch(() => undefined);
    return () => setUploadTarget(null);
  }, [student]);
}

const GAME_MODE_OF = Object.fromEntries(GAME_MODES.map((m) => [PLAY_MODE_OF[m], m])) as Record<string, GameMode>;

/** A tela da partida para o modo da tarefa ('arcade' → Arcade). */
export function taskGameMode(mode: string): GameMode {
  return GAME_MODE_OF[mode] ?? 'Arcade';
}
