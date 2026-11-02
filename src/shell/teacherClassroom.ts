import { supabaseClassroom, type ClassroomApi } from '../services/classroom';
import { supabase } from '../services/supabase';
import { DEV_TOOLS } from './devTools';

let demo: Promise<ClassroomApi> | undefined;

/**
 * ?turmas=simulada (as três simulações estão explicadas em services/classroomFake.ts): a área do professor roda no
 * fake, com um professor de mentira. Pega uma vez: os links de dentro da área não levam o parâmetro, e a simulação
 * segue até recarregar a página.
 */
export function isTeacherDemo(search = window.location.search): boolean {
  return DEV_TOOLS && (demo !== undefined || new URLSearchParams(search).get('turmas') === 'simulada');
}

export async function teacherClassroom(): Promise<ClassroomApi> {
  // Como em parentClassroom: a condição literal deixa o Vite tirar o fake do build de produção
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    if (isTeacherDemo()) return (demo ??= import('./teacherDemo').then((module) => module.teacherDemo()));
  }
  return supabaseClassroom(supabase);
}
