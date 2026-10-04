import { MAX_MOV_BYTES } from '../core/export-mov';
import { FPS_CHOICES, mergeScene } from '../core/scene';
import type { FpsChoice, Scene } from '../core/scene';
import type { LoopMode } from '../core/timeline';
import { toggleInput } from './controls';
import type { FieldContext } from './controls';
import { h, icon, setHidden, setInputValue } from './dom';
import { movSizeEstimate } from './exporter';
import type { ExportKind, ExportOutput } from './exporter';
import { SIZE_WARNING_BYTES, fileNameCandidate, formatLargeSize, formatSize, infoLine, loopLabel, manualFileName } from './format';
import { getLanguage, t } from './i18n';

/**
 * UI-14 export card (in a panel opened from the top bar), EXP-17 result panel, EXP-22 file name.
 * MOV-01〜05: the transparent video action has its own section; APNG-only options sit in a section marked "APNG only".
 */

export interface ExportPanelEvents {
  readonly onExport: (kind: ExportKind) => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
  readonly onOpenNotes: () => void;
}

export class ExportPanel {
  readonly el: HTMLElement;
  private readonly info: HTMLElement;
  private readonly fps: HTMLSelectElement;
  private readonly loop: HTMLSelectElement;
  private readonly count: HTMLInputElement;
  private readonly countWrap: HTMLElement;
  private readonly colors: HTMLSelectElement;
  private readonly fileName: HTMLInputElement;
  private readonly autoBadge: HTMLElement;
  private readonly resetName: HTMLButtonElement;
  private readonly defaultImage: HTMLInputElement;
  private readonly autoTrim: HTMLInputElement;
  private readonly movQuality: HTMLSelectElement;
  private readonly movEstimate: HTMLElement;
  private readonly apngSection: HTMLElement;
  private readonly buttons: Record<ExportKind, HTMLButtonElement>;
  private readonly progress: HTMLProgressElement;
  private readonly progressWrap: HTMLElement;
  private readonly status: HTMLElement;
  private readonly cancel: HTMLButtonElement;
  private readonly result: HTMLElement;
  private readonly resultImage: HTMLImageElement;
  private readonly resultMeta: HTMLElement;
  private readonly resultAdvice: HTMLElement;
  private readonly download: HTMLAnchorElement;
  private url: string | null = null;
  private candidate = '';
  private duration: number | null = null;

