import { ENTER_EFFECT_DEFAULTS, EXIT_EFFECT_DEFAULTS, selectEnterEffect, selectExitEffect } from '../core/effects';
import { MINI_PREVIEW_HEIGHT, MINI_PREVIEW_WIDTH, createMiniPreviewScene, listedEnterEffects, miniPreviewTimes } from '../core/preview';
import { EXIT_EFFECT_IDS } from '../core/scene';
import type { EnterEffectId, ExitEffectId, Scene } from '../core/scene';
import type { Field, FieldContext } from './controls';
import { h, setPressed } from './dom';
import { effectKey, t } from './i18n';
import { LazyRenderer, MiniAnimator, drawMini, miniModel } from './mini';
import type { FontFamilyFn, MiniTarget } from './mini';

/** FX-03 / FX-04 effect card grid with mini previews. */

export interface EffectCardServices {
  readonly fontFamily: FontFamilyFn;
  readonly animator: MiniAnimator;
  readonly lazy: LazyRenderer;
  /** Called after a card was chosen (restart the preview). */
  readonly onChosen: () => void;
  /** Ask the font loader for what a mini scene needs; resolves when loaded. */
  readonly ensureFonts: (scene: Scene) => Promise<unknown>;
}

interface Card {
  readonly id: EnterEffectId | ExitEffectId;
  readonly button: HTMLButtonElement;
  readonly target: MiniTarget;
  scene: Scene | null;
  key: string;
}

function miniKey(scene: Scene, phase: 'enter' | 'exit'): string {
  const font = scene.text.mainFont;
  const direction = phase === 'enter' ? scene.motion.enter.direction : scene.motion.exit.direction;
  return `${scene.text.main.slice(0, 24)}|${font.family}|${font.weight}|${font.italic}|${direction}`;
}

export function effectCards(ctx: FieldContext, phase: 'enter' | 'exit', services: EffectCardServices, testId: string): Field & { redraw(): void } {
  const grid = h('div', { class: 'fx-grid', attrs: { role: 'group', 'data-testid': testId } });
  const cards = new Map<string, Card>();
  const times = new WeakMap<Scene, { still: number; period: number }>();
  let listKey = '';
  let lastScene: Scene | null = null;

  const timesFor = (scene: Scene) => {
    let value = times.get(scene);
    if (!value) {
      const model = miniModel(scene, services.fontFamily);
      const { still, loopPeriod } = miniPreviewTimes(model.timeline, phase);
      value = { still, period: loopPeriod };
      times.set(scene, value);
    }
    return value;
  };

  const build = (ids: readonly (EnterEffectId | ExitEffectId)[]) => {
    for (const card of cards.values()) services.lazy.forget(card.target.canvas);
    cards.clear();
    grid.replaceChildren();
    for (const id of ids) {
      const defaults = phase === 'enter' ? ENTER_EFFECT_DEFAULTS[id as EnterEffectId] : EXIT_EFFECT_DEFAULTS[id as ExitEffectId];
      const canvas = h('canvas', { class: 'fx-canvas', attrs: { width: MINI_PREVIEW_WIDTH, height: MINI_PREVIEW_HEIGHT, 'aria-hidden': 'true' } });
      const name = h('span', { class: 'fx-name', text: t(effectKey(id)) });
      const badge = h('span', { class: `badge${defaults.unit === 'block' ? ' block' : ''}`, text: t(defaults.unit === 'block' ? 'badge.block' : 'badge.perChar') });
      const button = h('button', { class: 'fx-card', attrs: { type: 'button', 'data-effect': id, 'aria-pressed': 'false' } }, [canvas, h('span', { class: 'fx-meta' }, [name, badge])]);
      const card: Card = {
        id,
        button,
        scene: null,
        key: '',
        target: { canvas, scene: () => card.scene, times: timesFor },
      };
      button.addEventListener('click', () => {
        const scene = ctx.scene();
        const next = phase === 'enter' ? selectEnterEffect(scene, id as EnterEffectId) : selectExitEffect(scene, id as ExitEffectId);
        ctx.update(next, { restart: true });
        services.onChosen();
      });
      const play = () => services.animator.play(card.target);
      const stop = () => services.animator.stop(card.target);
      button.addEventListener('pointerenter', play);
      button.addEventListener('pointerleave', stop);
      button.addEventListener('focus', play);
      button.addEventListener('blur', stop);
      cards.set(id, card);
      grid.append(button);
    }
  };

  const refreshCard = (card: Card, scene: Scene, force: boolean) => {
    const key = miniKey(scene, phase);
    if (!force && key === card.key && card.scene) return;
    card.key = key;
    card.scene = phase === 'enter'
      ? createMiniPreviewScene(scene, 'enter', card.id as EnterEffectId)
      : createMiniPreviewScene(scene, 'exit', card.id as ExitEffectId);
    const miniScene = card.scene;
    services.lazy.request(card.target.canvas, () => {
      if (card.scene !== miniScene) return;
      void services.ensureFonts(miniScene).then(() => {
        if (card.scene === miniScene && !services.animator.isPlaying(card.target)) drawMini(card.target, 'still', services.fontFamily);
      });
      if (!services.animator.isPlaying(card.target)) drawMini(card.target, 'still', services.fontFamily);
    });
  };

  const sync = (scene: Scene, force = false) => {
    lastScene = scene;
    const ids = phase === 'enter' ? listedEnterEffects(scene.mode) : [...EXIT_EFFECT_IDS];
    const key = ids.join(',');
    if (key !== listKey) {
      build(ids);
      listKey = key;
    }
    const selected = phase === 'enter' ? scene.motion.enter.id : scene.motion.exit.id;
    for (const card of cards.values()) {
      setPressed(card.button, card.id === selected);
      refreshCard(card, scene, force);
    }
  };

  return {
    el: grid,
    sync: (scene) => sync(scene),
    redraw() {
      if (lastScene) sync(lastScene, true);
    },
  };
}
