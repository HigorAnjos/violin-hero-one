import styled from 'styled-components';
import { navigationPageInsets } from '../components/BackLink/BackLink';

export const ClassroomPage = styled.main`
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  color: ${({ theme }) => theme.colors.text};
  ${navigationPageInsets}
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  h1, h2 { font-family: ${({ theme }) => theme.fonts.display}; }
  h1 { font-size: 1.75rem; line-height: 1.2; }
  h2 { font-size: 1.25rem; }
  p, label, li { font-size: 0.875rem; }
  small { font-size: 0.8125rem; color: ${({ theme }) => theme.colors.textMuted}; }
  input, select { min-height: 44px; padding: 0.5rem; max-width: 100%; color: inherit; background: ${({ theme }) => theme.colors.background}; border: 2px solid ${({ theme }) => theme.colors.surfaceBorder}; border-radius: 8px; font: inherit; }
  @media (max-height: 500px) { gap: 0.625rem; h1 { font-size: 1.375rem; } }
`;
export const ClassroomContent = styled.div`
  min-height: 0;
  overflow: auto;
  padding: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;
export const ClassroomCard = styled.section`
  padding: 1rem;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  overflow-wrap: anywhere;
`;
export const ClassroomGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
  @media (max-width: 650px) { grid-template-columns: minmax(0, 1fr); }
`;
