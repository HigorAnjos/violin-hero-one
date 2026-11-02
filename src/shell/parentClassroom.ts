import { supabaseClassroom, type ClassroomApi } from '../services/classroom';
import { supabase } from '../services/supabase';
import { DEV_TOOLS } from './devTools';

let demo: Promise<ClassroomApi> | undefined;
/** ?turmas=simulada: a área do responsável no fake (as três simulações estão explicadas em services/classroomFake.ts). */
export function isParentDemo(search = window.location.search) {
  return DEV_TOOLS && new URLSearchParams(search).get('turmas') === 'simulada';
}
export async function parentClassroom(): Promise<ClassroomApi> {
  // O Vite precisa eliminar o import antes de dividir os chunks: a constante importada
  // DEV_TOOLS pode ficar em outro chunk e não ser propagada nessa etapa do build.
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    if (new URLSearchParams(window.location.search).get('turmas') === 'simulada') {
      return demo ??= import('./parentDemo').then(module => module.parentDemo()).then(result => result.api);
    }
  }
  return supabaseClassroom(supabase);
}
