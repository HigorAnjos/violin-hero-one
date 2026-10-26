import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('sem internet: quantas dá para tocar', () => {
    renderScreen(<OfflineBanner reason="offline" count={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem internet');
    expect(screen.getByRole('status')).toHaveTextContent('as 3 músicas que vêm no app');
  });

  it('erro do servidor tem outro título', () => {
    renderScreen(<OfflineBanner reason="server" count={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('Servidor fora do ar');
  });
});
