import type { SceneModel } from '../core/frame';
import type { Scene } from '../core/scene';
import { advancePlayback, playbackSegments, playbackStartTime, seekTime, timeAfterEdit } from '../core/scene-timeline';
import { CanvasTextMeasurer, getSceneModel, renderModelFrame } from '../render';
import { h, icon, setHidden } from './dom';
import { previewAvailableHeight, previewDisplaySize, previewInternalWidth } from './format';
import { t } from './i18n';
import type { PreviewBackground } from './state';

/** UI-11 preview canvas, UI-12 backgrounds, UI-13 transport (TL-17 / TL-18 playback). */

export interface PreviewEvents {
  readonly onBackground: (background: PreviewBackground) => void;
  readonly onLoopChange: (loop: boolean) => void;
  readonly onExitChange: (enabled: boolean) => void;
  readonly onPickImageError: () => void;
}

export class Preview {
  readonly el: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly transport: HTMLElement;
  readonly bgBar: HTMLElement;
  readonly heading: HTMLElement;
  private readonly context: CanvasRenderingContext2D;
  private measurer: CanvasTextMeasurer;
  private scene: Scene;
  private currentModel: SceneModel;
  private time = 0;
  private playing = false;
  private loop = true;
  private frame = 0;
  private lastTick = 0;
  private image: string | null = null;
  private background: PreviewBackground = 'transparent';
  private phone = false;
  private dirty = true;
  // transport elements
  private readonly playButton: HTMLButtonElement;
  private readonly playLabel: HTMLSpanElement;
  private readonly timeReadout: HTMLSpanElement;
  private readonly scrubber: HTMLInputElement;
  private readonly segmentsBar: HTMLDivElement;
  private readonly playhead: HTMLDivElement;
  private readonly loopSwitch: HTMLInputElement;
  private readonly exitSwitch: HTMLInputElement;
  private readonly exitWrap: HTMLLabelElement;
  private readonly bgButtons = new Map<PreviewBackground, HTMLButtonElement>();
  private readonly imageInput: HTMLInputElement;
  readonly fontStatus: HTMLSpanElement;
  private segmentsKey = '';

  constructor(scene: Scene, private readonly fontFamily: (family: string) => string, private readonly events: PreviewEvents) {
    this.scene = scene;
    this.canvas = h('canvas', { class: 'preview-canvas', attrs: { role: 'img', 'aria-label': t('preview.canvas'), 'data-testid': 'preview-canvas' } });
    this.context = this.canvas.getContext('2d')!;
    this.measurer = new CanvasTextMeasurer(this.context, fontFamily);
    this.currentModel = getSceneModel(scene, this.measurer);

    this.stage = h('div', { class: 'stage bg-transparent', attrs: { 'data-testid': 'preview-stage', title: t('preview.bg.tooltip') } }, [this.canvas]);
    this.stage.addEventListener('dblclick', () => {
      if (this.background === 'image') this.imageInput.click();
    });

    this.imageInput = h('input', { class: 'visually-hidden', attrs: { type: 'file', accept: 'image/*', tabindex: -1, 'data-testid': 'bg-image-input', 'aria-label': t('preview.bg.pickImage') } });
    this.imageInput.addEventListener('change', () => this.onImagePicked());
    const bgGroup = h('div', { class: 'chips bg-chips', attrs: { role: 'group', 'aria-label': t('preview.bg'), 'data-testid': 'preview-bg' } });
    for (const bg of ['transparent', 'black', 'white', 'grey', 'image'] as const) {
      const swatch = h('span', { class: `bg-swatch bg-${bg}`, attrs: { 'aria-hidden': 'true' } });
      const button = h('button', { class: 'chip', attrs: { type: 'button', 'data-bg': bg, 'aria-pressed': 'false', title: t('preview.bg.tooltip') } }, [swatch, t(`preview.bg.${bg}`)]);
      button.addEventListener('click', () => this.chooseBackground(bg));
      this.bgButtons.set(bg, button);
      bgGroup.append(button);
    }
    this.fontStatus = h('span', { class: 'font-status', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'font-status' } });
    this.heading = h('div', { class: 'preview-head' }, [
      h('h2', { class: 'preview-title', text: t('preview.heading') }),
      this.fontStatus,
      h('span', { class: 'spacer' }),
      h('span', { class: 'bg-label muted', text: t('preview.bg') }),
    ]);
    this.bgBar = h('div', { class: 'bg-bar' }, [bgGroup, this.imageInput]);