  constructor(private readonly ctx: FieldContext, private readonly events: ExportPanelEvents) {
    const field = (labelText: string, control: HTMLElement, id: string) =>
      h('div', { class: 'field' }, [h('label', { class: 'field-label', attrs: { for: id }, text: labelText }), control]);
    this.info = h('p', { class: 'export-info', attrs: { 'data-testid': 'export-info' } });
    this.fps = h('select', { id: 'export-fps', attrs: { 'data-testid': 'export-fps' } }, FPS_CHOICES.map((fps) => h('option', { attrs: { value: fps }, text: String(fps) })));
    this.fps.addEventListener('change', () => this.set({ export: { fps: Number(this.fps.value) as FpsChoice } }));
    this.loop = h('select', { id: 'export-loop', attrs: { 'data-testid': 'export-loop' } }, [
      h('option', { attrs: { value: 'once' }, text: t('loop.once') }),
      h('option', { attrs: { value: 'forever' }, text: t('loop.forever') }),
      h('option', { attrs: { value: 'count' }, text: t('loop.count') }),
    ]);
    this.loop.addEventListener('change', () => {
      const scene = this.ctx.scene();
      const kind = this.loop.value as LoopMode['kind'];
      const loop: LoopMode = kind === 'count' ? { kind, count: scene.export.loopCount } : { kind };
      this.ctx.update({ ...scene, export: { ...scene.export, loop } });
    });
    this.count = h('input', { id: 'export-count', class: 'num', attrs: { type: 'number', min: 1, max: 999, step: 1, 'data-testid': 'export-count' } });
    this.count.addEventListener('change', () => {
      const raw = Number(this.count.value);
      const count = Number.isFinite(raw) ? Math.max(1, Math.min(999, Math.round(raw))) : 1;
      const scene = this.ctx.scene();
      this.ctx.update({ ...scene, export: { ...scene.export, loopCount: count, loop: { kind: 'count', count } } });
      this.count.value = String(count);
    });
    this.countWrap = field(t('export.count'), this.count, 'export-count');
    this.colors = h('select', { id: 'export-colors', attrs: { 'data-testid': 'export-colors' } }, [
      h('option', { attrs: { value: 'palette' }, text: t('colors.palette') }),
      h('option', { attrs: { value: 'full' }, text: t('colors.full') }),
    ]);
    this.colors.addEventListener('change', () => this.set({ export: { colorMode: this.colors.value as 'palette' | 'full' } }));
    this.fileName = h('input', { id: 'export-filename', attrs: { type: 'text', spellcheck: 'false', autocomplete: 'off', 'data-testid': 'export-filename' } });
    this.fileName.addEventListener('input', () => {
      const scene = this.ctx.scene();
      const manual = manualFileName(this.fileName.value, this.candidate);
      if (manual !== scene.export.fileName) this.ctx.update({ ...scene, export: { ...scene.export, fileName: manual } });
    });
    this.fileName.addEventListener('blur', () => this.sync(this.ctx.scene(), null));
    this.autoBadge = h('span', { class: 'badge auto', attrs: { 'data-testid': 'filename-auto' }, text: t('export.filenameAuto') });
    this.resetName = h('button', { class: 'btn ghost small', attrs: { type: 'button', 'data-testid': 'filename-reset' }, text: t('export.filenameReset') });
    this.resetName.addEventListener('click', () => {
      const scene = this.ctx.scene();
      this.ctx.update({ ...scene, export: { ...scene.export, fileName: '' } });
      this.fileName.value = this.candidate;
    });
    this.defaultImage = toggleInput((checked) => this.set({ export: { includeDefaultImage: checked } }), 'export-default-image');
    this.autoTrim = toggleInput((checked) => this.set({ export: { autoTrim: checked } }), 'export-autotrim');
    this.movQuality = h('select', { id: 'export-mov-quality', attrs: { 'data-testid': 'export-mov-quality' } }, [
      h('option', { attrs: { value: 'high' }, text: t('export.movHigh') }),
      h('option', { attrs: { value: 'standard' }, text: t('export.movStandard') }),
    ]);
    this.movQuality.addEventListener('change', () => this.set({ export: { movQuality: this.movQuality.value === 'high' ? 'high' : 'standard' } }));
    this.movEstimate = h('p', { class: 'note', attrs: { 'data-testid': 'export-mov-estimate' } });

    this.buttons = {
      apng: h('button', { class: 'btn primary wide', attrs: { type: 'button', 'data-testid': 'export-apng' } }, [icon('download'), t('export.apng')]),
      png: h('button', { class: 'btn', attrs: { type: 'button', 'data-testid': 'export-png' }, text: t('export.png') }),
      zip: h('button', { class: 'btn', attrs: { type: 'button', 'data-testid': 'export-zip' }, text: t('export.zip') }),
      mov: h('button', { class: 'btn wide', attrs: { type: 'button', 'data-testid': 'export-mov' } }, [icon('download'), t('export.mov')]),
    };
    for (const kind of ['apng', 'png', 'zip', 'mov'] as const) this.buttons[kind].addEventListener('click', () => this.events.onExport(kind));

    this.progress = h('progress', { attrs: { max: 100, value: 0, 'aria-label': t('export.progress'), 'data-testid': 'export-progress' } });
    this.status = h('p', { class: 'status', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'export-status' } });
    this.cancel = h('button', { class: 'btn danger', attrs: { type: 'button', 'data-testid': 'export-cancel' }, text: t('export.cancel') });
    this.cancel.addEventListener('click', () => this.events.onCancel());
    this.progressWrap = h('div', { class: 'progress-wrap', attrs: { hidden: true } }, [this.progress, this.cancel]);

