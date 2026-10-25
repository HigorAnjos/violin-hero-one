import React from 'react';
import styled, { css } from 'styled-components';
import { SessionStatus } from '../components/SessionStatus/SessionStatus';
import { StringLegend } from '../components/StringLegend/StringLegend';
import { ThemeSwitch } from '../components/ThemeSwitch/ThemeSwitch';

const Page = styled.main`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.xl};
  padding: clamp(1rem, 7vh, 4rem) clamp(1rem, 6vw, 5rem);

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.md};
  }
`;

/** Pauta decorativa: cinco linhas, como no papel do caderno. */
const Staff = styled.div<{ $at: 'top' | 'bottom' }>`
  position: absolute;
  left: 0;
  right: 0;
  height: 5.125rem;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to bottom,
    ${({ theme }) => theme.colors.surfaceBorder} 0 2px,
    transparent 2px 1.25rem
  );
  ${({ $at }) =>
    $at === 'top'
      ? css`
          top: 16.5%;
        `
      : css`
          bottom: 11%;
        `}

  @media (max-height: 500px) {
    display: ${({ $at }) => ($at === 'top' ? 'none' : 'block')};
  }
`;

const Header = styled.header`
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Brand = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
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
    font-size: 3rem;
  }
`;

const Subtitle = styled.p`
  font-weight: 700;
  font-size: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Strings = styled.section`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  max-width: 48rem;
`;

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1.1;
  color: ${({ theme }) => theme.colors.text};
`;

/** Tela de teste do ciclo 0: tema, cordas e sessão funcionando juntos. */
export const Foundation: React.FC = () => (
  <Page>
    <Staff $at="top" aria-hidden="true" />
    <Staff $at="bottom" aria-hidden="true" />
    <Header>
      <Brand>
        <Title>
          Violin <span>Hero</span>
        </Title>
        <Subtitle>Aprenda violino tocando de verdade.</Subtitle>
      </Brand>
      <Controls>
        <SessionStatus />
        <ThemeSwitch />
      </Controls>
    </Header>
    <Strings aria-labelledby="cordas-titulo">
      <SectionTitle id="cordas-titulo">As quatro cordas</SectionTitle>
      <StringLegend />
    </Strings>
  </Page>
);
