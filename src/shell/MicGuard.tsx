import React from 'react';
import { useLocation } from 'react-router-dom';
import { useEar } from './Ear';
import { usePortraitBlock } from './LandscapeGate';
import { needsMicrophone } from './routes';

/**
 * Fecha o microfone ao entrar numa tela que não ouve o violino (início, escolha de música, biblioteca, rota
 * desconhecida) e quando o celular fica em pé numa tela que ouve (o aviso de girar toma o lugar dela).
 */
export const MicGuard: React.FC = () => {
  const ear = useEar();
  const { pathname } = useLocation();
  const blocked = usePortraitBlock();
  const listening = needsMicrophone(pathname) && !blocked;
  React.useEffect(() => {
    if (!listening) ear.stop();
  }, [ear, listening]);
  return null;
};