    this.resultImage = h('img', { class: 'result-img', attrs: { alt: t('result.preview'), 'data-testid': 'result-image' } });
    this.resultMeta = h('p', { class: 'result-meta', attrs: { 'data-testid': 'result-meta' } });
    this.resultAdvice = h('p', { class: 'result-advice', attrs: { 'data-testid': 'result-advice' } });
    this.download = h('a', { class: 'btn primary', attrs: { 'data-testid': 'result-download', href: '#' } }, [icon('download'), t('result.download')]);
    const clear = h('button', { class: 'btn ghost', attrs: { type: 'button', 'data-testid': 'result-clear' }, text: t('result.clear') });
    clear.addEventListener('click', () => this.clearResult(true));
    const notes = h('button', { class: 'link-btn', attrs: { type: 'button' }, text: t('footer.openNotes') });
    notes.addEventListener('click', () => this.events.onOpenNotes());
    this.result = h('div', { class: 'result card-inner', attrs: { hidden: true, 'data-testid': 'result-panel' } }, [
      h('h3', { text: t('result.heading') }),
      h('div', { class: 'result-img-wrap' }, [this.resultImage]),
      this.resultMeta,
      this.resultAdvice,
      h('div', { class: 'row' }, [this.download, clear]),
      h('p', { class: 'note' }, [notes]),
    ]);

