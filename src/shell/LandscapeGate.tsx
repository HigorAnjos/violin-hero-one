import React from 'react';
import { useLocation } from 'react-router-dom';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { RotatePhone } from '../components/RotatePhone/RotatePhone';
import { needsLandscape, ROUTES } from './routes';
import { useMediaQuery } from './useMediaQuery';

/** Celular em pé numa tela que toca. */
export function usePortraitBlock(): boolean {
  const { pathname } = useLocation();
  const upright = useMediaQuery(PORTRAIT_QUERY);
  return upright && needsLandscape(pathname);
}

/**
 * Chegando em pé numa tela que toca, ela nem monta: só o aviso de girar, sem microfone nem contagem; ao deitar, monta
 * com o mesmo endereço e estado. Já aberta deitada e girada para em pé, ela fica montada e pausa como no fundo (o
 * Ouvido fecha o microfone, src/shell/microphoneEar.ts), com o aviso por cima; ao deitar, a pausa aparece.
 */
export const LandscapeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const blocked = usePortraitBlock();
  // A entrada de histórico que já montou deitada: girar nela não desmonta
  const [mounted, setMounted] = React.useState<string | null>(blocked ? null : location.key);
  if (!blocked && mounted !== location.key) setMounted(location.key);
  const action = location.pathname.startsWith(ROUTES.editor) && !location.pathname.startsWith(ROUTES.dictation) ? 'escrever' : 'tocar';
  if (blocked && mounted !== location.key) return <RotatePhone action={action} />;
  // Sempre a mesma forma: o aviso entra e sai sem remontar a tela embaixo
  return (
    <>
      {children}
      {blocked && <RotatePhone action={action} paused />}
    </>
  );
};
