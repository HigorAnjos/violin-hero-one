/**
 * Bancada da partitura para o dev server (dev/partitura.html): toca uma música com leituras simuladas, sem microfone,
 * para medir fps e conferir o visual. Parâmetros: ?musica=<id>&nivel=hard&tema=palco&fps=1&altura=112&laco=1-2&andamento=0.75
 * &em=12 (laço A–B por compasso, a partir de 1, e fator de andamento; cada volta é um motor novo, como na prática; `em`
 * congela a faixa nesse tempo da música, para conferir pausas e ligaduras). A música pode ser qualquer uma de
 * content/songs, convertida aqui mesmo: a bancada não entra no build.
 */
import { getTheme } from '../../assets/styles/themes';
import { createEngine, renderPerformance, type Engine } from '../engine';
import { n } from '../engine/testing';
import { convertSongChart } from '../notation/catalog';
import type { Level, Song } from '../notation/song';
import { FIXED_SONGS, findFixedSong } from '../notation/songs';
import { parseFpsFlag, type FpsReport } from './fps';
import { createSheet, type Sheet } from './sheet';
import type { BeatSegment, SheetClock } from './sheetLayout';

declare global {
  interface Window {
    __sheetFps?: FpsReport[];
  }
}

/**
 * Amostra para conferir a escrita (?musica=pausas): toda figura de pausa, a pontuada, ligaduras dentro do compasso,
 * por cima da barra, acima e abaixo das cabeças, e uma ligadura no fim do compasso 7 para o laço 6-7 cortar.
 */
const SAMPLE: Song = {
  ...FIXED_SONGS[1].song,
  id: 'pausas',
  title: 'Pausas e ligaduras',
  measures: [
    { beats: 4, notes: [n(0, 1, 74, 2, 3)] },
    { beats: 4, notes: [] },
    { beats: 4, notes: [n(0, 0.25, 74, 2, 3), n(1, 1, 76, 3, 0), n(2.75, 0.25, 78, 3, 1), n(3, 1, 79, 3, 2)] },
    { beats: 4, notes: [n(0, 2, 81, 3, 3), n(2, 2, 81, 3, 3, true)] },
    { beats: 4, notes: [n(0, 1, 81, 3, 3, true)] },
    { beats: 4, notes: [n(0, 3, 69, 2, 0), n(3, 1, 69, 2, 0, true)] },
    { beats: 4, notes: [n(0, 2, 69, 2, 0, true), n(2, 1.5, 71, 2, 1), n(3.5, 0.5, 71, 2, 1, true)] },
    { beats: 4, notes: [n(0, 1, 71, 2, 1, true), n(2, 2, 74, 2, 3)] },
  ],
};

const params = new URLSearchParams(location.search);
const SOURCES = import.meta.glob('../../../content/songs/*.musicxml', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const id = params.get('musica') ?? '';
const level = (params.get('nivel') ?? 'easy') as Level;
const source = SOURCES[`../../../content/songs/${id}.musicxml`] as (() => Promise<string>) | undefined;
const song =
  id === SAMPLE.id
    ? SAMPLE
    : source && (level !== 'easy' || !findFixedSong(id))
      ? convertSongChart({ name: `${id}.musicxml`, content: await source() }, level)
      : (findFixedSong(id) ?? FIXED_SONGS[1]).song;
const frozenBeat = params.has('em') ? Number(params.get('em')) : null;
const theme = getTheme(params.get('tema'));
// Padrão: a proporção da tela 5b (280 px numa tela de 720)
const height = Number(params.get('altura') ?? Math.round((innerHeight * 280) / 720));
const factor = Number(params.get('andamento') ?? 1);
const spb = 60 / (song.bpm * factor);
const loop = /^(\d+)-(\d+)$/.exec(params.get('laco') ?? '');
const clockNow = () => performance.now() / 1000;
const reports: FpsReport[] = (window.__sheetFps = []);

const starts = [0];
for (const m of song.measures) starts.push(starts[starts.length - 1] + m.beats);
const from = loop ? Number(loop[1]) - 1 : 0;
const to = loop ? Number(loop[2]) : song.measures.length;
const startBeat = starts[from];
const endBeat = starts[to];
const startAt = clockNow() + 2;

/** Laço até o fim da bancada: uma volta de A ao fim de B atrás da outra, todas no mesmo andamento. */
const segments: BeatSegment[] = [];
for (let lap = 0, time = startAt; lap < (loop ? 200 : 1); lap++) {
  const length = (endBeat - startBeat) * spb;
  segments.push({ time, beat: startBeat, spb, endTime: loop ? time + length : Infinity, endBeat: loop ? endBeat : Infinity });
  time += length;
}
const clock: SheetClock = { segments: () => segments };
const lapLength = (endBeat - startBeat) * spb;

document.documentElement.style.backgroundColor = theme.colors.background;
document.body.style.cssText = `margin:0;background:${theme.colors.background};overflow:hidden`;
const host = document.createElement('div');
host.style.cssText = 'position:absolute;left:40px;right:40px;top:92px';
document.body.appendChild(host);

const live: { sheet?: Sheet; engine?: Engine; lap: number; readings: ReturnType<typeof renderPerformance>['readings']; next: number } = {
  lap: -1,
  readings: [],
  next: 0,
};

function startLap(lap: number) {
  const engine = createEngine({
    song,
    startAt: startAt + lap * lapLength,
    bpm: song.bpm * factor,
    section: { from, to },
    noFail: true,
    onEvent: (event) => {
      if (event.type === 'judgment') live.sheet?.onJudgment(event);
    },
  });
  live.engine = engine;
  live.lap = lap;
  live.readings = renderPerformance(engine.notes, undefined, { errors: 4, seed: 7 + lap, offsetMs: 30 }).readings;
  live.next = 0;
}
startLap(0);

const width = () => innerWidth - 80;
const sheet = (live.sheet = await createSheet(host, {
  theme,
  song,
  clock,
  width: width(),
  height,
  showFps: parseFpsFlag(location.search),
  onFps: (r) => {
    reports.push({ ...r });
    console.info(`[partitura] ${Math.round(r.averageFps)} fps, pior ${Math.round(r.worstMs)} ms`);
  },
}));

addEventListener('resize', () => sheet.resize(width(), height));

function frame() {
  const now = frozenBeat === null ? clockNow() : startAt + (frozenBeat - startBeat) * spb;
  if (loop && now >= startAt + (live.lap + 1) * lapLength) startLap(live.lap + 1);
  const { engine, readings } = live;
  while (live.next < readings.length && readings[live.next].time <= now) engine?.push(readings[live.next++].reading);
  if (engine?.status === 'playing') engine.advance(now);
  sheet.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
