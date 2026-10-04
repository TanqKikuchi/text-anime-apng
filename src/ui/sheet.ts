import { h, icon } from './dom';
import { t } from './i18n';
import { TAP_SLOP, halfHeight, settleStop, tapStop } from './sheetMath';
import type { SheetHeights, SheetStop } from './sheetMath';

/** UI-19 bottom sheet for the settings on narrow screens (< 1024 px). Inactive on wide screens. */

export class BottomSheet {
  readonly band: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly arrow: HTMLButtonElement;
  private stop: SheetStop = 'closed';
  private active = false;
  private drag: { startY: number; startHeight: number; lastY: number; lastTime: number; velocity: number; moved: boolean } | null = null;

  constructor(
    private readonly sheet: HTMLElement,
    private readonly body: HTMLElement,
    private readonly measureTop: () => { header: number; previewBottom: number },
    private readonly onOpen: () => void,
  ) {
    this.summary = h('span', { class: 'sheet-summary', attrs: { 'data-testid': 'sheet-summary' } });
    this.arrow = h('button', { class: 'icon-btn sheet-arrow', attrs: { type: 'button', 'aria-label': t('sheet.expand'), 'aria-expanded': 'false', 'data-testid': 'sheet-toggle' } }, [icon('chevron-up')]);
    const handle = h('span', { class: 'sheet-handle', attrs: { 'aria-hidden': 'true' } });
    this.band = h('div', { class: 'sheet-band', attrs: { 'data-testid': 'sheet-band' } }, [
      handle,
      h('span', { class: 'sheet-title' }, [h('strong', { text: t('sheet.settings') }), this.summary]),
      this.arrow,
    ]);
    this.arrow.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setStop(this.stop === 'closed' ? 'half' : this.stop === 'half' ? 'full' : 'closed');
    });
    this.band.addEventListener('pointerdown', (event) => this.onDown(event));
    this.band.addEventListener('pointermove', (event) => this.onMove(event));
    this.band.addEventListener('pointerup', (event) => this.onUp(event));
    this.band.addEventListener('pointercancel', () => {
      this.drag = null;
      this.apply();
    });
    // Swipe down on the content while it is scrolled to the top lowers the sheet.
    let touchStart: { y: number; atTop: boolean } | null = null;
    this.body.addEventListener('touchstart', (event) => {
      touchStart = { y: event.touches[0]?.clientY ?? 0, atTop: this.body.scrollTop <= 0 };
    }, { passive: true });
    this.body.addEventListener('touchend', (event) => {
      const end = event.changedTouches[0]?.clientY ?? 0;
      if (touchStart?.atTop && end - touchStart.y > 60 && this.active) this.setStop(this.stop === 'full' ? 'half' : 'closed');
      touchStart = null;
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', () => this.onViewport());
    window.addEventListener('resize', () => this.apply());
  }

  get current(): SheetStop {
    return this.stop;
  }

  setSummary(text: string): void {
    this.summary.textContent = text;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.sheet.style.removeProperty('--sheet-visible');
      this.sheet.style.removeProperty('--sheet-full');
      this.body.inert = false;
      this.sheet.dataset.stop = '';
      return;
    }
    this.apply();
  }

  private heights(): SheetHeights {
    const vh = window.innerHeight;
    const { header, previewBottom } = this.measureTop();
    const closed = this.band.offsetHeight || 56;
    return { closed, half: Math.max(closed + 80, halfHeight(vh, previewBottom + 8)), full: Math.max(closed + 120, vh - header) };
  }

  setStop(stop: SheetStop): void {
    const opening = this.stop === 'closed' && stop !== 'closed';
    this.stop = stop;
    if (opening) this.onOpen();
    this.apply();
  }

  private apply(height?: number): void {
    if (!this.active) return;
    const heights = this.heights();
    const visible = height ?? heights[this.stop];
    this.sheet.style.setProperty('--sheet-full', `${heights.full}px`);
    this.sheet.style.setProperty('--sheet-visible', `${visible}px`);
    this.sheet.dataset.stop = this.stop;
    this.sheet.classList.toggle('dragging', height !== undefined);
    this.body.inert = this.stop === 'closed' && height === undefined;
    this.arrow.setAttribute('aria-expanded', String(this.stop !== 'closed'));
    this.arrow.setAttribute('aria-label', t(this.stop === 'full' ? 'sheet.collapse' : 'sheet.expand'));
    const arrowIcon = this.stop === 'full' ? 'chevron-down' : 'chevron-up';
    if (this.arrow.dataset.icon !== arrowIcon) {
      this.arrow.dataset.icon = arrowIcon;
      this.arrow.replaceChildren(icon(arrowIcon));
    }
  }

  private currentHeight(): number {
    return parseFloat(this.sheet.style.getPropertyValue('--sheet-visible')) || this.heights()[this.stop];
  }

  private onDown(event: PointerEvent): void {
    if (!this.active || (event.target as HTMLElement).closest('.sheet-arrow')) return;
    this.band.setPointerCapture?.(event.pointerId);
    this.drag = { startY: event.clientY, startHeight: this.currentHeight(), lastY: event.clientY, lastTime: performance.now(), velocity: 0, moved: false };
  }

  private onMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const now = performance.now();
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) >= TAP_SLOP) drag.moved = true;
    const dt = Math.max(1, now - drag.lastTime);
    drag.velocity = (drag.lastY - event.clientY) / dt;
    drag.lastY = event.clientY;
    drag.lastTime = now;
    if (!drag.moved) return;
    const heights = this.heights();
    this.apply(Math.max(heights.closed, Math.min(heights.full, drag.startHeight - dy)));
  }

  private onUp(event: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    const total = Math.abs(event.clientY - drag.startY);
    if (!drag.moved || total < TAP_SLOP) {
      this.setStop(tapStop(this.stop));
      return;
    }
    this.setStop(settleStop(this.currentHeight(), drag.velocity, this.heights()));
  }

  /** Software keyboard opened while typing in the sheet: expand to full (pinch zoom excluded). */
  private onViewport(): void {
    const vv = window.visualViewport;
    if (!this.active || !vv || Math.abs(vv.scale - 1) > 0.01) return;
    const keyboard = window.innerHeight - vv.height > 120;
    const focused = document.activeElement;
    if (keyboard && focused && this.sheet.contains(focused) && /^(INPUT|TEXTAREA|SELECT)$/u.test(focused.tagName)) this.setStop('full');
  }
}
