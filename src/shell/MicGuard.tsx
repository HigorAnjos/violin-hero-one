import React from 'react';
import { useLocation } from 'react-router-dom';
import { useEar } from './Ear';
import { needsMicrophone } from './routes';

/** Fecha o microfone ao entrar numa tela que não ouve o violino (início, escolha de música, biblioteca, rota desconhecida). */
export const MicGuard: React.FC = () => {
  const ear = useEar();
  const { pathname } = useLocation();
  const listening = needsMicrophone(pathname);
  React.useEffect(() => {
    if (!listening) ear.stop();
  }, [ear, listening]);
  return null;
};
