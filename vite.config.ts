import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from './src/assets/styles/themes';
import { noConverterInApp } from './src/build/noConverterInApp';

/**
 * Anti-flash: antes do app carregar, pinta a página com o fundo e o texto do tema salvo no
 * aparelho. O mapa sai do próprio catálogo (sem duplicar cores à mão).
 */
function themeBootScript(): Plugin {
  const colors = Object.fromEntries(
    THEMES.map((t) => [t.id, [t.colors.background, t.colors.text, t.mode, t.colors.surface]])
  );
  const fallback = JSON.stringify(DEFAULT_THEME.id);
  const script =
    `(function(){try{var m=${JSON.stringify(colors)};` +
    `var id=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var c=m[id]||m[${fallback}];var r=document.documentElement;` +
    `r.style.backgroundColor=c[0];r.style.color=c[1];r.style.colorScheme=c[2];r.dataset.theme=m[id]?id:${fallback};` +
    `var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',c[3]);}catch(e){}})();`;
  return {
    name: 'theme-boot',
    transformIndexHtml: () => [{ tag: 'script', children: script, injectTo: 'head' }],
  };
}

/**
 * Únicas variáveis que vão para o navegador, pelo nome. Não usamos `envPrefix` de propósito:
 * liberar o prefixo SUPABASE_ levaria junto o SUPABASE_ACCESS_TOKEN (e qualquer segredo novo).
 * Lidas do .env.local ou do ambiente da hospedagem.
 */
const PUBLIC_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SCHEMA'] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), themeBootScript(), noConverterInApp()],
    server: { port: 5173, strictPort: true },
    define: Object.fromEntries(
      PUBLIC_ENV.map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key] ?? '')])
    ),
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
