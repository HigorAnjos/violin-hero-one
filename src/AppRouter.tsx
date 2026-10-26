import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalStyles } from './assets/styles/global';
import { Countdown } from './pages/Countdown';
import { lazyGameScreen } from './pages/loadGameScreens';
import { Main } from './pages/Main';
import { ModeSelect } from './pages/ModeSelect';
import { Library } from './pages/Library';
import { Loading } from './pages/Loading';
import { SongSelect } from './pages/SongSelect';
import { MicTrouble } from './pages/MicTrouble';
import { OnboardLevel } from './pages/OnboardLevel';
import { OnboardMic } from './pages/OnboardMic';
import { OnboardTest } from './pages/OnboardTest';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { isOnboarded } from './services/profile';
import type { AppUpdate } from './shell/appUpdate';
import { EarProvider, type Ear } from './shell/Ear';
import { MicGuard } from './shell/MicGuard';
import { createMicrophoneEar } from './shell/microphoneEar';
import { ROUTES } from './shell/routes';
import { ThemeChoiceProvider } from './shell/ThemeChoice';
import { UpdatePrompt } from './shell/UpdatePrompt';

const Calibration = lazyGameScreen('Calibration');
const Gameplay = lazyGameScreen('Gameplay');
const GameplaySheet = lazyGameScreen('GameplaySheet');
const Gameplay3D = lazyGameScreen('Gameplay3D');
const Practice = lazyGameScreen('Practice');
const GameOver = lazyGameScreen('GameOver');
const BadgeEarned = lazyGameScreen('BadgeEarned');
const Results = lazyGameScreen('Results');

/** Primeira vez no aparelho: onboarding. Depois, a tela inicial. */
const Home: React.FC = () => (isOnboarded() ? <Main /> : <Navigate to={ROUTES.level} replace />);

export const AppRouter: React.FC<{ ear?: Ear; update?: AppUpdate }> = ({ ear, update }) => {
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
            <Route path={ROUTES.modes} element={<ModeSelect />} />
            <Route path={ROUTES.songs} element={<SongSelect />} />
            <Route path={ROUTES.loading} element={<Loading />} />
            <Route path={ROUTES.library} element={<Library />} />
            <Route path={ROUTES.level} element={<OnboardLevel />} />
            <Route path={ROUTES.mic} element={<OnboardMic />} />
            <Route path={ROUTES.strings} element={<OnboardTest />} />
            <Route path={ROUTES.micTrouble} element={<MicTrouble />} />
            <Route path={ROUTES.countdown} element={<Countdown />} />
            <Route path={ROUTES.calibration} element={<Calibration />} />
            <Route path={ROUTES.game} element={<Gameplay />} />
            <Route path={ROUTES.sheet} element={<GameplaySheet />} />
            <Route path={ROUTES.strings3d} element={<Gameplay3D />} />
            <Route path={ROUTES.practice} element={<Practice />} />
            <Route path={ROUTES.gameOver} element={<GameOver />} />
            <Route path={ROUTES.badge} element={<BadgeEarned />} />
            <Route path={ROUTES.results} element={<Results />} />
            <Route path={ROUTES.settings} element={<Settings />} />
            <Route path={ROUTES.profile} element={<Profile />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </React.Suspense>
          {/* Depois das telas: é o último no Tab e não tira o foco de nada */}
          <UpdatePrompt update={update} />
        </BrowserRouter>
      </EarProvider>
    </ThemeChoiceProvider>
  );
};
