import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';
import type { EngineNote } from '../engine/types';
import { lowerBound, maxNotesInWindow, tailSeconds } from './layout';
import { strings3dPalette, type Strings3DPalette } from './palette';
import { feedbackAlpha, glowRing } from './present';
import type { JudgmentEvent, TextureBaker } from './scene';
import { beatWindows, windowTime, type BeatWindow, type SheetClock } from './sheetLayout';
import {
  BOX,
  boxScale,
  casaNumberInto,
  casaOf,
  columnsFor,
  entryAlpha3d,
  FLOOR_LENGTH,
  LEAD_SECONDS_3D,
  LETTER_HEIGHT,
  LETTER_OFFSET,
  MIN_LABEL_PX,
  noteZ,
  NUMBER_HEIGHT,
  NUMBER_Z,
  projectInto,
  STRING_HEIGHTS,
  STRING_OVERHANG,
  strings3dLayout,
  type ScreenPoint,
  type Strings3DLayout,
} from './strings3dLayout';

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
const HOLD_BAR_HEIGHT = 0.06;
const VIBRATE_SECONDS = 0.4;
const VIBRATE_AMPLITUDE = 0.035;
const STRING_SEGMENTS = 48;
const MAX_GRID_LINES = 48;
const MAX_BAR_LABELS = 6;
const FINGERS = 5;
/** Tempos à frente procurados no relógio: o laço curto ou o andamento lento cabem com folga. */
const GRID_AHEAD_BEATS = 64;

// Texturas assadas uma vez neste tamanho e escaladas no quadro: o resize não refaz textura
const LABEL_PX = 64;
const CELL_H = 80;
const CELL_W = Math.round((CELL_H * BOX.width) / BOX.height);
const DOT_R = 32;
const FRAME_W = 186;
const FRAME_H = 120;

interface Chip {
  tail: Sprite;
  shadow: Sprite;
  stem: Sprite;
  box: Sprite;
  holdBack: Sprite;
  holdFill: Sprite;
}

/** O que cada caixa visível mostra, em unidades do mundo; para testes. */
interface BoxInfo {
  x: number;
  y: number;
  z: number;
  opacity: number;
  finger: number;
  string: number;
}

/**
 * Escala do rótulo assado em LABEL_PX para ter `height` px de altura na tela, sem a letra ficar abaixo de MIN_LABEL_PX
 * (na caixa pequena do celular o mundo encolhe, a letra não).
 */
const labelScale = (height: number, texture: Texture) => Math.max(height / texture.height, MIN_LABEL_PX / LABEL_PX);

const white = (anchorX = 0.5, anchorY = 0.5) => {
  const s = new Sprite(Texture.WHITE);
  s.anchor.set(anchorX, anchorY);
  s.visible = false;
  return s;
};

/**
 * As Cordas 3D desenhadas em 2,5D: a câmera do design é só uma conta (strings3dLayout.project) e tudo é sprite do
 * Pixi, em lote. Chão do braço com uma coluna por casa, as quatro cordas G D A E na frente com a cor e a letra, e as
 * notas vindo do fundo no relógio do AudioContext. Nada é alocado em update(); o tema é fixo na vida da cena.
 */
export class Strings3DScene extends Container {
  private readonly palette: Strings3DPalette;
  private readonly reducedMotion: boolean;
  private readonly lead: number;
  private readonly clock: SheetClock | null;
  private readonly bars: readonly number[];
  private readonly columns: number;
  private readonly uiFont: string;
  private l: Strings3DLayout;
  private readonly pa: ScreenPoint = { x: 0, y: 0, scale: 0 };
  private readonly pb: ScreenPoint = { x: 0, y: 0, scale: 0 };

  private notes: readonly EngineNote[] = [];
  private times = new Float64Array(0);
  private tails = new Float64Array(0);
  private state = new Uint8Array(0);
  private judgedAt = new Float64Array(0);
  private lookBack = MISS_FADE_SECONDS;
  private lastNow = 0;

  private readonly atlas: Texture;
  /** Caixa de cada corda × dedo: pedaços do mesmo atlas (um lote só para todas). */
  private readonly boxTextures: Texture[][];
  private readonly letterTextures: Texture[];
  private readonly numberTextures: Texture[];
  private readonly casaTexture: Texture;
  private readonly frameTexture: Texture;
  private readonly dotTexture: Texture;
  private readonly barTextures = new Map<number, Texture>();

