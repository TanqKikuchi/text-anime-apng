import { ENTER_EFFECT_DEFAULTS, EXIT_EFFECT_DEFAULTS, GLITCH_EFFECTS } from '../core/effects';
import { EASING_IDS } from '../core/easing';
import type { EasingId } from '../core/easing';
import type { SceneModel } from '../core/frame';
import { CANVAS_PRESETS, HOLD_EFFECT_IDS, canvasSize, mergeScene } from '../core/scene';
import type {
  Anchor,
  BackgroundSettings,
  CanvasPreset,
  DecorationKind,
  Direction,
  HoldEffectId,
  Scene,
  StaggerOrder,
  SubEnterChoice,
  TrailerFlow,
} from '../core/scene';
import { GRADIENT_PRESETS, STYLE_PRESETS, applyGradientPreset, applyStylePreset } from '../templates';
import { at, choice, color, custom, group, note, section, select, slider, toggle } from './controls';
import type { Accessor, Choice, Field, FieldContext } from './controls';
import { h, setInputValue, setPressed } from './dom';
import { effectCards } from './effectCards';
import type { EffectCardServices } from './effectCards';
import { FONT_CATALOG } from './fonts/catalog';
import { fontPicker, fontUpload, weightChoices } from './fontPicker';
import type { FontPickerServices } from './fontPicker';
import {
  anchorKey,
  backgroundKey,
  canvasKey,
  decorationKey,
  directionKey,
  easingKey,
  effectKey,
  flowKey,
  fontCategoryKey,
  gradientPresetKey,
  orderKey,
  stylePresetKey,
  t,
  weightKey,
} from './i18n';
import type { MessageKey, WeightValue } from './i18n';
import type { SettingsGroup } from './state';

/** Field definitions of the five settings groups (UI-06〜UI-10). */

