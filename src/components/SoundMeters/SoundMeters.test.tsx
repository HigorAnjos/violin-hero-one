import { act, renderHook, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createFakeEar, reading } from '../../shell/fakeEar';
import { renderScreen } from '../../shell/testing';
import { SoundMeters } from './SoundMeters';
import { meterFraction, noiseView, SILENCE_DB, useSoundMeters, volumeView } from './meterLevels';

describe('medidores', () => {
  it('fração de -60 a 0 dBFS', () => {
    expect(meterFraction(SILENCE_DB)).toBe(0);
    expect(meterFraction(-30)).toBe(0.5);
    expect(meterFraction(3)).toBe(1);
  });

  it('volume: baixo, bom, alto', () => {
    expect(volumeView(-50).word).toBe('baixo');
    expect(volumeView(-20)).toMatchObject({ word: 'bom', tone: 'info' });
    expect(volumeView(-3).word).toBe('alto');
  });

  it('ruído: baixo, médio, alto', () => {
    expect(noiseView(-55).word).toBe('baixo');
    expect(noiseView(-45).word).toBe('médio');
    expect(noiseView(-20)).toMatchObject({ word: 'alto', tone: 'danger' });
  });
});

describe('useSoundMeters', () => {
  it('nível com nota clara é volume; sem nota, é ruído', () => {
    const ear = createFakeEar();
    const { result } = renderHook(() => useSoundMeters(ear));
    act(() => {
      ear.pitch(reading(69, 0));
      for (let i = 0; i < 30; i++) ear.level(-20);
    });
    expect(result.current.volumeDb).toBeCloseTo(-20, 0);
    expect(result.current.noiseDb).toBe(SILENCE_DB);
    act(() => {
      ear.pitch(null);
      for (let i = 0; i < 80; i++) ear.level(-55);
    });
    expect(result.current.noiseDb).toBeCloseTo(-55, 0);
    expect(result.current.volumeDb).toBeLessThan(-90);
  });
});

describe('SoundMeters', () => {
  it('cada medidor diz a palavra e quantos segmentos acendem', () => {
    renderScreen(<SoundMeters volumeDb={-20} noiseDb={-55} />);
    expect(screen.getByRole('region', { name: 'Como está o som' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Volume: bom, 8 de 12' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ruído do ambiente: baixo, 1 de 12' })).toBeInTheDocument();
  });
});
