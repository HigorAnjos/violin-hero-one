import { createOrchestra, type LoopRange, type OrchestraOptions, type OrchestraSettings } from '../game/synth';
import type { Song } from '../game/notation/song';

/** A parte da orquestra (src/game/synth) que a partida usa; os testes passam uma falsa. */
export interface GameOrchestra {
  /** O state de cada julgamento do Motor (energia e combo). */
  update(drive: { energy: number; combo: number }): void;
  /** Notas MIDI que a orquestra toca no instante (relógio do contexto): o motor descarta o vazamento. */
  soundingAt(t: number): number[];
  setVolume(volume: number): void;
  /** Prática: o andamento e o laço seguem os da linha do tempo da shell, nos mesmos instantes (relógio do contexto). */
  setTempo?(factor: number, at?: number): number;
  setLoop?(range: LoopRange | null): number;
  stop(fadeSeconds?: number): Promise<void>;
  dispose(): void;
}

export type OrchestraStart = Pick<OrchestraOptions, 'startAt' | 'bpm' | 'tempo' | 'a4' | 'energy' | 'volume' | 'enabled' | 'headphones'>;

export type OrchestraFactory = (context: BaseAudioContext, song: Song, options: OrchestraStart) => Promise<GameOrchestra>;

/** O tone vem sob demanda de dentro do createOrchestra: importar o synth não o põe no download inicial. */
export const loadOrchestra: OrchestraFactory = createOrchestra;

export type OrchestraPrefs = OrchestraSettings;
