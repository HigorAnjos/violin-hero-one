import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  type Material,
  type Texture,
} from 'three';
import type { Theme } from '../../assets/styles/themes';
import type { EngineNote } from '../engine/types';
import { lowerBound, maxNotesInWindow, tailSeconds } from './layout';
import { strings3dPalette, type Strings3DPalette } from './palette';
import { feedbackAlpha, glowRing } from './present';
import type { JudgmentEvent } from './scene';
import { beatWindows, windowTime, type BeatWindow, type SheetClock } from './sheetLayout';
import {
  BOX,
  boxScale,
  CASA_OFFSET,
  casaOf,
  columnsFor,
  entryAlpha3d,
  FLOOR_LENGTH,
  LEAD_SECONDS_3D,
  LETTER_HEIGHT,
  LETTER_OFFSET,
  noteZ,
  NUMBER_HEIGHT,
  NUMBER_Z,
  STRING_HEIGHTS,
  STRING_OVERHANG,
  strings3dLayout,
  type Strings3DLayout,
} from './strings3dLayout';

/** Textura assada uma vez e a proporção dela (largura / altura), para a placa não deformar. */
export interface Baked {
  texture: Texture;
  aspect: number;
}

/** Quem desenha os rótulos em textura (canvas no navegador; falso nos testes). */
export interface LabelBaker {
  /** Texto branco numa linha, fundo transparente: a cor vem do material (letra, casa, compasso). */
  text(text: string, font: string): Baked;
  /** Caixa da nota: retângulo arredondado na cor da corda com o dedo escrito na cor do texto da corda. */
  box(text: string, fill: number, color: number, font: string): Baked;
  /** Contorno arredondado branco, do tamanho da caixa (acerto). */
  frame(): Baked;
}

export interface Strings3DSceneOptions {
  theme: Theme;
  notes: readonly EngineNote[];
  reducedMotion: boolean;
  /** Segundos do fundo até a corda (LevelSettings.trackLeadSeconds); padrão LEAD_SECONDS_3D. */
  leadSeconds?: number;
  /** O tempo da música (o da partitura): sem ele, o chão fica sem as linhas dos tempos. */
  clock?: SheetClock;
  /** Tempo, desde o começo da música, em que cada compasso começa: barras mais fortes e o número do compasso. */
  bars?: readonly number[];
}

const HIT = 1;
const MISSED = 2;
const MISSED_ALPHA = 0.35;
/** O erro fica na corda, apagado, este tanto antes de sumir. */
const MISS_FADE_SECONDS = 0.5;
const TAIL_ALPHA = 0.5;
const SHADOW_ALPHA = 0.35;
const HIGHLIGHT_ALPHA = 0.12;
const STRING_THICKNESS = 0.035;
const STEM_WIDTH = 0.025;
const BORDER_WIDTH = 0.05;
const TAIL_WIDTH = 0.24;
const VIBRATE_SECONDS = 0.4;
const VIBRATE_AMPLITUDE = 0.035;
const STRING_SEGMENTS = 48;
const MAX_GRID_LINES = 48;
const MAX_BAR_LABELS = 6;
/** Tempos à frente procurados no relógio: o laço curto ou o andamento lento cabem com folga. */
const GRID_AHEAD_BEATS = 64;
/** Ergue as camadas do chão um fio, sem briga de profundidade. */
const LIFT = 0.002;

// Ordem de desenho (sem teste de profundidade, de trás para a frente dentro de cada camada)
const ORDER = { floor: 0, overlay: 1, grid: 2, tail: 3, shadow: 4, string: 5, stem: 6, label: 7, box: 8, frame: 9 } as const;

interface Chip {
  box: Sprite;
  stem: Mesh;
  shadow: Mesh;
  tail: Mesh;
  /** Barra do "segure", embaixo da caixa: o fundo e quanto já foi. */
  holdBack: Sprite;
  holdFill: Sprite;
}

const basic = (color: number, opacity = 1) =>
  new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: DoubleSide });

const sprite = (map: Texture | null, color = 0xffffff) =>
  new Sprite(new SpriteMaterial({ map, color, transparent: true, depthTest: false, depthWrite: false }));

