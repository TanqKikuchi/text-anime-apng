import { h, icon } from './dom';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { shortcutRows } from './shortcuts';

/** UI-16 help / notes / shortcuts as keyboard-operable modal dialogs (one open at a time). */

export type ModalId = 'help' | 'notes' | 'shortcuts';

function dialog(id: ModalId, titleKey: MessageKey, body: Node[], onClose: () => void): HTMLDialogElement {
  const titleId = `modal-${id}-title`;
  const close = h('button', { class: 'icon-btn modal-close', attrs: { type: 'button', 'aria-label': t('common.close'), 'data-testid': `close-${id}` } }, [icon('close')]);
  const el = h('dialog', { class: 'modal', id: `modal-${id}`, attrs: { 'aria-labelledby': titleId, 'data-testid': `modal-${id}` } }, [
    h('div', { class: 'modal-head' }, [h('h2', { id: titleId, text: t(titleKey) }), close]),
    h('div', { class: 'modal-body' }, body),
  ]);
  close.addEventListener('click', () => el.close());
  el.addEventListener('close', onClose);
  el.addEventListener('click', (event) => {
    if (event.target === el) el.close();
  });
  return el;
}

function list(keys: readonly MessageKey[], ordered: boolean): HTMLElement {
  return h(ordered ? 'ol' : 'ul', {}, keys.map((key) => h('li', { text: t(key) })));
}

export function modifierLabel(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad/u.test(platform) ? '⌘ / Ctrl / Alt' : 'Ctrl / Alt';
}

export function buildModals(onClose: (id: ModalId) => void): Record<ModalId, HTMLDialogElement> {
  const help = dialog('help', 'help.title', [
    list(['help.step1', 'help.step2', 'help.step3', 'help.step4', 'help.step5', 'help.step6'], true),
    h('h3', { text: t('help.tipsHeading') }),
    list(['help.tip1', 'help.tip2', 'help.tip3', 'help.tip4', 'help.tip5', 'help.tip6', 'help.tip7'], false),
  ], () => onClose('help'));
  const notes = dialog('notes', 'notes.title', [
    h('h3', { text: t('notes.localHeading') }),
    h('p', { text: t('notes.local') }),
    h('p', { text: t('notes.storage') }),
    h('h3', { text: t('notes.fontsHeading') }),
    h('p', { text: t('notes.fonts') }),
    h('p', { text: t('notes.uploads') }),
    h('p', { text: t('notes.output') }),
  ], () => onClose('notes'));
  const mod = modifierLabel();
  const rows = shortcutRows(mod).map((row) => h('tr', {}, [
    h('td', {}, row.keys.flatMap((key, index) => (index === 0 ? [h('kbd', { text: key })] : [' + ', h('kbd', { text: key })]))),
    h('td', { text: t(`shortcuts.${row.action}`) }),
  ]));
  const shortcuts = dialog('shortcuts', 'shortcuts.title', [
    h('p', { class: 'muted', text: t('shortcuts.modifier') }),
    h('table', { class: 'shortcut-table' }, [
      h('thead', {}, [h('tr', {}, [h('th', { attrs: { scope: 'col' }, text: t('shortcuts.colKeys') }), h('th', { attrs: { scope: 'col' }, text: t('shortcuts.colAction') })])]),
      h('tbody', {}, rows),
    ]),
  ], () => onClose('shortcuts'));
  return { help, notes, shortcuts };
}
