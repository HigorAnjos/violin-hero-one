import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { cadernoTheme, type Theme } from '../assets/styles/themes';
import { EarProvider, unwiredEar, type Ear } from './Ear';

/** Mostra a rota atual: os testes conferem a navegação sem depender das outras telas. */
export const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
};

interface Options {
  theme?: Theme;
  ear?: Ear;
  path?: string;
  route?: string;
  queryClient?: QueryClient;
}

/** Tela dentro de tema, Ouvido, React Query e roteador, como no app. */
export function renderScreen(ui: React.ReactElement, { theme = cadernoTheme, ear = unwiredEar, path = '/', route = '*', queryClient }: Options = {}) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <EarProvider ear={ear}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={route} element={ui} />
              <Route path="*" element={null} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </EarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
