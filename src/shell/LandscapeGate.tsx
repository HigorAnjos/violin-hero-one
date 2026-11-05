import React from 'react';
import { useLocation } from 'react-router-dom';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { RotatePhone } from '../components/RotatePhone/RotatePhone';
import { needsLandscape, ROUTES } from './routes';
import { useMediaQuery } from './useMediaQuery';

/** Celular em pé numa tela que toca: as telas (filhas) nem montam; ao deitar, montam do começo, com o mesmo endereço e estado. */
export function usePortraitBlock(): boolean {
  const { pathname } = useLocation();
  const upright = useMediaQuery(PORTRAIT_QUERY);
  return upright && needsLandscape(pathname);
}

export const LandscapeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const blocked = usePortraitBlock();
  if (!blocked) return <>{children}</>;
  return <RotatePhone action={pathname.startsWith(ROUTES.editor) && !pathname.startsWith(ROUTES.dictation) ? 'escrever' : 'tocar'} />;
};
