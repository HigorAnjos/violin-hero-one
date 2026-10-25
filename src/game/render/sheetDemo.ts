/**
 * Bancada da partitura para o dev server (dev/partitura.html): toca uma música com leituras simuladas, sem microfone,
 * para medir fps e conferir o visual. Parâmetros: ?musica=<id>&tema=palco&fps=1&altura=112&laco=1-2&andamento=0.75
 * (laço A–B por compasso, a partir de 1, e fator de andamento; cada volta é um motor novo, como na prática).
 */
import { getTheme } from '../../assets/styles/themes';
import { createEngine, renderPerformance, type Engine } from '../engine';
import { FIXED_SONGS, findFixedSong } from '../notation/songs';
import { parseFpsFlag, type FpsReport } from './fps';
import { createSheet, type Sheet } from './sheet';
import type { BeatSegment, SheetClock } from './sheetLayout';

declare global {
  interface Window {
    __sheetFps?: FpsReport[];
  }
}

const params = new URLSearchParams(location.search);
const song = (findFixedSong(params.get('musica') ?? '') ?? FIXED_SONGS[1]).song;
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
  const now = clockNow();
  if (loop && now >= startAt + (live.lap + 1) * lapLength) startLap(live.lap + 1);
  const { engine, readings } = live;
  while (live.next < readings.length && readings[live.next].time <= now) engine?.push(readings[live.next++].reading);
  if (engine?.status === 'playing') engine.advance(now);
  sheet.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
