import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalStyles } from './assets/styles/global';
import { Countdown } from './pages/Countdown';
import { Foundation } from './pages/Foundation';
import { MicTrouble } from './pages/MicTrouble';
import { OnboardLevel } from './pages/OnboardLevel';
import { OnboardMic } from './pages/OnboardMic';
import { OnboardTest } from './pages/OnboardTest';
import { isOnboarded } from './services/profile';
import { EarProvider, type Ear } from './shell/Ear';
import { createMicrophoneEar } from './shell/microphoneEar';
import { ROUTES } from './shell/routes';
import { createSimulatedEar } from './shell/simulatedEar';
import { ThemeChoiceProvider } from './shell/ThemeChoice';

/** Microfone de verdade; só no desenvolvimento, ?ouvido=simulado toca as cordas sozinho. */
function chooseEar(): Ear {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('ouvido') === 'simulado') return createSimulatedEar();
  return createMicrophoneEar();
}

/** Primeira vez no aparelho: onboarding. Depois, a tela de teste até a Principal existir. */
const Home: React.FC = () => <Navigate to={isOnboarded() ? ROUTES.foundation : ROUTES.level} replace />;

export const AppRouter: React.FC<{ ear?: Ear }> = ({ ear }) => {
  const [chosen] = React.useState(() => ear ?? chooseEar());
  return (
    <ThemeChoiceProvider>
      <GlobalStyles />
      <EarProvider ear={chosen}>
        <BrowserRouter>
          <Routes>
            <Route path={ROUTES.home} element={<Home />} />
            <Route path={ROUTES.foundation} element={<Foundation />} />
            <Route path={ROUTES.level} element={<OnboardLevel />} />
            <Route path={ROUTES.mic} element={<OnboardMic />} />
            <Route path={ROUTES.strings} element={<OnboardTest />} />
            <Route path={ROUTES.micTrouble} element={<MicTrouble />} />
            <Route path={ROUTES.countdown} element={<Countdown />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        </BrowserRouter>
      </EarProvider>
    </ThemeChoiceProvider>
  );
};
