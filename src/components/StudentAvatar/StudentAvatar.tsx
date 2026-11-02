import styled from 'styled-components';
import type { StringName } from '../../assets/styles/themes/types';

const COLORS: readonly StringName[] = ['E', 'G', 'D', 'A'];

/** "Ana Luísa" → "AN": as duas primeiras letras do primeiro nome, como os círculos do design. */
export function initials(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.normalize('NFC').slice(0, 2).toUpperCase() || '?';
}

/** A mesma cor para o mesmo aluno em toda tela (uma das quatro cordas, com a letra legível em cima). */
export function avatarString(id: string): StringName {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

const Circle = styled.span<{ $string: StringName; $size: number }>`
  flex: none;
  width: ${({ $size }) => $size}rem;
  height: ${({ $size }) => $size}rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $string }) => theme.game.strings[$string].main};
  color: ${({ theme, $string }) => theme.game.strings[$string].text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: ${({ $size }) => Math.max(0.75, $size * 0.36)}rem;
  line-height: 1;
`;

/** O círculo com as iniciais; decorativo (o nome está sempre escrito ao lado). */
export const StudentAvatar = ({ id, name, size = 2.125 }: { id: string; name: string; size?: number }) => (
  <Circle aria-hidden="true" $string={avatarString(id)} $size={size}>
    {initials(name)}
  </Circle>
);
