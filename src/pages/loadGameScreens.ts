import React from 'react';

/** O pedaço das telas de jogo; chamar de novo devolve o mesmo download (a contagem já pede antes de precisar). */
export const loadGameScreens = () => import('./gameScreens');

type GameScreen = 'BadgeEarned' | 'Calibration' | 'GameOver' | 'Gameplay' | 'GameplaySheet' | 'Practice' | 'Results';

export const lazyGameScreen = (name: GameScreen) => React.lazy(() => loadGameScreens().then((m) => ({ default: m[name] as React.ComponentType })));
