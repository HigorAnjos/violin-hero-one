import { edgeSongImporter, fakeSongImporter, type SongImporter } from '../services/songImport';
import { supabase } from '../services/supabase';
import { DEV_TOOLS } from './devTools';

/**
 * O importador da tela: a Edge Function; no desenvolvimento e no e2e, `?importacao=simulada` troca pelo fake (a
 * função vem do floor ciclo4-import-funcao e o e2e roda sem backend).
 */
export function appImporter(search: string = window.location.search): SongImporter {
  if (DEV_TOOLS && new URLSearchParams(search).get('importacao') === 'simulada') return fakeSongImporter();
  return edgeSongImporter(supabase);
}
