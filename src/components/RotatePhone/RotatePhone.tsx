import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { BackLink } from '../BackLink/BackLink';
import { Lead, Screen, ScreenTitle } from '../Screen/Screen';

const turn = keyframes`
  0%, 25% { transform: rotate(0deg); }
  60%, 100% { transform: rotate(-90deg); }
`;

const centered = css`
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom))
    max(1.5rem, env(safe-area-inset-left));
`;

const Page = styled(Screen)`
  ${centered}
`;

/** Por cima da partida pausada: cobre a tela toda, acima da pausa. */
const Cover = styled.div`
  ${centered}
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 1.375rem;
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
`;

const Phone = styled.svg`
  width: 7.5rem;
  height: 7.5rem;
  color: ${({ theme }) => theme.colors.text};

  @media (prefers-reduced-motion: no-preference) {
    g {
      transform-origin: 60px 60px;
      animation: ${turn} 2.4s ease-in-out infinite alternate;
    }
  }
`;

const Hint = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

interface Props {
  action?: 'tocar' | 'escrever';
  /** A partida já estava aberta e ficou em pé: pausada embaixo, retoma ao deitar. */
  paused?: boolean;
}

/**
 * No lugar das telas que tocam (pista, afinador, microfone) com o celular em pé: pede para deitar. Chegando em pé, a
 * tela de verdade nem monta; ficando em pé no meio, ela pausa embaixo deste aviso.
 */
export const RotatePhone: React.FC<Props> = ({ action = 'tocar', paused = false }) => {
  const content = (
    <>
      <Phone viewBox="0 0 120 120" aria-hidden="true">
        <g>
          <rect x="38" y="14" width="44" height="92" rx="8" fill="none" stroke="currentColor" strokeWidth="5" />
          <line x1="54" y1="96" x2="66" y2="96" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </g>
      </Phone>
      <ScreenTitle id="gire-titulo">Gire o celular para {action}</ScreenTitle>
      <Lead>
        {paused
          ? 'A partida está pausada e o microfone, fechado. Vire o celular de lado para continuar de onde parou.'
          : `${action === 'tocar' ? 'A pista e o afinador precisam da tela deitada.' : 'A partitura e a prévia na pista precisam da tela deitada.'} Vire o celular de lado e a tela continua daqui.`}
      </Lead>
      <Hint>Se a tela não girar, desligue o bloqueio de rotação do celular.</Hint>
      <div>
        <BackLink />
      </div>
    </>
  );
  return paused ? (
    <Cover role="dialog" aria-modal="true" aria-labelledby="gire-titulo">
      {content}
    </Cover>
  ) : (
    <Page aria-labelledby="gire-titulo">{content}</Page>
  );
};
