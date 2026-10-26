import React from 'react';
import styled from 'styled-components';
import { MenuLink } from '../components/MenuLink/MenuLink';
import { SessionStatus } from '../components/SessionStatus/SessionStatus';
import { CornerLinks } from '../components/CornerLinks/CornerLinks';
import { ViolinArt } from '../components/ViolinArt/ViolinArt';
import { levelSettings } from '../game/engine/levels';
import { FIXED_SONGS, findFixedSong } from '../game/notation/songs';
import { loadA4 } from '../services/playerAudio';
import { loadLocalProfile } from '../services/profile';
import { useShelf } from '../services/shelf';
import { modesUrl } from '../shell/choice';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';

const Page = styled.main`
  position: relative;
  /* Encolhe no espaço do aviso de versão nova, quando ele aparece (UpdateNotice) */
  min-height: calc(100vh - var(--update-notice-space, 0px));
  min-height: calc(100dvh - var(--update-notice-space, 0px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: clamp(1.5rem, 6.5vh, 3rem);
  padding: clamp(1.25rem, 8.9vh, 4rem) clamp(1.5rem, 6.25vw, 5rem);

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: 1.25rem max(1.5rem, env(safe-area-inset-left));
  }
`;

const Brand = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 20rem;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
  }
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: clamp(3rem, 6vw, 4.75rem);
  line-height: 0.95;
  color: ${({ theme }) => theme.colors.text};

  span {
    display: block;
    color: ${({ theme }) => theme.game.strings.A.main};
  }

  @media (max-height: 500px) {
    font-size: 2.25rem;
    line-height: 1;

    span {
      display: inline;
    }
  }
`;

const Subtitle = styled.p`
  font-weight: 700;
  font-size: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.8125rem;
  }
`;

const Menu = styled.nav`
  position: relative;
  width: min(20rem, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.875rem;

  @media (max-height: 500px) {
    width: 16.25rem;
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Controls = styled.div`
  position: absolute;
  top: 2.25rem;
  right: 3rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  max-width: calc(100% - 26rem);

  @media (max-height: 500px) {
    top: 1rem;
    right: max(1rem, env(safe-area-inset-right));
    gap: ${({ theme }) => theme.spacing.xs};
    max-width: calc(100% - 20rem);
  }
`;

// Celular deitado: menor e ancorado embaixo, para a voluta não ficar sob o seletor de tema
const Art = styled(ViolinArt)`
  @media (max-height: 500px) {
    transform: scale(0.8);
    transform-origin: 100% 100%;
  }
`;

const DEFAULT_LEVEL = 'beginner' as const;

/** 1 · Tela inicial: tocar, biblioteca e afinar, com a música sugerida para o nível do jogador. */
export const Main: React.FC = () => {
  const shelf = useShelf();
  const [first] = React.useState(() => {
    const { firstSongId } = levelSettings(loadLocalProfile().level ?? DEFAULT_LEVEL);
    return findFixedSong(firstSongId) ?? FIXED_SONGS[0];
  });
  const [a4] = React.useState(loadA4);
  const count = shelf.status === 'ready' ? String(shelf.songs.length) : '…';

  return (
    <Page>
      <Art />
      <Brand>
        <Title>
          Violin <span>Hero</span>
        </Title>
        <Subtitle>Aprenda violino tocando de verdade.</Subtitle>
      </Brand>
      <Menu aria-label="Menu principal">
        <MenuLink
          to={modesUrl()}
          primary
          label="Tocar"
          detail={
            <>
              {first.title} <span aria-hidden="true">▸</span>
            </>
          }
        />
        <MenuLink to={ROUTES.library} label="Biblioteca" detail={count} />
        <MenuLink
          to={ROUTES.calibration}
          state={{ song: first.song, mode: 'Arcade' } satisfies PlayState}
          label="Afinar"
          detail={`Lá ${a4}`}
        />
      </Menu>
      <Controls>
        <SessionStatus />
        <CornerLinks />
      </Controls>
    </Page>
  );
};
