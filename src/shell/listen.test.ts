import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor, editorSong, insertNote, setCursor, setDuration, songToSave } from '../game/notation/editor';
import { listen, previewNotes, songFrom } from './listen';

const scale = () => songToSave([62, 64, 66, 67, 69, 71, 73, 74].reduce((s, m) => insertNote(s, m), createEditor()));

/** AudioContext de mentira: guarda as notas agendadas. */
function fakeContext() {
  const started: number[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn((next: unknown) => next) });
  const context = {
    state: 'running',
    currentTime: 10,
    destination: node(),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createOscillator: () => ({ ...node(), type: '', frequency: param(), start: (t: number) => started.push(t), stop: vi.fn() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param() }),
    createGain: () => ({ ...node(), gain: param() }),
  };
  return { context: context as unknown as AudioContext, started, raw: context };
}

describe('ouvir o que foi escrito', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('um ataque por nota, no andamento da música; ligadura estica a anterior', () => {
    let state = setDuration(setCursor(createEditor(), 3), 2);
    state = insertNote(state, 69); // Lá ligado sobre a barra
    const notes = previewNotes(editorSong(state), 1, 440);
    expect(notes).toHaveLength(1);
    expect(notes[0].time).toBeCloseTo(1 + 3 * (60 / 72));
    expect(notes[0].duration).toBeCloseTo(2 * (60 / 72));
    expect(notes[0].frequency).toBeCloseTo(440);
  });

  it('daqui: a música começa no compasso do cursor e a ligadura que perdeu o começo vira ataque', () => {
    let state = setDuration(setCursor(createEditor(), 3), 2);
    state = insertNote(state, 69);
    const part = songFrom(editorSong(state), 1);
    expect(part.measures[0].notes[0].tie).toBeUndefined();
    expect(songFrom(editorSong(state), 99).measures).toHaveLength(1);
  });

  it('agenda a melodia e a orquestra com o mesmo primeiro tempo e fecha tudo no fim', async () => {
    vi.useFakeTimers();
    const { context, started, raw } = fakeContext();
    const band = { dispose: vi.fn() };
    const orchestra = vi.fn().mockResolvedValue(band);
    const playing = await listen(scale(), { createContext: () => context, orchestra });
    expect(started).toHaveLength(8);
    expect(started[0]).toBeCloseTo(10.25);
    expect(orchestra).toHaveBeenCalledWith(context, expect.objectContaining({ title: 'Sem título' }), expect.objectContaining({ startAt: started[0], headphones: true }));
    vi.advanceTimersByTime(8 * (60 / 72) * 1000 + 1000);
    await playing.done;
    expect(band.dispose).toHaveBeenCalled();
    expect(raw.close).toHaveBeenCalled();
  });

  it('parar antes do fim; orquestra que não carrega não cala a melodia', async () => {
    const { context, started } = fakeContext();
    const playing = await listen(scale(), { createContext: () => context, orchestra: vi.fn().mockRejectedValue(new Error('sem tone')) });
    expect(started).toHaveLength(8);
    playing.stop();
    playing.stop();
    await expect(playing.done).resolves.toBeUndefined();
  });
});