  private readonly bg = new Graphics();
  private readonly highlights: Graphics[] = [];
  private readonly gridLayer = new Container();
  private readonly beatLines: Sprite[] = [];
  private readonly barLines: Sprite[] = [];
  private readonly barLabels: Sprite[] = [];
  private readonly tailLayer = new Container();
  private readonly shadowLayer = new Container();
  private readonly strings: Graphics[] = [];
  private readonly stemLayer = new Container();
  private readonly labelLayer = new Container();
  private readonly letters: Sprite[] = [];
  private readonly numbers: Sprite[] = [];
  private readonly casa: Sprite;
  private readonly boxLayer = new Container();
  private readonly frameLayer = new Container();
  private readonly frames: Sprite[] = [];
  private readonly glows: Sprite[] = [];
  private readonly chips: Chip[] = [];
  private readonly info: BoxInfo[] = [];
  private usedChips = 0;
  private held = 0;
  private highlighted = -1;

  private readonly vibrating = [false, false, false, false];
  private readonly holding = [false, false, false, false];
  private readonly laneHitAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  private readonly laneHitX = [0, 0, 0, 0];
  private readonly windows: BeatWindow[] = [];
  private beatsShown = 0;
  private barsShown = 0;

  constructor(
    private readonly baker: TextureBaker,
    options: Strings3DSceneOptions,
  ) {
    super();
    const { theme } = options;
    const p = (this.palette = strings3dPalette(theme));
    this.reducedMotion = options.reducedMotion;
    this.lead = options.leadSeconds ?? LEAD_SECONDS_3D;
    this.clock = options.clock ?? null;
    this.bars = options.bars ?? [];
    this.columns = columnsFor(options.notes);
    this.l = strings3dLayout(1, 1, this.columns, this.lead);
    const { display, ui } = theme.fonts;
    this.uiFont = ui;

    this.atlas = this.bakeAtlas(display);
    this.boxTextures = p.strings.map((_, s) =>
      Array.from(
        { length: FINGERS },
        (_, finger) => new Texture({ source: this.atlas.source, frame: new Rectangle(finger * CELL_W, s * CELL_H, CELL_W, CELL_H) }),
      ),
    );
    this.letterTextures = p.strings.map((s) => this.bakeText(s.letter, display));
    this.numberTextures = Array.from({ length: this.columns }, (_, i) => this.bakeText(String(i), ui));
    this.casaTexture = this.bakeText('CASA', ui);
    this.frameTexture = this.bake(
      new Graphics().roundRect(4, 4, FRAME_W - 8, FRAME_H - 8, 22).stroke({ color: 0xffffff, width: 6 }),
    );
    this.dotTexture = this.bake(new Graphics().circle(DOT_R, DOT_R, DOT_R).fill(0xffffff));

    for (let c = 0; c < this.columns; c++) {
      const g = new Graphics();
      g.alpha = HIGHLIGHT_ALPHA;
      g.visible = false;
      this.highlights.push(g);
    }
    for (let i = 0; i < MAX_GRID_LINES; i++) {
      const line = white(0, 0.5);
      line.tint = p.grid;
      this.beatLines.push(line);
      this.gridLayer.addChild(line);
    }
    for (let i = 0; i < MAX_BAR_LABELS; i++) {
      const line = white(0, 0.5);
      line.tint = p.muted;
      line.alpha = 0.6;
      const label = new Sprite(this.numberTextures[0]);
      label.anchor.set(0, 0.5);
      label.tint = p.muted;
      label.visible = false;
      this.barLines.push(line);
      this.barLabels.push(label);
      this.gridLayer.addChild(line, label);
    }
    for (let s = 0; s < 4; s++) {
      this.strings.push(new Graphics());
      const letter = new Sprite(this.letterTextures[s]);
      letter.anchor.set(0.5);
      letter.tint = p.strings[s].main;
      this.letters.push(letter);
      this.labelLayer.addChild(letter);
    }
    for (let i = 0; i < this.columns; i++) {
      const number = new Sprite(this.numberTextures[i]);
      number.anchor.set(0.5);
      number.tint = p.muted;
      this.numbers.push(number);
      this.labelLayer.addChild(number);
    }
    this.casa = new Sprite(this.casaTexture);
    this.casa.anchor.set(0, 0.5);
    this.casa.tint = p.muted;
    this.labelLayer.addChild(this.casa);
    for (let s = 0; s < 4; s++) {
      const glow = new Sprite(this.frameTexture);
      const frame = new Sprite(this.frameTexture);
      glow.anchor.set(0.5);
      frame.anchor.set(0.5);
      glow.tint = p.strings[s].glow.color;
      frame.tint = p.ink;
      glow.visible = frame.visible = false;
      this.glows.push(glow);
      this.frames.push(frame);
      this.frameLayer.addChild(glow, frame);
    }

    this.setNotes(options.notes);

    for (const layer of [this.gridLayer, this.tailLayer, this.shadowLayer, this.stemLayer, this.labelLayer, this.boxLayer, this.frameLayer]) layer.eventMode = 'none';
    this.eventMode = 'none';
    this.addChild(this.bg, ...this.highlights, this.gridLayer, this.tailLayer, this.shadowLayer, ...this.strings, this.stemLayer, this.labelLayer, this.boxLayer, this.frameLayer);
  }

