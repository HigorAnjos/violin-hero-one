import { describe, expect, it } from 'vitest';
import { FpsMeter, formatFps, parseFpsFlag } from './fps';

describe('FpsMeter', () => {
  it('relata a média e o pior quadro quando a janela fecha', () => {
    const meter = new FpsMeter(990);
    let report = null;
    for (let i = 0; i < 59; i++) report = meter.frame(i === 10 ? 50 : 16);
    expect(report).toBeNull();
    report = meter.frame(16);
    expect(report).not.toBeNull();
    expect(report!.frames).toBe(60);
    expect(report!.averageFps).toBeCloseTo((60 * 1000) / (59 * 16 + 50));
    expect(report!.worstMs).toBe(50);
  });

  it('recomeça a janela e reaproveita o objeto', () => {
    const meter = new FpsMeter(100);
    const first = meter.frame(100);
    expect(first!.worstMs).toBe(100);
    meter.frame(20);
    const second = meter.frame(80);
    expect(second).toBe(first);
    expect(second!.frames).toBe(2);
    expect(second!.worstMs).toBe(80);
  });

  it('formata para o canto da tela', () => {
    expect(formatFps({ frames: 60, averageFps: 59.7, worstMs: 21.2 })).toBe('60 fps · pior 21 ms');
  });
});

describe('parseFpsFlag', () => {
  it.each([
    ['?fps=1', true],
    ['?fps=true', true],
    ['?fps=0', false],
    ['', false],
    ['?musica=ode&fps=1', true],
  ])('%s → %s', (search, expected) => {
    expect(parseFpsFlag(search)).toBe(expected);
  });
});
