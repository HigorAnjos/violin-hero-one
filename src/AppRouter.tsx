import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalStyles } from './assets/styles/global';
import { ThemeChoiceProvider } from './shell/ThemeChoice';
import { Foundation } from './pages/Foundation';

export const AppRouter: React.FC = () => (
  <ThemeChoiceProvider>
    <GlobalStyles />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Foundation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </ThemeChoiceProvider>
);
