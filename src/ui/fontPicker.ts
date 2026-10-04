import type { Scene } from '../core/scene';
import type { Field, FieldContext } from './controls';
import { h, setHidden, setPressed } from './dom';
import { FONT_CATEGORIES, catalogByCategory, findCatalogFont, isLatinFont, snapWeight } from './fonts/catalog';
import type { FontCategoryTab, MyFont } from './fonts/catalog';
import { loadSampleFace } from './fonts/loader';
import { LOCAL_FONT_SAMPLE, localFontExists } from './fonts/myfonts';
import type { MyFontStore } from './fonts/myfonts';
import { fontCategoryKey, t } from './i18n';

/** FNT-06 font picker, FNT-07 upload button, FNT-08 local font, FNT-09 removal. */

export interface FontPickerServices {
  readonly store: MyFontStore;
  readonly fontFamily: (family: string) => string;
  readonly weightsOf: (family: string) => readonly number[];
  readonly toast: (kind: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  /** Applies FNT-09 to every mode's scene. */
  readonly onRemoved: (font: MyFont) => void;
}

/** UI-07 / FNT-05: choosing a font snaps the weights to what the family has. */
export function withMainFont(scene: Scene, family: string, weights: readonly number[]): Scene {
  const text = scene.text;
  return {
    ...scene,
    text: {
      ...text,
      mainFont: { ...text.mainFont, family, weight: snapWeight(text.mainFont.weight, weights) },
      subFont: text.subFontInherit ? { ...text.subFont, family, weight: snapWeight(text.subFont.weight, weights) } : text.subFont,
    },
  };
}

let measureContext: CanvasRenderingContext2D | null = null;
function measureWidth(font: string): number {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return 0;
  measureContext.font = font;
  return measureContext.measureText(LOCAL_FONT_SAMPLE).width;
}

export function fontPicker(ctx: FieldContext, services: FontPickerServices): Field {
  let category: FontCategoryTab = 'all';
  let open = false;
  const sampleObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      sampleObserver?.unobserve(el);
      const family = el.dataset.family ?? '';
      void loadSampleFace(family, el.textContent ?? '').then((alias) => {
        if (alias) el.style.fontFamily = `"${alias}", sans-serif`;
      });
    }
  });

  const currentName = h('span', { class: 'fp-name' });
  const currentSample = h('span', { class: 'fp-sample' });
  const panelId = 'font-picker-panel';
  const trigger = h('button', {
    class: 'fp-trigger',
    attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId, 'data-testid': 'font-picker' },
  }, [currentName, currentSample]);
  const tabs = h('div', { class: 'chips fp-tabs', attrs: { role: 'group', 'aria-label': t('field.font') } });
  const grid = h('div', { class: 'fp-grid', attrs: { 'data-testid': 'font-grid' } });
  const localInput = h('input', { attrs: { type: 'text', placeholder: t('font.localPlaceholder'), 'aria-label': t('font.local'), 'data-testid': 'local-font-input' } });
  const localButton = h('button', { class: 'btn', attrs: { type: 'button' }, text: t('font.localUse') });
  const closeButton = h('button', { class: 'icon-btn fp-close', attrs: { type: 'button', 'aria-label': t('font.pickerClose') }, text: '×' });
  const panel = h('div', { class: 'fp-panel card', id: panelId, attrs: { hidden: true } }, [
    h('div', { class: 'fp-head' }, [tabs, closeButton]),
    grid,
    h('div', { class: 'fp-local' }, [h('label', { class: 'field-label', text: t('font.local') }), h('div', { class: 'row' }, [localInput, localButton])]),
  ]);

  const setOpen = (value: boolean) => {
    open = value;
    setHidden(panel, !open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) renderGrid(ctx.scene());
  };
  trigger.addEventListener('click', () => setOpen(!open));
  closeButton.addEventListener('click', () => {
    setOpen(false);
    trigger.focus();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      trigger.focus();
    }
  });

  const choose = (family: string) => {
    ctx.update(withMainFont(ctx.scene(), family, services.weightsOf(family)));
    setOpen(false);
    trigger.focus();
  };

  const useLocal = () => {
    const name = localInput.value.trim();
    if (!name) return;
    if (!localFontExists(name, measureWidth)) {
      services.toast('warning', t('toast.fontLocalNotFound', { name }));
      return;
    }
    const font = services.store.addLocal(name);
    services.toast('success', t('toast.fontLocalAdded', { name }));
    localInput.value = '';
    choose(font.family);
  };
  localButton.addEventListener('click', useLocal);
  localInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      useLocal();
    }
  });

  const renderTabs = () => {
    const mine = services.store.list();
    const visible = FONT_CATEGORIES.filter((id) => id !== 'mine' || mine.length > 0);
    if (!visible.includes(category)) category = 'all';
    tabs.replaceChildren(...visible.map((id) => {
      const button = h('button', { class: 'chip', attrs: { type: 'button', 'data-category': id }, text: t(fontCategoryKey(id)) });
      setPressed(button, id === category);
      button.addEventListener('click', () => {
        category = id;
        renderGrid(ctx.scene());
      });
      return button;
    }));
  };

  const renderGrid = (scene: Scene) => {
    renderTabs();
    const current = scene.text.mainFont.family;
    const cards: HTMLElement[] = [];
    if (category === 'all' || category === 'mine') {
      for (const font of services.store.list()) {
        const sample = h('span', { class: 'fp-card-sample', text: t('font.sampleCjk') });
        sample.style.fontFamily = services.fontFamily(font.family);
        const card = h('button', { class: 'fp-card', attrs: { type: 'button', 'data-family': font.family } }, [sample, h('span', { class: 'fp-card-name', text: font.name })]);
        setPressed(card, font.family === current);
        card.addEventListener('click', () => choose(font.family));
        const remove = h('button', { class: 'fp-remove', attrs: { type: 'button', 'aria-label': `${t('font.remove')}: ${font.name}`, title: t('font.remove') }, text: '×' });
        let armed: ReturnType<typeof setTimeout> | undefined;
        remove.addEventListener('click', () => {
          if (armed === undefined) {
            remove.textContent = t('font.removeConfirm');
            remove.classList.add('armed');
            armed = setTimeout(() => {
              armed = undefined;
              remove.textContent = '×';
              remove.classList.remove('armed');
            }, 3000);
            return;
          }
          clearTimeout(armed);
          armed = undefined;
          void services.store.remove(font.id).then((removed) => {
            if (!removed) return;
            services.onRemoved(removed);
            services.toast('success', t('toast.fontRemoved', { name: removed.name }));
            renderGrid(ctx.scene());
          });
        });
        cards.push(h('div', { class: 'fp-card-wrap' }, [card, remove]));
      }
    }
    if (category !== 'mine') {
      for (const font of catalogByCategory(category)) {
        const latin = font.category === 'latin';
        const sample = h('span', { class: 'fp-card-sample', text: t(latin ? 'font.sampleLatin' : 'font.sampleCjk'), attrs: { 'data-family': font.family } });
        const card = h('button', { class: 'fp-card', attrs: { type: 'button', 'data-family': font.family } }, [sample, h('span', { class: 'fp-card-name', text: font.family })]);
        setPressed(card, font.family === current);
        card.addEventListener('click', () => choose(font.family));
        sampleObserver?.observe(sample);
        cards.push(card);
      }
    }
    grid.replaceChildren(...cards);
  };

  services.store.onChange(() => {
    if (open) renderGrid(ctx.scene());
  });

  const el = h('div', { class: 'field field-font' }, [h('span', { class: 'field-label', text: t('field.font') }), trigger, panel]);
  return {
    el,
    sync(scene) {
      const family = scene.text.mainFont.family;
      const mine = services.store.byFamily(family);
      currentName.textContent = mine ? mine.name : family;
      currentSample.textContent = t(isLatinFont(family) ? 'font.sampleLatin' : 'font.sampleCjk');
      currentSample.style.fontFamily = services.fontFamily(family);
      currentSample.style.fontWeight = String(scene.text.mainFont.weight);
      currentSample.style.fontStyle = scene.text.mainFont.italic ? 'italic' : 'normal';
      if (open) {
        for (const card of grid.querySelectorAll<HTMLElement>('.fp-card')) setPressed(card, card.dataset.family === family);
      }
    },
  };
}

