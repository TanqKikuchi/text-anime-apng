import { createSceneModel } from '../core/frame';
import type { SceneModel } from '../core/frame';
import type { Scene } from '../core/scene';
import { CanvasTextMeasurer, renderFrame } from '../render';

/** Shared helpers for small live previews (template cards, effect cards). Only one plays at a time. */

export type FontFamilyFn = (family: string) => string;

export interface MiniTarget {
  readonly canvas: HTMLCanvasElement;
  scene(): Scene | null;
  /** Still time and hover loop period for the current scene. */
  times(scene: Scene): { still: number; period: number };
}

let scratch: { family: FontFamilyFn; measurer: CanvasTextMeasurer } | null = null;
let modelGeneration = 0;
const models = new WeakMap<Scene, { generation: number; model: SceneModel }>();

/** Call after fonts load so cached mini models are rebuilt with the new metrics. */
export function invalidateMiniModels(): void {
  modelGeneration += 1;
  scratch = null;
}

export function drawMini(target: MiniTarget, time: number | 'still', fontFamily: FontFamilyFn): void {
  const scene = target.scene();
  const context = target.canvas.getContext('2d');
  if (!scene || !context) return;
  const k = target.canvas.width / scene.canvas.width;
  context.setTransform(k, 0, 0, k, 0, 0);
  const t = time === 'still' ? target.times(scene).still : time;
  renderFrame(scene, t, context, { fontFamily });
}

/**
 * Model of a mini scene (for its timeline). Uses its own scratch measurer and cache so it does not
 * fight with the renderer's per-context model cache.
 */
export function miniModel(scene: Scene, fontFamily: FontFamilyFn): SceneModel {
  const cached = models.get(scene);
  if (cached && cached.generation === modelGeneration) return cached.model;
  if (!scratch || scratch.family !== fontFamily) {
    const context = document.createElement('canvas').getContext('2d')!;
    scratch = { family: fontFamily, measurer: new CanvasTextMeasurer(context, fontFamily) };
  }
  const model = createSceneModel(scene, scratch.measurer);
  models.set(scene, { generation: modelGeneration, model });
  return model;
}

export class MiniAnimator {
  private active: MiniTarget | null = null;
  private frame = 0;
  private start = 0;

  constructor(private readonly fontFamily: FontFamilyFn) {}

  play(target: MiniTarget): void {
    if (this.active === target) return;
    this.stop();
    this.active = target;
    this.start = performance.now();
    const tick = (now: number) => {
      if (this.active !== target) return;
      const scene = target.scene();
      if (scene) {
        const { period } = target.times(scene);
        const t = ((now - this.start) / 1000) % Math.max(0.1, period);
        drawMini(target, t, this.fontFamily);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(target?: MiniTarget): void {
    if (target && this.active !== target) return;
    const previous = this.active;
    this.active = null;
    cancelAnimationFrame(this.frame);
    if (previous) drawMini(previous, 'still', this.fontFamily);
  }

  isPlaying(target: MiniTarget): boolean {
    return this.active === target;
  }
}

/** Lazily runs `render` when the element first becomes visible (and again on demand while visible). */
export class LazyRenderer {
  private readonly visible = new Set<Element>();
  private readonly pending = new Map<Element, () => void>();
  private readonly observer: IntersectionObserver | null;

  constructor() {
    this.observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.visible.add(entry.target);
            const job = this.pending.get(entry.target);
            if (job) {
              this.pending.delete(entry.target);
              job();
            }
          } else {
            this.visible.delete(entry.target);
          }
        }
      }, { rootMargin: '120px' });
  }

  /** Schedules a render; runs now if visible, otherwise when the element scrolls into view. */
  request(el: Element, render: () => void): void {
    if (!this.observer) {
      render();
      return;
    }
    this.observer.observe(el);
    if (this.visible.has(el)) render();
    else this.pending.set(el, render);
  }

  forget(el: Element): void {
    this.observer?.unobserve(el);
    this.visible.delete(el);
    this.pending.delete(el);
  }
}