    // transport
    this.playLabel = h('span', { class: 'visually-hidden' });
    this.playButton = h('button', { class: 'icon-btn play', attrs: { type: 'button', 'data-testid': 'play-toggle' } }, [icon('play'), this.playLabel]);
    this.playButton.addEventListener('click', () => this.togglePlay());
    const restart = h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': t('transport.restart'), title: t('transport.restart'), 'data-testid': 'restart' } }, [icon('restart')]);
    restart.addEventListener('click', () => this.restart());
    this.loopSwitch = h('input', { class: 'switch', attrs: { type: 'checkbox', role: 'switch', 'data-testid': 'loop-switch' } });
    this.loopSwitch.addEventListener('change', () => {
      this.loop = this.loopSwitch.checked;
      this.events.onLoopChange(this.loop);
    });
    this.exitSwitch = h('input', { class: 'switch', attrs: { type: 'checkbox', role: 'switch', 'data-testid': 'exit-switch' } });
    this.exitSwitch.addEventListener('change', () => this.events.onExitChange(this.exitSwitch.checked));
    this.exitWrap = h('label', { class: 'switch-label' }, [this.exitSwitch, h('span', { text: t('transport.exit') })]);
    this.timeReadout = h('span', { class: 'time', attrs: { 'data-testid': 'time-readout', 'aria-live': 'off' } });
    this.scrubber = h('input', { class: 'scrubber', attrs: { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': t('transport.seek'), 'data-testid': 'scrubber' } });
    this.scrubber.addEventListener('input', () => this.seek(Number(this.scrubber.value)));
    this.segmentsBar = h('div', { class: 'segments', attrs: { 'aria-hidden': 'true' } });
    this.playhead = h('div', { class: 'playhead', attrs: { 'aria-hidden': 'true' } });
    const legend = h('div', { class: 'legend', attrs: { 'aria-hidden': 'true' } }, (['enter', 'hold', 'exit'] as const).map((phase) => h('span', { class: `legend-item ${phase}` }, [h('i'), t(`legend.${phase}`)])));
    this.transport = h('div', { class: 'transport', attrs: { 'data-testid': 'transport' } }, [
      h('div', { class: 'transport-row' }, [
        this.playButton,
        restart,
        this.timeReadout,
        h('span', { class: 'spacer' }),
        h('label', { class: 'switch-label' }, [this.loopSwitch, h('span', { text: t('transport.loop') })]),
        this.exitWrap,
      ]),
      h('div', { class: 'scrub-wrap' }, [this.segmentsBar, this.playhead, this.scrubber]),
      legend,
    ]);

    this.el = h('section', { class: 'preview card', attrs: { 'aria-label': t('preview.heading') } }, [this.heading, this.bgBar, h('div', { class: 'stage-wrap' }, [this.stage]), this.transport]);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => requestAnimationFrame(() => this.resize())).observe(this.el);
    }
    window.addEventListener('resize', () => this.resize());
  }

  get model(): SceneModel {
    return this.currentModel;
  }

  get currentTime(): number {
    return this.time;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get previewBackground(): PreviewBackground {
    return this.background;
  }

  setPhone(phone: boolean): void {
    if (this.phone === phone) return;
    this.phone = phone;
    this.resize();
  }

  /** Re-measures after fonts loaded. */
  fontsChanged(): void {
    this.measurer = new CanvasTextMeasurer(this.context, this.fontFamily);
    this.currentModel = getSceneModel(this.scene, this.measurer);
    this.updateTransport();
    this.requestRender();
  }

  setScene(scene: Scene, options: { restart?: boolean } = {}): void {
    const sizeChanged = scene.canvas.width !== this.scene.canvas.width || scene.canvas.height !== this.scene.canvas.height;
    this.scene = scene;
    this.currentModel = getSceneModel(scene, this.measurer);
    const timeline = this.currentModel.timeline;
    if (options.restart) {
      this.time = 0;
      this.play();
    } else if (!this.playing) {
      this.time = timeAfterEdit(seekTime(this.time, timeline.duration), timeline);
    } else {
      this.time = seekTime(this.time, timeline.duration);
    }
    if (sizeChanged) this.resize();
    this.updateTransport();
    this.requestRender();
  }

  /** Start-up: show the completed frame, then autoplay (TL-17 / STO-02). */
  start(): void {
    this.time = this.currentModel.timeline.completedTime;
    this.resize();
    this.play();
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
    this.loopSwitch.checked = loop;
  }

  setExit(enabled: boolean, scroll: boolean): void {
    this.exitSwitch.checked = scroll ? true : enabled;
    this.exitSwitch.disabled = scroll;
    this.exitWrap.title = scroll ? t('transport.exitDisabledScroll') : '';
    this.exitWrap.classList.toggle('disabled', scroll);
  }

  setBackground(background: PreviewBackground): void {
    this.background = background === 'image' && !this.image ? 'transparent' : background;
    this.stage.className = `stage bg-${this.background}`;
    this.stage.style.backgroundImage = this.background === 'image' && this.image ? `url("${this.image}")` : '';
    this.stage.title = this.background === 'image' ? `${t('preview.bg.tooltip')} ${t('preview.bg.changeImage')}` : t('preview.bg.tooltip');
    for (const [key, button] of this.bgButtons) button.setAttribute('aria-pressed', String(key === this.background));
  }

  private chooseBackground(background: PreviewBackground): void {
    if (background === 'image' && !this.image) {
      this.imageInput.click();
      return;
    }
    this.setBackground(background);
    this.events.onBackground(this.background);
  }

  private onImagePicked(): void {
    const file = this.imageInput.files?.[0];
    this.imageInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.events.onPickImageError();
      return;
    }
    if (this.image) URL.revokeObjectURL(this.image);
    this.image = URL.createObjectURL(file);
    this.setBackground('image');
    this.events.onBackground('image');
  }

