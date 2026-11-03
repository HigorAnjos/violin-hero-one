import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App de celular (Android e iOS): o mesmo build da web (dist), aberto do pacote local, sem service worker
 * (src/main.tsx). O appId vai para as lojas e não muda depois de publicado.
 */
const config: CapacitorConfig = {
  appId: 'app.violinhero',
  appName: 'Violin Hero',
  webDir: 'dist',
  plugins: {
    // O index.html pede viewport-fit=cover: o WebView vai de borda a borda e o env(safe-area-inset-*) das telas
    // afasta o conteúdo da barra de status e do recorte da câmera
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
