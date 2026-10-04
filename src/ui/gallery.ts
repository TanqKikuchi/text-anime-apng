import { createDefaultScene } from '../core/scene';
import type { Scene, SceneMode } from '../core/scene';
import { applyTemplate, listCategories, listSystems, listTemplates, templateName } from '../templates';
import type { RollSystem, TemplateCategory, TemplateDef } from '../templates';
import { h, setPressed } from './dom';
import { categoryKey, getLanguage, systemKey, t } from './i18n';
import { LazyRenderer, MiniAnimator, drawMini, miniModel } from './mini';
import type { FontFamilyFn, MiniTarget } from './mini';

/** UI-04 template gallery: category tabs, system row, cards with live mini previews (TPL-01/04). */

export interface GalleryServices {
  readonly fontFamily: FontFamilyFn;
  readonly animator: MiniAnimator;
  readonly lazy: LazyRenderer;
  readonly ensureFonts: (scene: Scene) => Promise<unknown>;
  readonly onPick: (template: TemplateDef) => void;
  readonly onCategory: (category: TemplateCategory) => void;
  readonly onSystem: (system: RollSystem) => void;
  readonly onReset: () => void;
}

const THUMB_WIDTH = 256;
const THUMB_HEIGHT = 144;

export class Gallery {
  readonly el: HTMLElement;
  private readonly hint: HTMLParagraphElement;
  private readonly categoryRow: HTMLDivElement;
  private readonly systemRow: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly thumbs = new Map<string, Scene>();
  private readonly targets: MiniTarget[] = [];
  private readonly times = new WeakMap<Scene, { still: number; period: number }>();
  private key = '';
  private current: TemplateDef | null = null;
  private mode: SceneMode = 'message';

