import { mergeScene } from '../core/scene';
import type { Scene } from '../core/scene';
import { h, setHidden, setInputValue, setPressed, uid } from './dom';
import { clamp, roundToStep } from './format';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/** Declarative setting fields (UI-05). Each field renders once and re-syncs from the scene. */

export interface UpdateOptions {
  /** Restart preview playback from 0 (template / effect card). */
  readonly restart?: boolean;
  /** The edit changed the text (TPL-03 memory, debounced font loading). */
  readonly textEdit?: boolean;
}

export interface FieldContext {
  scene(): Scene;
  update(next: Scene, options?: UpdateOptions): void;
}

export interface Field {
  readonly el: HTMLElement;
  sync(scene: Scene): void;
}

export type Label = MessageKey | ((scene: Scene) => string);
export type Visible = (scene: Scene) => boolean;

export interface Accessor<T> {
  get(scene: Scene): T;
  set(scene: Scene, value: T): Scene;
}

function labelText(label: Label, scene: Scene): string {
  return typeof label === 'function' ? label(scene) : t(label);
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function patchFor(path: readonly string[], value: unknown): Record<string, unknown> {
  let patch: unknown = value;
  for (let index = path.length - 1; index >= 0; index -= 1) patch = { [path[index]!]: patch };
  return patch as Record<string, unknown>;
}

/** Accessor for a dotted scene path ("style.shadow.blur"). Values are validated by mergeScene. */
export function at<T = never>(path: string): Accessor<T> {
  const parts = path.split('.');
  return {
    get: (scene) => readPath(scene, parts) as T,
    set: (scene, value) => mergeScene(scene, patchFor(parts, value)),
  };
}

/** Wraps fields and keeps visibility in sync. */
function wrap(el: HTMLElement, visible: Visible | undefined, sync: (scene: Scene) => void): Field {
  return {
    el,
    sync(scene) {
      const show = visible ? visible(scene) : true;
      setHidden(el, !show);
      if (show) sync(scene);
    },
  };
}

export interface SliderOptions {
  readonly label: Label;
  readonly unit?: MessageKey;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Show internal value × 100 (UI-05 "%" items). */
  readonly percent?: boolean;
  readonly value: Accessor<number>;
  readonly visible?: Visible;
  readonly testId?: string;
}

export function slider(ctx: FieldContext, options: SliderOptions): Field {
  const id = uid('sl');
  const factor = options.percent ? 100 : 1;
  const min = options.min * factor;
  const max = options.max * factor;
  const step = options.step * factor;
  const label = h('label', { attrs: { for: id }, class: 'field-label' });
  const range = h('input', {
    attrs: { type: 'range', min, max, step, id, 'data-testid': options.testId },
  });
  const number = h('input', {
    class: 'num',
    attrs: { type: 'number', min, max, step, inputmode: 'decimal', 'aria-label': '' },
  });
  const unit = h('span', { class: 'unit', text: options.unit ? t(options.unit) : '' });
  const commit = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const value = roundToStep(clamp(raw, min, max), step) / factor;
    ctx.update(options.value.set(ctx.scene(), value));
  };
  range.addEventListener('input', () => commit(Number(range.value)));
  number.addEventListener('change', () => {
    commit(Number(number.value));
    number.value = String(roundToStep(options.value.get(ctx.scene()) * factor, step));
  });
  number.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') number.blur();
  });
  const el = h('div', { class: 'field field-slider' }, [label, h('div', { class: 'slider-row' }, [range, h('span', { class: 'num-wrap' }, [number, unit])])]);
  return wrap(el, options.visible, (scene) => {
    const text = labelText(options.label, scene);
    if (label.textContent !== text) label.textContent = text;
    number.setAttribute('aria-label', text);
    const shown = String(roundToStep(options.value.get(scene) * factor, step));
    setInputValue(range, shown);
    setInputValue(number, shown);
  });
}

export interface ToggleOptions {
  readonly label: Label;
  readonly value: Accessor<boolean>;
  readonly visible?: Visible;
  readonly disabled?: (scene: Scene) => boolean;
  readonly testId?: string;
}

