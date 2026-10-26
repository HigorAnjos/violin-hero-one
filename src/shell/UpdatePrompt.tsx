import React from 'react';
import { useLocation } from 'react-router-dom';
import { UpdateNotice } from '../components/UpdateNotice/UpdateNotice';
import type { AppUpdate } from './appUpdate';
import { needsMicrophone } from './routes';

const never = () => () => undefined;

/**
 * Mostra o aviso de versão nova só fora da partida: nas telas que ouvem o violino (afinar, jogo, resultado…) ele
 * espera, e aparece quando o jogador volta ao menu. "Depois" esconde até a próxima abertura do app.
 */
export const UpdatePrompt: React.FC<{ update?: AppUpdate }> = ({ update }) => {
  const { pathname } = useLocation();
  const waiting = React.useSyncExternalStore(update?.subscribe ?? never, () => update?.waiting() ?? false);
  const [later, setLater] = React.useState(false);
  if (!update || !waiting || later || needsMicrophone(pathname)) return null;
  return <UpdateNotice onUpdate={update.apply} onLater={() => setLater(true)} />;
};
