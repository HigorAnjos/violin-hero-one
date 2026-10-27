import React from 'react';
import { Link } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Button } from '../components/Button/Button';
import { Kicker, Lead } from '../components/Screen/Screen';
import { EMBEDDED_SHELF } from '../services/shelf';
import { loadingUrl, songsUrl } from '../shell/choice';
import { DEFAULT_MODE } from '../shell/play';

const Box = styled.section`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.125rem;
  padding: ${({ theme }) => theme.spacing.lg};
  border: 1.5px dashed ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  text-align: center;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => theme.spacing.sm};
  }
`;

const Drawing = styled.svg`
  width: 7.5rem;
  height: 9.375rem;

  @media (max-height: 500px) {
    display: none;
  }
`;

const Heading = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.625rem;

  @media (max-height: 500px) {
    font-size: 1.25rem;
  }
`;

const Text = styled(Lead)`
  max-width: 32.5rem;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Free = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  width: min(47.5rem, 100%);
  margin-top: ${({ theme }) => theme.spacing.xs};
  text-align: left;

  ul {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: ${({ theme }) => theme.spacing.sm};
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    margin-top: 0;
  }
`;

const Mini = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  padding: 0.625rem 0.75rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;

  i {
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 3px;
  }

  span {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.875rem;
  }

  small {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  em {
    margin-left: auto;
    font-style: normal;
    color: ${({ theme }) => theme.colors.info.text};
  }

  @media (hover: hover) {
    &:hover {
      border-color: ${({ theme }) => theme.colors.primary.main};
    }
  }

  @media (max-height: 500px) {
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.xs}`};

    i {
      width: 1.75rem;
      height: 1.75rem;
    }
  }
`;

const SWATCH = ['G', 'A', 'D'] as const;

/** 8b · Biblioteca vazia: o catálogo veio sem músicas; as do app ficam à mão para começar. */
export const LibraryEmpty: React.FC = () => {
  const { colors, game } = useTheme();
  const [first] = EMBEDDED_SHELF;
  return (
    <Box aria-labelledby="biblioteca-vazia">
      <Drawing viewBox="0 0 200 250" aria-hidden="true">
        <g fill="none" stroke={colors.surfaceBorder} strokeWidth="5" strokeDasharray="10 8">
          <path d="M100 30 C140 28 172 38 172 82 C172 122 156 136 162 150 L150 156 C141 170 141 188 150 200 L162 206 C172 218 190 230 190 240" />
          <path d="M100 30 C60 28 28 38 28 82 C28 122 44 136 38 150 L50 156 C59 170 59 188 50 200 L38 206 C28 218 10 230 10 240" />
        </g>
        <circle cx="100" cy="135" r="34" fill={colors.background} stroke={colors.primary.main} strokeWidth="4" />
        <path d="M100 116v38 M81 135h38" stroke={colors.primary.main} strokeWidth="5" strokeLinecap="round" />
      </Drawing>
      <Heading id="biblioteca-vazia">Sua biblioteca ainda está vazia</Heading>
      <Text>Toque uma das músicas grátis abaixo. Elas vêm no app e funcionam até sem internet. Os selos vêm jogando.</Text>
      <Actions>
        <Button as={Link} to={loadingUrl({ mode: DEFAULT_MODE, songId: first.id, level: 'easy' })}>
          Tocar a primeira grátis <span aria-hidden="true">▸</span>
        </Button>
      </Actions>
      <Free>
        <Kicker id="gratis">Grátis para começar</Kicker>
        <ul aria-labelledby="gratis">
          {EMBEDDED_SHELF.map((song, i) => (
            <li key={song.id}>
              <Mini to={songsUrl(DEFAULT_MODE, song.id)}>
                <i style={{ backgroundColor: game.strings[SWATCH[i % SWATCH.length]].main }} aria-hidden="true" />
                <span>
                  <b>{song.title}</b>
                  <small>{song.composer || 'Treino'} · Fácil</small>
                </span>
                <em aria-hidden="true">▸</em>
              </Mini>
            </li>
          ))}
        </ul>
      </Free>
    </Box>
  );
};