  layout(width: number, height: number): void {
    const l = (this.l = strings3dLayout(width, height, this.columns, this.lead));
    const p = this.palette;
    const a = this.pa;
    const b = this.pb;
    const pt = (x: number, y: number, z: number, out = a) => projectInto(l, x, y, z, out);
    const corners = (x0: number, x1: number, near: number, far: number) => {
      const out: number[] = [];
      for (const [x, z] of [
        [x0, near],
        [x1, near],
        [x1, far],
        [x0, far],
      ]) {
        pt(x, 0, z);
        out.push(a.x, a.y);
      }
      return out;
    };
    const segment = (x0: number, z0: number, x1: number, z1: number, color: number, w: number, alpha = 1) => {
      pt(x0, 0, z0, a);
      pt(x1, 0, z1, b);
      this.bg.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width: w, alpha });
    };

    this.bg.clear();
    this.bg.poly(corners(l.left, l.right, 0, -FLOOR_LENGTH)).fill(p.floor);
    for (let k = 1; k < this.columns; k++) segment(l.left + k, 0, l.left + k, -FLOOR_LENGTH, p.grid, 1);
    const border = Math.max(2, BORDER_WIDTH * pt(0, 0, 0).scale * 0.6);
    segment(l.left, 0, l.left, -FLOOR_LENGTH, p.border, border);
    segment(l.right, 0, l.right, -FLOOR_LENGTH, p.border, border);
    segment(l.left, -FLOOR_LENGTH, l.right, -FLOOR_LENGTH, p.border, Math.max(1, border / 3));

    this.highlights.forEach((g, c) => g.clear().poly(corners(l.columnX[c] - 0.5, l.columnX[c] + 0.5, 0, -FLOOR_LENGTH)).fill(0xffffff));

    for (let s = 0; s < 4; s++) {
      this.drawString(s, 0);
      const letter = this.letters[s];
      pt(l.left - LETTER_OFFSET, STRING_HEIGHTS[s], 0);
      letter.position.set(a.x, a.y);
      letter.scale.set(labelScale(LETTER_HEIGHT * a.scale, this.letterTextures[s]));
    }
    for (let i = 0; i < this.columns; i++) {
      casaNumberInto(l, i, a);
      this.numbers[i].position.set(a.x, a.y);
      this.numbers[i].scale.set(labelScale(NUMBER_HEIGHT * a.scale, this.numberTextures[i]));
    }
    // "CASA" começa na borda direita do chão, na linha dos números, e cabe em CASA_OFFSET + 0,6 (o enquadramento)
    pt(l.right, 0, NUMBER_Z);
    this.casa.position.set(a.x, a.y);
    this.casa.scale.set(labelScale(NUMBER_HEIGHT * 0.7 * a.scale, this.casaTexture));

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
    const pool = maxNotesInWindow(this.times, this.lead + this.lookBack + 0.5) + 2;
    while (this.chips.length < pool) {
      const box = new Sprite(this.boxTextures[0][0]);
      box.anchor.set(0.5);
      box.visible = false;
      const shadow = new Sprite(this.dotTexture);
      shadow.anchor.set(0.5);
      shadow.visible = false;
      const chip: Chip = { tail: white(0.5, 1), shadow, stem: white(0.5, 1), box, holdBack: white(0, 0.5), holdFill: white(0, 0.5) };
      chip.holdBack.tint = this.palette.grid;
      this.tailLayer.addChild(chip.tail);
      this.shadowLayer.addChild(chip.shadow);
      this.stemLayer.addChild(chip.stem);
      this.boxLayer.addChild(chip.box, chip.holdBack, chip.holdFill);
      this.chips.push(chip);
      this.info.push({ x: 0, y: 0, z: 0, opacity: 0, finger: 0, string: 0 });
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

  /** Desenha o quadro da hora `now` do AudioContext. */
  update(now: number): void {
    this.lastNow = now;
    const l = this.l;
    const p = this.palette;
    const a = this.pa;
    const b = this.pb;
    const first = lowerBound(this.times, now - this.lookBack);
    const last = lowerBound(this.times, now + this.lead + 0.05);
    const holding = this.holding.fill(false);
    let next = -1;
    let used = 0;
    let held = 0;
    for (const n of this.numbers) n.tint = p.muted;

    // Do fundo para a frente: a nota mais perto fica por cima da de trás
    for (let i = last - 1; i >= first && used < this.chips.length; i--) {
      const s = this.state[i];
      const time = this.times[i];
      const tail = this.tails[i];
      const note = this.notes[i];
      const isHeld = s !== MISSED && tail > 0 && now >= time && now < time + tail;
      const missFade = s === MISSED ? 1 - (now - Math.max(time, this.judgedAt[i])) / MISS_FADE_SECONDS : 1;
      const showBox = (s === 0 || isHeld || (s === MISSED && missFade > 0)) && time - now <= this.lead;
      const tailEnd = Math.max(-FLOOR_LENGTH, noteZ(l, time + tail, now));
      const z = noteZ(l, time, now);
      const showTail = tail > 0 && s !== MISSED && tailEnd < z;
      if (!showBox && !showTail) continue;
      if (s === 0) next = i;

      const chip = this.chips[used];
      const info = this.info[used++];
      const lane = p.strings[note.string];
      const column = Math.min(this.columns - 1, casaOf(note));
      const x = l.columnX[column];
      const y = STRING_HEIGHTS[note.string];
      const fade = s === MISSED ? MISSED_ALPHA * missFade : entryAlpha3d(z);

      chip.tail.visible = showTail;
      if (showTail) {
        projectInto(l, x, 0, z, a);
        projectInto(l, x, 0, tailEnd, b);
        this.segment(chip.tail, a, b, TAIL_WIDTH * (a.scale + b.scale) * 0.5);
        chip.tail.tint = lane.main;
        chip.tail.alpha = TAIL_ALPHA * entryAlpha3d(tailEnd);
      }

      chip.box.visible = chip.shadow.visible = showBox;
      chip.stem.visible = false;
      if (showBox) {
        const k = boxScale(z);
        const w = BOX.width * k;
        const h = BOX.height * k;
        projectInto(l, x, y, z, a);
        chip.box.texture = this.boxTextures[note.string][note.finger];
        chip.box.position.set(a.x, a.y);
        chip.box.scale.set((w * a.scale) / CELL_W, (h * a.scale) / CELL_H);
        chip.box.alpha = fade;
        Object.assign(info, { x, y, z, opacity: fade, finger: note.finger, string: note.string });

        const stemTop = y - h / 2;
        if (stemTop > 0) {
          projectInto(l, x, 0, z, a);
          projectInto(l, x, stemTop, z, b);
          chip.stem.visible = true;
          this.segment(chip.stem, a, b, Math.max(1, STEM_WIDTH * k * a.scale));
          chip.stem.tint = lane.main;
          chip.stem.alpha = fade;
        }
        // Sombra deitada no chão: a altura é a da profundidade dela na tela
        const r = w * 0.45;
        projectInto(l, x, 0, z - r, b);
        const top = b.y;
        projectInto(l, x, 0, z + r, b);
        projectInto(l, x, 0, z, a);
        chip.shadow.position.set(a.x, a.y);
        chip.shadow.scale.set((2 * r * a.scale) / (2 * DOT_R), Math.max(1, b.y - top) / (2 * DOT_R));
        chip.shadow.tint = lane.main;
        chip.shadow.alpha = SHADOW_ALPHA * fade;
      } else {
        info.opacity = 0;
      }

      chip.holdBack.visible = chip.holdFill.visible = isHeld;
      if (isHeld) {
        held++;
        holding[note.string] = true;
        this.numbers[column].tint = lane.main;
        projectInto(l, x - BOX.width / 2, y - BOX.height / 2 - 0.08, 0, a);
        const barW = BOX.width * a.scale;
        const barH = Math.max(2, HOLD_BAR_HEIGHT * a.scale);
        chip.holdBack.position.set(a.x, a.y);
        chip.holdBack.width = barW;
        chip.holdBack.height = barH;
        chip.holdFill.position.set(a.x, a.y);
        chip.holdFill.width = barW * Math.min(1, (now - time) / tail);
        chip.holdFill.height = barH;
        chip.holdFill.tint = lane.main;
      }
    }
    for (let i = used; i < this.usedChips; i++) {
      const chip = this.chips[i];
      chip.tail.visible = chip.shadow.visible = chip.stem.visible = chip.box.visible = chip.holdBack.visible = chip.holdFill.visible = false;
    }
    this.usedChips = used;
    this.held = held;

    // A coluna da próxima nota acende na cor da corda dela, como o número da casa
    const column = next >= 0 ? Math.min(this.columns - 1, casaOf(this.notes[next])) : -1;
    if (this.highlighted >= 0 && this.highlighted !== column) this.highlights[this.highlighted].visible = false;
    this.highlighted = column;
    if (column >= 0) {
      const color = p.strings[this.notes[next].string].main;
      this.highlights[column].visible = true;
      this.highlights[column].tint = color;
      this.numbers[column].tint = color;
    }

    for (let s = 0; s < 4; s++) {
      const age = now - this.laneHitAt[s];
      const flash = feedbackAlpha(age);
      const frame = this.frames[s];
      const glow = this.glows[s];
      const ring = glowRing(age, this.reducedMotion);
      frame.visible = flash > 0;
      glow.visible = ring.alpha > 0;
      if (frame.visible || glow.visible) {
        projectInto(l, this.laneHitX[s], STRING_HEIGHTS[s], 0, a);
        const fw = (BOX.width * a.scale) / FRAME_W;
        const fh = (BOX.height * a.scale) / FRAME_H;
        frame.position.set(a.x, a.y);
        frame.scale.set(fw * 1.24 * (FRAME_W / (FRAME_W - 8)), fh * 1.4);
        frame.alpha = flash;
        glow.position.set(a.x, a.y);
        glow.scale.set(fw * 1.5 * ring.scale, fh * 1.9 * ring.scale);
        glow.alpha = ring.alpha;
      }
      this.vibrate(s, !this.reducedMotion && (holding[s] || (age >= 0 && age < VIBRATE_SECONDS)), now);
    }

    this.grid(now);
  }

  /** Notas com a caixa visível agora; para testes. */
  visibleNotes(): number {
    return this.chips.reduce((n, c) => n + (c.box.visible ? 1 : 0), 0);
  }

  /** Notas no "segure" (na corda, com a barra); para testes. */
  heldNotes(): number {
    return this.held;
  }

  /** Caixas visíveis, da mais perto para a mais longe: onde estão no mundo, quão acesas e qual dedo / corda; para testes. */
  visibleBoxes(): BoxInfo[] {
    return this.chips
      .map((c, i) => (c.box.visible ? { ...this.info[i] } : null))
      .filter((b): b is BoxInfo => b !== null)
      .reverse();
  }

  /** Cor das hastes visíveis (a da corda da nota), da caixa mais perto para a mais longe; para testes. */
  stemColors(): number[] {
    return this.chips
      .filter((c) => c.stem.visible)
      .map((c) => c.stem.tint)
      .reverse();
  }

  /** Tamanho da letra de cada rótulo na tela, em px (letras G D A E, casas, "CASA" e compassos à vista); para testes. */
  labelFontSizes(): { label: string; px: number }[] {
    const sprites: [string, Sprite][] = [
      ...this.letters.map((s, i): [string, Sprite] => [this.palette.strings[i].letter, s]),
      ...this.numbers.map((s, i): [string, Sprite] => [`casa ${i}`, s]),
      ['CASA', this.casa],
      ...this.barLabels.filter((s) => s.visible).map((s, i): [string, Sprite] => [`compasso ${i}`, s]),
    ];
    return sprites.map(([label, s]) => ({ label, px: LABEL_PX * s.scale.y }));
  }

  /** Centro de cada número de casa na tela; para testes. */
  numberPositions(): number[] {
    return this.numbers.map((n) => n.x);
  }

  /** As caixas visíveis usam pedaços do atlas (mesma fonte de textura, um lote); para testes. */
  boxesShareAtlas(): boolean {
    return this.chips.every((c) => !c.box.visible || c.box.texture.source === this.atlas.source);
  }

  /** Coluna acesa (a da próxima nota) e a cor dela, ou null; para testes. */
  highlightedColumn(): { x: number; color: number } | null {
    if (this.highlighted < 0) return null;
    return { x: this.l.columnX[this.highlighted], color: this.highlights[this.highlighted].tint };
  }

  /** Cor de cada corda e textura da letra dela, G D A E; para testes. */
  stringLooks(): { color: number; letter: Texture }[] {
    return this.letters.map((letter, s) => ({ color: this.palette.strings[s].main, letter: letter.texture }));
  }

  /** Linhas de tempo e de compasso desenhadas agora; para testes. */
  gridLines(): { beats: number; bars: number } {
    return { beats: this.beatsShown, bars: this.barsShown };
  }

  /** O contorno do acerto da corda está aceso? Para testes. */
  hitShown(string: number): { frame: boolean; glow: boolean } {
    return { frame: this.frames[string].visible, glow: this.glows[string].visible };
  }

  /** Texturas que esta cena assou; destruídas junto com ela. */
  bakedTextures(): Texture[] {
    return [this.atlas, ...this.letterTextures, ...this.numberTextures, this.casaTexture, this.frameTexture, this.dotTexture, ...this.barTextures.values()];
  }

  override destroy(): void {
    const baked = this.bakedTextures();
    const frames = this.boxTextures.flat();
    super.destroy({ children: true });
    for (const t of frames) t.destroy(false);
    for (const t of baked) t.destroy(true);
  }

  /** Sprite branco esticado de `from` até `to` (âncora no pé): cauda e haste. */
  private segment(sprite: Sprite, from: ScreenPoint, to: ScreenPoint, width: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    sprite.position.set(from.x, from.y);
    sprite.rotation = Math.atan2(dx, -dy);
    sprite.width = width;
    sprite.height = Math.hypot(dx, dy);
  }

  /** A corda, reta ou vibrando (a onda vem de `wave` = hora do relógio; 0 é reta). */
  private drawString(s: number, wave: number): void {
    const l = this.l;
    const a = this.pa;
    const g = this.strings[s];
    const x0 = l.left - STRING_OVERHANG;
    projectInto(l, x0, STRING_HEIGHTS[s], 0, a);
    const scale = a.scale;
    g.clear().moveTo(a.x, a.y);
    const steps = wave ? STRING_SEGMENTS : 1;
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      const offset = wave ? VIBRATE_AMPLITUDE * Math.sin(Math.PI * u) * Math.sin(u * 37 + wave * 90) : 0;
      projectInto(l, x0 + (l.right - x0) * u, STRING_HEIGHTS[s] + offset, 0, a);
      g.lineTo(a.x, a.y);
    }
    g.stroke({ color: this.palette.strings[s].main, width: Math.max(2, STRING_THICKNESS * scale) });
  }

  /** A corda tocada vibra; parada, volta a ser reta. */
  private vibrate(string: number, on: boolean, now: number): void {
    if (!on && !this.vibrating[string]) return;
    this.vibrating[string] = on;
    this.drawString(string, on ? now || 1e-6 : 0);
  }

  /** Linhas dos tempos e barras de compasso no chão, pelo relógio da música (segue o laço e o andamento da prática). */
  private grid(now: number): void {
    let beats = 0;
    let bars = 0;
    if (this.clock) {
      const l = this.l;
      const a = this.pa;
      const b = this.pb;
      const segments = this.clock.segments(now + this.lead + 1);
      const count = beatWindows(segments, now, 0, GRID_AHEAD_BEATS, this.windows);
      for (let w = 0; w < count; w++) {
        const win = this.windows[w];
        for (let beat = Math.max(0, Math.ceil(win.fromBeat)); beat < win.toBeat; beat++) {
          const time = windowTime(win, beat);
          if (time > now + this.lead) break;
          if (time < now) continue;
          const z = (now - time) * l.speed;
          const bar = this.barIndex(beat);
          const isBar = bar >= 0 && bars < MAX_BAR_LABELS;
          if (!isBar && beats >= MAX_GRID_LINES) continue;
          projectInto(l, l.left, 0, z, a);
          projectInto(l, l.right, 0, z, b);
          const line = isBar ? this.barLines[bars] : this.beatLines[beats];
          line.visible = true;
          line.position.set(a.x, a.y);
          line.width = b.x - a.x;
          line.height = isBar ? 1.5 : 1;
          if (isBar) {
            this.showBarLabel(bars, bar + 1, z);
            bars++;
          } else beats++;
        }
      }
    }
    for (let i = beats; i < this.beatsShown; i++) this.beatLines[i].visible = false;
    for (let i = bars; i < this.barsShown; i++) this.barLines[i].visible = this.barLabels[i].visible = false;
    this.beatsShown = beats;
    this.barsShown = bars;
  }

  /** Índice do compasso que começa no tempo `beat`, ou −1. */
  private barIndex(beat: number): number {
    const i = lowerBound(this.bars, beat - 1e-6);
    return i < this.bars.length && Math.abs(this.bars[i] - beat) < 1e-6 ? i : -1;
  }

  private showBarLabel(slot: number, measure: number, z: number): void {
    let texture = this.barTextures.get(measure);
    // Assado na primeira vez que o compasso aparece; a música tem um número limitado deles
    if (!texture) this.barTextures.set(measure, (texture = this.bakeText(String(measure), this.uiFont)));
    const label = this.barLabels[slot];
    const h = NUMBER_HEIGHT * (1 + 2 * Math.min(1, -z / FLOOR_LENGTH));
    projectInto(this.l, this.l.right + 0.15, h / 2, z, this.pa);
    label.visible = true;
    label.texture = texture;
    label.position.set(this.pa.x, this.pa.y);
    label.scale.set(labelScale(h * this.pa.scale, texture));
  }

  private bake(target: Container): Texture {
    const texture = this.baker.generateTexture({ target, resolution: this.baker.resolution, antialias: true });
    target.destroy();
    return texture;
  }

  private bakeText(text: string, fontFamily: string): Texture {
    return this.bake(new Text({ text, style: { fill: 0xffffff, fontFamily, fontWeight: '800', fontSize: LABEL_PX } }));
  }

  /** Caixas das notas, uma linha por corda (G D A E) e uma coluna por dedo (0 a 4), num atlas só. */
  private bakeAtlas(font: string): Texture {
    const atlas = new Container();
    const g = new Graphics();
    atlas.addChild(g);
    this.palette.strings.forEach((lane, s) => {
      for (let finger = 0; finger < FINGERS; finger++) {
        const x = finger * CELL_W;
        const y = s * CELL_H;
        // Folga de 1 px entre células: a filtragem da textura não puxa a cor da vizinha para a borda
        g.roundRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2, CELL_H * 0.16).fill(lane.main);
        const digit = new Text({ text: String(finger), style: { fill: lane.onNote, fontFamily: font, fontWeight: '800', fontSize: CELL_H * 0.7 } });
        digit.anchor.set(0.5);
        digit.position.set(x + CELL_W / 2, y + CELL_H / 2 + CELL_H * 0.04);
        atlas.addChild(digit);
      }
    });
    // Moldura invisível do tamanho exato: a textura começa em (0, 0) e as células caem nos frames certos
    g.rect(0, 0, CELL_W * FINGERS, CELL_H * 4).fill({ color: 0, alpha: 0 });
    return this.bake(atlas);
  }
}
