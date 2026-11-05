import React from 'react';
import { useLocation } from 'react-router-dom';
import { useEar } from './Ear';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { needsMicrophone } from './routes';
import { useMediaQuery } from './useMediaQuery';

/**
 * Fecha o microfone ao entrar numa tela que não ouve o violino (início, escolha de música, biblioteca, rota
 * desconhecida) e sempre que o celular fica em pé: as telas que ouvem dão lugar ao aviso de girar e as do fim da
 * partida seguem sem microfone.
 */
export const MicGuard: React.FC = () => {
  const ear = useEar();
  const { pathname } = useLocation();
  const upright = useMediaQuery(PORTRAIT_QUERY);
  const listening = needsMicrophone(pathname) && !upright;
  React.useEffect(() => {
    if (!listening) ear.stop();
  }, [ear, listening]);
  return null;
};
