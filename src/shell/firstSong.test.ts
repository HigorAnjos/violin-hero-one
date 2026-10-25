import { describe, it, expect } from 'vitest';
import { songProblems } from '../game/notation/song';
import { WARM_UP_SONG } from './firstSong';

describe('WARM_UP_SONG', () => {
  it('é uma Song v1 válida', () => {
    expect(songProblems(WARM_UP_SONG)).toEqual([]);
  });
});
