import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import styled, { css } from 'styled-components';

const Item = styled(Link)<{ $primary: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: 3.25rem;
  padding: 0 1.25rem;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 2.5px solid ${({ theme }) => theme.colors.text};
  font-weight: 800;
  font-size: 1.0625rem;
  line-height: 1;
  transition:
    transform 0.08s,
    box-shadow 0.08s;

  ${({ theme, $primary }) =>
    $primary
      ? css`
          background-color: ${theme.colors.text};
          color: ${theme.colors.background};
          box-shadow: 0 4px 0 ${theme.colors.info.main};
        `
      : css`
          background-color: ${theme.colors.surface};
          color: ${theme.colors.text};
          box-shadow: 0 4px 0 ${theme.colors.text};
        `}

  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    font-size: 0.8125rem;
    color: ${({ theme, $primary }) => ($primary ? theme.colors.surfaceBorder : theme.colors.textMuted)};
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    &:hover {
      transform: translateY(2px);
      box-shadow: 0 2px 0 ${({ theme, $primary }) => ($primary ? theme.colors.info.main : theme.colors.text)};
    }
  }

  @media (max-height: 500px) {
    min-height: 2.75rem;
    font-size: 0.9375rem;
  }
`;

/** Botão grande do menu principal (a.vb do design): rótulo à esquerda e um detalhe curto à direita. */
export const MenuLink: React.FC<LinkProps & { label: string; detail?: React.ReactNode; primary?: boolean }> = ({
  label,
  detail,
  primary = false,
  ...link
}) => (
  <Item {...link} $primary={primary}>
    <span>{label}</span>{' '}
    {detail !== undefined && <small>{detail}</small>}
  </Item>
);
