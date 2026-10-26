import { createClient } from '@supabase/supabase-js';

/** Públicas (vão no build); a conta lê por elas os provedores ligados no auth. */
export const supabaseUrl = import.meta.env.SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;
const schema = import.meta.env.SUPABASE_SCHEMA || 'violinhero';

/**
 * Cliente do Supabase, ou null quando o build não tem as variáveis (prévia sem backend).
 * O jogo não depende de internet: sem cliente, só não há sincronização.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        db: { schema },
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