    const close = h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': t('export.close'), 'data-testid': 'export-close' } }, [icon('close')]);
    close.addEventListener('click', () => this.events.onClose());
    const sectionHead = (title: string, badge: string) =>
      h('div', { class: 'export-section-head' }, [h('h3', { text: title }), h('span', { class: 'badge', text: badge })]);
    this.apngSection = h('section', { class: 'export-section', attrs: { 'data-testid': 'export-apng-options' } }, [
      sectionHead(t('export.apngSection'), t('export.apngOnly')),
      h('div', { class: 'export-grid' }, [
        field(t('export.loop'), this.loop, 'export-loop'),
        this.countWrap,
        field(t('export.colors'), this.colors, 'export-colors'),
      ]),
      h('label', { class: 'field field-toggle' }, [this.defaultImage, h('span', { text: t('export.defaultImage') })]),
      h('label', { class: 'field field-toggle' }, [this.autoTrim, h('span', { text: t('export.autoTrim') })]),
      this.buttons.apng,
    ]);
    const movSection = h('section', { class: 'export-section', attrs: { 'data-testid': 'export-mov-options' } }, [
      sectionHead(t('export.movSection'), t('export.movOnly')),
      field(t('export.movQuality'), this.movQuality, 'export-mov-quality'),
      h('p', { class: 'note', attrs: { 'data-testid': 'export-mov-hint' }, text: t('export.movHint') }),
      this.movEstimate,
      this.buttons.mov,
    ]);
    this.el = h('aside', { class: 'export-panel', id: 'export-panel', attrs: { 'aria-labelledby': 'export-title', 'data-testid': 'export-panel', hidden: true } }, [
      h('div', { class: 'export-head' }, [h('h2', { id: 'export-title', text: t('export.heading') }), close]),
      this.info,
      h('div', { class: 'export-grid' }, [field(t('export.fps'), this.fps, 'export-fps')]),
      h('div', { class: 'field filename' }, [
        h('div', { class: 'row' }, [h('label', { class: 'field-label', attrs: { for: 'export-filename' }, text: t('export.filename') }), this.autoBadge, this.resetName]),
        this.fileName,
      ]),
      this.apngSection,
      movSection,
      h('div', { class: 'export-buttons' }, [h('div', { class: 'row' }, [this.buttons.png, this.buttons.zip])]),
      this.progressWrap,
      this.status,
      this.result,
    ]);
  }

  private set(patch: Parameters<typeof mergeScene>[1]): void {
    this.ctx.update(mergeScene(this.ctx.scene(), patch));
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** `duration` = current timeline length (null = keep the info line). */
  sync(scene: Scene, duration: number | null): void {
    const lang = getLanguage();
    if (duration !== null) {
      this.duration = duration;
      this.info.textContent = infoLine(scene, duration, lang);
    }
    this.fps.value = String(scene.export.fps);
    this.loop.value = scene.export.loop.kind;
    setHidden(this.countWrap, scene.export.loop.kind !== 'count');
    setInputValue(this.count, String(scene.export.loop.kind === 'count' ? scene.export.loop.count : scene.export.loopCount));
    this.colors.value = scene.export.colorMode;
    this.defaultImage.checked = scene.export.includeDefaultImage;
    this.autoTrim.checked = scene.export.autoTrim;
    this.movQuality.value = scene.export.movQuality;
    this.syncMovEstimate(scene);
    this.candidate = fileNameCandidate(scene, lang);
    const manual = scene.export.fileName;
    setHidden(this.autoBadge, manual !== '');
    setHidden(this.resetName, manual === '');
    if (document.activeElement !== this.fileName) this.fileName.value = manual || this.candidate;
  }

  /** MOV-04: typical size before exporting; the conservative estimate decides whether the 2 GB guard will stop the job. */
  private syncMovEstimate(scene: Scene): void {
    if (this.duration === null) return;
    const lang = getLanguage();
    const estimate = movSizeEstimate(scene, this.duration);
    const over = estimate.guard > MAX_MOV_BYTES;
    this.movEstimate.textContent = over
      ? t('error.movSize', { size: formatLargeSize(estimate.guard, lang), max: formatLargeSize(MAX_MOV_BYTES, lang) })
      : t('export.movEstimate', { low: formatLargeSize(estimate.low, lang), high: formatLargeSize(estimate.guard, lang) });
    this.movEstimate.classList.toggle('warn', over);
  }

  get candidateName(): string {
    return this.candidate;
  }

  /** `kind` = running job; a video job dims the APNG-only section (its options do not apply). */
  setBusy(busy: boolean, kind: ExportKind | null = null): void {
    for (const button of Object.values(this.buttons)) button.disabled = busy;
    this.apngSection.classList.toggle('inactive', busy && kind === 'mov');
    setHidden(this.progressWrap, !busy);
    if (!busy) this.progress.value = 0;
    this.cancel.disabled = false;
  }

  setProgress(percent: number, text: string, cancellable: boolean): void {
    this.progress.value = Math.max(0, Math.min(100, percent));
    setHidden(this.cancel, !cancellable);
    this.status.textContent = text;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  clearResult(clearStatus: boolean): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.resultImage.removeAttribute('src');
    this.download.removeAttribute('href');
    setHidden(this.result, true);
    if (clearStatus) this.status.textContent = '';
  }

  /** EXP-17 result panel. Returns the object URL (used for automatic downloads). */
  showResult(output: ExportOutput, scene: Scene): string {
    this.clearResult(false);
    const lang = getLanguage();
    const blob = new Blob([output.bytes.slice().buffer], { type: output.mime });
    this.url = URL.createObjectURL(blob);
    this.download.href = this.url;
    this.download.download = output.fileName;
    const size = formatSize(output.bytes.length, lang);
    let meta: string[];
    if (output.kind === 'apng') {
      const colors = scene.export.colorMode === 'full' ? t('result.colorsFull') : output.lossless ? t('result.colorsLossless') : t('result.colorsPalette');
      meta = [output.fileName, size, t('result.dimensions', { w: output.width, h: output.height }), t('result.frames', { n: output.sourceFrames, m: output.storedFrames }), colors, loopLabel(scene, lang)];
    } else if (output.kind === 'png') {
      meta = [output.fileName, size, t('result.dimensions', { w: output.width, h: output.height }), t('result.png')];
    } else if (output.kind === 'mov') {
      meta = [
        output.fileName,
        size,
        t('result.dimensions', { w: output.width, h: output.height }),
        t('result.movFrames', { n: output.sourceFrames }),
        t('result.fps', { fps: output.fps }),
        t('result.movCodec'),
        t(output.quality === 'high' ? 'export.movHigh' : 'export.movStandard'),
        t('result.loopOnce'),
      ];
    } else {
      meta = [output.fileName, size, t('result.zipFrames', { n: output.sourceFrames }), t('result.fps', { fps: output.fps })];
    }
    this.resultMeta.textContent = meta.join(' ・ ');
    // Browsers cannot show ProRes, so the video result has no preview.
    const showImage = output.kind === 'apng' || output.kind === 'png';
    setHidden(this.resultImage.parentElement!, !showImage);
    if (showImage) this.resultImage.src = this.url;
    const over = output.bytes.length > SIZE_WARNING_BYTES;
    setHidden(this.resultAdvice, output.kind !== 'apng' && output.kind !== 'mov');
    if (output.kind === 'mov') {
      this.resultAdvice.textContent = t('result.movAdvice');
      this.resultAdvice.className = 'result-advice';
    } else {
      this.resultAdvice.textContent = over ? t('result.sizeOver') : t('result.sizeOk');
      this.resultAdvice.className = `result-advice ${over ? 'warn' : 'ok'}`;
    }
    setHidden(this.result, false);
    return this.url;
  }

  focusFirst(): void {
    this.buttons.apng.focus();
  }
}
