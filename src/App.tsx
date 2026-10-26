import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './AppRouter';
import type { AppUpdate } from './shell/appUpdate';
import type { Ear } from './shell/Ear';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** `ear`: o Ouvido de conferência (?ouvido=simulado); sem ele, o microfone de verdade. `update`: a versão nova do service worker. */
export const App: React.FC<{ ear?: Ear; update?: AppUpdate }> = ({ ear, update }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter ear={ear} update={update} />
    </QueryClientProvider>
  );
};

export default App;
