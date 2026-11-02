import React from 'react';
import styled from 'styled-components';

/** Duas iniciais do nome da turma ("Iniciantes · sábado" → "IS"); sem letras, "T". */
export function classInitials(name: string): string {
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[A-Za-z0-9]+/g) ?? [];
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? 'T').slice(0, 2);
  return letters.toUpperCase();
}

const Avatar = styled.span<{ $size: number }>`
  width: ${({ $size }) => $size / 16}rem;
  height: ${({ $size }) => $size / 16}rem;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.info.main};
  color: ${({ theme }) => theme.colors.background};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: ${({ $size }) => Math.max(12, Math.round($size * 0.4)) / 16}rem;
  line-height: 1;
`;

/** A bolinha da turma (o "HM" do design): iniciais da turma, que é o que o aluno conhece. */
export const ClassAvatar: React.FC<{ name: string; size?: number }> = ({ name, size = 36 }) => (
  <Avatar aria-hidden="true" $size={size}>
    {classInitials(name)}
  </Avatar>
);
