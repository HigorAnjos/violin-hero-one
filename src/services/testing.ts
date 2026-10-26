// Só para testes: o banco do catálogo de mentira, com as 10 músicas da estante e os 3 níveis.
import { vi } from 'vitest';
import { CATALOG_ORDER } from '../game/notation/catalog';
import { LEVELS, songDurationSeconds, type Level, type Song } from '../game/notation/song';
import { FIXED_SONGS } from '../game/notation/songs';
import type { SongsClient } from './songs';

const titleOf = (id: string) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Chart de qualquer música do catálogo: as notas de uma embutida, com id, título e nível trocados. */
export function fakeChart(id: string, level: Level): Song {
  const base = FIXED_SONGS[CATALOG_ORDER.indexOf(id) % FIXED_SONGS.length]?.song ?? FIXED_SONGS[0].song;
  const fixed = FIXED_SONGS.find((s) => s.id === id);
  return { ...base, id, title: fixed?.title ?? titleOf(id), level };
}

function sheetRow(id: string) {
  const chart = fakeChart(id, 'easy');
  return {
    id,
    title: chart.title,
    composer: id === 'escala-re-maior' ? '' : 'Tradicional',
    bpm: String(chart.bpm),
    time_beats: chart.timeSignature.beats,
    time_unit: chart.timeSignature.unit,
    key: chart.key,
    duration_seconds: String(songDurationSeconds(chart)),
    origin: 'catalog',
  };
}

export interface FakeCatalog {
  client: SongsClient;
  rpc: ReturnType<typeof vi.fn>;
}

/** `ids`: a estante (padrão: as 10 da ordem do catálogo). `failRpc`: get_song responde erro. */
export function fakeCatalogClient({ ids = CATALOG_ORDER, failRpc = false }: { ids?: readonly string[]; failRpc?: boolean } = {}): FakeCatalog {
  const rows = ids.map((id) => ({ ...sheetRow(id), song_charts: LEVELS.map((level) => ({ level })) }));
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  for (const fn of [query.select, query.eq, query.not, query.order]) fn.mockReturnValue(query);
  const rpc = vi.fn(async (_name: string, { p_song_id, p_level }: { p_song_id: string; p_level: Level }) => {
    if (failRpc) return { data: null, error: { message: 'boom' } };
    if (!ids.includes(p_song_id)) return { data: [], error: null };
    const chart = fakeChart(p_song_id, p_level);
    return { data: [{ ...sheetRow(p_song_id), level: p_level, format_version: 1, chart, hash: 'f'.repeat(64) }], error: null };
  });
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1', is_anonymous: true } } }, error: null }),
    signInAnonymously: vi.fn(),
  };
  return { client: { auth, from: vi.fn().mockReturnValue(query), rpc } as unknown as SongsClient, rpc };
}
