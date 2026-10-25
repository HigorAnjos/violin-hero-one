/**
 * Bancada da pista para o dev server (dev/pista.html): toca uma música com leituras simuladas, sem
 * microfone, para medir fps e conferir o visual. Parâmetros: ?musica=<id>&tema=palco&fps=1&reduzir=1.
 */
import { getTheme } from '../../assets/styles/themes';
import { createEngine, renderPerformance } from '../engine';
import { FIXED_SONGS, findFixedSong } from '../notation/songs';
import { createTrack, parseFpsFlag, stageBox, type FpsReport, type Track } from '.';

declare global {
  interface Window {
    __trackFps?: FpsReport[];
  }
}

const params = new URLSearchParams(location.search);
const song = (findFixedSong(params.get('musica') ?? '') ?? FIXED_SONGS[1]).song;
const theme = getTheme(params.get('tema'));
const clock = () => performance.now() / 1000;
const reports: FpsReport[] = (window.__trackFps = []);

document.documentElement.style.backgroundColor = theme.colors.background;
document.body.style.cssText =`margin:0;background:${theme.colors.background};overflow:hidden`;
const host = document.createElement('div');
host.style.position = 'absolute';
document.body.appendChild(host);

const live: { track?: Track } = {};
const startAt = clock() + 2;
const engine = createEngine({
  song,
  startAt,
  noFail: true,
  onEvent: (event) => {
    if (event.type === 'judgment') live.track?.onJudgment(event);
  },
});
const { readings } = renderPerformance(engine.notes, undefined, { errors: 4, seed: 7, offsetMs: 30 });

function place(): { width: number; height: number } {
  const box = stageBox(innerWidth, innerHeight);
  host.style.left = `${box.x}px`;
  host.style.top = `${box.y}px`;
  return box;
}

const size = place();
const track = (live.track = await createTrack(host, {
  theme,
  notes: engine.notes,
  ...size,
  showFps: parseFpsFlag(location.search),
  reducedMotion: params.has('reduzir') ? params.get('reduzir') === '1' : undefined,
  onFps: (r) => {
    reports.push({ ...r });
    console.info(`[pista] ${Math.round(r.averageFps)} fps, pior ${Math.round(r.worstMs)} ms`);
  },
}));

addEventListener('resize', () => {
  const box = place();
  track.resize(box.width, box.height);
});

let next = 0;
function frame() {
  const now = clock();
  while (next < readings.length && readings[next].time <= now) engine.push(readings[next++].reading);
  if (engine.status === 'playing') engine.advance(now);
  track.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
