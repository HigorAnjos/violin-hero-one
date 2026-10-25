import { screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { ODE } from '../../game/engine/testing';
import { renderScreen } from '../../shell/testing';
import { SheetStrip, type SheetStripHandle } from './SheetStrip';

describe('SheetStrip', () => {
  it('compasso, tempo, andamento e a nota da vez para leitor de tela', () => {
    renderScreen(<SheetStrip song={ODE} measure={1} elapsed={102} total={192} past={0} next={{ midi: 74, string: 2, finger: 3 }} />);
    expect(screen.getByText(/Partitura · compasso/)).toHaveTextContent('Partitura · compasso 2');
    expect(screen.getByText('1:42')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Andamento da música' })).toHaveAttribute('aria-valuenow', '53');
    expect(screen.getByRole('img', { name: 'Partitura: agora Ré5, corda Lá, 3º dedo' })).toBeInTheDocument();
  });

  it('corre a pauta pelo tempo sem renderizar e apaga as notas passadas', () => {
    const ref = React.createRef<SheetStripHandle>();
    const { container } = renderScreen(<SheetStrip ref={ref} song={ODE} measure={0} elapsed={0} total={10} past={3} next={null} />);
    ref.current?.setBeat(2);
    expect(container.querySelector('g[transform^="translate(128"]')).toBeInTheDocument();
    expect(container.querySelectorAll('g[opacity="0.35"]')).toHaveLength(3);
  });

  it('parada (pausa): rótulo próprio, sem relógio', () => {
    renderScreen(<SheetStrip song={ODE} measure={17} elapsed={0} total={10} past={0} next={null} paused />);
    expect(screen.getByRole('region', { name: 'Partitura parada' })).toHaveTextContent('Partitura · parada no compasso 18');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
