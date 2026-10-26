/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** Variáveis públicas injetadas pelo vite.config.ts (lista PUBLIC_ENV). Vazias quando não definidas. */
interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SCHEMA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
