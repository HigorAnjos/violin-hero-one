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
import { trackPalette, type TrackPalette } from './palette';
import { feedbackLabel, feedbackAlpha, feedbackScale, glowRing, judgmentDetail, JUDGMENTS } from './present';

export type JudgmentEvent = Extract<EngineEvent, { type: 'judgment' }>;

export type TextureBaker = Pick<Renderer, 'generateTexture' | 'resolution'>;

export interface SceneOptions {
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
// A textura do texto inclui a entrelinha: a letra visível fica com ~75% da altura da nota
const LETTER_ON_NOTE = 1.15;

const HIT = 1;
const MISSED = 2;
const MISSED_ALPHA = 0.35;
const TAIL_ALPHA = 0.5;

interface Chip {
  tail: Sprite;
  gem: Sprite;
  letter: Sprite;
}

/**
 * A pista: plano em perspectiva, quatro trilhas G D A E, notas que descem no relógio do
 * AudioContext e o feedback do julgamento. Nada é alocado em update(); o tema é fixo na vida da
 * cena (trocar de tema = destruir e criar outra).
 */
export class TrackScene extends Container {
  private readonly palette: TrackPalette;
  private readonly reducedMotion: boolean;
  private notes: readonly EngineNote[] = [];
  private times = new Float64Array(0);
  private tails = new Float64Array(0);
  private state = new Uint8Array(0);
  private lookBack = MISS_TAIL_SECONDS;

  private readonly bg = new Graphics();
  private readonly tailLayer = new Container();
  private readonly gemLayer = new Container();
  private readonly letterLayer = new Container();
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

  private readonly lead: number;
  private l: TrackLayout;
  private readonly laneHitAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  private ringScale = [1, 1];
  private feedbackAt = -Infinity;
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
    this.reducedMotion = options.reducedMotion;
    this.lead = options.leadSeconds ?? LEAD_SECONDS;
    this.l = trackLayout(1, 1, this.lead);

    const p = this.palette;
    const display = theme.fonts.display;
    this.gemTextures = p.lanes.map((lane) => this.bakeGem(lane.main, lane.onNote));
    this.noteLetterTextures = p.lanes.map((lane) => this.bakeText(lane.letter, LETTER_PX, lane.onNote, display));
    this.stringLetterTextures = p.lanes.map((lane) => this.bakeText(lane.letter, LETTER_PX, lane.main, display));
    this.ringTextures = p.lanes.map((lane) => this.bakeCircle(p.target, lane.main));
    this.fillTextures = p.lanes.map((lane) => this.bakeCircle(lane.main));
    this.glowTextures = p.lanes.map((lane) => this.bakeCircle(lane.glow.color, undefined, lane.glow.alpha));
    this.labelTextures = new Map(JUDGMENTS.map((j) => [j, this.bakeText(feedbackLabel(j), LABEL_PX, p.judgments[j], display)]));

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

    this.setNotes(options.notes);

    this.feedbackLabel.anchor.set(0.5, 1);
    this.feedbackLabel.visible = false;
    this.feedbackDetail = new Text({ text: '', style: { fill: p.muted, fontFamily: theme.fonts.ui, fontWeight: '800' } });
    this.feedbackDetail.anchor.set(0.5, 0);
    this.feedbackDetail.visible = false;
    this.fpsText = new Text({ text: '', style: { fill: p.muted, fontFamily: theme.fonts.ui, fontWeight: '700', fontSize: 12 } });
    this.fpsText.position.set(8, 8);
    this.fpsText.visible = false;

    for (const layer of [this.tailLayer, this.gemLayer, this.letterLayer]) layer.eventMode = 'none';
    this.eventMode = 'none';
    this.addChild(this.bg, targets, this.tailLayer, this.gemLayer, this.letterLayer, this.feedbackLabel, this.feedbackDetail, this.fpsText);
  }

  layout(width: number, height: number): void {
    const l = (this.l = trackLayout(width, height, this.lead));
    const p = this.palette;
    const far = l.farDepth * 1.02;
    const half = l.planeWidth / 2;
    const corner = (x: number, d: number) => [projectX(l, x, d), projectY(l, d)];
    const line = (x: number, color: number, width: number, alpha = 1) =>
      this.bg
        .moveTo(projectX(l, x, 0), projectY(l, 0))
        .lineTo(projectX(l, x, far), projectY(l, far))
        .stroke({ color, width, alpha });

    this.bg.clear();
    this.bg.poly([...corner(-half, 0), ...corner(half, 0), ...corner(half, far), ...corner(-half, far)]).fill(p.track);
    for (let k = 1; k < 4; k++) line(-half + k * l.laneWidth, p.trackLine, 2);
    l.lanes.forEach((x, i) => line(x, p.lanes[i].main, Math.max(2, l.laneWidth * 0.024), 0.3));
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
      tail.anchor.set(0.5, 1);
      gem.anchor.set(0.5);
      letter.anchor.set(0.5);
      tail.visible = gem.visible = letter.visible = false;
      this.tailLayer.addChild(tail);
      this.gemLayer.addChild(gem);
      this.letterLayer.addChild(letter);
      this.chips.push({ tail, gem, letter });
    }
  }

  /** Registra o julgamento do motor; `at` é a hora do relógio em que o feedback começa. */
  judge(event: JudgmentEvent, at: number = this.lastNow): void {
    const note = this.notes[event.index];
    if (!note) return;
    const miss = event.judgment === 'miss';
    this.state[event.index] = miss ? MISSED : HIT;
    if (!miss) this.laneHitAt[note.string] = at;
    this.feedbackAt = at;
    this.feedbackLabel.texture = this.labelTextures.get(event.judgment) ?? Texture.EMPTY;
    this.feedbackDetail.text = judgmentDetail(event);
    this.feedbackDetail.style.fill = event.issue ? this.palette.judgments[event.judgment] : this.palette.muted;
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

      chip.gem.visible = chip.letter.visible = showGem;
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
      }
    }
    for (let i = used; i < this.usedChips; i++) {
      const chip = this.chips[i];
      chip.tail.visible = chip.gem.visible = chip.letter.visible = false;
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

    const age = now - this.feedbackAt;
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

  /** Quanto as notas visíveis estão apagadas (1 = acesas); para testes. */
  visibleNoteAlphas(): number[] {
    return this.chips.filter((c) => c.gem.visible).map((c) => c.gem.alpha);
  }

  feedbackVisible(): boolean {
    return this.feedbackLabel.visible;
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
    ];
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

  /** Nota do design: barra arredondada com contorno de tinta e um risco de brilho. */
  private bakeGem(fill: number, shine: number): Texture {
    const stroke = 5;
    const r = GEM_H * 0.43;
    return this.bake(
      new Graphics()
        .roundRect(stroke / 2, stroke / 2, GEM_W - stroke, GEM_H - stroke, r)
        .fill(fill)
        .stroke({ color: this.palette.hitLine, width: stroke })
        .roundRect(GEM_W * 0.1, GEM_H * 0.2, GEM_W * 0.18, GEM_H * 0.15, GEM_H * 0.08)
        .fill({ color: shine, alpha: 0.7 }),
    );
  }

  private bakeCircle(fill: number, stroke?: number, alpha = 1): Texture {
    const width = (RING_R * 0.04) / 0.28;
    const g = new Graphics().circle(RING_R, RING_R, stroke === undefined ? RING_R : RING_R - width / 2).fill({ color: fill, alpha });
    if (stroke !== undefined) g.stroke({ color: stroke, width });
    return this.bake(g);
  }
}
