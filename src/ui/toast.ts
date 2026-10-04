import { h } from './dom';
import { t } from './i18n';

/** UI-17 toasts: info / success / warning / error (error = role=alert), 2.2〜8 s, optional action. */

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export function toastDuration(kind: ToastKind, message: string, hasAction: boolean): number {
  if (hasAction) return 8000;
  const base = kind === 'error' ? 6000 : kind === 'warning' ? 5000 : kind === 'success' ? 2600 : 2200;
  return Math.min(8000, base + Math.max(0, message.length - 40) * 25);
}

export class Toaster {
  readonly el: HTMLElement;
  private readonly polite: HTMLElement;
  private readonly assertive: HTMLElement;

  constructor() {
    this.polite = h('div', { class: 'toast-stack', attrs: { role: 'status', 'aria-live': 'polite' } });
    this.assertive = h('div', { class: 'toast-stack', attrs: { role: 'alert', 'aria-live': 'assertive' } });
    this.el = h('div', { class: 'toasts', attrs: { 'data-testid': 'toasts' } }, [this.assertive, this.polite]);
  }

  show(kind: ToastKind, message: string, action?: ToastAction): void {
    const close = h('button', { class: 'toast-close', attrs: { type: 'button', 'aria-label': t('common.close') }, text: '×' });
    const actionButton = action ? h('button', { class: 'toast-action', attrs: { type: 'button' }, text: action.label }) : null;
    const toast = h('div', { class: `toast ${kind}`, attrs: { 'data-kind': kind } }, [h('span', { class: 'toast-text', text: message }), actionButton, close]);
    const remove = () => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 180);
    };
    close.addEventListener('click', remove);
    actionButton?.addEventListener('click', () => {
      action?.run();
      remove();
    });
    (kind === 'error' ? this.assertive : this.polite).append(toast);
    const stack = kind === 'error' ? this.assertive : this.polite;
    while (stack.children.length > 4) stack.firstElementChild?.remove();
    setTimeout(remove, toastDuration(kind, message, action !== undefined));
  }
}
