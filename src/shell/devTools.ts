/**
 * Ferramentas de conferência (?ouvido=simulado, ?simular): no servidor de desenvolvimento e no build
 * do e2e (`vite build --mode e2e`). No build de produção a constante é false e o código some.
 */
export const DEV_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'e2e';
