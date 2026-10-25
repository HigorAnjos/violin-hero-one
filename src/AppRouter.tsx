import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalStyles } from './assets/styles/global';
import { Countdown } from './pages/Countdown';
import { Foundation } from './pages/Foundation';
import { lazyGameScreen } from './pages/loadGameScreens';
import { MicTrouble } from './pages/MicTrouble';
import { OnboardLevel } from './pages/OnboardLevel';
import { OnboardMic } from './pages/OnboardMic';
import { OnboardTest } from './pages/OnboardTest';
import { isOnboarded } from './services/profile';
import { EarProvider, type Ear } from './shell/Ear';
import { MicGuard } from './shell/MicGuard';
import { createMicrophoneEar } from './shell/microphoneEar';
import { ROUTES } from './shell/routes';
import { ThemeChoiceProvider } from './shell/ThemeChoice';

const Calibration = lazyGameScreen('Calibration');
const Gameplay = lazyGameScreen('Gameplay');
const GameOver = lazyGameScreen('GameOver');
const BadgeEarned = lazyGameScreen('BadgeEarned');
const Results = lazyGameScreen('Results');

/** Primeira vez no aparelho: onboarding. Depois, a tela de teste até a Principal existir. */
const Home: React.FC = () => <Navigate to={isOnboarded() ? ROUTES.foundation : ROUTES.level} replace />;

export const AppRouter: React.FC<{ ear?: Ear }> = ({ ear }) => {
  // Sem Ouvido de conferência (main.tsx, ?ouvido=simulado), o microfone de verdade
  const [chosen] = React.useState(() => ear ?? createMicrophoneEar());
  return (
    <ThemeChoiceProvider>
      <GlobalStyles />
      <EarProvider ear={chosen}>
        <BrowserRouter>
          <MicGuard />
          <React.Suspense fallback={null}>
            <Routes>
            <Route path={ROUTES.home} element={<Home />} />
            <Route path={ROUTES.foundation} element={<Foundation />} />
            <Route path={ROUTES.level} element={<OnboardLevel />} />
            <Route path={ROUTES.mic} element={<OnboardMic />} />
            <Route path={ROUTES.strings} element={<OnboardTest />} />
            <Route path={ROUTES.micTrouble} element={<MicTrouble />} />
            <Route path={ROUTES.countdown} element={<Countdown />} />
            <Route path={ROUTES.calibration} element={<Calibration />} />
            <Route path={ROUTES.game} element={<Gameplay />} />
            <Route path={ROUTES.gameOver} element={<GameOver />} />
            <Route path={ROUTES.badge} element={<BadgeEarned />} />
            <Route path={ROUTES.results} element={<Results />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </React.Suspense>
        </BrowserRouter>
      </EarProvider>
    </ThemeChoiceProvider>
  );
};
