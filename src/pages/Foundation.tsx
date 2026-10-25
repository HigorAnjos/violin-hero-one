import React from 'react';
import styled from 'styled-components';

// Provisória: o floor ciclo0-tela-teste troca pela tela de teste no visual Caderno.
const Page = styled.main`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  color: ${({ theme }) => theme.colors.text};
`;

export const Foundation: React.FC = () => (
  <Page>
    <Title>Violin Hero</Title>
  </Page>
);