  play(): void {
    const duration = this.currentModel.timeline.duration;
    if (!this.playing) this.time = playbackStartTime(this.time, duration);
    this.playing = true;
    this.lastTick = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame((now) => this.tick(now));
    this.updateTransport();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.updateTransport();
    this.requestRender();
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  restart(): void {
    this.time = 0;
    this.playing = false;
    this.play();
  }

  seek(time: number): void {
    this.pause();
    this.time = seekTime(time, this.currentModel.timeline.duration);
    this.updateTransport();
    this.requestRender();
  }

  private tick(now: number): void {
    if (!this.playing) return;
    const elapsed = Math.min(0.25, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const next = advancePlayback({ time: this.time, playing: true }, elapsed, this.currentModel.timeline.duration, this.loop);
    this.time = next.time;
    this.playing = next.playing;
    this.render();
    this.updateTransport();
    if (this.playing) this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  requestRender(): void {
    this.dirty = true;
    if (!this.playing) requestAnimationFrame(() => {
      if (this.dirty) this.render();
    });
  }

  render(): void {
    this.dirty = false;
    const k = this.canvas.width / this.scene.canvas.width;
    this.context.setTransform(k, 0, 0, k, 0, 0);
    renderModelFrame(this.currentModel, this.time, this.context, { fontFamily: this.fontFamily });
  }

  resize(): void {
    const wrap = this.stage.parentElement;
    if (!wrap) return;
    const available = wrap.clientWidth;
    if (available <= 0) return;
    const height = previewAvailableHeight(window.innerHeight, this.phone);
    const display = previewDisplaySize(this.scene.canvas.width, this.scene.canvas.height, available, height);
    this.stage.style.width = `${display.width}px`;
    this.stage.style.height = `${display.height}px`;
    const internalWidth = previewInternalWidth(display.width, window.devicePixelRatio || 1, this.scene.canvas.width);
    const internalHeight = Math.max(1, Math.round((internalWidth * this.scene.canvas.height) / this.scene.canvas.width));
    if (this.canvas.width !== internalWidth || this.canvas.height !== internalHeight) {
      this.canvas.width = internalWidth;
      this.canvas.height = internalHeight;
    }
    this.render();
  }

  private updateTransport(): void {
    const timeline = this.currentModel.timeline;
    const duration = timeline.duration;
    const state = this.playing ? 'playing' : 'paused';
    if (this.playButton.dataset.state !== state) {
      // Only touch the button when the state changes (replacing children mid-click would swallow the click).
      this.playButton.replaceChildren(icon(this.playing ? 'pause' : 'play'), this.playLabel);
      const label = t(this.playing ? 'transport.pause' : 'transport.play');
      this.playLabel.textContent = label;
      this.playButton.setAttribute('aria-label', label);
      this.playButton.title = label;
      this.playButton.dataset.state = state;
    }
    this.timeReadout.textContent = t('transport.time', { t: this.time.toFixed(2), d: duration.toFixed(2) });
    this.scrubber.max = String(duration);
    if (document.activeElement !== this.scrubber || this.playing) this.scrubber.value = String(this.time);
    this.playhead.style.left = `${duration > 0 ? (this.time / duration) * 100 : 0}%`;
    const segments = playbackSegments(timeline);
    const key = `${duration}|${segments.map((s) => `${s.phase}:${s.start}:${s.end}`).join(',')}`;
    if (key !== this.segmentsKey) {
      this.segmentsKey = key;
      this.segmentsBar.replaceChildren(...segments.filter((s) => s.end > s.start).map((s) => {
        const seg = h('span', { class: `seg ${s.phase}` });
        seg.style.left = `${(s.start / duration) * 100}%`;
        seg.style.width = `${((Math.min(s.end, duration) - s.start) / duration) * 100}%`;
        return seg;
      }));
    }
  }

  setLocked(locked: boolean): void {
    setHidden(this.bgBar, false);
    this.scrubber.disabled = locked;
  }
}