/** FNT-07 upload button (outside the picker). */
export function fontUpload(ctx: FieldContext, services: FontPickerServices): Field {
  const input = h('input', { class: 'visually-hidden', attrs: { type: 'file', accept: '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', 'data-testid': 'font-upload', tabindex: -1, 'aria-label': t('field.fontUpload') } });
  const button = h('button', { class: 'btn', attrs: { type: 'button' } }, [t('field.fontUpload')]);
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void services.store.addFile(file).then((result) => {
      if (result.status === 'unsupported') {
        services.toast('error', t('toast.fontUnsupported'));
        return;
      }
      if (result.status === 'exists') services.toast('info', t('toast.fontAlready', { name: result.font.name }));
      else {
        services.toast('success', t('toast.fontRegistered', { name: result.font.name }));
        if (!result.persisted) services.toast('warning', t('toast.fontSessionOnly'));
      }
      ctx.update(withMainFont(ctx.scene(), result.font.family, services.weightsOf(result.font.family)));
    });
  });
  const el = h('div', { class: 'field field-upload' }, [button, input, h('p', { class: 'note', text: t('note.fontUpload') })]);
  return { el, sync: () => {} };
}

export function weightChoices(family: string, weightsOf: (family: string) => readonly number[]): readonly number[] {
  return weightsOf(family).length > 0 ? weightsOf(family) : findCatalogFont(family)?.weights ?? [400, 700];
}
