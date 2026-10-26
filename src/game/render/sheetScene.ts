import { Container, Graphics, GraphicsContext, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';
import type { Issue, Judgment } from '../engine/types';
import type { Song } from '../notation/song';
import { STRING_LETTERS } from '../notation/violin';
import { formatFps, type FpsReport } from './fps';
import { lowerBound, maxNotesInWindow } from './layout';
import { sheetPalette, type SheetPalette } from './palette';
import { feedbackScale, playedString } from './present';
import type { JudgmentEvent, TextureBaker } from './scene';
import {
  beatWindows,
  beatX,
  BOTTOM_STEP,
  barOffsets,
  beatWarp,
  clefFade,
  dashedCubic,
  loopMarks,
  markApplies,
  noteAlpha,
  MIDDLE_STEP,
  sheetLayout,
  stepY,
  tieArc,
  tieShows,
  TOP_STEP,
  windowTime,
  type BeatSegment,
  type BeatWarp,
  type BeatWindow,
  type MeasureLoop,
  type SheetClock,
  type SheetLayout,
  type TieArc,
} from './sheetLayout';
import { diatonicStep, keySignature, ledgerSteps, staffLayout, type Accidental, type RestValue, type StaffNote, type StaffRest, type StaffTie } from './staff';

export interface SheetSceneOptions {
  theme: Theme;
  song: Song;
  clock: SheetClock;
  reducedMotion: boolean;
}

// Texturas assadas uma vez com este espaço entre linhas e escaladas no quadro: o resize não refaz textura
const REF = 24;
const HEAD_RX = REF * 0.64;
const HEAD_RY = REF * 0.47;
const HEAD_ANGLE = (-20 * Math.PI) / 180;
const STAFF_LINES = [0, 1, 2, 3, 4].map((k) => BOTTOM_STEP + k * 2);
const MAX_LEDGERS = 3;
const HOLD_BG_ALPHA = 0.18;
const HOLD_FILL_ALPHA = 0.55;
const ZONE_ALPHA = 0.08;
const STAFF_ALPHA = 0.7;
/** Ajuste ótico dos glifos da Noto Music: centro da caixa de texto acima do ponto da pauta, em espaços. */
const CLEF_LIFT = -0.25;
const ACCIDENTAL_LIFT = 0.05;
/**
 * Pausas da Noto Music, assadas cortadas na tinta (trim): a caixa de texto do Pixi vem da fonte de reserva (a Noto
 * Music só tem o subset music), que muda de aparelho para aparelho, e a tinta não. Cada glifo se prende pela própria
 * borda a um grau da pauta: a semibreve pende da 4ª linha, a mínima senta na 3ª, as outras centram nela.
 */
const REST_SIZE = REF * 3.5;
const REST_GLYPHS: Record<RestValue, { glyph: string; anchor: number; step: number }> = {
  4: { glyph: '𝄻', anchor: 0, step: MIDDLE_STEP + 2 },
  2: { glyph: '𝄼', anchor: 1, step: MIDDLE_STEP },
  1: { glyph: '𝄽', anchor: 0.5, step: MIDDLE_STEP },
  0.5: { glyph: '𝄾', anchor: 0.5, step: MIDDLE_STEP },
  0.25: { glyph: '𝄿', anchor: 0.5, step: MIDDLE_STEP - 0.5 },
};
const REST_VALUES = [4, 2, 1, 0.5, 0.25] as const;
/** Ponto da pausa pontuada: à direita do centro do glifo, em espaços. */
const REST_DOT_X = 1;
/** Espessura do arco da ligadura no meio, em espaços (nas pontas ele afina até quase nada). */
const TIE_THICKNESS = 0.16;

const ISSUE_GLYPH: Record<Issue, string> = {
  early: '◂',
  late: '▸',
  sharp: '▴',
  flat: '▾',
  'wrong-note': '×',
  'not-played': '×',
};
const MISS_GLYPH = '×';
/** A cor `top` sobre `base` com transparência `alpha`, já misturada (0xRRGGBB). */
function mix(base: number, top: number, alpha: number): number {
  const channel = (shift: number) => Math.round(((base >> shift) & 255) * (1 - alpha) + ((top >> shift) & 255) * alpha);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Um acerto adiantado chega antes da hora da nota: a cópia dela ainda vale até este tanto depois do julgamento. */
const MARK_EARLY_SECONDS = 0.3;
/** Nota sem altura tocada a mostrar (não foi nota errada). */
const NO_STEP = -1;
const CLOCK_REFRESH_SECONDS = 0.25;

interface NoteSlot {
  root: Container;
  ledgers: Sprite[];
  stem: Sprite;
  head: Sprite;
  /** Colchetes: um na colcheia, dois na semicolcheia. */
  flags: Sprite[];
  dot: Sprite;
  accidental: Sprite;
  finger: Sprite;
  letter: Sprite;
  name: Sprite;
  mark: Sprite;
  /** Cabeça vazada da nota tocada no lugar (nota errada). */
  ghost: Sprite;
  /** Nota da timeline que este slot mostra, ou −1 depois de um layout. */
  note: number;
}

interface BarSlot {
  line: Sprite;
  number: Sprite;
}

interface RestSlot {
  root: Container;
  glyph: Sprite;
  dot: Sprite;
  /** Pausa que este slot mostra, ou −1 depois de um layout. */
  rest: number;
}

/** Linha de A ou de B com a bandeirinha ("A · 18" à direita da linha, "B · 19" à esquerda). */
interface LoopMark {
  line: Sprite;
  flag: Sprite;
}

/** Bandeirinha: texto deste tamanho na textura, com folga de lado e altura do design (8 px e 22 px no texto de 12 px). */
const FLAG_TEXT = REF * 0.67;
const LOOP_BAND_ALPHA = 0.06;
const LOOP_ARC_ALPHA = 0.7;

interface TieSlot {
  /** Redesenhado só quando muda a ligadura do slot: a forma depende do layout, não do quadro. */
  arc: Graphics;
  tie: number;
}

const HIT = 1;
const MISSED = 2;

/**
 * A faixa de partitura: pauta, clave, armadura e as notas da música correndo sob a agulha do "agora", no relógio de
 * tempos da partida (SheetClock). Nada é alocado em update(); o tema é fixo na vida da cena.
 */
export class SheetScene extends Container {
  private readonly palette: SheetPalette;
  private readonly reducedMotion: boolean;
  private readonly clock: SheetClock;
  private readonly notes: readonly StaffNote[];
  private readonly at: Float64Array;
  private readonly rests: readonly StaffRest[];
  private readonly restAt: Float64Array;
  private readonly ties: readonly StaffTie[];
  private readonly tieTo: Float64Array;
  private readonly arc: TieArc = { x: 0, y: 0, width: 0, height: 0 };
  private readonly bars: readonly number[];
  private readonly barOffsets: Float64Array;
  private readonly fifths: number;
  /** A nota de ataque de cada nota (a ligada aponta para a que ela continua) e a duração somada das ligadas. */
  private readonly attackOf: Int32Array;
  private readonly holdBeats: Float64Array;
  /** O espaço na faixa (BeatWarp): onde cada nota, pausa, barra e ponta de ligadura fica, e quanto a nota ocupa. */
  private readonly warp: BeatWarp;
  private readonly spacedAt: Float64Array;
  private readonly spacedBeats: Float64Array;
  private readonly spacedHold: Float64Array;
  private readonly spacedRest: Float64Array;
  private readonly spacedBars: Float64Array;
  private readonly spacedTieFrom: Float64Array;
  private readonly spacedTieTo: Float64Array;
  /** Hora da cópia da nota que o julgamento marcou (no laço, a volta certa) e hora em que a marca apareceu. */
  private readonly markAt: Float64Array;
  private readonly markShownAt: Float64Array;
  private readonly markState: Uint8Array;
  private readonly markTexture: (Texture | null)[];
  private readonly windows: BeatWindow[] = [];
  private readonly totalBeats: number;
  private readonly uiFont: string;

  // Laço A–B: tempos de A e B, onde ficam na faixa e quanto as linhas recuam antes deles (como a barra de compasso)
  private loop: MeasureLoop | null = null;
  private loopA = 0;
  private loopB = 0;
  private spacedA = 0;
  private spacedB = 0;
  private loopOffA = 0;
  private loopOffB = 0;
  private flagTextures: Texture[] = [];
  private readonly bandLayer = new Container();
  private readonly paperLayer = new Container();
  private readonly paperPieces: Sprite[] = [];
  private readonly loopLayer = new Container();
  private readonly bands: Sprite[] = [];
  private readonly aMarks: LoopMark[] = [];
  private readonly bMarks: LoopMark[] = [];
  private readonly loopArcs: Graphics[] = [];
  private readonly arcContext = new GraphicsContext();
  private hasArc = false;
  /** Quantos de cada peça do laço este quadro mostrou e o anterior; x da última linha de A e de B (a passada repete). */
  private readonly loopCount = { bands: 0, a: 0, b: 0, arcs: 0 };
  private readonly loopUsed = { bands: 0, a: 0, b: 0, arcs: 0 };
  private lastA = NaN;
  private lastB = NaN;

  private readonly paper = new Sprite(Texture.WHITE);
  private readonly staff: Sprite[] = [];
  private readonly zone = new Sprite(Texture.WHITE);
  private readonly holdBg = new Sprite(Texture.WHITE);
  private readonly holdFill = new Sprite(Texture.WHITE);
  private readonly barLayer = new Container();
  private readonly restLayer = new Container();
  private readonly tieLayer = new Container();
  private readonly noteLayer = new Container();
  private readonly needle = new Sprite(Texture.WHITE);
  private readonly needleLabel: Sprite;
  private readonly cover = new Container();
  private readonly coverPaper = new Sprite(Texture.WHITE);
  private readonly coverStaff: Sprite[] = [];
  private readonly coverEnd = new Sprite(Texture.WHITE);
  private readonly clef: Sprite;
  private readonly keySprites: Sprite[];
  private readonly fpsText: Text;
  private readonly slots: NoteSlot[] = [];
  private readonly barSlots: BarSlot[] = [];
  private readonly restSlots: RestSlot[] = [];
  private readonly tieSlots: TieSlot[] = [];

  private readonly headTextures: Texture[];
  private readonly hollowTextures: Texture[];
  private readonly flagTexture: Texture;
  private readonly dotTexture: Texture;
  private readonly accidentalTextures: Map<Accidental, Texture>;
  private readonly restTextures: Map<RestValue, Texture>;
  private readonly fingerTextures: Texture[][];
  private readonly letterTextures: Texture[];
  private readonly nameTextures: Map<string, Texture>;
  private readonly numberTextures: Texture[];
  private readonly labelTexture: Texture;
  private readonly clefTexture: Texture;
  private readonly glyphTextures: Texture[];
  // Nota errada: cabeça vazada na altura tocada e "VOCÊ E" no lugar do nome (o dedo e a letra embaixo são o alvo)
  private readonly ghostTexture: Texture;
  private readonly youTextures: Texture[];
  private readonly playedStep: Int16Array;
  private readonly playedString: Uint8Array;
  private readonly nameTexture: Texture[];
  private readonly glyphFor: (judgment: Judgment, issue: Issue | null) => Texture | null;

  private l: SheetLayout;
  private lastNow = 0;
  private until = -Infinity;
  private fetchedAt = -Infinity;
  private segments: readonly BeatSegment[] = [];
  private usedSlots = 0;
  private usedBars = 0;
  private usedRests = 0;
  private usedTies = 0;

  constructor(
    private readonly baker: TextureBaker,
    options: SheetSceneOptions,
  ) {
    super();
    const { theme, song } = options;
    this.palette = sheetPalette(theme);
    this.reducedMotion = options.reducedMotion;
    this.clock = options.clock;
    const staff = staffLayout(song);
    this.notes = staff.notes;
    this.bars = staff.bars;
    this.rests = staff.rests;
    this.ties = staff.ties;
    const starts = [...this.notes, ...this.rests].map((x) => x.at).sort((a, b) => a - b);
    const warp = (this.warp = beatWarp(starts));
    const spaced = (beats: ArrayLike<number>) => Float64Array.from(beats, (b) => warp.forward(b));
    this.fifths = staff.fifths;
    this.at = Float64Array.from(this.notes, (n) => n.at);
    this.restAt = Float64Array.from(this.rests, (r) => r.at);
    this.tieTo = Float64Array.from(this.ties, (t) => t.toAt);
    this.attackOf = new Int32Array(this.notes.length);
    this.holdBeats = Float64Array.from(this.notes, (n) => n.beats);
    for (let i = 0; i < this.notes.length; i++) {
      const attack = this.notes[i].tie && i > 0 ? this.attackOf[i - 1] : i;
      this.attackOf[i] = attack;
      if (attack !== i) this.holdBeats[attack] += this.notes[i].beats;
    }
    this.spacedAt = spaced(this.at);
    this.spacedBeats = Float64Array.from(this.notes, (n, i) => warp.forward(n.at + n.beats) - this.spacedAt[i]);
    this.spacedHold = Float64Array.from(this.notes, (n, i) => warp.forward(n.at + this.holdBeats[i]) - this.spacedAt[i]);
    this.spacedRest = spaced(this.restAt);
    this.spacedBars = spaced(this.bars);
    this.spacedTieFrom = spaced(this.ties.map((t) => t.fromAt));
    this.spacedTieTo = spaced(this.tieTo);
    this.totalBeats = song.measures.reduce((sum, m) => sum + m.beats, 0);
    // A barra foge da pausa como foge da nota; uma a mais no fim da música, para o B do laço no último compasso
    this.barOffsets = barOffsets([...this.spacedBars, warp.forward(this.totalBeats)], spaced(starts));
    this.markAt = new Float64Array(this.notes.length).fill(NaN);
    this.markShownAt = new Float64Array(this.notes.length).fill(NaN);
    this.markState = new Uint8Array(this.notes.length);
    this.markTexture = new Array(this.notes.length).fill(null);

    const p = this.palette;
    const ui = (this.uiFont = theme.fonts.ui);
    const display = theme.fonts.display;
    this.headTextures = p.strings.map((c) => this.bakeHead(c, null));
    this.hollowTextures = p.strings.map((c) => this.bakeHead(p.paper, c));
    this.flagTexture = this.bakeFlag(p.ink);
    this.dotTexture = this.bake(new Graphics().circle(REF * 0.16, REF * 0.16, REF * 0.16).fill(p.ink));
    this.accidentalTextures = new Map((['♯', '♭', '♮'] as const).map((a) => [a, this.bakeText(a, { fontFamily: theme.fonts.music, fontSize: REF * 1.78, fill: p.ink })]));
    // Só as figuras de pausa que a música usa
    const restValues = REST_VALUES.filter((v) => this.rests.some((r) => r.value === v));
    this.restTextures = new Map(restValues.map((v) => [v, this.bakeText(REST_GLYPHS[v].glyph, { fontFamily: theme.fonts.music, fontSize: REST_SIZE, fill: p.ink, trim: true })]));
    this.fingerTextures = p.strings.map((c) => [0, 1, 2, 3, 4].map((f) => this.bakeText(String(f), { fontFamily: ui, fontWeight: '700', fontSize: REF, fill: c })));
    this.letterTextures = p.strings.map((c, i) => this.bakeText(STRING_LETTERS[i], { fontFamily: display, fontWeight: '800', fontSize: REF * 1.05, fill: c }));
    const names = [...new Set(this.notes.map((n) => n.name))];
    this.nameTextures = new Map(names.map((name) => [name, this.bakeText(name, { fontFamily: ui, fontSize: REF * 0.72, fill: p.line })]));
    this.numberTextures = this.bars.map((_, m) => this.bakeText(String(m + 1), { fontFamily: ui, fontSize: REF * 0.78, fill: p.line }));
    this.labelTexture = this.bakeText('AGORA', { fontFamily: ui, fontWeight: '700', fontSize: REF * 0.61, letterSpacing: REF * 0.085, fill: p.needleText });
    this.clefTexture = this.bakeText('𝄞', { fontFamily: theme.fonts.music, fontSize: REF * 5.8, fill: p.ink });
    const glyph = (text: string, judgment: Judgment) => this.bakeText(text, { fontFamily: ui, fontWeight: '800', fontSize: REF * 0.9, fill: p.judgments[judgment] });
    const glyphs = new Map<string, Texture>();
    const glyphFor = (judgment: Judgment, issue: Issue | null): Texture | null => {
      if (judgment === 'perfect' && !issue) return null;
      const text = judgment === 'miss' ? MISS_GLYPH : issue ? ISSUE_GLYPH[issue] : null;
      if (!text) return null;
      const key = `${judgment}${text}`;
      if (!glyphs.has(key)) glyphs.set(key, glyph(text, judgment));
      return glyphs.get(key)!;
    };
    for (const j of ['great', 'good'] as const) for (const issue of ['early', 'late', 'sharp', 'flat'] as const) glyphFor(j, issue);
    glyphFor('miss', 'not-played');
    this.glyphTextures = [...glyphs.values()];
    this.glyphFor = glyphFor;
    this.nameTexture = this.notes.map((n) => this.nameTextures.get(n.name)!);
    this.ghostTexture = this.bakeHead(p.paper, p.judgments.miss);
    this.youTextures = STRING_LETTERS.map((letter) => this.bakeText(`VOCÊ ${letter}`, { fontFamily: ui, fontWeight: '700', fontSize: REF * 0.72, fill: p.judgments.miss }));
    this.playedStep = new Int16Array(this.notes.length).fill(NO_STEP);
    this.playedString = new Uint8Array(this.notes.length);

    this.paper.tint = p.paper;
    this.paperPieces.push(this.paper);
    this.paperLayer.addChild(this.paper);
    for (let k = 0; k < STAFF_LINES.length; k++) {
      const line = new Sprite(Texture.WHITE);
      line.tint = p.line;
      line.alpha = STAFF_ALPHA;
      this.staff.push(line);
      const cover = new Sprite(Texture.WHITE);
      cover.tint = p.line;
      cover.alpha = STAFF_ALPHA;
      this.coverStaff.push(cover);
    }
    this.zone.tint = p.needle;
    this.zone.alpha = ZONE_ALPHA;
    this.holdBg.anchor.set(0, 0.5);
    this.holdFill.anchor.set(0, 0.5);
    this.holdBg.visible = this.holdFill.visible = false;
    this.needle.tint = p.needle;
    this.needle.anchor.set(0.5, 0);
    this.needleLabel = new Sprite(this.labelTexture);
    this.needleLabel.anchor.set(1, 0);
    this.coverPaper.tint = p.paper;
    this.coverEnd.tint = p.line;
    this.clef = new Sprite(this.clefTexture);
    this.clef.anchor.set(0, 0.5);
    this.keySprites = keySignature(this.fifths).map((k) => {
      const s = new Sprite(this.accidentalTextures.get(k.glyph));
      s.anchor.set(0.5);
      return s;
    });
    this.cover.addChild(this.coverPaper, ...this.coverStaff, this.coverEnd, this.clef, ...this.keySprites);
    this.fpsText = new Text({ text: '', style: { fill: p.line, fontFamily: ui, fontWeight: '700', fontSize: 12 } });
    this.fpsText.visible = false;

    this.l = sheetLayout(1, 1, this.keySprites.length);
    this.eventMode = 'none';
    this.addChild(
      this.paperLayer,
      this.bandLayer,
      ...this.staff,
      this.zone,
      this.holdBg,
      this.holdFill,
      this.barLayer,
      this.restLayer,
      this.tieLayer,
      this.noteLayer,
      this.loopLayer,
      this.needle,
      this.needleLabel,
      this.cover,
      this.fpsText,
    );
  }

  layout(width: number, height: number): void {
    const l = (this.l = sheetLayout(width, height, this.keySprites.length));
    const p = this.palette;
    const k = l.space / REF;
    this.paper.position.set(0, 0);
    this.paper.setSize(width, height);
    for (const piece of this.paperPieces) piece.height = height;
    STAFF_LINES.forEach((step, i) => {
      const y = stepY(l, step) - l.line / 2;
      this.staff[i].position.set(0, y);
      this.staff[i].setSize(width, l.line);
      this.coverStaff[i].position.set(0, y);
      this.coverStaff[i].setSize(l.clefWidth, l.line);
    });
    this.zone.position.set(l.needleX - l.needle.zone / 2, l.needle.top);
    this.zone.setSize(l.needle.zone, l.needle.bottom - l.needle.top);
    this.needle.position.set(l.needleX, l.needle.top);
    this.needle.setSize(l.needle.width, l.needle.bottom - l.needle.top);
    this.needleLabel.scale.set(l.needle.labelSize / (REF * 0.61));
    this.needleLabel.position.set(l.needleX - l.space * 0.55, l.needle.labelY);
    this.needleLabel.visible = !l.compact;
    this.coverPaper.setSize(l.clefWidth, height);
    this.coverEnd.position.set(l.clefWidth - l.line, stepY(l, TOP_STEP));
    this.coverEnd.setSize(l.line, stepY(l, BOTTOM_STEP) - stepY(l, TOP_STEP));
    this.clef.scale.set(k);
    this.clef.position.set(l.clef.x, l.clef.y - CLEF_LIFT * l.space);
    keySignature(this.fifths).forEach((key, i) => {
      this.keySprites[i].scale.set(k);
      this.keySprites[i].position.set(l.keyX + i * l.keyStep, stepY(l, key.step) - ACCIDENTAL_LIFT * l.space);
    });
    this.fpsText.position.set(l.clefWidth + 8, 4);
    this.holdBg.tint = this.holdFill.tint = p.strings[0];

    const span = l.behind + l.ahead;
    const slots = 2 * maxNotesInWindow(this.at, span) + 2;
    while (this.slots.length < slots) this.slots.push(this.makeSlot());
    for (const slot of this.slots) slot.note = -1;
    const minMeasure = Math.max(1, Math.min(...this.bars.map((b, i) => (this.bars[i + 1] ?? Infinity) - b)));
    const bars = 2 * Math.ceil(span / minMeasure) + 2;
    while (this.barSlots.length < bars) this.barSlots.push(this.makeBar());
    for (const bar of this.barSlots) {
      bar.line.position.y = stepY(l, TOP_STEP);
      bar.line.setSize(l.line * 1.1, stepY(l, BOTTOM_STEP) - stepY(l, TOP_STEP));
      bar.number.scale.set(l.numberSize / (REF * 0.78));
      bar.number.position.y = l.numberY;
    }
    const rests = 2 * maxNotesInWindow(this.restAt, span) + 2;
    while (this.restSlots.length < rests) this.restSlots.push(this.makeRest());
    for (const slot of this.restSlots) slot.rest = -1;
    const longestTie = this.ties.reduce((most, t) => Math.max(most, t.toAt - t.fromAt), 0);
    const ties = 2 * maxNotesInWindow(this.tieTo, span + longestTie) + 2;
    while (this.tieSlots.length < ties) this.tieSlots.push(this.makeTie());
    for (const slot of this.tieSlots) slot.tie = -1;
    this.layoutLoop();
    this.until = -Infinity;
    this.fetchedAt = -Infinity;
    this.update(this.lastNow);
  }

  /** Liga, troca ou desliga o laço marcado na faixa: refaz as bandeirinhas e o arco só aqui, nunca no quadro. */
  private setLoop(loop: MeasureLoop | null): void {
    const valid = loop && loop.startMeasure >= 0 && loop.endMeasure >= loop.startMeasure && loop.endMeasure < this.bars.length;
    this.loop = valid ? { startMeasure: loop.startMeasure, endMeasure: loop.endMeasure } : null;
    for (const t of this.flagTextures) t.destroy(true);
    this.flagTextures = [];
    if (this.loop) {
      const { startMeasure: s, endMeasure: e } = this.loop;
      this.loopA = this.bars[s];
      this.loopB = this.bars[e + 1] ?? this.totalBeats;
      this.spacedA = this.warp.forward(this.loopA);
      this.spacedB = this.warp.forward(this.loopB);
      this.loopOffA = this.barOffsets[s];
      this.loopOffB = this.barOffsets[e + 1];
      // Na faixa compacta, só a letra: o alto dela divide espaço com o julgamento e a passada da tela
      this.flagTextures = [this.bakeLoopFlag(`A · ${s + 1}`), this.bakeLoopFlag(`B · ${e + 1}`), this.bakeLoopFlag('A'), this.bakeLoopFlag('B')];
    }
    this.layoutLoop();
  }

  /** Tamanho dos marcadores e o desenho do arco de volta (de B, em x = 0, até A), no layout atual. */
  private layoutLoop(): void {
    const l = this.l;
    const m = loopMarks(l);
    for (const mark of [...this.aMarks, ...this.bMarks]) this.layoutLoopMark(mark);
    for (const band of this.bands) band.height = l.height;

    this.arcContext.clear();
    const width = (this.spacedB - this.spacedA) * l.pxPerBeat;
    this.hasArc = this.loop !== null && m.arc !== null && width > l.space * 4;
    if (!this.hasArc || !m.arc) return;
    const { baseY, topY, dash, gap } = m.arc;
    const from = -l.space * 0.22;
    const to = -width + l.space * 0.9;
    const span = from - to;
    // Cada traço vira um segmento reto (o traço é curto): o Pixi refaz os vértices dos Graphics a cada quadro na CPU
    for (const piece of dashedCubic([from, baseY, from - 0.21 * span, topY, to + 0.22 * span, topY, to, baseY], dash, gap)) {
      this.arcContext.moveTo(piece[0], piece[1]).lineTo(piece[piece.length - 2], piece[piece.length - 1]);
    }
    this.arcContext
      .moveTo(to, baseY)
      .lineTo(to + l.space * 0.55, baseY - l.space * 0.5)
      .moveTo(to, baseY)
      .lineTo(to + l.space * 0.72, baseY + l.space * 0.17)
      .stroke({ color: this.palette.loop, width: m.arc.width, alpha: LOOP_ARC_ALPHA });
  }

  /** Marca o julgamento do motor na própria nota; `at` é a hora do relógio do julgamento. */
  judge(event: JudgmentEvent, at: number = this.lastNow): void {
    const i = event.noteIndex;
    if (!(i >= 0 && i < this.notes.length)) return;
    // A nota sem acerto só é julgada quando a janela dela fecha (~0,6 s mais a latência depois da hora): a marca vai
    // para a cópia que tocou por último até ali, não para a que estiver mais perto da hora do julgamento
    this.markAt[i] = this.copyTimeBefore(this.at[i], at);
    this.markShownAt[i] = at;
    this.markState[i] = event.judgment === 'miss' ? MISSED : HIT;
    this.markTexture[i] = this.glyphFor(event.judgment, event.issue);
    const played = event.issue === 'wrong-note' ? event.playedMidi : null;
    this.playedStep[i] = played === null ? NO_STEP : diatonicStep(played, this.fifths);
    this.playedString[i] = played === null ? 0 : playedString(played, this.notes[i].string);
  }

  /** Hora da última cópia do tempo `beat` que tocou até `at` (com folga de um ataque adiantado); `at` se não achar. */
  private copyTimeBefore(beat: number, at: number): number {
    let best = NaN;
    for (const s of this.clock.segments(at + 1)) {
      if (beat < s.beat || beat >= s.endBeat) continue;
      const t = s.time + (beat - s.beat) * s.spb;
      if (t <= at + MARK_EARLY_SECONDS && !(t <= best)) best = t;
    }
    return Number.isNaN(best) ? at : best;
  }

  showFps(report: FpsReport | null): void {
    this.fpsText.visible = report !== null;
    if (report) this.fpsText.text = formatFps(report);
  }

  /** Desenha o quadro da hora `now` do AudioContext. */
  update(now: number): void {
    this.lastNow = now;
    const l = this.l;
    // A lista é copiada a cada pedido e cresce uma volta por vez: pede de novo só quando o horizonte acaba ou a prática
    // pode ter mudado (laço, andamento)
    const spb = this.segments.length ? this.segments[this.segments.length - 1].spb : 1;
    const horizon = now + l.ahead * spb * 2 + 1;
    if (horizon > this.until || now - this.fetchedAt >= CLOCK_REFRESH_SECONDS || now < this.fetchedAt) {
      this.segments = this.clock.segments(horizon + 2);
      this.until = horizon + 2;
      this.fetchedAt = now;
      const loop = this.clock.currentLoop?.() ?? null;
      if (loop?.startMeasure !== this.loop?.startMeasure || loop?.endMeasure !== this.loop?.endMeasure) this.setLoop(loop);
    }
    const count = beatWindows(this.segments, now, l.behind, l.ahead, this.windows, this.warp);

    let used = 0;
    let bars = 0;
    let rests = 0;
    let ties = 0;
    this.loopCount.bands = this.loopCount.a = this.loopCount.b = this.loopCount.arcs = 0;
    this.lastA = this.lastB = NaN;
    let holding = -1;
    let holdX = 0;
    for (let w = 0; w < count; w++) {
      const win = this.windows[w];
      for (let i = lowerBound(this.at, win.fromBeat); i < this.at.length && this.at[i] < win.toBeat && used < this.slots.length; i++) {
        const slot = this.slots[used++];
        if (slot.note !== i) this.fill(slot, i);
        const distance = this.spacedAt[i] + win.shift;
        const attack = this.attackOf[i];
        const markOn = markApplies(windowTime(win, this.at[attack]), this.markAt[attack]);
        const state = markOn ? this.markState[attack] : 0;
        slot.root.visible = true;
        slot.root.x = beatX(l, distance);
        slot.root.alpha = noteAlpha(distance, this.spacedBeats[i], state === HIT) * clefFade(l, slot.root.x);
        const mark = markOn && attack === i ? this.markTexture[attack] : null;
        slot.mark.visible = mark !== null;
        if (mark) {
          slot.mark.texture = mark;
          slot.mark.scale.set((l.space / REF) * feedbackScale(now - this.markShownAt[attack], this.reducedMotion));
        }
        const step = mark ? this.playedStep[i] : NO_STEP;
        slot.ghost.visible = step !== NO_STEP;
        if (step !== NO_STEP) slot.ghost.position.set(0, stepY(l, step));
        slot.name.texture = step !== NO_STEP ? this.youTextures[this.playedString[i]] : this.nameTexture[i];
        if (attack === i && distance <= 0 && distance + this.spacedHold[i] > 0) {
          holding = i;
          holdX = slot.root.x;
        }
      }
      for (let m = lowerBound(this.bars, Math.max(win.fromBeat, 1e-9)); m < this.bars.length && this.bars[m] < win.toBeat && bars < this.barSlots.length; m++) {
        // As barras de A e de B são as linhas do laço
        if (this.loop && (m === this.loop.startMeasure || m === this.loop.endMeasure + 1)) continue;
        const bar = this.barSlots[bars++];
        const x = beatX(l, this.spacedBars[m] + win.shift - this.barOffsets[m]);
        bar.line.visible = bar.number.visible = true;
        bar.line.x = x;
        bar.number.x = x + l.space * 0.35;
        bar.number.texture = this.numberTextures[m];
      }
      for (let r = lowerBound(this.restAt, win.fromBeat); r < this.restAt.length && this.restAt[r] < win.toBeat && rests < this.restSlots.length; r++) {
        const slot = this.restSlots[rests++];
        if (slot.rest !== r) this.fillRest(slot, r);
        slot.root.visible = true;
        slot.root.x = beatX(l, this.spacedRest[r] + win.shift);
        slot.root.alpha = clefFade(l, slot.root.x);
      }
      // O arco entra pela nota que continua, mas aparece enquanto qualquer parte dele estiver no pedaço
      const previous = w > 0 ? this.windows[w - 1] : undefined;
      for (let t = lowerBound(this.tieTo, win.fromBeat); t < this.ties.length && this.ties[t].fromAt < win.toBeat && ties < this.tieSlots.length; t++) {
        const tie = this.ties[t];
        if (!tieShows(win, previous, tie.fromAt, tie.toAt)) continue;
        const slot = this.tieSlots[ties++];
        if (slot.tie !== t) this.fillTie(slot, t);
        const distance = this.spacedTieTo[t] + win.shift;
        const attack = this.attackOf[tie.to];
        const hit = markApplies(windowTime(win, this.at[attack]), this.markAt[attack]) && this.markState[attack] === HIT;
        slot.arc.visible = true;
        slot.arc.x = beatX(l, this.spacedTieFrom[t] + win.shift);
        slot.arc.alpha = noteAlpha(distance, this.spacedBeats[tie.to], hit) * clefFade(l, beatX(l, distance));
      }
      if (this.loop) this.drawLoop(win);
    }
    this.hideLoop();
    for (let i = used; i < this.usedSlots; i++) this.slots[i].root.visible = false;
    for (let i = bars; i < this.usedBars; i++) this.barSlots[i].line.visible = this.barSlots[i].number.visible = false;
    for (let i = rests; i < this.usedRests; i++) this.restSlots[i].root.visible = false;
    for (let i = ties; i < this.usedTies; i++) this.tieSlots[i].arc.visible = false;
    this.usedSlots = used;
    this.usedBars = bars;
    this.usedRests = rests;
    this.usedTies = ties;

    this.holdBg.visible = this.holdFill.visible = holding >= 0;
    if (holding >= 0) {
      const n = this.notes[holding];
      const y = stepY(l, n.step);
      const color = this.palette.strings[n.string];
      this.holdBg.tint = this.holdFill.tint = color;
      this.holdBg.alpha = HOLD_BG_ALPHA;
      this.holdFill.alpha = HOLD_FILL_ALPHA;
      this.holdBg.position.set(holdX, y);
      this.holdBg.setSize(this.spacedHold[holding] * l.pxPerBeat, l.holdHeight);
      this.holdFill.position.set(holdX, y);
      this.holdFill.setSize(Math.max(0, l.needleX - holdX), l.holdHeight);
    }
  }

  /**
   * O laço neste pedaço: banda de A a B, as linhas de A e B e o arco de volta. Depois do salto, o A da passada nova cai
   * na linha do B da anterior (as duas se encontram onde a música volta). Cria peça só quando o pool não basta.
   */
  private drawLoop(win: BeatWindow): void {
    const l = this.l;
    const c = this.loopCount;
    const a = this.loopA;
    const b = this.loopB;
    if (win.fromBeat > b + 1e-9 || win.toBeat < a - 1e-9) return;
    const glued = Math.abs(win.passFrom - a) < 1e-9;
    const aX = beatX(l, this.spacedA + win.shift - (glued ? this.loopOffB : this.loopOffA));
    const bX = beatX(l, this.spacedB + win.shift - this.loopOffB);

    const from = Math.max(a, win.fromBeat);
    const to = Math.min(b, win.toBeat);
    if (to > from) {
      const x0 = from === a ? aX : beatX(l, this.warp.forward(from) + win.shift);
      const x1 = to === b ? bX : beatX(l, this.warp.forward(to) + win.shift);
      const band = this.bands[c.bands] ?? this.makeBand();
      c.bands++;
      band.visible = true;
      band.x = x0;
      band.width = Math.max(0, x1 - x0);
    }
    if (a >= win.fromBeat - 1e-9 && a < win.toBeat && !(Math.abs(aX - this.lastA) < 0.5)) {
      const mark = this.aMarks[c.a] ?? this.makeLoopMark(this.aMarks, 0);
      c.a++;
      mark.line.visible = mark.flag.visible = true;
      mark.line.x = aX;
      mark.flag.x = aX - mark.line.width / 2;
      this.lastA = aX;
    }
    if (Math.abs(bX - this.lastB) < 0.5) return;
    this.lastB = bX;
    if (b > win.fromBeat && b <= win.toBeat + 1e-9) {
      const mark = this.bMarks[c.b] ?? this.makeLoopMark(this.bMarks, 1);
      c.b++;
      mark.line.visible = mark.flag.visible = true;
      mark.line.x = bX;
      mark.flag.x = bX + mark.line.width / 2;
    }
    // O arco sai do B desta passada, mesmo com o B ainda fora da tela: a parte da esquerda já aparece
    if (this.hasArc) {
      const arc = this.loopArcs[c.arcs] ?? this.makeLoopArc();
      c.arcs++;
      arc.visible = true;
      arc.x = bX;
    }
  }

  private layoutLoopMark(mark: LoopMark): void {
    const m = loopMarks(this.l);
    const texture = this.flagTextures[(mark.flag.anchor.x === 0 ? 0 : 1) + (this.l.compact ? 2 : 0)];
    mark.line.position.y = m.flagTop;
    mark.line.setSize(m.lineWidth, m.lineBottom - m.flagTop);
    mark.flag.texture = texture ?? Texture.EMPTY;
    mark.flag.scale.set(m.labelSize / FLAG_TEXT);
    mark.flag.position.y = m.flagTop;
  }

  /** Esconde as peças do laço que o quadro anterior usou e este não. */
  private hideLoop(): void {
    const c = this.loopCount;
    const u = this.loopUsed;
    for (let i = c.bands; i < u.bands; i++) this.bands[i].visible = false;
    for (let i = c.a; i < u.a; i++) this.aMarks[i].line.visible = this.aMarks[i].flag.visible = false;
    for (let i = c.b; i < u.b; i++) this.bMarks[i].line.visible = this.bMarks[i].flag.visible = false;
    for (let i = c.arcs; i < u.arcs; i++) this.loopArcs[i].visible = false;
    u.bands = c.bands;
    u.a = c.a;
    u.b = c.b;
    u.arcs = c.arcs;
    this.layoutPaper();
  }

  /**
   * O papel cobre só o que as bandas do laço não cobrem: a banda é opaca, com a cor já misturada, e nenhum pixel é
   * pintado duas vezes (no celular com GPU fraca, o preenchimento é o que pesa).
   */
  private layoutPaper(): void {
    const width = this.l.width;
    let pieces = 0;
    let cursor = 0;
    const put = (to: number) => {
      if (to <= cursor) return;
      const piece = this.paperPieces[pieces] ?? this.makePaperPiece();
      pieces++;
      piece.visible = true;
      piece.x = cursor;
      piece.width = to - cursor;
    };
    for (let i = 0; i < this.loopCount.bands; i++) {
      const band = this.bands[i];
      put(Math.min(width, band.x));
      cursor = Math.max(cursor, band.x + band.width);
    }
    put(width);
    for (let i = pieces; i < this.paperPieces.length; i++) this.paperPieces[i].visible = false;
  }

  private makePaperPiece(): Sprite {
    const piece = new Sprite(Texture.WHITE);
    piece.tint = this.palette.paper;
    piece.height = this.l.height;
    this.paperPieces.push(piece);
    this.paperLayer.addChild(piece);
    return piece;
  }

  private makeBand(): Sprite {
    const band = new Sprite(Texture.WHITE);
    band.tint = mix(this.palette.paper, this.palette.loop, LOOP_BAND_ALPHA);
    band.height = this.l.height;
    this.bands.push(band);
    this.bandLayer.addChild(band);
    return band;
  }

  /** `side` 0 é A (bandeirinha à direita da linha), 1 é B (à esquerda). */
  private makeLoopMark(marks: LoopMark[], side: 0 | 1): LoopMark {
    const line = new Sprite(Texture.WHITE);
    line.tint = this.palette.loop;
    line.anchor.set(0.5, 0);
    const flag = new Sprite(this.flagTextures[side] ?? Texture.EMPTY);
    flag.anchor.set(side, 0);
    const mark = { line, flag };
    marks.push(mark);
    this.loopLayer.addChild(line, flag);
    this.layoutLoopMark(mark);
    return mark;
  }

  private makeLoopArc(): Graphics {
    const arc = new Graphics(this.arcContext);
    this.loopArcs.push(arc);
    this.loopLayer.addChild(arc);
    return arc;
  }

  /** Marcas do laço agora: x das linhas de A e B, das pontas da banda e dos arcos; para testes. */
  loopView(): { a: number[]; b: number[]; bands: [number, number][]; arcs: number[] } {
    const shown = (marks: LoopMark[]) => marks.filter((m) => m.line.visible).map((m) => m.line.x);
    return {
      a: shown(this.aMarks),
      b: shown(this.bMarks),
      bands: this.bands.filter((s) => s.visible).map((s): [number, number] => [s.x, s.x + s.width]),
      arcs: this.loopArcs.filter((g) => g.visible).map((g) => g.x),
    };
  }

  /** Notas na faixa agora (também as que já passaram, sob a clave); para testes. */
  visibleNotes(): number[] {
    return this.slots.filter((s) => s.root.visible).map((s) => s.note);
  }

  /** Transparência e marca de cada nota visível; para testes. */
  noteView(note: number): { alpha: number; x: number; marked: boolean }[] {
    return this.slots
      .filter((s) => s.root.visible && s.note === note)
      .map((s) => ({ alpha: s.root.alpha, x: s.root.x, marked: s.mark.visible }));
  }

  /** Nota errada à mostra: y da cabeça da nota tocada e se o nome virou "VOCÊ <corda>"; para testes. */
  wrongView(note: number): { ghostY: number | null; you: boolean }[] {
    return this.slots
      .filter((s) => s.root.visible && s.note === note)
      .map((s) => ({ ghostY: s.ghost.visible ? s.ghost.y : null, you: this.youTextures.includes(s.name.texture) }));
  }

  /** x de cada nota visível à frente da clave; para testes. */
  notesX(): number[] {
    return this.slots.filter((s) => s.root.visible && s.root.x > this.l.clefWidth).map((s) => s.root.x);
  }

  /** Pausas na faixa agora: índice em staffLayout(song).rests e x; para testes. */
  restView(): { rest: number; x: number }[] {
    return this.restSlots.filter((s) => s.root.visible).map((s) => ({ rest: s.rest, x: s.root.x }));
  }

  /** Arcos na faixa agora: índice em staffLayout(song).ties e as pontas do arco; para testes. */
  tieView(): { tie: number; from: number; to: number; alpha: number }[] {
    return this.tieSlots
      .filter((s) => s.arc.visible)
      .map((s) => {
        const tie = this.ties[s.tie];
        const arc = tieArc(this.l, s.arc.x, s.arc.x + this.tieLength(s.tie) * this.l.pxPerBeat, tie, { x: 0, y: 0, width: 0, height: 0 });
        return { tie: s.tie, from: arc.x, to: arc.x + arc.width, alpha: s.arc.alpha };
      });
  }

  /** Da cabeça que a ligadura `t` sai à que ela chega, em tempos de faixa. */
  private tieLength(t: number): number {
    return this.spacedTieTo[t] - this.spacedTieFrom[t];
  }

  holdVisible(): boolean {
    return this.holdBg.visible;
  }

  bakedTextures(): Texture[] {
    return [
      ...this.headTextures,
      ...this.hollowTextures,
      this.flagTexture,
      this.dotTexture,
      ...this.accidentalTextures.values(),
      ...this.restTextures.values(),
      ...this.fingerTextures.flat(),
      ...this.letterTextures,
      ...this.nameTextures.values(),
      ...this.numberTextures,
      this.labelTexture,
      this.clefTexture,
      ...this.glyphTextures,
      this.ghostTexture,
      ...this.youTextures,
    ];
  }

  override destroy(): void {
    const baked = [...this.bakedTextures(), ...this.flagTextures];
    super.destroy({ children: true });
    for (const t of baked) t.destroy(true);
    this.flagTextures = [];
    // O arco do laço é de todos os Graphics do pool: nenhum deles destrói o desenho
    this.arcContext.destroy();
  }

  /** Bandeirinha "A · 18": texto do primário sobre o magenta do laço, assada quando o laço muda. */
  private bakeLoopFlag(text: string): Texture {
    const p = this.palette;
    // O texto assado primeiro dá a largura da bandeirinha sem medir fonte fora do renderizador
    const label = this.bakeText(text, { fontFamily: this.uiFont, fontWeight: '700', fontSize: FLAG_TEXT, letterSpacing: FLAG_TEXT * 0.1, fill: p.loopText });
    const padX = FLAG_TEXT * 0.67;
    const height = FLAG_TEXT * 1.83;
    const sprite = new Sprite(label);
    sprite.position.set(padX, (height - label.height) / 2);
    const flag = new Container();
    flag.addChild(new Graphics().rect(0, 0, label.width + padX * 2, height).fill(p.loop), sprite);
    const texture = this.bake(flag);
    label.destroy(true);
    return texture;
  }

  /** Monta o slot para a nota `i` (textura, haste, linhas suplementares): só quando a nota do slot muda. */
  private fill(slot: NoteSlot, i: number): void {
    const l = this.l;
    const n = this.notes[i];
    const k = l.space / REF;
    const y = stepY(l, n.step);
    slot.note = i;

    const ledgers = ledgerSteps(n.step);
    slot.ledgers.forEach((ledger, j) => {
      ledger.visible = j < ledgers.length;
      if (!ledger.visible) return;
      ledger.position.set(-l.ledgerHalf, stepY(l, ledgers[j]) - l.line / 2);
      ledger.setSize(l.ledgerHalf * 2, l.line);
    });

    slot.head.texture = n.hollow ? this.hollowTextures[n.string] : this.headTextures[n.string];
    slot.head.scale.set(k);
    slot.head.position.set(0, y);
    slot.ghost.scale.set(k);

    slot.stem.visible = n.stem;
    const stemX = n.stemUp ? l.head.rx * 0.9 : -l.head.rx * 0.9;
    if (n.stem) {
      slot.stem.position.set(stemX - l.stem.width / 2, n.stemUp ? y - l.stem.length : y);
      slot.stem.setSize(l.stem.width, l.stem.length);
    }
    const tip = n.stemUp ? y - l.stem.length : y + l.stem.length;
    const toHead = n.stemUp ? 1 : -1;
    slot.flags.forEach((flag, j) => {
      flag.visible = j < n.flags;
      if (!flag.visible) return;
      flag.position.set(stemX + l.stem.width / 2, tip + toHead * j * l.space * 0.75);
      flag.scale.set(k, toHead * k);
    });
    slot.dot.visible = n.dotted;
    if (n.dotted) {
      slot.dot.scale.set(k);
      slot.dot.position.set(l.head.rx + l.space * 0.55, n.step % 2 === 0 ? y - l.space / 2 : y);
    }
    slot.accidental.visible = n.accidental !== null;
    if (n.accidental) {
      slot.accidental.texture = this.accidentalTextures.get(n.accidental)!;
      slot.accidental.scale.set(k * 0.85);
      slot.accidental.position.set(-l.head.rx - l.space * 0.75, y - ACCIDENTAL_LIFT * l.space);
    }

    // A ligada continua a nota anterior: sem dedo nem letra de novo
    const labelled = !n.tie;
    slot.finger.visible = slot.letter.visible = labelled;
    slot.name.visible = labelled && !l.compact;
    if (labelled) {
      const label = l.fingerSize / REF;
      slot.finger.texture = this.fingerTextures[n.string][n.finger];
      slot.finger.scale.set(label);
      slot.finger.position.set(-l.fingerSize * 0.3, l.fingerY);
      slot.letter.texture = this.letterTextures[n.string];
      slot.letter.scale.set(label);
      slot.letter.position.set(l.fingerSize * 0.5, l.fingerY);
      slot.name.texture = this.nameTexture[i];
      slot.name.scale.set(k);
      slot.name.position.set(0, l.nameY);
    }
    slot.mark.position.set(l.head.rx + l.space * 0.8, l.fingerY - l.space * 0.05);
  }

  private makeSlot(): NoteSlot {
    const sprite = (texture: Texture = Texture.WHITE, ax = 0.5, ay = 0.5) => {
      const s = new Sprite(texture);
      s.anchor.set(ax, ay);
      return s;
    };
    const p = this.palette;
    const ledgers = Array.from({ length: MAX_LEDGERS }, () => {
      const s = sprite(Texture.WHITE, 0, 0);
      s.tint = p.line;
      return s;
    });
    const stem = sprite(Texture.WHITE, 0, 0);
    stem.tint = p.ink;
    const head = sprite();
    head.rotation = HEAD_ANGLE;
    const flags = [sprite(this.flagTexture, 0, 0), sprite(this.flagTexture, 0, 0)];
    const dot = sprite(this.dotTexture);
    const accidental = sprite();
    const finger = sprite();
    const letter = sprite();
    const name = sprite();
    const mark = sprite();
    mark.visible = false;
    const ghost = sprite(this.ghostTexture);
    ghost.rotation = HEAD_ANGLE;
    ghost.visible = false;
    const root = new Container();
    root.visible = false;
    root.addChild(...ledgers, stem, head, ghost, ...flags, dot, accidental, finger, letter, name, mark);
    this.noteLayer.addChild(root);
    return { root, ledgers, stem, head, flags, dot, accidental, finger, letter, name, mark, ghost, note: -1 };
  }

  /** Monta o slot para a pausa `r`: glifo da figura na altura dela e o ponto no espaço acima da linha do meio. */
  private fillRest(slot: RestSlot, r: number): void {
    const l = this.l;
    const rest = this.rests[r];
    const k = l.space / REF;
    slot.rest = r;
    const { anchor, step } = REST_GLYPHS[rest.value];
    slot.glyph.texture = this.restTextures.get(rest.value)!;
    slot.glyph.scale.set(k);
    slot.glyph.anchor.set(0.5, anchor);
    slot.glyph.position.set(0, stepY(l, step));
    slot.dot.visible = rest.dotted;
    if (rest.dotted) {
      slot.dot.scale.set(k);
      slot.dot.position.set(l.space * REST_DOT_X, stepY(l, MIDDLE_STEP + 1));
    }
  }

  /** Redesenha o arco do slot para a ligadura `t`, com a ponta esquerda em x = 0. */
  private fillTie(slot: TieSlot, t: number): void {
    const l = this.l;
    const tie = this.ties[t];
    slot.tie = t;
    const { x, y, width, height } = tieArc(l, 0, this.tieLength(t) * l.pxPerBeat, tie, this.arc);
    const inner = height - Math.sign(height) * l.space * TIE_THICKNESS;
    slot.arc
      .clear()
      .moveTo(x, y)
      .quadraticCurveTo(x + width / 2, y + 2 * height, x + width, y)
      .quadraticCurveTo(x + width / 2, y + 2 * inner, x, y)
      .fill(this.palette.ink);
  }

  private makeRest(): RestSlot {
    const glyph = new Sprite();
    glyph.anchor.set(0.5);
    const dot = new Sprite(this.dotTexture);
    dot.anchor.set(0.5);
    const root = new Container();
    root.visible = false;
    root.addChild(glyph, dot);
    this.restLayer.addChild(root);
    return { root, glyph, dot, rest: -1 };
  }

  private makeTie(): TieSlot {
    const arc = new Graphics();
    arc.visible = false;
    this.tieLayer.addChild(arc);
    return { arc, tie: -1 };
  }

  private makeBar(): BarSlot {
    const line = new Sprite(Texture.WHITE);
    line.tint = this.palette.line;
    line.alpha = 0.8;
    const number = new Sprite();
    number.anchor.set(0, 1);
    line.visible = number.visible = false;
    this.barLayer.addChild(line, number);
    return { line, number };
  }

  private bake(target: Container): Texture {
    const texture = this.baker.generateTexture({ target, resolution: this.baker.resolution, antialias: true });
    target.destroy();
    return texture;
  }

  private bakeText(text: string, style: TextStyleOptions): Texture {
    return this.bake(new Text({ text, style }));
  }

  /** Cabeça de nota do design: elipse (girada no sprite); vazada = papel com contorno da corda. */
  private bakeHead(fill: number, stroke: number | null): Texture {
    const width = HEAD_RY * 0.35;
    const g = new Graphics().ellipse(HEAD_RX + width, HEAD_RY + width, HEAD_RX - (stroke === null ? 0 : width / 2), HEAD_RY - (stroke === null ? 0 : width / 2)).fill(fill);
    if (stroke !== null) g.stroke({ color: stroke, width });
    return this.bake(g);
  }

  /** Colchete da colcheia, desenhado para a haste para cima (para baixo, o sprite espelha). */
  private bakeFlag(color: number): Texture {
    const w = REF * 0.9;
    const h = REF * 2.2;
    return this.bake(
      new Graphics()
        .moveTo(0, 0)
        .bezierCurveTo(w * 0.1, h * 0.35, w * 1.1, h * 0.45, w * 0.6, h)
        .bezierCurveTo(w * 0.85, h * 0.55, w * 0.2, h * 0.45, 0, h * 0.4)
        .closePath()
        .fill(color),
    );
  }
}
