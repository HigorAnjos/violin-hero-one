import { fireEvent, screen } from '@testing-library/react';
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

  it('celular deitado com o botão Pauta desligado: só o fio do andamento, sem a pauta', () => {
    const ref = React.createRef<SheetStripHandle>();
    renderScreen(<SheetStrip ref={ref} song={ODE} measure={1} elapsed={102} total={192} past={0} next={{ midi: 74, string: 2, finger: 3 }} compact staff={false} />);
    expect(screen.getByRole('progressbar', { name: 'Andamento da música' })).toHaveAttribute('aria-valuenow', '53');
    expect(screen.queryByRole('region', { name: 'Partitura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // A tela de jogo segue chamando a cada quadro
    expect(() => ref.current?.setBeat(2)).not.toThrow();
  });

  it('celular deitado com o botão Pauta ligado: a faixa compacta, com o agora mais perto da clave', () => {
    const ref = React.createRef<SheetStripHandle>();
    const { container } = renderScreen(<SheetStrip ref={ref} song={ODE} measure={1} elapsed={102} total={192} past={0} next={{ midi: 74, string: 2, finger: 3 }} compact />);
    expect(screen.getByRole('region', { name: 'Partitura' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Partitura: agora Ré5, corda Lá, 3º dedo' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Andamento da música' })).toHaveAttribute('aria-valuenow', '53');
    ref.current?.setBeat(2);
    // 150 − 2 × 56
    expect(container.querySelector('g[transform="translate(38.0 0)"]')).toBeInTheDocument();
  });

  it('a pauta que volta (botão Pauta) entra no tempo de agora, não no começo da música', () => {
    const ref = React.createRef<SheetStripHandle>();
    const Harness = () => {
      const [staff, setStaff] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setStaff(true)}>
            Pauta
          </button>
          <SheetStrip ref={ref} song={ODE} measure={1} elapsed={0} total={10} past={0} next={null} compact staff={staff} />
        </>
      );
    };
    const { container } = renderScreen(<Harness />);
    ref.current?.setBeat(2);
    fireEvent.click(screen.getByRole('button', { name: 'Pauta' }));
    expect(container.querySelector('g[transform="translate(38.0 0)"]')).toBeInTheDocument();
  });

  it('fora do celular deitado o botão Pauta não vale: a pauta do desktop', () => {
    const { container } = renderScreen(<SheetStrip song={ODE} measure={0} elapsed={0} total={10} past={0} next={null} staff={false} />);
    expect(screen.getByRole('region', { name: 'Partitura' })).toBeInTheDocument();
    expect(container.querySelector('g[transform^="translate(240"]')).toBeInTheDocument();
  });

  it('parada (pausa): rótulo próprio, sem relógio', () => {
    renderScreen(<SheetStrip song={ODE} measure={17} elapsed={0} total={10} past={0} next={null} paused />);
    expect(screen.getByRole('region', { name: 'Partitura parada' })).toHaveTextContent('Partitura · parada no compasso 18');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
