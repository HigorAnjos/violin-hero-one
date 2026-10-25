import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './AppRouter';
import type { Ear } from './shell/Ear';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** `ear`: o Ouvido de conferência (?ouvido=simulado); sem ele, o microfone de verdade. */
export const App: React.FC<{ ear?: Ear }> = ({ ear }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter ear={ear} />
    </QueryClientProvider>
  );
};

export default App;
