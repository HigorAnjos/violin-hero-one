import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { cadernoTheme, DEFAULT_THEME, SPECIAL_THEMES, THEMES, THEME_STORAGE_KEY } from './src/assets/styles/themes';
import { noConverterInApp } from './src/build/noConverterInApp';

/**
 * Anti-flash: antes do app carregar, pinta a página com o fundo e o texto do tema salvo no
 * aparelho. O mapa sai do próprio catálogo (sem duplicar cores à mão).
 */
function themeBootScript(): Plugin {
  const colors = Object.fromEntries(
    [...THEMES, ...SPECIAL_THEMES].map((t) => [t.id, [t.colors.background, t.colors.text, t.mode, t.colors.surface]])
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

/**
 * Instalável e jogável sem internet depois da primeira visita. O service worker (Workbox, gerado no build) guarda
 * o app inteiro: casca, pedaços sob demanda (pista, partitura, orquestra, telas de jogo), os worklets do microfone
 * e as fontes. Versão nova espera o jogador sair da partida (shell/appUpdate.ts e shell/UpdatePrompt.tsx); fora do build não há SW.
 */
function offlineApp() {
  return VitePWA({
    registerType: 'prompt',
    // O registro é do main.tsx (createAppUpdate em shell/appUpdate.ts); o UpdatePrompt decide quando trocar de versão
    injectRegister: false,
    includeAssets: ['icons/apple-touch-icon.png'],
    manifest: {
      id: '/',
      name: 'Violin Hero',
      short_name: 'Violin Hero',
      description: 'Aprenda violino tocando de verdade.',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'landscape',
      background_color: cadernoTheme.colors.background,
      theme_color: cadernoTheme.colors.surface,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
      // Rotas do jogo (/tocar, /jogo…) abrem a casca guardada; o BrowserRouter resolve o resto
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
      // Lembrete de prática: notificação local, sem servidor de push (services/reminder.ts)
      importScripts: ['reminder-sw.js'],
    },
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), themeBootScript(), noConverterInApp(), offlineApp()],
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