function flat(mesh: Mesh): Mesh {
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * As Cordas 3D: chão do braço com uma coluna por casa, as quatro cordas G D A E na frente, cada uma com a cor e a letra,
 * e as notas vindo do fundo no relógio do AudioContext. Nada é alocado em update(); o tema é fixo na vida da cena.
 */
export class Strings3DScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.1, 200);
  private readonly palette: Strings3DPalette;
  private readonly reducedMotion: boolean;
  private readonly lead: number;
  private readonly clock: SheetClock | null;
  private readonly bars: readonly number[];
  private readonly columns: number;
  private l: Strings3DLayout;

  private notes: readonly EngineNote[] = [];
  private times = new Float64Array(0);
  private tails = new Float64Array(0);
  private state = new Uint8Array(0);
  private judgedAt = new Float64Array(0);
  private lookBack = MISS_FADE_SECONDS;
  private readonly chips: Chip[] = [];
  private usedChips = 0;
  private lastNow = 0;

  private readonly boxes: Baked[][];
  private readonly letterTextures: Baked[];
  private readonly numberTextures: Baked[];
  private readonly casaTexture: Baked;
  private readonly frameTexture: Baked;
  private readonly barTextures = new Map<number, Baked>();

  private readonly highlight: Mesh;
  private readonly numbers: Sprite[] = [];
  private readonly strings: Mesh[] = [];
  private readonly vibrating = [false, false, false, false];
  private readonly holding = [false, false, false, false];
  private readonly laneHitAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  private readonly laneHitX = [0, 0, 0, 0];
  private readonly frames: Sprite[] = [];
  private readonly glows: Sprite[] = [];
  private readonly beatLines: LineSegments;
  private readonly barLines: LineSegments;
  private readonly barLabels: Sprite[] = [];
  private readonly windows: BeatWindow[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  constructor(
    private readonly baker: LabelBaker,
    options: Strings3DSceneOptions,
  ) {
    const { theme } = options;
    const p = (this.palette = strings3dPalette(theme));
    this.reducedMotion = options.reducedMotion;
    this.lead = options.leadSeconds ?? LEAD_SECONDS_3D;
    this.clock = options.clock ?? null;
    this.bars = options.bars ?? [];
    this.columns = columnsFor(options.notes);
    this.l = strings3dLayout(1, 1, this.columns, this.lead);
    const l = this.l;
    const { display, ui } = theme.fonts;
    this.camera.rotation.order = 'YXZ';

    this.boxes = p.strings.map((s) => [0, 1, 2, 3, 4].map((finger) => baker.box(String(finger), s.main, s.onNote, display)));
    this.letterTextures = p.strings.map((s) => baker.text(s.letter, display));
    this.numberTextures = Array.from({ length: this.columns }, (_, i) => baker.text(String(i), ui));
    this.casaTexture = baker.text('CASA', ui);
    this.frameTexture = baker.frame();

    // Chão, contorno e divisas das casas
    const width = l.right - l.left;
    const floor = flat(this.mesh(new PlaneGeometry(width, FLOOR_LENGTH), basic(p.floor), ORDER.floor));
    floor.position.set(0, 0, -FLOOR_LENGTH / 2);
    for (const [w, d, x, z] of [
      [BORDER_WIDTH, FLOOR_LENGTH, l.left, -FLOOR_LENGTH / 2],
      [BORDER_WIDTH, FLOOR_LENGTH, l.right, -FLOOR_LENGTH / 2],
      [width + BORDER_WIDTH, BORDER_WIDTH, 0, -FLOOR_LENGTH],
    ]) {
      const edge = flat(this.mesh(new PlaneGeometry(w, d), basic(p.border), ORDER.overlay));
      edge.position.set(x, LIFT * 2, z);
    }
    this.highlight = flat(this.mesh(new PlaneGeometry(1, FLOOR_LENGTH), basic(p.strings[0].main, HIGHLIGHT_ALPHA), ORDER.overlay));
    this.highlight.position.set(0, LIFT, -FLOOR_LENGTH / 2);
    this.highlight.visible = false;

    const dividers = new Float32Array((this.columns - 1) * 6);
    for (let k = 1; k < this.columns; k++) dividers.set([l.left + k, LIFT, 0, l.left + k, LIFT, -FLOOR_LENGTH], (k - 1) * 6);
    this.lines(dividers, p.grid, 1, ORDER.grid);
    this.beatLines = this.lines(new Float32Array(MAX_GRID_LINES * 6), p.grid, 1, ORDER.grid);
    this.barLines = this.lines(new Float32Array(MAX_BAR_LABELS * 6), p.muted, 0.6, ORDER.grid);
    for (let i = 0; i < MAX_BAR_LABELS; i++) {
      // Placas com textura desde o começo: trocar o map de nulo para textura pediria outro shader no meio da música
      const label = this.add(sprite(this.numberTextures[0].texture, p.muted), ORDER.label);
      label.visible = false;
      this.barLabels.push(label);
    }

    // As cordas, com a letra à esquerda, e os números das casas embaixo
    const length = width + STRING_OVERHANG;
    for (let s = 0; s < 4; s++) {
      const string = this.mesh(new PlaneGeometry(length, STRING_THICKNESS, STRING_SEGMENTS, 1), basic(p.strings[s].main), ORDER.string);
      string.position.set(l.right - length / 2, STRING_HEIGHTS[s], 0);
      this.strings.push(string);
      const letter = this.add(sprite(this.letterTextures[s].texture, p.strings[s].main), ORDER.label);
      letter.position.set(l.left - LETTER_OFFSET, STRING_HEIGHTS[s], 0);
      letter.scale.set(LETTER_HEIGHT * this.letterTextures[s].aspect, LETTER_HEIGHT, 1);
    }
    for (let i = 0; i < this.columns; i++) {
      const number = this.add(sprite(this.numberTextures[i].texture, p.muted), ORDER.label);
      number.position.set(l.columnX[i], 0, NUMBER_Z);
      number.scale.set(NUMBER_HEIGHT * this.numberTextures[i].aspect, NUMBER_HEIGHT, 1);
      this.numbers.push(number);
    }
    const casa = this.add(sprite(this.casaTexture.texture, p.muted), ORDER.label);
    const casaHeight = NUMBER_HEIGHT * 0.7;
    casa.center.set(0, 0.5);
    casa.position.set(l.right + CASA_OFFSET - 0.25, 0, NUMBER_Z);
    casa.scale.set(casaHeight * this.casaTexture.aspect, casaHeight, 1);

    // Acerto: contorno de tinta e halo da corda em volta da caixa
    for (let s = 0; s < 4; s++) {
      const glow = this.add(sprite(this.frameTexture.texture, p.strings[s].glow.color), ORDER.frame);
      const frame = this.add(sprite(this.frameTexture.texture, p.ink), ORDER.frame);
      glow.visible = frame.visible = false;
      this.glows.push(glow);
      this.frames.push(frame);
    }

    this.setNotes(options.notes);
  }

  layout(width: number, height: number): void {
    const l = (this.l = strings3dLayout(width, height, this.columns, this.lead));
    const c = l.camera;
    this.camera.fov = c.fov;
    this.camera.aspect = c.aspect;
    this.camera.position.set(c.x, c.y, c.z);
    this.camera.rotation.set(-c.pitch, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.update(this.lastNow);
  }

  /** Troca as notas (a prática: volta nova, troca de andamento); quem fica no mesmo índice e instante guarda o julgamento. */
  setNotes(notes: readonly EngineNote[]): void {
    const times = Float64Array.from(notes, (n) => n.time);
    const state = new Uint8Array(notes.length);
    const judgedAt = new Float64Array(notes.length);
    for (let i = 0; i < Math.min(notes.length, this.notes.length); i++) {
      if (this.times[i] !== times[i]) continue;
      state[i] = this.state[i];
      judgedAt[i] = this.judgedAt[i];
    }
    this.notes = notes;
    this.times = times;
    this.tails = Float64Array.from(notes, (n) => tailSeconds(n.duration));
    this.state = state;
    this.judgedAt = judgedAt;
    this.lookBack = MISS_FADE_SECONDS + this.tails.reduce((a, b) => Math.max(a, b), 0);
    const poolSize = maxNotesInWindow(this.times, this.lead + this.lookBack + 0.5) + 2;
    const p = this.palette;
    while (this.chips.length < poolSize) {
      const chip: Chip = {
        tail: flat(this.mesh(this.chips[0]?.tail.geometry ?? new PlaneGeometry(1, 1), basic(p.strings[0].main, TAIL_ALPHA), ORDER.tail)),
        shadow: flat(this.mesh(this.chips[0]?.shadow.geometry ?? new CircleGeometry(0.5, 20), basic(p.strings[0].main, SHADOW_ALPHA), ORDER.shadow)),
        stem: this.mesh(this.chips[0]?.stem.geometry ?? new PlaneGeometry(STEM_WIDTH, 1), basic(p.strings[0].main), ORDER.stem),
        box: this.add(sprite(this.boxes[0][0].texture), ORDER.box),
        holdBack: this.add(sprite(null, p.grid), ORDER.box),
        holdFill: this.add(sprite(null, p.strings[0].main), ORDER.box),
      };
      chip.holdBack.center.set(0, 0.5);
      chip.holdFill.center.set(0, 0.5);
      this.hide(chip);
      this.chips.push(chip);
    }
  }

  /** Registra o julgamento do motor; `at` é a hora do relógio em que o feedback começa. */
  judge(event: JudgmentEvent, at: number = this.lastNow): void {
    const note = this.notes[event.index];
    if (!note) return;
    const miss = event.judgment === 'miss';
    this.state[event.index] = miss ? MISSED : HIT;
    this.judgedAt[event.index] = at;
    if (miss) return;
    this.laneHitAt[note.string] = at;
    this.laneHitX[note.string] = this.l.columnX[Math.min(this.columns - 1, casaOf(note))];
  }

  /** Monta o quadro da hora `now` do AudioContext (quem desenha é o WebGLRenderer). */
  update(now: number): void {
    this.lastNow = now;
    const l = this.l;
    const p = this.palette;
    const first = lowerBound(this.times, now - this.lookBack);
    const last = lowerBound(this.times, now + this.lead + 0.05);
    let used = 0;
    let next = -1;
    const holding = this.holding.fill(false);

    for (const n of this.numbers) n.material.color.setHex(p.muted);

    for (let i = first; i < last && used < this.chips.length; i++) {
      const s = this.state[i];
      const time = this.times[i];
      const tail = this.tails[i];
      const note = this.notes[i];
      const held = s !== MISSED && tail > 0 && now >= time && now < time + tail;
      const missFade = s === MISSED ? 1 - (now - Math.max(time, this.judgedAt[i])) / MISS_FADE_SECONDS : 1;
      const showBox = (s === 0 || held || (s === MISSED && missFade > 0)) && time - now <= this.lead;
      const tailEnd = Math.max(-FLOOR_LENGTH, noteZ(l, time + tail, now));
      const z = noteZ(l, time, now);
      const showTail = tail > 0 && s !== MISSED && tailEnd < z;
      if (!showBox && !showTail) continue;
      if (s === 0 && next < 0) next = i;

      const chip = this.chips[used++];
      const lane = p.strings[note.string];
      const column = Math.min(this.columns - 1, casaOf(note));
      const x = l.columnX[column];
      const y = STRING_HEIGHTS[note.string];
      const fade = s === MISSED ? MISSED_ALPHA * missFade : entryAlpha3d(z);

      chip.tail.visible = showTail;
      if (showTail) {
        chip.tail.position.set(x, LIFT * 3, (z + tailEnd) / 2);
        chip.tail.scale.set(TAIL_WIDTH, z - tailEnd, 1);
        (chip.tail.material as MeshBasicMaterial).color.setHex(lane.main);
        (chip.tail.material as MeshBasicMaterial).opacity = TAIL_ALPHA * entryAlpha3d(tailEnd);
      }

      chip.box.visible = chip.stem.visible = chip.shadow.visible = showBox;
      if (showBox) {
        const k = boxScale(z);
        const w = BOX.width * k;
        const h = BOX.height * k;
        chip.box.material.map = this.boxes[note.string][note.finger].texture;
        chip.box.material.opacity = fade;
        chip.box.position.set(x, y, z);
        chip.box.scale.set(w, h, 1);
        const stemTop = Math.max(0, y - h / 2);
        chip.stem.visible = stemTop > 0;
        chip.stem.position.set(x, stemTop / 2, z);
        chip.stem.scale.set(k, stemTop, 1);
        const stem = chip.stem.material as MeshBasicMaterial;
        stem.color.setHex(lane.main);
        stem.opacity = fade;
        chip.shadow.position.set(x, LIFT * 4, z);
        chip.shadow.scale.set(w * 0.9, w * 0.9, 1);
        const shadow = chip.shadow.material as MeshBasicMaterial;
        shadow.color.setHex(lane.main);
        shadow.opacity = SHADOW_ALPHA * fade;
      }

      chip.holdBack.visible = chip.holdFill.visible = held;
      if (held) {
        holding[note.string] = true;
        this.numbers[column].material.color.setHex(lane.main);
        const left = x - BOX.width / 2;
        const barY = y - BOX.height / 2 - 0.08;
        const barH = 0.06;
        chip.holdBack.position.set(left, barY, 0);
        chip.holdBack.scale.set(BOX.width, barH, 1);
        chip.holdFill.position.set(left, barY, 0);
        chip.holdFill.scale.set(BOX.width * Math.min(1, (now - time) / tail), barH, 1);
        chip.holdFill.material.color.setHex(lane.main);
      }
    }
    for (let i = used; i < this.usedChips; i++) this.hide(this.chips[i]);
    this.usedChips = used;

    // A coluna da próxima nota acende na cor da corda dela, como o número da casa
    this.highlight.visible = next >= 0;
    if (next >= 0) {
      const note = this.notes[next];
      const column = Math.min(this.columns - 1, casaOf(note));
      this.highlight.position.x = l.columnX[column];
      (this.highlight.material as MeshBasicMaterial).color.setHex(p.strings[note.string].main);
      this.numbers[column].material.color.setHex(p.strings[note.string].main);
    }

    for (let s = 0; s < 4; s++) {
      const age = now - this.laneHitAt[s];
      const flash = feedbackAlpha(age);
      const frame = this.frames[s];
      frame.visible = flash > 0;
      if (frame.visible) {
        frame.position.set(this.laneHitX[s], STRING_HEIGHTS[s], 0);
        frame.scale.set(BOX.width * 1.24, BOX.height * 1.4, 1);
        frame.material.opacity = flash;
      }
      const ring = glowRing(age, this.reducedMotion);
      const glow = this.glows[s];
      glow.visible = ring.alpha > 0;
      if (glow.visible) {
        glow.position.set(this.laneHitX[s], STRING_HEIGHTS[s], 0);
        glow.scale.set(BOX.width * 1.5 * ring.scale, BOX.height * 1.9 * ring.scale, 1);
        glow.material.opacity = ring.alpha;
      }
      this.vibrate(s, !this.reducedMotion && (holding[s] || (age >= 0 && age < VIBRATE_SECONDS)), now);
    }

    this.grid(now);
  }

  /** Notas com a caixa visível agora; para testes. */
  visibleNotes(): number {
    return this.chips.filter((c) => c.box.visible).length;
  }

  /** Notas no "segure" (na corda, com a barra); para testes. */
  heldNotes(): number {
    return this.chips.filter((c) => c.holdFill.visible).length;
  }

  /** Onde estão as caixas visíveis (x, y, z) e quão acesas; para testes. */
  visibleBoxes(): { x: number; y: number; z: number; opacity: number; map: Texture | null }[] {
    return this.chips
      .filter((c) => c.box.visible)
      .map((c) => ({ x: c.box.position.x, y: c.box.position.y, z: c.box.position.z, opacity: c.box.material.opacity, map: c.box.material.map }));
  }

  /** Coluna acesa (a da próxima nota) e a cor dela, ou null; para testes. */
  highlightedColumn(): { x: number; color: number } | null {
    if (!this.highlight.visible) return null;
    return { x: this.highlight.position.x, color: (this.highlight.material as MeshBasicMaterial).color.getHex() };
  }

  /** Cor de cada corda e textura da letra dela, G D A E; para testes. */
  stringLooks(): { color: number; letter: Texture }[] {
    return this.strings.map((s, i) => ({ color: (s.material as MeshBasicMaterial).color.getHex(), letter: this.letterTextures[i].texture }));
  }

  /** Linhas de tempo e de compasso desenhadas agora; para testes. */
  gridLines(): { beats: number; bars: number } {
    return { beats: this.beatLines.geometry.drawRange.count / 2, bars: this.barLines.geometry.drawRange.count / 2 };
  }

  /** O contorno do acerto da corda está aceso? Para testes. */
  hitShown(string: number): { frame: boolean; glow: boolean } {
    return { frame: this.frames[string].visible, glow: this.glows[string].visible };
  }

  /** Texturas assadas por esta cena; destruídas junto com ela. */
  bakedTextures(): Texture[] {
    return [
      ...this.boxes.flat(),
      ...this.letterTextures,
      ...this.numberTextures,
      this.casaTexture,
      this.frameTexture,
      ...this.barTextures.values(),
    ].map((b) => b.texture);
  }

  destroy(): void {
    for (const t of this.bakedTextures()) t.dispose();
    for (const g of new Set(this.geometries)) g.dispose();
    for (const m of this.materials) m.dispose();
    this.scene.clear();
  }

  private add<T extends Mesh | Sprite | LineSegments>(object: T, order: number): T {
    object.renderOrder = order;
    object.frustumCulled = false;
    this.materials.push(object.material as Material);
    this.scene.add(object);
    return object;
  }

  private mesh(geometry: BufferGeometry, material: MeshBasicMaterial, order: number): Mesh {
    this.geometries.push(geometry);
    return this.add(new Mesh(geometry, material), order);
  }

  private lines(positions: Float32Array, color: number, opacity: number, order: number): LineSegments {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometries.push(geometry);
    const material = new LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
    return this.add(new LineSegments(geometry, material), order);
  }

  private hide(chip: Chip): void {
    chip.box.visible = chip.stem.visible = chip.shadow.visible = chip.tail.visible = false;
    chip.holdBack.visible = chip.holdFill.visible = false;
  }

  /** A corda tocada vibra; parada, volta a ser reta. */
  private vibrate(string: number, on: boolean, now: number): void {
    if (!on && !this.vibrating[string]) return;
    this.vibrating[string] = on;
    const position = this.strings[string].geometry.getAttribute('position') as BufferAttribute;
    const half = STRING_THICKNESS / 2;
    for (let v = 0; v < position.count; v++) {
      const u = (v % (STRING_SEGMENTS + 1)) / STRING_SEGMENTS;
      const top = v <= STRING_SEGMENTS;
      const wave = on ? VIBRATE_AMPLITUDE * Math.sin(Math.PI * u) * Math.sin(u * 37 + now * 90) : 0;
      position.setY(v, (top ? half : -half) + wave);
    }
    position.needsUpdate = true;
  }

  /** Linhas dos tempos e barras de compasso no chão, pelo relógio da música (segue o laço e o andamento da prática). */
  private grid(now: number): void {
    let beats = 0;
    let bars = 0;
    if (this.clock) {
      const l = this.l;
      const segments = this.clock.segments(now + this.lead + 1);
      const count = beatWindows(segments, now, 0, GRID_AHEAD_BEATS, this.windows);
      const beatPos = this.beatLines.geometry.getAttribute('position') as BufferAttribute;
      const barPos = this.barLines.geometry.getAttribute('position') as BufferAttribute;
      for (let w = 0; w < count; w++) {
        const win = this.windows[w];
        for (let b = Math.max(0, Math.ceil(win.fromBeat)); b < win.toBeat; b++) {
          const time = windowTime(win, b);
          if (time > now + this.lead) break;
          if (time < now) continue;
          const z = (now - time) * l.speed;
          const bar = this.barIndex(b);
          if (bar >= 0 && bars < MAX_BAR_LABELS) {
            barPos.setXYZ(bars * 2, l.left, LIFT, z);
            barPos.setXYZ(bars * 2 + 1, l.right, LIFT, z);
            this.showBarLabel(bars, bar + 1, z);
            bars++;
          } else if (beats < MAX_GRID_LINES) {
            beatPos.setXYZ(beats * 2, l.left, LIFT, z);
            beatPos.setXYZ(beats * 2 + 1, l.right, LIFT, z);
            beats++;
          }
        }
      }
      beatPos.needsUpdate = barPos.needsUpdate = true;
    }
    this.beatLines.geometry.setDrawRange(0, beats * 2);
    this.barLines.geometry.setDrawRange(0, bars * 2);
    for (let i = bars; i < MAX_BAR_LABELS; i++) this.barLabels[i].visible = false;
  }

  /** Índice do compasso que começa no tempo `beat`, ou −1. */
  private barIndex(beat: number): number {
    const i = lowerBound(this.bars, beat - 1e-6);
    return i < this.bars.length && Math.abs(this.bars[i] - beat) < 1e-6 ? i : -1;
  }

  private showBarLabel(slot: number, measure: number, z: number): void {
    let baked = this.barTextures.get(measure);
    // Assado na primeira vez que o compasso aparece; a música tem um número limitado deles
    if (!baked) this.barTextures.set(measure, (baked = this.baker.text(String(measure), 'monospace')));
    const label = this.barLabels[slot];
    const h = NUMBER_HEIGHT * (1 + 2 * Math.min(1, -z / FLOOR_LENGTH));
    label.visible = true;
    label.material.map = baked.texture;
    label.center.set(0, 0.5);
    label.position.set(this.l.right + 0.15, h / 2, z);
    label.scale.set(h * baked.aspect, h, 1);
  }
}
