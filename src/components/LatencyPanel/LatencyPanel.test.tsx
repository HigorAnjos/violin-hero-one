import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { CalibrationResult } from '../../game/audio';
import { renderScreen } from '../../shell/testing';
import { LatencyPanel, phaseText, type LatencyPanelProps } from './LatencyPanel';

const result = (reliable: boolean, hits: number): CalibrationResult => ({
  latencySeconds: reliable ? 0.142 : null,
  confidence: reliable ? 0.9 : 0.2,
  reliable,
  spreadSeconds: 0.01,
  samples: Array.from({ length: 8 }, (_, i) => ({ index: i, clickTime: i, attackTime: null, delaySeconds: null, status: i < hits ? 'hit' : 'missed' })),
});

describe('phaseText', () => {
  it('diz o que a medida está fazendo', () => {
    expect(phaseText({ kind: 'idle' })).toBeNull();
    expect(phaseText({ kind: 'measuring', beat: 3, total: 8, heard: 2 })?.text).toBe('Toque a corda Lá solta junto com cada clique · 3 de 8');
    expect(phaseText({ kind: 'done', result: result(true, 8) })?.text).toBe('Medida pronta: 142 ms, guardada neste aparelho.');
    expect(phaseText({ kind: 'done', result: result(false, 3) })?.text).toMatch(/^Não deu para medir \(3 de 8 tempos\)/);
  });
});

describe('LatencyPanel', () => {
  const props = (extra: Partial<LatencyPanelProps> = {}): LatencyPanelProps => ({
    phase: { kind: 'idle' },
    seconds: 0.142,
    measured: true,
    headphones: false,
    onHeadphones: vi.fn(),
    onMeasure: vi.fn(),
    onStart: vi.fn(),
    canMeasure: true,
    ...extra,
  });

  it('medida guardada: valor, AUTOMÁTICA e "Medir de novo"', async () => {
    const p = props();
    renderScreen(<LatencyPanel {...p} />);
    expect(screen.getByText('142 ms')).toBeInTheDocument();
    expect(screen.getByText('AUTOMÁTICA')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Medir de novo' }));
    expect(p.onMeasure).toHaveBeenCalled();
  });

  it('medindo: não deixa começar nem medir de novo', () => {
    renderScreen(<LatencyPanel {...props({ phase: { kind: 'measuring', beat: 1, total: 8, heard: 0 } })} />);
    expect(screen.getByRole('button', { name: /Começar/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Medir/ })).toBeDisabled();
  });

  it('a pergunta do fone anda pelas setas', async () => {
    const p = props();
    renderScreen(<LatencyPanel {...p} />);
    screen.getByRole('radio', { name: 'Não' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(p.onHeadphones).toHaveBeenCalledWith(true);
  });
});