export interface SettingsServices {
  readonly ctx: FieldContext;
  readonly model: () => SceneModel;
  readonly fonts: FontPickerServices;
  readonly cards: Omit<EffectCardServices, 'onChosen'>;
  readonly toast: (kind: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  readonly restart: () => void;
  readonly onExitToggled: (scene: Scene) => void;
}

type Svc = SettingsServices & { readonly minis: { redraw(): void }[] };

export interface SettingsPanel {
  readonly el: HTMLElement;
  readonly groups: Readonly<Record<SettingsGroup, HTMLElement>>;
  sync(scene: Scene): void;
  redrawMinis(): void;
}

const isTrailer = (s: Scene) => s.mode === 'trailer';
const notTrailer = (s: Scene) => s.mode !== 'trailer';
const flow = (s: Scene) => s.motion.trailer.flow;
const isScroll = (s: Scene) => isTrailer(s) && flow(s) === 'scroll';
const isCenterFlow = (s: Scene) => isTrailer(s) && (flow(s) === 'center-characters' || flow(s) === 'expand');
const vertical = (s: Scene) => s.layout.writingMode === 'vertical';
const gradientFill = (s: Scene) => s.style.fill.kind === 'gradient';
const deco = (s: Scene) => s.style.decoration.kind;
const decoIn = (...kinds: DecorationKind[]) => (s: Scene) => kinds.includes(deco(s));

function weightLabel(weight: number): string {
  return [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(weight) ? t(weightKey(weight as WeightValue)) : String(weight);
}

const directionsOf = (phase: 'enter' | 'exit', s: Scene): readonly Direction[] => {
  const defaults = phase === 'enter' ? ENTER_EFFECT_DEFAULTS[s.motion.enter.id] : EXIT_EFFECT_DEFAULTS[s.motion.exit.id];
  return (defaults.directions ?? []) as readonly Direction[];
};

function colorAt(index: 0 | 1 | 2): Accessor<string> {
  return {
    get: (s) => s.style.fill.colors[index] ?? '',
    set: (s, value) => {
      const colors: [string, string, string] = [s.style.fill.colors[0], s.style.fill.colors[1], s.style.fill.colors[2] ?? ''];
      colors[index] = value;
      return mergeScene(s, { style: { fill: { colors } } });
    },
  };
}

function glitchAt(index: 0 | 1): Accessor<string> {
  return {
    get: (s) => s.style.glitchColors[index],
    set: (s, value) => {
      const colors: [string, string] = [s.style.glitchColors[0], s.style.glitchColors[1]];
      colors[index] = value;
      return mergeScene(s, { style: { glitchColors: colors } });
    },
  };
}

const ORDERS: readonly StaggerOrder[] = ['forward', 'reverse', 'center', 'edges', 'random'];
const orderChoices: readonly Choice<StaggerOrder>[] = ORDERS.map((value) => ({ value, label: orderKey(value) }));
const easingChoices: readonly Choice<EasingId>[] = EASING_IDS.map((value) => ({ value, label: easingKey(value) }));

function textGroup(svc: Svc): Field[] {
  const { ctx } = svc;
  const mainLabel = h('label', { class: 'field-label', attrs: { for: 'main-text' } });
  const main = h('textarea', { id: 'main-text', attrs: { rows: 2, 'data-testid': 'main-text', spellcheck: 'false' } });
  main.addEventListener('input', () => {
    const s = ctx.scene();
    ctx.update({ ...s, text: { ...s.text, main: main.value } }, { textEdit: true });
  });
  const subLabel = h('label', { class: 'field-label', attrs: { for: 'sub-text' }, text: t('field.sub') });
  const sub = h('input', { id: 'sub-text', attrs: { type: 'text', placeholder: t('field.subPlaceholder'), 'data-testid': 'sub-text', spellcheck: 'false' } });
  sub.addEventListener('input', () => {
    const s = ctx.scene();
    ctx.update({ ...s, text: { ...s.text, sub: sub.value } }, { textEdit: true });
  });
  return [
    custom(h('div', { class: 'field' }, [mainLabel, main]), (s) => {
      mainLabel.textContent = t(isTrailer(s) ? 'field.mainTrailer' : 'field.main');
      main.rows = isTrailer(s) ? 8 : 2;
      setInputValue(main, s.text.main);
    }),
    note({ text: () => t('note.trailerBody'), visible: isTrailer }),
    custom(h('div', { class: 'field' }, [subLabel, sub]), (s) => setInputValue(sub, s.text.sub), notTrailer),
    choice(ctx, {
      label: 'field.subPosition',
      value: at('text.subPosition'),
      visible: notTrailer,
      testId: 'sub-position',
      choices: [
        { value: 'before', label: (s) => t(vertical(s) ? 'opt.subPosition.beforeVertical' : 'opt.subPosition.before') },
        { value: 'after', label: (s) => t(vertical(s) ? 'opt.subPosition.afterVertical' : 'opt.subPosition.after') },
      ],
    }),
    choice(ctx, {
      label: 'field.writingMode',
      value: at('layout.writingMode'),
      testId: 'writing-mode',
      choices: [{ value: 'horizontal', label: 'opt.writing.horizontal' }, { value: 'vertical', label: 'opt.writing.vertical' }],
    }),
    choice(ctx, {
      label: 'field.alignment',
      value: at('layout.alignment'),
      testId: 'alignment',
      choices: [
        { value: 'start', label: (s) => t(vertical(s) ? 'opt.align.startVertical' : 'opt.align.start') },
        { value: 'center', label: 'opt.align.center' },
        { value: 'end', label: (s) => t(vertical(s) ? 'opt.align.endVertical' : 'opt.align.end') },
      ],
    }),
    slider(ctx, { label: 'field.maxChars', unit: 'unit.chars', min: 0, max: 60, step: 1, value: at('text.maxCharactersPerLine'), visible: isTrailer, testId: 'max-chars' }),
    toggle(ctx, { label: 'field.splitPages', value: at('text.splitPages'), visible: (s) => isTrailer(s) && !isScroll(s) }),
    toggle(ctx, { label: 'field.autoShrink', value: at('layout.autoShrink'), testId: 'auto-shrink' }),
    note({
      testId: 'shrink-note',
      text: () => {
        const layout = svc.model().layout;
        return layout.shrunk ? t('note.autoShrink', { from: Math.round(layout.baseSize), to: Math.round(layout.fontSize) }) : null;
      },
    }),
  ];
}

function subFontField(svc: Svc): Field {
  const { ctx } = svc;
  const select = h('select', { id: 'sub-font', attrs: { 'data-testid': 'sub-font' } });
  const build = () => {
    const same = h('option', { attrs: { value: '' }, text: t('opt.subFont.same') });
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const font of FONT_CATALOG) {
      let optgroup = groups.get(font.category);
      if (!optgroup) {
        optgroup = h('optgroup', { attrs: { label: t(fontCategoryKey(font.category)) } });
        groups.set(font.category, optgroup);
      }
      optgroup.append(h('option', { attrs: { value: font.family }, text: font.family }));
    }
    const mine = svc.fonts.store.list();
    const mineGroup = mine.length > 0 ? h('optgroup', { attrs: { label: t('fontCat.mine') } }, mine.map((font) => h('option', { attrs: { value: font.family }, text: font.name }))) : null;
    select.replaceChildren(same, ...(mineGroup ? [mineGroup] : []), ...groups.values());
  };
  build();
  svc.fonts.store.onChange(build);
  select.addEventListener('change', () => {
    const s = ctx.scene();
    const family = select.value;
    const inherit = family === '';
    const resolved = inherit ? s.text.mainFont.family : family;
    const weight = weightChoices(resolved, svc.fonts.weightsOf);
    let best = weight[0] ?? 400;
    for (const w of weight) if (Math.abs(w - s.text.subFont.weight) < Math.abs(best - s.text.subFont.weight)) best = w;
    ctx.update(mergeScene(s, { text: { subFontInherit: inherit, subFont: { family: resolved, weight: best } } }));
  });
  return custom(h('div', { class: 'field field-select' }, [h('label', { class: 'field-label', attrs: { for: 'sub-font' }, text: t('field.subFont') }), select]), (s) => {
    const value = s.text.subFontInherit ? '' : s.text.subFont.family;
    if (select.value !== value) select.value = value;
  }, notTrailer);
}

function fontGroup(svc: Svc): Field[] {
  const { ctx } = svc;
  const weightOptions = (family: (s: Scene) => string) => (s: Scene) => weightChoices(family(s), svc.fonts.weightsOf).map((w) => ({ value: w, label: () => weightLabel(w) }));
  const subFamily = (s: Scene) => (s.text.subFontInherit ? s.text.mainFont.family : s.text.subFont.family);
  return [
    fontPicker(ctx, svc.fonts),
    fontUpload(ctx, svc.fonts),
    select(ctx, { label: 'field.weight', value: at('text.mainFont.weight'), choices: weightOptions((s) => s.text.mainFont.family), parse: Number, testId: 'font-weight' }),
    toggle(ctx, { label: 'field.italic', value: at('text.mainFont.italic') }),
    color(ctx, { label: (s) => t(gradientFill(s) ? 'field.color1' : 'field.textColor'), value: colorAt(0), testId: 'text-color' }),
    color(ctx, { label: 'field.color2', value: colorAt(1), visible: gradientFill }),
    color(ctx, { label: 'field.color3', value: colorAt(2), visible: gradientFill, optional: true }),
    note({ text: () => t('note.decorationTab') }),
    slider(ctx, { label: 'field.fontSize', unit: 'unit.px', min: 12, max: 400, step: 1, value: at('text.mainFont.size'), testId: 'font-size' }),
    slider(ctx, { label: 'field.letterSpacing', unit: 'unit.percent', min: -0.2, max: 1.2, step: 0.01, percent: true, value: at('text.mainFont.letterSpacing') }),
    slider(ctx, { label: 'field.lineHeight', unit: 'unit.times', min: 0.9, max: 3.2, step: 0.05, value: at('text.lineHeight') }),
    section(ctx, {
      title: 'heading.subText',
      visible: notTrailer,
      fields: [
        subFontField(svc),
        select(ctx, { label: 'field.subWeight', value: at('text.subFont.weight'), choices: weightOptions(subFamily), parse: Number }),
        toggle(ctx, { label: 'field.subItalic', value: at('text.subFont.italic') }),
        toggle(ctx, { label: 'field.subColorEnabled', value: at('style.subColorEnabled') }),
        color(ctx, { label: 'field.subColor', value: at('style.subColor'), visible: (s) => s.style.subColorEnabled }),
        slider(ctx, { label: 'field.subScale', unit: 'unit.percent', min: 0.1, max: 0.9, step: 0.01, percent: true, value: at('text.subScale') }),
        slider(ctx, { label: 'field.subLetterSpacing', unit: 'unit.percent', min: -0.2, max: 1.5, step: 0.01, percent: true, value: at('text.subFont.letterSpacing') }),
        slider(ctx, { label: 'field.subGap', unit: 'unit.em', min: 0, max: 1.5, step: 0.01, value: at('text.subGap') }),
      ],
    }),
  ];
}

function effectControls(svc: Svc, phase: 'enter' | 'exit'): Field[] {
  const { ctx } = svc;
  const base = phase === 'enter' ? 'motion.enter' : 'motion.exit';
  const id = (s: Scene) => (phase === 'enter' ? s.motion.enter.id : s.motion.exit.id);
  const defaults = (s: Scene) => (phase === 'enter' ? ENTER_EFFECT_DEFAULTS[s.motion.enter.id] : EXIT_EFFECT_DEFAULTS[s.motion.exit.id]);
  const zero = phase === 'enter' ? 'FX-I15' : 'FX-O11';
  const charUnit = (s: Scene) => defaults(s).unit === 'character';
  const directionValue: Accessor<Direction> = {
    get: (s) => {
      const list = directionsOf(phase, s);
      const current = phase === 'enter' ? s.motion.enter.direction : s.motion.exit.direction;
      return list.includes(current) ? current : list[0] ?? current;
    },
    set: (s, value) => mergeScene(s, phase === 'enter' ? { motion: { enter: { direction: value } } } : { motion: { exit: { direction: value } } }),
  };
  const cards = effectCards(ctx, phase, { ...svc.cards, onChosen: svc.restart }, `${phase}-cards`);
  svc.minis.push(cards);
  return [
    cards,
    select(ctx, {
      label: 'field.direction',
      value: directionValue,
      choices: (s) => directionsOf(phase, s).map((value) => ({ value, label: directionKey(value) })),
      parse: (raw) => raw as Direction,
      visible: (s) => directionsOf(phase, s).length > 0,
      testId: `${phase}-direction`,
    }),
    slider(ctx, {
      label: 'field.duration', unit: 'unit.sec', min: 0.05, max: 4, step: 0.05, value: at(`${base}.duration`),
      visible: (s) => id(s) !== zero && (phase === 'exit' || notTrailer(s)), testId: `${phase}-duration`,
    }),
    slider(ctx, {
      label: 'field.stagger', unit: 'unit.sec', min: 0, max: 0.6, step: 0.01, value: at(`${base}.stagger`),
      visible: (s) => charUnit(s) && (phase === 'exit' || notTrailer(s)), testId: `${phase}-stagger`,
    }),
    select(ctx, {
      label: 'field.order', value: at(`${base}.order`), choices: orderChoices, parse: (raw) => raw as StaggerOrder,
      visible: (s) => charUnit(s) && (phase === 'exit' || notTrailer(s)),
    }),
    select(ctx, { label: 'field.easing', value: at(`${base}.easing`), choices: easingChoices, parse: (raw) => raw as EasingId, visible: (s) => id(s) !== zero, testId: `${phase}-easing` }),
    slider(ctx, { label: 'field.strength', unit: 'unit.times', min: 0.2, max: 2.5, step: 0.05, value: at(`${base}.strength`), visible: (s) => defaults(s).hasStrength }),
  ];
}

const FLOWS: readonly TrailerFlow[] = ['characters', 'center-characters', 'expand', 'lines', 'smooth-lines', 'simultaneous', 'scroll'];
const SUB_ENTERS: readonly SubEnterChoice[] = ['same', 'FX-I01', 'FX-I02', 'FX-I08', 'FX-I06', 'FX-I15', 'FX-I05'];

function motionGroup(svc: Svc): Field[] {
  const { ctx } = svc;
  const fl = (...flows: TrailerFlow[]) => (s: Scene) => flows.includes(flow(s));
  const exitAccessor: Accessor<boolean> = {
    get: (s) => s.motion.exitEnabled,
    set: (s, value) => {
      const next = mergeScene(s, { motion: { exitEnabled: value } });
      if (!value) svc.onExitToggled(next);
      return next;
    },
  };
  return [
    section(ctx, {
      title: 'heading.flow',
      visible: isTrailer,
      testId: 'flow-section',
      fields: [
        choice(ctx, {
          label: 'field.flow', style: 'chips', value: at('motion.trailer.flow'), testId: 'flow',
          choices: FLOWS.map((value) => ({ value, label: flowKey(value) })),
          onPick: (value) => ctx.update(mergeScene(ctx.scene(), { motion: { trailer: { flow: value } } }), { restart: true }),
        }),
        note({ text: (s) => (flow(s) === 'center-characters' ? t('note.flowCenter') : flow(s) === 'expand' ? t('note.flowExpand') : null) }),
        slider(ctx, { label: 'field.overlapHold', unit: 'unit.sec', min: 0, max: 3, step: 0.05, value: at('motion.trailer.overlapHold'), visible: fl('expand') }),
        slider(ctx, { label: 'field.expandDuration', unit: 'unit.sec', min: 0.1, max: 3, step: 0.05, value: at('motion.trailer.expandDuration'), visible: fl('expand') }),
        slider(ctx, { label: 'field.cps', unit: 'unit.cps', min: 2, max: 40, step: 1, value: at('motion.trailer.charactersPerSecond'), visible: fl('characters', 'center-characters') }),
        slider(ctx, { label: 'field.centerSize', unit: 'unit.percent', min: 0.15, max: 0.9, step: 0.01, percent: true, value: at('motion.trailer.centerSize'), visible: fl('center-characters') }),
        slider(ctx, { label: 'field.centerPause', unit: 'unit.sec', min: 0, max: 2, step: 0.05, value: at('motion.trailer.centerPause'), visible: fl('center-characters') }),
        slider(ctx, { label: 'field.impact', unit: 'unit.times', min: 0, max: 2, step: 0.05, value: at('motion.trailer.impact'), visible: fl('center-characters') }),
        slider(ctx, {
          label: 'field.characterDuration', unit: 'unit.sec', min: 0, max: 2, step: 0.05, value: at('motion.trailer.characterDuration'),
          visible: (s) => !isScroll(s) && !isCenterFlow(s) && s.motion.enter.id !== 'FX-I15',
        }),
        slider(ctx, { label: 'field.punctuationPause', unit: 'unit.sec', min: 0, max: 1.5, step: 0.05, value: at('motion.trailer.punctuationPause'), visible: fl('characters') }),
        slider(ctx, { label: 'field.linePause', unit: 'unit.sec', min: 0, max: 2, step: 0.05, value: at('motion.trailer.linePause'), visible: fl('characters') }),
        slider(ctx, { label: 'field.lineInterval', unit: 'unit.sec', min: 0.1, max: 4, step: 0.05, value: at('motion.trailer.lineInterval'), visible: fl('lines', 'smooth-lines') }),
        slider(ctx, { label: 'field.lineFlowDuration', unit: 'unit.sec', min: 0.2, max: 5, step: 0.05, value: at('motion.trailer.lineFlowDuration'), visible: fl('smooth-lines') }),
        slider(ctx, { label: 'field.scrollSpeed', unit: 'unit.pxPerSec', min: 10, max: 400, step: 5, value: at('motion.trailer.scrollSpeed'), visible: fl('scroll') }),
        toggle(ctx, { label: 'field.edgeFade', value: at('motion.trailer.edgeFade'), visible: fl('scroll') }),
        toggle(ctx, { label: 'field.cursor', value: at('motion.trailer.cursor'), visible: fl('characters') }),
        slider(ctx, { label: 'field.pageGap', unit: 'unit.sec', min: 0, max: 3, step: 0.05, value: at('motion.pageGap'), visible: (s) => !isScroll(s) && s.text.splitPages }),
      ],
    }),
    section(ctx, {
      title: (s) => t(isTrailer(s) ? 'heading.enterTrailer' : 'heading.enter'),
      visible: (s) => !isCenterFlow(s),
      testId: 'enter-section',
      fields: effectControls(svc, 'enter'),
    }),
    section(ctx, {
      title: (s) => t(isTrailer(s) && !isScroll(s) ? 'heading.holdPages' : 'heading.hold'),
      testId: 'hold-section',
      fields: [
        slider(ctx, { label: 'field.holdDuration', unit: 'unit.sec', min: 0, max: 10, step: 0.1, value: at('motion.holdDuration'), visible: (s) => !isScroll(s), testId: 'hold-duration' }),
        choice(ctx, {
          label: 'field.holdEffect', style: 'chips', value: at('motion.hold.id'), testId: 'hold-effect',
          choices: HOLD_EFFECT_IDS.map((value: HoldEffectId) => ({ value, label: effectKey(value) })),
        }),
        slider(ctx, { label: 'field.strength', unit: 'unit.times', min: 0.2, max: 3, step: 0.05, value: at('motion.hold.strength'), visible: (s) => s.motion.hold.id !== 'FX-H00' }),
        note({ text: (s) => (s.motion.hold.id !== 'FX-H00' ? t('note.holdSize') : null) }),
        note({ tone: 'warn', testId: 'glow-off-note', text: (s) => (s.motion.hold.id === 'FX-H05' && !s.style.glow.enabled ? t('note.glowOff') : null) }),
      ],
    }),
    section(ctx, {
      title: 'heading.exit',
      toggle: exitAccessor,
      toggleTestId: 'exit-switch-motion',
      visible: (s) => !isScroll(s),
      testId: 'exit-section',
      fields: effectControls(svc, 'exit'),
    }),
    section(ctx, {
      title: 'heading.timing',
      fields: [
        select(ctx, {
          label: 'field.subEnter', value: at('motion.subEnter'), parse: (raw) => raw as SubEnterChoice, visible: notTrailer,
          choices: SUB_ENTERS.map((value) => ({ value, label: value === 'same' ? 'opt.subEnter.same' : effectKey(value) })),
        }),
        slider(ctx, { label: 'field.subDelay', unit: 'unit.sec', min: -2, max: 2, step: 0.05, value: at('motion.subDelay'), visible: notTrailer }),
        slider(ctx, { label: 'field.preDelay', unit: 'unit.sec', min: 0, max: 3, step: 0.05, value: at('motion.preDelay') }),
        slider(ctx, { label: 'field.postDelay', unit: 'unit.sec', min: 0, max: 5, step: 0.05, value: at('motion.postDelay') }),
        note({
          testId: 'total-length',
          text: () => {
            const timeline = svc.model().timeline;
            const seconds = timeline.duration.toFixed(2);
            return timeline.pages.length > 1 ? t('note.totalLengthPages', { seconds, pages: timeline.pages.length }) : t('note.totalLength', { seconds });
          },
        }),
      ],
    }),
  ];
}

function stylePresets(svc: Svc): Field {
  const buttons = STYLE_PRESETS.map((preset) => {
    const button = h('button', { class: 'chip preset', attrs: { type: 'button', 'data-preset': preset.id }, text: t(stylePresetKey(preset.id)) });
    button.addEventListener('click', () => {
      svc.ctx.update(applyStylePreset(svc.ctx.scene(), preset));
      svc.toast('success', t('toast.presetApplied', { name: t(stylePresetKey(preset.id)) }));
    });
    return button;
  });
  const el = h('div', { class: 'field' }, [h('span', { class: 'field-label', text: t('field.stylePreset') }), h('div', { class: 'chips', attrs: { 'data-testid': 'style-presets' } }, buttons)]);
  return custom(el, () => {});
}

function gradientPresets(svc: Svc): Field {
  const buttons = GRADIENT_PRESETS.map((preset) => {
    const button = h('button', { class: 'swatch', attrs: { type: 'button', 'aria-label': t(gradientPresetKey(preset.id)), title: t(gradientPresetKey(preset.id)), 'data-gradient': preset.id } });
    button.style.background = `linear-gradient(180deg, ${preset.colors.join(', ')})`;
    button.addEventListener('click', () => svc.ctx.update(applyGradientPreset(svc.ctx.scene(), preset)));
    return button;
  });
  return custom(h('div', { class: 'field' }, [h('span', { class: 'field-label', text: t('field.gradientPreset') }), h('div', { class: 'swatches' }, buttons)]), (s) => {
    const current = s.style.fill.colors.join(',').toLowerCase();
    for (const [index, preset] of GRADIENT_PRESETS.entries()) setPressed(buttons[index]!, preset.colors.join(',').toLowerCase() === current);
  }, gradientFill);
}

function decorationGroup(svc: Svc): Field[] {
  const { ctx } = svc;
  return [
    stylePresets(svc),
    section(ctx, {
      title: 'field.fillKind',
      fields: [
        choice(ctx, { label: 'field.fillKind', value: at('style.fill.kind'), testId: 'fill-kind', choices: [{ value: 'solid', label: 'opt.fill.solid' }, { value: 'gradient', label: 'opt.fill.gradient' }] }),
        color(ctx, { label: (s) => t(gradientFill(s) ? 'field.color1' : 'field.color'), value: colorAt(0) }),
        color(ctx, { label: 'field.color2', value: colorAt(1), visible: gradientFill }),
        color(ctx, { label: 'field.color3', value: colorAt(2), visible: gradientFill, optional: true }),
        choice(ctx, {
          label: 'field.gradientDirection', value: at('style.fill.direction'), visible: gradientFill,
          choices: [
            { value: 'line-vertical', label: 'opt.gradient.line-vertical' },
            { value: 'block-horizontal', label: 'opt.gradient.block-horizontal' },
            { value: 'block-diagonal', label: 'opt.gradient.block-diagonal' },
          ],
        }),
        gradientPresets(svc),
        slider(ctx, { label: 'field.fillOpacity', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('style.fill.opacity'), testId: 'fill-opacity' }),
      ],
    }),
    section(ctx, {
      title: 'heading.innerStroke', toggle: at('style.innerStroke.enabled'), toggleTestId: 'inner-stroke-switch',
      fields: [
        color(ctx, { label: 'field.color', value: at('style.innerStroke.color') }),
        slider(ctx, { label: 'field.width', unit: 'unit.px', min: 0.5, max: 30, step: 0.5, value: at('style.innerStroke.width') }),
      ],
    }),
    section(ctx, {
      title: 'heading.outerStroke', toggle: at('style.outerStroke.enabled'),
      fields: [
        color(ctx, { label: 'field.color', value: at('style.outerStroke.color') }),
        slider(ctx, { label: 'field.width', unit: 'unit.px', min: 0.5, max: 40, step: 0.5, value: at('style.outerStroke.width') }),
      ],
    }),
    section(ctx, {
      title: 'heading.shadow', toggle: at('style.shadow.enabled'), toggleTestId: 'shadow-switch', testId: 'shadow-section',
      fields: [
        color(ctx, { label: 'field.color', value: at('style.shadow.color') }),
        slider(ctx, { label: 'field.shadowOpacity', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('style.shadow.opacity') }),
        slider(ctx, { label: 'field.blur', unit: 'unit.px', min: 0, max: 80, step: 1, value: at('style.shadow.blur'), testId: 'shadow-blur' }),
        slider(ctx, { label: 'field.offsetX', unit: 'unit.px', min: -60, max: 60, step: 1, value: at('style.shadow.offsetX') }),
        slider(ctx, { label: 'field.offsetY', unit: 'unit.px', min: -60, max: 60, step: 1, value: at('style.shadow.offsetY') }),
      ],
    }),
    section(ctx, {
      title: 'heading.glow', toggle: at('style.glow.enabled'), toggleTestId: 'glow-switch',
      fields: [
        color(ctx, { label: 'field.color', value: at('style.glow.color') }),
        slider(ctx, { label: 'field.spread', unit: 'unit.px', min: 2, max: 150, step: 1, value: at('style.glow.spread') }),
        slider(ctx, { label: 'field.glowStrength', unit: 'unit.times', min: 0.2, max: 3, step: 0.05, value: at('style.glow.strength') }),
      ],
    }),
    group([
      color(ctx, { label: () => `${t('field.glitchColors')} 1`, value: glitchAt(0), testId: 'glitch-color-1' }),
      color(ctx, { label: () => `${t('field.glitchColors')} 2`, value: glitchAt(1) }),
    ], (s) => GLITCH_EFFECTS.has(s.motion.enter.id) || GLITCH_EFFECTS.has(s.motion.exit.id) || GLITCH_EFFECTS.has(s.motion.hold.id)),
    toggle(ctx, { label: 'field.subColorEnabled', value: at('style.subColorEnabled'), visible: notTrailer }),
    color(ctx, { label: 'field.subColor', value: at('style.subColor'), visible: (s) => notTrailer(s) && s.style.subColorEnabled }),
    color(ctx, {
      label: 'field.cursorColor', value: at('style.cursorColor'), optional: true, note: 'note.cursorColorEmpty',
      addColor: '#FFFFFF', visible: (s) => isTrailer(s) && flow(s) === 'characters' && s.motion.trailer.cursor,
    }),
  ];
}

const DECORATIONS: readonly DecorationKind[] = ['none', 'band', 'hazard', 'box', 'title-frame', 'lines', 'underline', 'side-lines', 'accent-bar', 'corners'];
const BACKGROUNDS: readonly BackgroundSettings['kind'][] = ['none', 'solid', 'vignette', 'bottom-gradient', 'top-gradient'];
const PRESETS: readonly CanvasPreset[] = ['fhd', 'hd', 'light', 'banner', 'caption', 'square', 'portrait', 'custom'];
const ANCHORS: readonly Anchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

function canvasField(svc: Svc): Field {
  const { ctx } = svc;
  const presetSelect = h('select', { id: 'canvas-preset', attrs: { 'data-testid': 'canvas-preset' } }, PRESETS.map((p) => h('option', { attrs: { value: p }, text: t(canvasKey(p)) })));
  const width = h('input', { class: 'num', attrs: { type: 'number', min: 32, max: 3840, step: 1, 'aria-label': t('field.canvasWidth'), 'data-testid': 'canvas-width' } });
  const height = h('input', { class: 'num', attrs: { type: 'number', min: 32, max: 3840, step: 1, 'aria-label': t('field.canvasHeight'), 'data-testid': 'canvas-height' } });
  const custom2 = h('div', { class: 'row canvas-custom' }, [h('label', { text: t('field.canvasWidth') }), width, h('span', { text: '×' }), h('label', { text: t('field.canvasHeight') }), height]);
  presetSelect.addEventListener('change', () => {
    const s = ctx.scene();
    const preset = presetSelect.value as CanvasPreset;
    const size = canvasSize(preset, s.canvas.width, s.canvas.height);
    ctx.update(mergeScene(s, { canvas: { preset, ...size } }));
  });
  const commit = () => {
    const s = ctx.scene();
    const size = canvasSize('custom', Number(width.value), Number(height.value));
    ctx.update(mergeScene(s, { canvas: { preset: 'custom', ...size } }));
    width.value = String(size.width);
    height.value = String(size.height);
  };
  width.addEventListener('change', commit);
  height.addEventListener('change', commit);
  const el = h('div', { class: 'field' }, [h('label', { class: 'field-label', attrs: { for: 'canvas-preset' }, text: t('field.canvasPreset') }), presetSelect, custom2]);
  return custom(el, (s) => {
    presetSelect.value = s.canvas.preset in CANVAS_PRESETS || s.canvas.preset === 'custom' ? s.canvas.preset : 'custom';
    custom2.hidden = s.canvas.preset !== 'custom';
    setInputValue(width, String(s.canvas.width));
    setInputValue(height, String(s.canvas.height));
  });
}

function anchorField(svc: Svc): Field {
  const buttons = ANCHORS.map((anchor) => {
    const button = h('button', { class: 'anchor-btn', attrs: { type: 'button', 'aria-label': t(anchorKey(anchor)), title: t(anchorKey(anchor)), 'data-anchor': anchor } }, [h('span', { class: 'dot' })]);
    button.addEventListener('click', () => svc.ctx.update(mergeScene(svc.ctx.scene(), { layout: { anchor } })));
    return button;
  });
  const el = h('div', { class: 'field' }, [h('span', { class: 'field-label', text: t('field.anchor') }), h('div', { class: 'anchor-grid', attrs: { role: 'group', 'aria-label': t('field.anchor') } }, buttons)]);
  return custom(el, (s) => buttons.forEach((button, index) => setPressed(button, ANCHORS[index] === s.layout.anchor)));
}

function layoutGroup(svc: Svc): Field[] {
  const { ctx } = svc;
  const lineKinds: DecorationKind[] = ['box', 'title-frame', 'lines', 'underline', 'side-lines', 'accent-bar', 'corners'];
  const strokeKinds: DecorationKind[] = ['title-frame', 'lines', 'underline', 'side-lines', 'accent-bar', 'corners'];
  const notNone = (s: Scene) => deco(s) !== 'none';
  return [
    section(ctx, {
      title: 'heading.decoration',
      testId: 'decoration-section',
      fields: [
        choice(ctx, { label: 'field.decorationKind', style: 'chips', value: at('style.decoration.kind'), testId: 'decoration-kind', choices: DECORATIONS.map((value) => ({ value, label: decorationKey(value) })) }),
        color(ctx, { label: 'field.decoFill', value: at('style.decoration.fillColor'), visible: decoIn('band', 'box', 'title-frame') }),
        color(ctx, { label: 'field.decoLine', value: at('style.decoration.lineColor'), visible: decoIn(...lineKinds) }),
        color(ctx, { label: 'field.tapeColor', value: at('style.decoration.tapeColor'), visible: decoIn('hazard') }),
        color(ctx, { label: 'field.tapeStripe', value: at('style.decoration.tapeStripeColor'), visible: decoIn('hazard') }),
        slider(ctx, { label: 'field.decoFillOpacity', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('style.decoration.fillOpacity'), visible: decoIn('band', 'box', 'title-frame') }),
        slider(ctx, {
          label: (s) => t(decoIn('box', 'title-frame')(s) ? 'field.frameLineWidth' : 'field.lineWidth'),
          unit: 'unit.px', min: 0, max: 16, step: 0.5, value: at('style.decoration.lineWidth'), visible: decoIn(...lineKinds),
        }),
        toggle(ctx, {
          label: 'field.lineUsesTextStroke', value: at('style.decoration.lineUsesTextStroke'),
          visible: (s) => decoIn(...strokeKinds)(s) && (s.style.innerStroke.enabled || s.style.outerStroke.enabled),
        }),
        slider(ctx, { label: 'field.tapeWidth', unit: 'unit.px', min: 8, max: 120, step: 1, value: at('style.decoration.tapeWidth'), visible: decoIn('hazard') }),
        slider(ctx, { label: 'field.tapeSpeed', unit: 'unit.pxPerSec', min: 0, max: 400, step: 5, value: at('style.decoration.tapeSpeed'), visible: decoIn('hazard') }),
        slider(ctx, { label: 'field.tapeBlink', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('style.decoration.tapeBlink'), visible: decoIn('hazard') }),
        slider(ctx, { label: 'field.padding', unit: 'unit.em', min: 0, max: 2, step: 0.01, value: at('style.decoration.padding'), visible: notNone }),
        slider(ctx, { label: 'field.lineExtent', unit: 'unit.em', min: 0, max: 4, step: 0.05, value: at('style.decoration.lineExtent'), visible: decoIn('lines', 'underline', 'side-lines') }),
        slider(ctx, { label: 'field.frameExtent', unit: 'unit.em', min: 0, max: 12, step: 0.1, value: at('style.decoration.lineExtent'), visible: decoIn('title-frame') }),
        slider(ctx, { label: 'field.bandEdgeBlur', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('style.decoration.bandEdgeBlur'), visible: decoIn('band') }),
        slider(ctx, { label: 'field.bandEndFade', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('style.decoration.bandEndFade'), visible: decoIn('band') }),
        slider(ctx, { label: 'field.cornerRadius', unit: 'unit.em', min: 0, max: 1, step: 0.01, value: at('style.decoration.cornerRadius'), visible: decoIn('box') }),
        choice(ctx, {
          label: 'field.decoAnimation', value: at('style.decoration.animation'), visible: notNone,
          choices: [{ value: 'grow', label: 'opt.decoAnim.grow' }, { value: 'fade', label: 'opt.decoAnim.fade' }, { value: 'none', label: 'opt.decoAnim.none' }],
        }),
        slider(ctx, { label: 'field.decoDuration', unit: 'unit.sec', min: 0.1, max: 2.5, step: 0.05, value: at('style.decoration.duration'), visible: (s) => notNone(s) && s.style.decoration.animation !== 'none' }),
      ],
    }),
    section(ctx, {
      title: 'heading.background',
      fields: [
        choice(ctx, { label: 'field.bgKind', style: 'chips', value: at('background.kind'), testId: 'background-kind', choices: BACKGROUNDS.map((value) => ({ value, label: backgroundKey(value) })) }),
        color(ctx, { label: 'field.bgColor', value: at('background.color'), visible: (s) => s.background.kind !== 'none' }),
        slider(ctx, { label: 'field.bgOpacity', unit: 'unit.percent', min: 0, max: 1, step: 0.01, percent: true, value: at('background.opacity'), visible: (s) => s.background.kind !== 'none' }),
        toggle(ctx, { label: 'field.bgSyncFade', value: at('background.syncFade'), visible: (s) => s.background.kind !== 'none' }),
      ],
    }),
    section(ctx, { title: 'heading.canvas', fields: [canvasField(svc)] }),
    section(ctx, {
      title: 'heading.position',
      fields: [
        anchorField(svc),
        slider(ctx, { label: 'field.marginX', unit: 'unit.px', min: 0, max: 400, step: 1, value: at('layout.marginX') }),
        slider(ctx, { label: 'field.marginY', unit: 'unit.px', min: 0, max: 400, step: 1, value: at('layout.marginY') }),
        slider(ctx, { label: 'field.nudgeX', unit: 'unit.px', min: -800, max: 800, step: 1, value: at('layout.offsetX') }),
        slider(ctx, { label: 'field.nudgeY', unit: 'unit.px', min: -800, max: 800, step: 1, value: at('layout.offsetY') }),
      ],
    }),
  ];
}

export const GROUP_LABEL: Readonly<Record<SettingsGroup, MessageKey>> = {
  text: 'settings.text',
  font: 'settings.font',
  motion: 'settings.motion',
  decoration: 'settings.decoration',
  layout: 'settings.layout',
};

export function buildSettings(services: SettingsServices): SettingsPanel {
  const cardFields: { redraw(): void }[] = [];
  const svc: Svc = { ...services, minis: cardFields };
  const builders: Record<SettingsGroup, () => Field[]> = {
    text: () => textGroup(svc),
    font: () => fontGroup(svc),
    motion: () => motionGroup(svc),
    decoration: () => decorationGroup(svc),
    layout: () => layoutGroup(svc),
  };
  const fields: Field[] = [];
  const groups = {} as Record<SettingsGroup, HTMLElement>;
  for (const key of Object.keys(builders) as SettingsGroup[]) {
    const list = builders[key]();
    fields.push(...list);
    groups[key] = h('div', {
      class: 'settings-group',
      id: `group-${key}`,
      attrs: { role: 'tabpanel', 'aria-labelledby': `tab-${key}`, 'data-group': key, tabindex: 0 },
    }, [h('h2', { class: 'group-title', text: t(GROUP_LABEL[key]) }), ...list.map((field) => field.el)]);
  }
  const el = h('div', { class: 'settings-body' }, Object.values(groups));
  return {
    el,
    groups,
    sync(scene) {
      for (const field of fields) field.sync(scene);
    },
    redrawMinis() {
      for (const field of cardFields) field.redraw();
    },
  };
}
