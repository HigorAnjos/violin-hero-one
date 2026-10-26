import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { ModeCard } from '../components/ModeCard/ModeCard';
import { useRadioGroup } from '../components/RadioGroup/useRadioGroup';
import { Kicker, Lead, Screen, ScreenTitle } from '../components/Screen/Screen';
import { isReadyMode, modeFromSlug, READY_MODES, readyMode, songsUrl } from '../shell/choice';
import type { GameMode } from '../shell/play';
import { ROUTES } from '../shell/routes';

/** Os modos do cartão que já têm tela; um modo sem tela aparece "em breve". A Prática não é cartão. */
const PLAYABLE = READY_MODES.filter((mode) => mode !== 'Prática');

const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  @media (max-height: 500px) {
    gap: 0;
  }
`;

const Cards = styled.div`
  flex-grow: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Footer = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Keys = styled.p`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  kbd {
    padding: 0.25rem 0.4375rem;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: 3px;
    background-color: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
    font: inherit;
    font-size: 0.75rem;
    line-height: 1;
  }

  kbd + span + kbd {
    margin-left: ${({ theme }) => theme.spacing.sm};
  }

  @media (pointer: coarse), (max-height: 500px) {
    visibility: hidden;
  }
`;

/** 2 · Escolha de modo: Arcade, Partitura e Cordas 3D. Setas trocam, Enter confirma. */
export const ModeSelect: React.FC = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const fromUrl = modeFromSlug(search.get('modo'));
  const [mode, setMode] = React.useState<GameMode>(fromUrl === 'Prática' ? 'Arcade' : readyMode(fromUrl));
  const radio = useRadioGroup(PLAYABLE, mode, setMode);
  // Vindo da Biblioteca, a música já escolhida segue para a seleção
  const confirm = () => navigate(songsUrl(mode, search.get('musica') ?? undefined));

  return (
    <Screen $gap="1.75rem">
      <Header>
        <Intro>
          <Kicker>Passo 1 de 3</Kicker>
          <ScreenTitle>Escolha o modo</ScreenTitle>
          <Lead>Mesma música, mesmas cores de corda, mesmo placar. Muda só a forma de ler.</Lead>
        </Intro>
        <Button as={Link} to={ROUTES.home} $variant="ghost">
          <span aria-hidden="true">◂</span>Voltar
        </Button>
      </Header>

      <Cards role="radiogroup" aria-label="Modo de jogo">
        <ModeCard
          art="arcade"
          name="Arcade"
          description="A pista vem na sua direção, estilo Guitar Hero. Cada raia é uma corda: leia a cor e toque no tempo."
          audience="Quer jogar sem saber ler partitura"
          radio={isReadyMode('Arcade') ? radio('Arcade') : undefined}
          onConfirm={confirm}
        />
        <ModeCard
          art="sheet"
          name="Partitura"
          description="A pauta corre embaixo da tela e a nota acende na agulha. Cor indica a corda, número indica o dedo."
          audience="Quer aprender a ler música de verdade"
          radio={isReadyMode('Partitura') ? radio('Partitura') : undefined}
          onConfirm={confirm}
        />
        <ModeCard
          art="strings3d"
          name="Cordas 3D"
          description="As quatro cordas na frente e as notas vindo do fundo. A coluna mostra a casa, a caixa mostra o dedo."
          audience="Quer aprender onde pôr os dedos"
          radio={isReadyMode('Cordas 3D') ? radio('Cordas 3D') : undefined}
          onConfirm={confirm}
        />
      </Cards>

      <Footer>
        <Keys>
          <kbd>◂ ▸</kbd>
          <span>trocar modo</span>
          <kbd>Enter</kbd>
          <span>confirmar</span>
        </Keys>
        <Button type="button" onClick={confirm}>
          Continuar com {mode} <span aria-hidden="true">▸</span>
        </Button>
      </Footer>
    </Screen>
  );
};
