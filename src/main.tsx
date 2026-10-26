import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './assets/styles/fonts.css';
import { createAppUpdate } from './shell/appUpdate';
import type { Ear } from './shell/Ear';

// Service worker (só no build; no dev o registerSW não faz nada): app guardado para jogar sem internet
const update = 'serviceWorker' in navigator ? createAppUpdate(registerSW) : undefined;

/** ?ouvido=simulado (só desenvolvimento e e2e): por import(), para o ouvido simulado e o motor dele não irem no download inicial. */
async function devEar(): Promise<Ear | undefined> {
  // A condição literal (e não DEV_TOOLS importado) deixa o build de produção apagar o import() antes de montar os pedaços
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'e2e')) return undefined;
  if (new URLSearchParams(window.location.search).get('ouvido') !== 'simulado') return undefined;
  return (await import('./shell/simulatedEar')).createSimulatedEar();
}

void devEar().then((ear) =>
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App ear={ear} update={update} />
    </React.StrictMode>
  )
);
