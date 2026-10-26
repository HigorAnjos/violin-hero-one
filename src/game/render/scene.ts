import { Container, Graphics, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';
import type { EngineEvent, EngineNote, Judgment } from '../engine/types';
import { formatFps, type FpsReport } from './fps';
import {
  depthScale,
  entryAlpha,
  LEAD_SECONDS,
  lowerBound,
  maxNotesInWindow,
  MISS_TAIL_SECONDS,
  noteDepth,
  projectX,
  projectY,
  tailSeconds,
  trackLayout,
  type TrackLayout,
} from './layout';
import { corner, drawPattern, glowLayers, noteLabel, noteLook, STRING_PATTERNS, type LookOptions, type NoteLook, type StringPattern } from './look';
import { trackPalette, type TrackPalette } from './palette';
import {
  FEEDBACK_FADE_SECONDS,
  FEEDBACK_HOLD_SECONDS,
  errorAlpha,
  feedbackLabel,
  playedString,
  feedbackAlpha,
  feedbackScale,
  glowRing,
  judgmentDetail,
  JUDGMENTS,
} from './present';
import { createShowQueue } from './showQueue';

/** O que o rótulo central mostra de um julgamento. */
interface Called {
  judgment: Judgment;
  detail: string;
  fill: number;
}

export type JudgmentEvent = Extract<EngineEvent, { type: 'judgment' }>;

export type TextureBaker = Pick<Renderer, 'generateTexture' | 'resolution'>;

export interface SceneOptions extends LookOptions {
  theme: Theme;
  notes: readonly EngineNote[];
  reducedMotion: boolean;
  /** Segundos do topo da pista à linha de acerto; padrão LEAD_SECONDS. */
  leadSeconds?: number;
}

// Texturas assadas uma vez neste tamanho e escaladas no quadro: o resize não refaz textura.
const GEM_W = 160;
const GEM_H = 64;
const RING_R = 64;
const LETTER_PX = 64;
const LABEL_PX = 96;
const TAG_PX = 32;
// A textura do texto inclui a entrelinha: a letra visível fica com ~75% da altura da nota
const LETTER_ON_NOTE = 1.15;
/** ALVO e VOCÊ embaixo das letras das cordas: nunca abaixo de 12 px. */
const MIN_TAG_PX = 12;
const DASHES = 12;
// Nome da nota acima dela, um pouco menor que a letra
const NAME_PX = 48;
const NAME_ON_NOTE = 0.9;

const HIT = 1;
const MISSED = 2;
const MISSED_ALPHA = 0.35;
const TAIL_ALPHA = 0.5;

interface Chip {
  tail: Sprite;
  gem: Sprite;
  letter: Sprite;
  /** O × da nota errada, em cima da nota apagada. */
  mark: Sprite;
  name: Sprite;
}

/**
 * A pista: plano em perspectiva, quatro trilhas G D A E, notas que descem no relógio do
 * AudioContext e o feedback do julgamento. Nada é alocado em update(); o tema é fixo na vida da
 * cena (trocar de tema = destruir e criar outra).
 */
export class TrackScene extends Container {
  private readonly palette: TrackPalette;
  private look: NoteLook;
  private readonly reducedMotion: boolean;
  private readonly uiFont: string;
  private notes: readonly EngineNote[] = [];
  private times = new Float64Array(0);
  private tails = new Float64Array(0);
  private state = new Uint8Array(0);
  private lookBack = MISS_TAIL_SECONDS;

  private readonly bg = new Graphics();
  private readonly tailLayer = new Container();
  private readonly gemLayer = new Container();
  private readonly letterLayer = new Container();
  private readonly nameLayer = new Container();
  private readonly glows: Sprite[] = [];
  private readonly rings: Sprite[] = [];
  private readonly fills: Sprite[] = [];
  private readonly stringLetters: Sprite[] = [];
  private readonly chips: Chip[] = [];
  private readonly feedbackLabel = new Sprite();
  private readonly feedbackDetail: Text;
  private readonly fpsText: Text;

  private readonly gemTextures: Texture[];
  private readonly noteLetterTextures: Texture[];
  private readonly stringLetterTextures: Texture[];
  private readonly ringTextures: Texture[];
  private readonly fillTextures: Texture[];
  private readonly glowTextures: Texture[];
  private readonly labelTextures: Map<Judgment, Texture>;
  private readonly missMarkTexture: Texture;
  private readonly aimRingTextures: Texture[];
  private readonly youRingTexture: Texture;
  private readonly aimTagTextures: Texture[];
  private readonly youTagTexture: Texture;

  // Nota errada (GameplayErrors.dc): o alvo tracejado com ALVO na corda certa, anel e VOCÊ na corda tocada
  private readonly aimRing = new Sprite();
  private readonly youRing = new Sprite();
  private readonly aimTag = new Sprite();
  private readonly youTag = new Sprite();
  private errorAt = -Infinity;
  private errorTarget = 0;
  private errorPlayed = 0;
  private tagY = 0;
  /** Nome de cada nota da música (Dó, Ré…), assado quando a nota chega na lista; só com noteNames. */
  private readonly nameTextures = new Map<string, Texture>();

  private readonly lead: number;
  private l: TrackLayout;
  private readonly laneHitAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  private ringScale = [1, 1];
  // Mesma fila do texto da shell: cada julgamento fica ao menos 250 ms no rótulo, mesmo numa sequência rápida
  private readonly called = createShowQueue<Called>(FEEDBACK_HOLD_SECONDS + FEEDBACK_FADE_SECONDS);
  private calledSerial = 0;
  private calledJudgment: Judgment | null = null;
  private feedbackBase = 1;
  private usedChips = 0;
  private lastNow = 0;

  constructor(
    private readonly baker: TextureBaker,
    options: SceneOptions,
  ) {
    super();
    const { theme } = options;
    this.palette = trackPalette(theme);
    this.look = noteLook(theme, options);
    this.reducedMotion = options.reducedMotion;
    this.uiFont = theme.fonts.ui;
    this.lead = options.leadSeconds ?? LEAD_SECONDS;
    this.l = trackLayout(1, 1, this.lead);

    const p = this.palette;
    const display = theme.fonts.display;
    this.gemTextures = p.lanes.map((lane, i) => this.bakeGem(lane.main, lane.onNote, STRING_PATTERNS[i]));
    this.noteLetterTextures = p.lanes.map((lane) => this.bakeText(lane.letter, LETTER_PX, lane.onNote, display));
    this.stringLetterTextures = p.lanes.map((lane) => this.bakeText(lane.letter, LETTER_PX, lane.main, display));
    this.ringTextures = p.lanes.map((lane) => this.bakeCircle(p.target, lane.main));
    this.fillTextures = p.lanes.map((lane) => this.bakeCircle(lane.main));
    this.glowTextures = p.lanes.map((lane) => this.bakeCircle(lane.glow.color, undefined, lane.glow.alpha));
    this.labelTextures = new Map(JUDGMENTS.map((j) => [j, this.bakeText(feedbackLabel(j), LABEL_PX, p.judgments[j], display)]));
    const miss = p.judgments.miss;
    this.missMarkTexture = this.bakeText('×', LETTER_PX, miss, theme.fonts.ui);
    this.aimRingTextures = p.lanes.map((lane) => this.bakeDashedRing(lane.main));
    const youWidth = (RING_R * 0.04) / 0.28;
    const youR = RING_R - youWidth / 2;
    const youShape = this.look.square ? new Graphics().rect(RING_R - youR, RING_R - youR, 2 * youR, 2 * youR) : new Graphics().circle(RING_R, RING_R, youR);
    this.youRingTexture = this.bake(youShape.stroke({ color: miss, width: youWidth }));
    this.aimTagTextures = p.lanes.map((lane) => this.bakeText('ALVO', TAG_PX, lane.main, theme.fonts.ui));
    this.youTagTexture = this.bakeText('VOCÊ', TAG_PX, miss, theme.fonts.ui);

    const targets = new Container();
    for (let i = 0; i < 4; i++) {
      const glow = new Sprite(this.glowTextures[i]);
      const ring = new Sprite(this.ringTextures[i]);
      const fill = new Sprite(this.fillTextures[i]);
      const letter = new Sprite(this.stringLetterTextures[i]);
      for (const s of [glow, ring, fill, letter]) s.anchor.set(0.5);
      glow.visible = fill.visible = false;
      targets.addChild(glow, ring, fill, letter);
      this.glows.push(glow);
      this.rings.push(ring);
      this.fills.push(fill);
      this.stringLetters.push(letter);
    }
    for (const s of [this.aimRing, this.youRing]) s.anchor.set(0.5);
    this.aimTag.anchor.set(0.5);
    this.youTag.anchor.set(0.5);
    this.youRing.texture = this.youRingTexture;
    this.youTag.texture = this.youTagTexture;
    for (const s of [this.aimRing, this.youRing, this.aimTag, this.youTag]) s.visible = false;
    targets.addChild(this.aimRing, this.youRing);

    this.setNotes(options.notes);

    this.feedbackLabel.anchor.set(0.5, 1);
    this.feedbackLabel.visible = false;
    this.feedbackDetail = new Text({ text: '', style: { fill: p.muted, fontFamily: theme.fonts.ui, fontWeight: '800' } });
    this.feedbackDetail.anchor.set(0.5, 0);
    this.feedbackDetail.visible = false;
    this.fpsText = new Text({ text: '', style: { fill: p.muted, fontFamily: theme.fonts.ui, fontWeight: '700', fontSize: 12 } });
    this.fpsText.position.set(8, 8);
    this.fpsText.visible = false;

    for (const layer of [this.tailLayer, this.gemLayer, this.letterLayer, this.nameLayer]) layer.eventMode = 'none';
    this.eventMode = 'none';
    // ALVO e VOCÊ por cima das notas que descem: a nota seguinte não pode cobrir o rótulo
    this.addChild(
      this.bg,
      targets,
      this.tailLayer,
      this.gemLayer,
      this.letterLayer,
      this.nameLayer,
      this.aimTag,
      this.youTag,
      this.feedbackLabel,
      this.feedbackDetail,
      this.fpsText,
    );
  }

  layout(width: number, height: number): void {
    const l = (this.l = trackLayout(width, height, this.lead));
    const p = this.palette;
    const far = l.farDepth * 1.02;
    const half = l.planeWidth / 2;
    const edge = (x: number, d: number) => [projectX(l, x, d), projectY(l, d)];
    const line = (x: number, color: number, width: number, alpha = 1) =>
      this.bg
        .moveTo(projectX(l, x, 0), projectY(l, 0))
        .lineTo(projectX(l, x, far), projectY(l, far))
        .stroke({ color, width, alpha });

    this.bg.clear();
    this.bg.poly([...edge(-half, 0), ...edge(half, 0), ...edge(half, far), ...edge(-half, far)]).fill(p.track);
    for (let k = 1; k < 4; k++) line(-half + k * l.laneWidth, p.trackLine, 2);
    const laneWidth = Math.max(2, l.laneWidth * 0.024);
    // Neon: a linha de cada corda acesa, com halo largo e fraco por baixo
    for (const { spread, alpha } of glowLayers(this.look)) l.lanes.forEach((x, i) => line(x, p.lanes[i].main, laneWidth + l.laneWidth * spread * 0.5, alpha));
    l.lanes.forEach((x, i) => line(x, p.lanes[i].main, laneWidth, this.look.glow > 0 ? 0.3 + 0.5 * this.look.glow : 0.3));
    const border = Math.max(2, l.height * 0.007);
    line(-half, p.hitLine, border);
    line(half, p.hitLine, border);
    const hitScale = depthScale(l, l.hitDepth);
    this.bg
      .moveTo(projectX(l, -half, l.hitDepth), projectY(l, l.hitDepth))
      .lineTo(projectX(l, half, l.hitDepth), projectY(l, l.hitDepth))
      .stroke({ color: p.hitLine, width: Math.max(2, l.height * 0.007 * hitScale) });

    // O alvo fica deitado no plano: elipse, achatada pela inclinação
    const r = l.targetRadius;
    const radiusX = r * hitScale;
    const radiusY = (projectY(l, l.hitDepth - r) - projectY(l, l.hitDepth + r)) / 2;
    this.ringScale = [radiusX / RING_R, radiusY / RING_R];
    const hitY = projectY(l, l.hitDepth);
    const letterY = projectY(l, l.letterDepth);
    const letterScale = (l.letterSize * depthScale(l, l.letterDepth)) / LETTER_PX;
    for (let i = 0; i < 4; i++) {
      const x = projectX(l, l.lanes[i], l.hitDepth);
      for (const s of [this.glows[i], this.rings[i], this.fills[i]]) {
        s.position.set(x, hitY);
        s.scale.set(this.ringScale[0], this.ringScale[1]);
      }
      this.stringLetters[i].position.set(projectX(l, l.lanes[i], l.letterDepth), letterY);
      this.stringLetters[i].scale.set(letterScale);
    }
    // ALVO / VOCÊ entre o anel e a letra da corda: embaixo da pista o celular deitado não tem lugar
    const tagPx = Math.max(MIN_TAG_PX, l.letterSize * 0.36);
    const tagScale = tagPx / TAG_PX;
    this.aimTag.scale.set(tagScale);
    this.youTag.scale.set(tagScale);
    const ringBottom = hitY + radiusY;
    const letterTop = letterY - (l.letterSize * depthScale(l, l.letterDepth)) / 2;
    this.tagY = Math.max(ringBottom + tagPx * 0.5, (ringBottom + letterTop) / 2);
    this.aimRing.scale.set(this.ringScale[0], this.ringScale[1]);
    this.youRing.scale.set(this.ringScale[0] * 1.18, this.ringScale[1] * 1.18);
    this.aimRing.y = this.youRing.y = hitY;

    this.feedbackBase = l.feedback.size / LABEL_PX;
    const ax = l.feedback.align === 'right' ? 1 : 0.5;
    this.feedbackLabel.anchor.set(ax, 1);
    this.feedbackDetail.anchor.set(ax, 0);
    this.feedbackLabel.position.set(l.feedback.x, l.feedback.y + l.feedback.size);
    this.feedbackDetail.position.set(l.feedback.x, l.feedback.y + l.feedback.size + 2);
    this.feedbackDetail.style.fontSize = l.feedback.detailSize;

    this.update(this.lastNow);
  }

  /**
   * Troca as notas da pista (a prática acrescenta a volta seguinte e corta o que a troca de andamento refez). As notas
   * que continuam no mesmo índice e no mesmo instante guardam o acerto ou o erro já mostrado.
   */
  setNotes(notes: readonly EngineNote[]): void {
    const times = Float64Array.from(notes, (n) => n.time);
    const state = new Uint8Array(notes.length);
    for (let i = 0; i < Math.min(notes.length, this.notes.length); i++) if (this.times[i] === times[i]) state[i] = this.state[i];
    this.notes = notes;
    this.times = times;
    this.tails = Float64Array.from(notes, (n) => tailSeconds(n.duration));
    this.state = state;
    this.lookBack = MISS_TAIL_SECONDS + this.tails.reduce((a, b) => Math.max(a, b), 0);
    const poolSize = maxNotesInWindow(this.times, this.lead + this.lookBack + 0.5) + 2;
    while (this.chips.length < poolSize) {
      const tail = new Sprite(Texture.WHITE);
      const gem = new Sprite();
      const letter = new Sprite();
      const mark = new Sprite(this.missMarkTexture);
      const name = new Sprite();
      tail.anchor.set(0.5, 1);
      gem.anchor.set(0.5);
      letter.anchor.set(0.5);
      mark.anchor.set(0.5);
      name.anchor.set(0.5, 1);
      tail.visible = gem.visible = letter.visible = mark.visible = name.visible = false;
      this.tailLayer.addChild(tail);
      this.gemLayer.addChild(gem);
      this.letterLayer.addChild(letter, mark);
      this.nameLayer.addChild(name);
      this.chips.push({ tail, gem, letter, mark, name });
    }
    this.bakeNames();
  }

  /**
   * Liga ou desliga o modo daltônico e o nome das notas (a Pausa muda na hora): reassa só as 4 notas e os nomes que
   * faltam. A forma e o brilho continuam os do tema.
   */
  setLook(options: LookOptions): void {
    const patterns = options.patterns ?? false;
    const noteNames = options.noteNames ?? false;
    if (patterns === this.look.patterns && noteNames === this.look.noteNames) return;
    this.look = { ...this.look, patterns, noteNames };
    const old = this.gemTextures.splice(0, 4, ...this.palette.lanes.map((lane, i) => this.bakeGem(lane.main, lane.onNote, STRING_PATTERNS[i])));
    this.bakeNames();
    this.update(this.lastNow);
    for (const t of old) t.destroy(true);
  }

  private bakeNames(): void {
    if (!this.look.noteNames) return;
    for (const n of this.notes) {
      const label = noteLabel(n.midi);
      if (!this.nameTextures.has(label)) this.nameTextures.set(label, this.bakeText(label, NAME_PX, this.palette.hitLine, this.uiFont));
    }
  }

  /** Registra o julgamento do motor; `at` é a hora do relógio em que o feedback começa. */
  judge(event: JudgmentEvent, at: number = this.lastNow): void {
    const note = this.notes[event.index];
    if (!note) return;
    const miss = event.judgment === 'miss';
    this.state[event.index] = miss ? MISSED : HIT;
    if (!miss) this.laneHitAt[note.string] = at;
    if (event.issue === 'wrong-note' && event.playedMidi !== null) {
      this.errorAt = at;
      this.errorTarget = note.string;
      this.errorPlayed = playedString(event.playedMidi, note.string);
    }
    const fill = event.issue ? this.palette.judgments[event.judgment] : this.palette.muted;
    this.called.push({ judgment: event.judgment, detail: judgmentDetail(event), fill }, at);
  }

  showFps(report: FpsReport | null): void {
    this.fpsText.visible = report !== null;
    if (report) this.fpsText.text = formatFps(report);
  }

  /** Desenha o quadro da hora `now` do AudioContext. */
  update(now: number): void {
    this.lastNow = now;
    const l = this.l;
    const missDepth = l.hitDepth - MISS_TAIL_SECONDS * l.speed;
    const first = lowerBound(this.times, now - this.lookBack);
    const last = lowerBound(this.times, now + this.lead + 0.05);
    let used = 0;

    for (let i = first; i < last && used < this.chips.length; i++) {
      const s = this.state[i];
      const d = noteDepth(l, this.times[i], now);
      const tail = this.tails[i];
      const endDepth = Math.min(l.enterDepth, d + tail * l.speed);
      const tailFrom = Math.max(0, s === HIT ? l.hitDepth : d);
      const showTail = tail > 0 && endDepth > tailFrom;
      const showGem = s !== HIT && d >= Math.max(0, missDepth) && d <= l.enterDepth;
      if (!showTail && !showGem) continue;

      const chip = this.chips[used++];
      const lane = this.notes[i].string;
      const x = l.lanes[lane];
      const fade = s === MISSED ? MISSED_ALPHA : 1;

      chip.tail.visible = showTail;
      if (showTail) {
        // A trilha é inclinada na tela: a cauda vai da base ao topo seguindo a linha da corda
        const bx = projectX(l, x, tailFrom);
        const by = projectY(l, tailFrom);
        const dx = projectX(l, x, endDepth) - bx;
        const dy = projectY(l, endDepth) - by;
        chip.tail.position.set(bx, by);
        chip.tail.rotation = Math.atan2(dx, -dy);
        chip.tail.scale.set(l.tailWidth * depthScale(l, (tailFrom + endDepth) / 2), Math.hypot(dx, dy));
        chip.tail.tint = this.palette.lanes[lane].main;
        chip.tail.alpha = TAIL_ALPHA * fade * entryAlpha(l, Math.min(d, l.enterDepth));
      }

      chip.gem.visible = showGem;
      chip.letter.visible = showGem && s !== MISSED;
      chip.mark.visible = showGem && s === MISSED;
      if (showGem) {
        const scale = depthScale(l, d);
        const px = projectX(l, x, d);
        const py = projectY(l, d);
        const alpha = fade * entryAlpha(l, d);
        chip.gem.texture = this.gemTextures[lane];
        chip.gem.position.set(px, py);
        chip.gem.scale.set((l.note.width * scale) / GEM_W);
        chip.gem.alpha = alpha;
        chip.letter.texture = this.noteLetterTextures[lane];
        chip.letter.position.set(px, py);
        chip.letter.scale.set((l.note.height * scale * LETTER_ON_NOTE) / LETTER_PX);
        chip.letter.alpha = alpha;
        chip.mark.position.set(px, py);
        chip.mark.scale.set(chip.letter.scale.x);
        chip.mark.alpha = entryAlpha(l, d);
      }

      const name = showGem && this.look.noteNames ? this.nameTextures.get(noteLabel(this.notes[i].midi)) : undefined;
      chip.name.visible = name !== undefined;
      if (name) {
        const scale = depthScale(l, d);
        chip.name.texture = name;
        chip.name.position.set(projectX(l, x, d), projectY(l, d) - (l.note.height * scale) / 2);
        chip.name.scale.set((l.note.height * scale * NAME_ON_NOTE) / NAME_PX);
        chip.name.alpha = fade * entryAlpha(l, d);
      }
    }
    for (let i = used; i < this.usedChips; i++) {
      const chip = this.chips[i];
      chip.tail.visible = chip.gem.visible = chip.letter.visible = chip.mark.visible = chip.name.visible = false;
    }
    this.usedChips = used;

    for (let i = 0; i < 4; i++) {
      const age = now - this.laneHitAt[i];
      const fillAlpha = feedbackAlpha(age);
      this.fills[i].visible = fillAlpha > 0;
      this.fills[i].alpha = fillAlpha;
      const ring = glowRing(age, this.reducedMotion);
      this.glows[i].visible = ring.alpha > 0;
      this.glows[i].alpha = ring.alpha;
      this.glows[i].scale.set(this.ringScale[0] * 1.3 * ring.scale, this.ringScale[1] * 1.3 * ring.scale);
    }

    const errAlpha = errorAlpha(now - this.errorAt);
    const showError = errAlpha > 0;
    const target = this.errorTarget;
    const played = this.errorPlayed;
    for (let i = 0; i < 4; i++) this.rings[i].visible = !(showError && i === target);
    this.aimRing.visible = this.youRing.visible = this.aimTag.visible = this.youTag.visible = showError;
    if (showError) {
      this.aimRing.texture = this.aimRingTextures[target];
      this.aimTag.texture = this.aimTagTextures[target];
      this.aimRing.x = this.rings[target].x;
      this.youRing.x = this.rings[played].x;
      // Na mesma corda (dedo errado), ALVO e VOCÊ lado a lado embaixo dela
      const gap = this.aimTag.height * 0.25;
      const aimShift = target === played ? this.aimTag.width / 2 + gap : 0;
      const youShift = target === played ? this.youTag.width / 2 + gap : 0;
      this.aimTag.position.set(this.rings[target].x - aimShift, this.tagY);
      this.youTag.position.set(this.rings[played].x + youShift, this.tagY);
      this.aimRing.alpha = this.youRing.alpha = this.aimTag.alpha = this.youTag.alpha = errAlpha;
    }

    const shown = this.called.current(now);
    if (shown && shown.serial !== this.calledSerial) {
      this.calledSerial = shown.serial;
      this.calledJudgment = shown.item.judgment;
      this.feedbackLabel.texture = this.labelTextures.get(shown.item.judgment) ?? Texture.EMPTY;
      this.feedbackDetail.text = shown.item.detail;
      this.feedbackDetail.style.fill = shown.item.fill;
    }
    const age = shown ? now - shown.at : Infinity;
    const alpha = feedbackAlpha(age);
    this.feedbackLabel.visible = this.feedbackDetail.visible = alpha > 0;
    if (alpha > 0) {
      this.feedbackLabel.alpha = this.feedbackDetail.alpha = alpha;
      this.feedbackLabel.scale.set(this.feedbackBase * feedbackScale(age, this.reducedMotion));
    }
  }

  /** Notas com a cabeça visível agora; para testes. */
  visibleNotes(): number {
    return this.chips.filter((c) => c.gem.visible).length;
  }

  /** Posição, tamanho e transparência das notas e caudas visíveis, em texto; para testes. */
  visibleChips(): string[] {
    const view = (s: Sprite) => (s.visible ? `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.scale.x.toFixed(4)},${s.scale.y.toFixed(4)},${s.alpha.toFixed(3)}` : '-');
    return this.chips.slice(0, this.usedChips).map((c) => `${view(c.gem)} ${view(c.tail)}`);
  }

  /** Quanto as notas visíveis estão apagadas (1 = acesas); para testes. */
  visibleNoteAlphas(): number[] {
    return this.chips.filter((c) => c.gem.visible).map((c) => c.gem.alpha);
  }

  feedbackVisible(): boolean {
    return this.feedbackLabel.visible;
  }

  /** Julgamento no rótulo central agora (null se escondido); para testes. */
  feedbackShown(): Judgment | null {
    return this.feedbackLabel.visible ? this.calledJudgment : null;
  }

  /** Nomes de nota visíveis agora; para testes. */
  visibleNames(): number {
    return this.chips.filter((c) => c.name.visible).length;
  }

  /** Texturas que esta cena assou; destruídas junto com ela. */
  bakedTextures(): Texture[] {
    return [
      ...this.gemTextures,
      ...this.noteLetterTextures,
      ...this.stringLetterTextures,
      ...this.ringTextures,
      ...this.fillTextures,
      ...this.glowTextures,
      ...this.labelTextures.values(),
      this.missMarkTexture,
      ...this.aimRingTextures,
      this.youRingTexture,
      ...this.aimTagTextures,
      this.youTagTexture,
      ...this.nameTextures.values(),
    ];
  }

  /** ALVO e VOCÊ agora: a corda de cada um, ou null se escondidos; e quantas notas visíveis levam ×. Para testes. */
  errorView(): { aim: number | null; you: number | null; crossed: number } {
    const shown = this.aimTag.visible;
    return {
      aim: shown ? this.errorTarget : null,
      you: shown ? this.errorPlayed : null,
      crossed: this.chips.filter((c) => c.mark.visible).length,
    };
  }

  override destroy(): void {
    const baked = this.bakedTextures();
    super.destroy({ children: true });
    for (const t of baked) t.destroy(true);
  }

  private bake(target: Container): Texture {
    const texture = this.baker.generateTexture({ target, resolution: this.baker.resolution, antialias: true });
    target.destroy();
    return texture;
  }

  private bakeText(text: string, size: number, fill: number, fontFamily: string): Texture {
    return this.bake(new Text({ text, style: { fill, fontFamily, fontWeight: '800', fontSize: size } }));
  }

  /**
   * Nota do design: barra arredondada com contorno de tinta e um risco de brilho. No 8-Bits, canto reto; no Neon, halo
   * por fora (a textura cresce em volta, a nota continua do mesmo tamanho porque a escala usa GEM_W); no modo
   * daltônico, o padrão da corda por dentro.
   */
  private bakeGem(fill: number, shine: number, pattern: StringPattern): Texture {
    const stroke = 5;
    const look = this.look;
    const r = corner(look, GEM_H * 0.43);
    const g = new Graphics();
    for (const { spread, alpha } of glowLayers(look)) {
      const grow = GEM_H * spread;
      g.roundRect(-grow, -grow, GEM_W + 2 * grow, GEM_H + 2 * grow, corner(look, r + grow)).fill({ color: fill, alpha });
    }
    g.roundRect(stroke / 2, stroke / 2, GEM_W - stroke, GEM_H - stroke, r).fill(fill);
    if (look.patterns) drawPattern(g, pattern, stroke, stroke, GEM_W - 2 * stroke, GEM_H - 2 * stroke, shine);
    g.roundRect(stroke / 2, stroke / 2, GEM_W - stroke, GEM_H - stroke, r).stroke({ color: this.palette.hitLine, width: stroke });
    g.roundRect(GEM_W * 0.1, GEM_H * 0.2, GEM_W * 0.18, GEM_H * 0.15, corner(look, GEM_H * 0.08)).fill({ color: shine, alpha: 0.7 });
    return this.bake(g);
  }

  /** O alvo tracejado da corda certa na nota errada; no 8-Bits, quadrado como os alvos dele. */
  private bakeDashedRing(color: number): Texture {
    const width = (RING_R * 0.04) / 0.28;
    const r = RING_R - width / 2;
    const g = new Graphics();
    if (this.look.square) {
      // Três traços por lado, em volta do quadrado
      const side = 2 * r;
      const dash = side / 5;
      const corners: [number, number, number, number][] = [
        [-1, -1, 1, 0],
        [1, -1, 0, 1],
        [1, 1, -1, 0],
        [-1, 1, 0, -1],
      ];
      for (const [sx, sy, dx, dy] of corners) {
        for (let k = 0; k < 3; k++) {
          const x = RING_R + sx * r + dx * k * 2 * dash;
          const y = RING_R + sy * r + dy * k * 2 * dash;
          g.moveTo(x, y).lineTo(x + dx * dash, y + dy * dash);
        }
      }
    } else {
      const step = (Math.PI * 2) / DASHES;
      for (let k = 0; k < DASHES; k++) {
        const from = k * step;
        g.moveTo(RING_R + r * Math.cos(from), RING_R + r * Math.sin(from)).arc(RING_R, RING_R, r, from, from + step * 0.55);
      }
    }
    g.stroke({ color, width });
    // Mantém a textura do tamanho do anel inteiro, como as outras
    g.rect(0, 0, RING_R * 2, RING_R * 2).fill({ color, alpha: 0 });
    return this.bake(g);
  }

  private bakeCircle(fill: number, stroke?: number, alpha = 1): Texture {
    const width = (RING_R * 0.04) / 0.28;
    const r = stroke === undefined ? RING_R : RING_R - width / 2;
    // No 8-Bits o alvo também é quadrado, do tamanho da nota que cai nele
    const g = this.look.square ? new Graphics().rect(RING_R - r, RING_R - r, 2 * r, 2 * r) : new Graphics().circle(RING_R, RING_R, r);
    g.fill({ color: fill, alpha });
    if (stroke !== undefined) g.stroke({ color: stroke, width });
    return this.bake(g);
  }
}