export function toggleInput(onChange: (checked: boolean) => void, testId?: string): HTMLInputElement {
  const input = h('input', { class: 'switch', attrs: { type: 'checkbox', role: 'switch', 'data-testid': testId } });
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

export function toggle(ctx: FieldContext, options: ToggleOptions): Field {
  const input = toggleInput((checked) => ctx.update(options.value.set(ctx.scene(), checked)), options.testId);
  const text = h('span');
  const el = h('label', { class: 'field field-toggle' }, [input, text]);
  return wrap(el, options.visible, (scene) => {
    text.textContent = labelText(options.label, scene);
    input.checked = options.value.get(scene);
    input.disabled = options.disabled?.(scene) ?? false;
  });
}

export interface Choice<T> {
  readonly value: T;
  readonly label: Label;
}

export interface ChoiceOptions<T> {
  readonly label: Label;
  readonly choices: readonly Choice<T>[] | ((scene: Scene) => readonly Choice<T>[]);
  readonly value: Accessor<NoInfer<T>>;
  readonly visible?: Visible;
  /** 'segment' = joined buttons, 'chips' = wrapping chips. */
  readonly style?: 'segment' | 'chips';
  readonly testId?: string;
  readonly onPick?: (value: T) => void;
}

/** Single-choice button group (aria-pressed). */
export function choice<T extends string | number>(ctx: FieldContext, options: ChoiceOptions<T>): Field {
  const id = uid('ch');
  const label = h('span', { class: 'field-label', id });
  const group = h('div', { class: options.style === 'chips' ? 'chips' : 'segment', attrs: { role: 'group', 'aria-labelledby': id, 'data-testid': options.testId } });
  let rendered: readonly Choice<T>[] = [];
  const buttons = new Map<T, HTMLButtonElement>();
  const build = (choices: readonly Choice<T>[], scene: Scene) => {
    group.replaceChildren();
    buttons.clear();
    for (const entry of choices) {
      const button = h('button', { class: 'chip', attrs: { type: 'button', 'data-value': String(entry.value) }, text: labelText(entry.label, scene) });
      button.addEventListener('click', () => {
        if (options.onPick) options.onPick(entry.value);
        else ctx.update(options.value.set(ctx.scene(), entry.value));
      });
      buttons.set(entry.value, button);
      group.append(button);
    }
    rendered = choices;
  };
  const el = h('div', { class: 'field field-choice' }, [label, group]);
  return wrap(el, options.visible, (scene) => {
    label.textContent = labelText(options.label, scene);
    const choices = typeof options.choices === 'function' ? options.choices(scene) : options.choices;
    if (choices.length !== rendered.length || choices.some((c, i) => c.value !== rendered[i]!.value)) build(choices, scene);
    const current = options.value.get(scene);
    for (const entry of choices) {
      const button = buttons.get(entry.value)!;
      const text = labelText(entry.label, scene);
      if (button.textContent !== text) button.textContent = text;
      setPressed(button, entry.value === current);
    }
  });
}

export interface SelectOptions<T> {
  readonly label: Label;
  readonly choices: readonly Choice<T>[] | ((scene: Scene) => readonly Choice<T>[]);
  readonly value: Accessor<NoInfer<T>>;
  readonly visible?: Visible;
  readonly testId?: string;
  readonly parse: (raw: string) => T;
}

export function select<T extends string | number>(ctx: FieldContext, options: SelectOptions<T>): Field {
  const id = uid('se');
  const label = h('label', { class: 'field-label', attrs: { for: id } });
  const input = h('select', { id, attrs: { 'data-testid': options.testId } });
  let key = '';
  input.addEventListener('change', () => ctx.update(options.value.set(ctx.scene(), options.parse(input.value))));
  const el = h('div', { class: 'field field-select' }, [label, input]);
  return wrap(el, options.visible, (scene) => {
    label.textContent = labelText(options.label, scene);
    const choices = typeof options.choices === 'function' ? options.choices(scene) : options.choices;
    const nextKey = choices.map((c) => `${c.value}=${labelText(c.label, scene)}`).join('|');
    if (nextKey !== key) {
      input.replaceChildren(...choices.map((c) => h('option', { attrs: { value: String(c.value) }, text: labelText(c.label, scene) })));
      key = nextKey;
    }
    input.value = String(options.value.get(scene));
  });
}

export interface ColorOptions {
  readonly label: Label;
  readonly value: Accessor<string>;
  readonly visible?: Visible;
  /** Optional colour: may be '' (shows "unused" with + / ×). */
  readonly optional?: boolean;
  readonly addColor?: string;
  readonly note?: MessageKey;
  readonly testId?: string;
}

function toHexInput(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : /^#[0-9a-f]{3}$/i.test(value) ? `#${value.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase() : '#ffffff';
}

export function color(ctx: FieldContext, options: ColorOptions): Field {
  const id = uid('co');
  const label = h('label', { class: 'field-label', attrs: { for: id } });
  const input = h('input', { id, attrs: { type: 'color', 'data-testid': options.testId } });
  const hex = h('span', { class: 'hex' });
  const unused = h('span', { class: 'muted', text: t('color.unused') });
  const add = h('button', { class: 'mini-btn', attrs: { type: 'button', 'aria-label': t('color.add'), title: t('color.add') }, text: '+' });
  const remove = h('button', { class: 'mini-btn', attrs: { type: 'button', 'aria-label': t('color.remove'), title: t('color.remove') }, text: '×' });
  input.addEventListener('input', () => ctx.update(options.value.set(ctx.scene(), input.value.toUpperCase())));
  add.addEventListener('click', () => ctx.update(options.value.set(ctx.scene(), options.addColor ?? '#FFFFFF')));
  remove.addEventListener('click', () => ctx.update(options.value.set(ctx.scene(), '')));
  const row = h('div', { class: 'color-row' }, [input, hex, unused, options.optional ? add : null, options.optional ? remove : null]);
  const el = h('div', { class: 'field field-color' }, [label, row, options.note ? h('p', { class: 'note', text: t(options.note) }) : null]);
  return wrap(el, options.visible, (scene) => {
    label.textContent = labelText(options.label, scene);
    const value = options.value.get(scene);
    const empty = value === '';
    setHidden(input, empty);
    setHidden(hex, empty);
    setHidden(unused, !empty);
    setHidden(add, !empty);
    setHidden(remove, empty);
    if (!empty) {
      setInputValue(input, toHexInput(value));
      hex.textContent = value.toUpperCase();
    }
  });
}

export interface NoteOptions {
  readonly text: (scene: Scene) => string | null;
  readonly visible?: Visible;
  readonly testId?: string;
  readonly tone?: 'info' | 'warn';
}

export function note(options: NoteOptions): Field {
  const el = h('p', { class: `note${options.tone === 'warn' ? ' warn' : ''}`, attrs: { 'data-testid': options.testId, 'aria-live': 'polite' } });
  return {
    el,
    sync(scene) {
      const text = options.visible && !options.visible(scene) ? null : options.text(scene);
      setHidden(el, text === null);
      if (text !== null && el.textContent !== text) el.textContent = text;
    },
  };
}

export interface SectionOptions {
  readonly title: Label;
  readonly toggle?: Accessor<boolean>;
  readonly toggleTestId?: string;
  readonly toggleDisabled?: (scene: Scene) => boolean;
  readonly visible?: Visible;
  readonly testId?: string;
  readonly fields: readonly Field[];
}

/** Card with a heading; a heading switch hides the body when off (UI-05). */
export function section(ctx: FieldContext, options: SectionOptions): Field {
  const heading = h('h3', { class: 'section-title' });
  const body = h('div', { class: 'section-body' }, options.fields.map((field) => field.el));
  let toggleEl: HTMLInputElement | null = null;
  if (options.toggle) {
    const accessor = options.toggle;
    toggleEl = toggleInput((checked) => ctx.update(accessor.set(ctx.scene(), checked)), options.toggleTestId);
  }
  const header = h('div', { class: 'section-head' }, [heading, toggleEl]);
  const el = h('section', { class: 'card section', attrs: { 'data-testid': options.testId } }, [header, body]);
  return wrap(el, options.visible, (scene) => {
    const title = labelText(options.title, scene);
    heading.textContent = title;
    let open = true;
    if (toggleEl && options.toggle) {
      open = options.toggle.get(scene);
      toggleEl.checked = open;
      toggleEl.setAttribute('aria-label', title);
      toggleEl.disabled = options.toggleDisabled?.(scene) ?? false;
    }
    setHidden(body, !open);
    if (open) for (const field of options.fields) field.sync(scene);
  });
}

/** Free-form field built by the caller. */
export function custom(el: HTMLElement, sync: (scene: Scene) => void, visible?: Visible): Field {
  return wrap(el, visible, sync);
}

export function group(fields: readonly Field[], visible?: Visible): Field {
  const el = h('div', { class: 'field-group' }, fields.map((field) => field.el));
  return wrap(el, visible, (scene) => {
    for (const field of fields) field.sync(scene);
  });
}