  constructor(private readonly services: GalleryServices) {
    const reset = h('button', { class: 'btn ghost small', attrs: { type: 'button', 'data-testid': 'reset-mode' }, text: t('template.reset') });
    reset.addEventListener('click', () => services.onReset());
    this.hint = h('p', { class: 'note' });
    this.categoryRow = h('div', { class: 'chips category-row', attrs: { role: 'group', 'aria-label': t('template.categories'), 'data-testid': 'categories' } });
    this.systemRow = h('div', { class: 'system-row', attrs: { 'data-testid': 'systems' } });
    this.grid = h('div', { class: 'tpl-grid', attrs: { role: 'group', 'aria-label': t('template.gallery'), 'data-testid': 'template-grid' } });
    this.el = h('section', { class: 'gallery card', attrs: { 'aria-labelledby': 'gallery-title' } }, [
      h('div', { class: 'gallery-head' }, [h('h2', { id: 'gallery-title', text: t('template.heading') }), reset]),
      this.hint,
      this.categoryRow,
      this.systemRow,
      this.grid,
    ]);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.reserveHeight()).observe(this.grid);
  }

  private thumbScene(template: TemplateDef): Scene {
    const lang = getLanguage();
    const key = `${template.id}|${lang}`;
    let scene = this.thumbs.get(key);
    if (!scene) {
      scene = applyTemplate(createDefaultScene(template.mode), template, { lang });
      this.thumbs.set(key, scene);
    }
    return scene;
  }

  private timesFor = (scene: Scene): { still: number; period: number } => {
    let value = this.times.get(scene);
    if (!value) {
      const timeline = miniModel(scene, this.services.fontFamily).timeline;
      value = { still: timeline.completedTime, period: timeline.duration + 0.25 };
      this.times.set(scene, value);
    }
    return value;
  };

  /** Re-renders thumbnails (after fonts loaded). */
  redraw(): void {
    for (const target of this.targets) {
      if (!this.services.animator.isPlaying(target)) drawMini(target, 'still', this.services.fontFamily);
    }
  }

  update(mode: SceneMode, template: TemplateDef): void {
    const category = mode === 'message' ? template.category : undefined;
    const system = category === 'roll' ? template.system : undefined;
    const key = `${mode}|${category ?? ''}|${system ?? ''}|${getLanguage()}`;
    this.current = template;
    this.mode = mode;
    if (key !== this.key) {
      const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.template;
      const focusedCategory = (document.activeElement as HTMLElement | null)?.dataset?.category;
      const focusedSystem = (document.activeElement as HTMLElement | null)?.dataset?.system;
      this.key = key;
      this.build(mode, category, system);
      const selector = focusedId ? `[data-template="${focusedId}"]` : focusedCategory ? `[data-category="${focusedCategory}"]` : focusedSystem ? `[data-system="${focusedSystem}"]` : null;
      if (selector) this.el.querySelector<HTMLElement>(selector)?.focus();
    }
    for (const button of this.grid.querySelectorAll<HTMLElement>('.tpl-card')) setPressed(button, button.dataset.template === template.id);
    for (const button of this.categoryRow.querySelectorAll<HTMLElement>('button')) setPressed(button, button.dataset.category === category);
    for (const button of this.systemRow.querySelectorAll<HTMLElement>('button')) setPressed(button, button.dataset.system === system);
  }

  private build(mode: SceneMode, category: TemplateCategory | undefined, system: RollSystem | undefined): void {
    this.services.animator.stop();
    for (const target of this.targets) this.services.lazy.forget(target.canvas);
    this.targets.length = 0;
    this.hint.textContent = t(mode === 'message' ? 'template.hint.message' : 'template.hint.other');
    const categories = listCategories(mode);
    this.categoryRow.hidden = categories.length === 0;
    this.categoryRow.replaceChildren(...categories.map((id) => {
      const button = h('button', { class: 'chip', attrs: { type: 'button', 'data-category': id }, text: t(categoryKey(id)) });
      button.addEventListener('click', () => this.services.onCategory(id));
      return button;
    }));
    const systems = category ? listSystems(category) : [];
    this.systemRow.hidden = systems.length === 0;
    this.systemRow.replaceChildren(
      h('span', { class: 'field-label', text: t('template.systemLabel') }),
      h('div', { class: 'chips' }, systems.map((id) => {
        const button = h('button', { class: 'chip', attrs: { type: 'button', 'data-system': id }, text: t(systemKey(id)) });
        button.addEventListener('click', () => this.services.onSystem(id));
        return button;
      })),
    );
    const templates = listTemplates(mode, { category, system });
    this.grid.replaceChildren(...templates.map((template) => this.card(template)));
    this.reserveHeight();
  }

  /** TPL-04: keep the grid height constant across categories (tallest category, ≥ 2 rows). */
  private reserveHeight(): void {
    if (this.mode !== 'message') {
      this.grid.style.minHeight = '';
      return;
    }
    const first = this.grid.firstElementChild as HTMLElement | null;
    if (!first) return;
    const columns = Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(' ').filter(Boolean).length);
    const largest = Math.max(...listCategories('message').map((category) => {
      const systems = listSystems(category);
      if (systems.length === 0) return listTemplates('message', { category }).length;
      return Math.max(...systems.map((system) => listTemplates('message', { category, system }).length));
    }));
    const rows = Math.max(2, Math.ceil(largest / columns));
    const gap = parseFloat(getComputedStyle(this.grid).rowGap || '0') || 0;
    this.grid.style.minHeight = `${rows * first.offsetHeight + (rows - 1) * gap}px`;
  }

  private card(template: TemplateDef): HTMLElement {
    const canvas = h('canvas', { class: 'tpl-canvas', attrs: { width: THUMB_WIDTH, height: THUMB_HEIGHT, 'aria-hidden': 'true' } });
    const name = templateName(template, getLanguage());
    const button = h('button', { class: 'tpl-card', attrs: { type: 'button', 'data-template': template.id, 'aria-pressed': 'false' } }, [h('span', { class: 'tpl-thumb' }, [canvas]), h('span', { class: 'tpl-name', text: name })]);
    const target: MiniTarget = { canvas, scene: () => this.thumbScene(template), times: this.timesFor };
    this.targets.push(target);
    button.addEventListener('click', () => this.services.onPick(template));
    const play = () => this.services.animator.play(target);
    const stop = () => this.services.animator.stop(target);
    button.addEventListener('pointerenter', play);
    button.addEventListener('pointerleave', stop);
    button.addEventListener('focus', play);
    button.addEventListener('blur', stop);
    this.services.lazy.request(canvas, () => {
      const scene = this.thumbScene(template);
      drawMini(target, 'still', this.services.fontFamily);
      void this.services.ensureFonts(scene).then(() => {
        if (!this.services.animator.isPlaying(target)) drawMini(target, 'still', this.services.fontFamily);
      });
    });
    return button;
  }

  get selected(): TemplateDef | null {
    return this.current;
  }
}
