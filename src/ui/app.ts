import type { SceneModel } from '../core/frame';
import { mergeScene } from '../core/scene';
import type { Scene, SceneMode } from '../core/scene';
import { firstTemplate, getTemplate, relocalizeSample, templateName } from '../templates';
import type { RollSystem, TemplateCategory, TemplateDef } from '../templates';
import type { FieldContext, UpdateOptions } from './controls';
import { AiPanel } from './aiPanel';
import { h, icon, setPressed } from './dom';
import { BottomSheet } from './sheet';
import { ExportPanel } from './exportPanel';
import { runExport } from './exporter';
import type { ExportFailure, ExportKind, ExportResult } from './exporter';
import { FontLoader } from './fonts/loader';
import { formatLargeSize } from './format';
import { MyFontStore } from './fonts/myfonts';
import type { MyFont } from './fonts/catalog';
import { Gallery } from './gallery';
import {
  LANGUAGE_BUTTON_LABEL,
  UI_LANGUAGES,
  applyDocumentLanguage,
  defaultStorage,
  getLanguage,
  loadLanguage,
  modeDescriptionKey,
  modeKey,
  saveLanguage,
  setLanguage,
  t,
} from './i18n';
import type { Lang, StorageLike } from './i18n';
import { LazyRenderer, MiniAnimator, invalidateMiniModels } from './mini';
import { buildModals } from './modals';
import type { ModalId } from './modals';
import { createSaver, loadStateJson, restoreState, saveStateJson } from './persist';
import { Preview } from './preview';
import { GROUP_LABEL, buildSettings } from './settings';
import type { SettingsPanel } from './settings';
import { matchShortcut, nextTabIndex } from './shortcuts';
import { MODES, SETTINGS_GROUPS, activeScene, recordText, repairFonts, resetMode, sceneForTemplate, templateOf, withModeState, withSharedExport } from './state';
import type { AppState, SettingsGroup } from './state';
import { applyTheme, initialTheme, saveTheme } from './theme';
import type { Theme } from './theme';
import { Toaster } from './toast';
import type { ToastAction, ToastKind } from './toast';

/** Application controller: owns the state and wires every UI part together. */

const PHONE_QUERY = '(max-width: 1023.98px)';
const APP_VERSION = '0.1.0';
const APP_DATE = '2026-10-04';

const MODE_ICON = { message: 'message', trailer: 'trailer', 'place-time': 'pin' } as const;
const GROUP_ICON = { text: 'text', font: 'font', motion: 'motion', decoration: 'decoration', layout: 'layout' } as const;

function sameExport(a: Scene, b: Scene): boolean {
  return JSON.stringify({ ...a.export, fileName: '' }) === JSON.stringify({ ...b.export, fileName: '' });
}

export class App {
  state: AppState;
  readonly loader = new FontLoader();
  readonly store: MyFontStore;
  private readonly storage: StorageLike | null;
  private readonly toaster = new Toaster();
  private theme: Theme;
  private readonly saver;
  private storageWarned = false;
  private root!: HTMLElement;
  private preview!: Preview;
  private gallery!: Gallery;
  private settings!: SettingsPanel;
  private exportPanel!: ExportPanel;
  private aiPanel!: AiPanel;
  private sheet!: BottomSheet;
  private modals!: Record<ModalId, HTMLDialogElement>;
  private modeTabs: HTMLButtonElement[] = [];
  private groupTabs: HTMLButtonElement[] = [];
  private headerButtons = new Map<ModalId, HTMLButtonElement>();
  private langButtons: HTMLButtonElement[] = [];
  private themeButton!: HTMLButtonElement;
  private exportToggle!: HTMLButtonElement;
  private fab!: HTMLButtonElement;
  private workspace!: HTMLElement;
  private leftColumn!: HTMLElement;
  private rightColumn!: HTMLElement;
  private header!: HTMLElement;
  private exporting: AbortController | null = null;
  private fontTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly animator = new MiniAnimator(this.loader.fontFamily);
  private readonly lazy = new LazyRenderer();
  private readonly phoneQuery = window.matchMedia(PHONE_QUERY);
  private fontBusy = false;

  readonly ctx: FieldContext = {
    scene: () => activeScene(this.state),
    update: (next, options) => this.update(next, options),
  };

  constructor(private readonly host: HTMLElement) {
    this.storage = defaultStorage();
    const lang = loadLanguage(this.storage);
    setLanguage(lang);
    applyDocumentLanguage(document, lang);
    this.theme = initialTheme(this.storage, window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(document.documentElement, this.theme);
    this.store = new MyFontStore(this.storage);
    this.loader.setMyFonts(this.store.list());
    this.state = restoreState(loadStateJson(this.storage), lang, (family) => this.loader.isKnownFamily(family));
    this.saver = createSaver(() => {
      if (!saveStateJson(this.storage, this.state) && !this.storageWarned) {
        this.storageWarned = true;
        this.toast('warning', t('error.storage'));
      }
    });
    window.addEventListener('pagehide', () => this.saver.flush());
    this.loader.setEvents({
      onLoaded: () => this.onFontsLoaded(),
      onBusy: (busy) => this.setFontBusy(busy),
      onFailed: (family) => this.toast('warning', t('toast.fontFallback', { name: family })),
    });
    this.store.onChange(() => this.loader.setMyFonts(this.store.list()));
    window.addEventListener('keydown', (event) => this.onKey(event), true);
    this.phoneQuery.addEventListener('change', () => this.applyPhone());
  }

  start(): void {
    this.mount();
    this.preview.start();
    void this.loader.ensureScene(this.scene);
    const before = new Set(this.store.list().map((font) => font.family));
    void this.store.restore().then(() => {
      const after = new Set(this.store.list().map((font) => font.family));
      for (const family of before) if (!after.has(family)) this.repairAllFonts();
      this.syncUi();
    });
  }

  get scene(): Scene {
    return activeScene(this.state);
  }

  get model(): SceneModel {
    return this.preview.model;
  }

  get previewTime(): { time: number; playing: boolean } {
    return { time: this.preview.currentTime, playing: this.preview.isPlaying };
  }

  toast(kind: ToastKind, message: string, action?: ToastAction): void {
    this.toaster.show(kind, message, action);
  }

  // ── building the DOM ──

  private mount(): void {
    const scene = this.scene;
    this.preview = new Preview(scene, this.loader.fontFamily, {
      onBackground: (background) => this.setState({ ...this.state, previewBackground: background }),
      onLoopChange: (loop) => this.setState({ ...this.state, loopPlayback: loop }),
      onExitChange: (enabled) => this.update(mergeScene(this.scene, { motion: { exitEnabled: enabled } })),
      onPickImageError: () => this.toast('error', t('error.imageLoad')),
    });
    this.preview.setLoop(this.state.loopPlayback);
    this.preview.setBackground(this.state.previewBackground);
    this.preview.fontStatus.textContent = this.fontBusy ? t('font.loading') : '';

    this.gallery = new Gallery({
      fontFamily: this.loader.fontFamily,
      animator: this.animator,
      lazy: this.lazy,
      ensureFonts: (s) => this.loader.ensureScene(s, false),
      onPick: (template) => this.applyTemplate(template),
      onCategory: (category) => this.selectCategory(category),
      onSystem: (system) => this.selectSystem(system),
      onReset: () => this.resetCurrentMode(),
    });

    this.settings = buildSettings({
      ctx: this.ctx,
      model: () => this.preview.model,
      fonts: {
        store: this.store,
        fontFamily: this.loader.fontFamily,
        weightsOf: (family) => this.loader.weightsOf(family),
        toast: (kind, message) => this.toast(kind, message),
        onRemoved: (font) => this.onFontRemoved(font),
      },
      cards: {
        fontFamily: this.loader.fontFamily,
        animator: this.animator,
        lazy: this.lazy,
        ensureFonts: (s) => this.loader.ensureScene(s, false),
      },
      toast: (kind, message) => this.toast(kind, message),
      restart: () => this.preview.restart(),
      onExitToggled: () => {},
    });

    this.exportPanel = new ExportPanel(this.ctx, {
      onExport: (kind) => void this.startExport(kind),
      onCancel: () => this.exporting?.abort(),
      onClose: () => this.setExportOpen(false),
      onOpenNotes: () => this.openModal('notes'),
    });

    this.aiPanel = new AiPanel({
      state: () => this.state,
      apply: (state) => this.applyAiState(state),
      knownFont: (family) => this.loader.isKnownFamily(family),
      busy: () => this.exporting !== null,
    }, this.storage);

    this.modals = buildModals((id) => this.headerButtons.get(id)?.setAttribute('aria-expanded', 'false'));

    this.header = this.buildHeader();
    const modeTablist = this.buildModeTabs();
    this.leftColumn = h('div', { class: 'col col-left' }, [modeTablist, this.gallery.el]);
    const rail = this.buildRail();
    const settingsBody = h('div', { class: 'settings-scroll', attrs: { 'data-testid': 'settings' } }, [this.settings.el]);
    this.rightColumn = h('div', { class: 'col col-right sheet', attrs: { 'data-testid': 'settings-column' } });
    const sheetBody = h('div', { class: 'sheet-body' }, [rail, settingsBody]);
    this.sheet = new BottomSheet(this.rightColumn, sheetBody, () => ({
      header: this.header.getBoundingClientRect().bottom,
      previewBottom: this.preview.transport.getBoundingClientRect().bottom,
    }), () => window.scrollTo({ top: 0 }));
    this.rightColumn.append(this.sheet.band, sheetBody);
    const center = h('div', { class: 'col col-center' }, [this.preview.el]);
    const aiColumn = h('div', { class: 'col col-ai' }, [this.aiPanel.el]);
    this.workspace = h('main', { class: 'workspace', id: 'main', attrs: { tabindex: -1 } }, [this.leftColumn, center, this.rightColumn, aiColumn]);
    const footer = this.buildFooter();
    this.fab = h('button', { class: 'fab btn primary', attrs: { type: 'button', 'data-testid': 'fab-export', 'aria-controls': 'export-panel' } }, [icon('export'), t('header.export')]);
    this.fab.addEventListener('click', () => this.setExportOpen(!this.exportPanel.open));
    const backdrop = h('div', { class: 'backdrop', attrs: { 'data-testid': 'export-backdrop' } });
    backdrop.addEventListener('click', () => this.setExportOpen(false));
    this.root = h('div', { class: 'app' }, [
      h('a', { class: 'skip-link', attrs: { href: '#main' }, text: t('app.skipToMain') }),
      this.header,
      this.workspace,
      footer,
      backdrop,
      this.exportPanel.el,
      this.fab,
      this.toaster.el,
      ...Object.values(this.modals),
    ]);
    this.host.replaceChildren(this.root);
    this.selectGroup(this.state.group, false);
    this.applyPhone();
    this.syncUi();
  }

  private buildHeader(): HTMLElement {
    const logo = h('span', { class: 'logo', attrs: { 'aria-hidden': 'true' } }, [h('span', { text: '文' }), h('span', { text: 'M' })]);
    const title = h('div', { class: 'brand' }, [
      h('h1', { class: 'brand-name' }, [t('app.name'), h('span', { class: 'brand-sub', text: t('app.subtitle') })]),
      h('p', { class: 'brand-tagline', text: t('app.tagline') }),
    ]);
    const version = h('span', { class: 'version muted', text: t('app.version', { version: APP_VERSION, date: APP_DATE }) });
    const langGroup = h('div', { class: 'segment lang', attrs: { role: 'group', 'aria-label': t('header.language') } });
    this.langButtons = UI_LANGUAGES.map((lang) => {
      const button = h('button', { class: 'chip', attrs: { type: 'button', lang, 'data-lang': lang, title: t(`lang.${lang}`), 'aria-label': t(`lang.${lang}`) }, text: LANGUAGE_BUTTON_LABEL[lang] });
      button.addEventListener('click', () => this.changeLanguage(lang));
      langGroup.append(button);
      return button;
    });
    this.themeButton = h('button', { class: 'icon-btn theme-toggle', attrs: { type: 'button', 'data-testid': 'theme-toggle' } });
    this.themeButton.addEventListener('click', () => this.toggleTheme());
    const modalButton = (id: ModalId, label: 'header.help' | 'header.notes' | 'header.shortcuts', iconName: 'help' | 'info' | 'keyboard') => {
      const button = h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': t(label), title: t(label), 'aria-expanded': 'false', 'aria-controls': `modal-${id}`, 'data-testid': `open-${id}` } }, [icon(iconName)]);
      button.addEventListener('click', () => this.openModal(id));
      this.headerButtons.set(id, button);
      return button;
    };
    this.exportToggle = h('button', { class: 'btn primary export-toggle', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'export-panel', 'data-testid': 'open-export' } }, [icon('export'), t('header.export')]);
    this.exportToggle.addEventListener('click', () => this.setExportOpen(!this.exportPanel.open));
    return h('header', { class: 'topbar' }, [
      logo,
      title,
      version,
      h('span', { class: 'spacer' }),
      h('div', { class: 'topbar-actions' }, [
        langGroup,
        this.themeButton,
        modalButton('help', 'header.help', 'help'),
        modalButton('notes', 'header.notes', 'info'),
        modalButton('shortcuts', 'header.shortcuts', 'keyboard'),
        this.exportToggle,
      ]),
    ]);
  }

  private buildModeTabs(): HTMLElement {
    const list = h('div', { class: 'mode-tabs', attrs: { role: 'tablist', 'aria-label': t('mode.tablist'), 'data-testid': 'mode-tabs' } });
    this.modeTabs = MODES.map((mode, index) => {
      const button = h('button', {
        class: 'mode-tab',
        id: `mode-${mode}`,
        attrs: { type: 'button', role: 'tab', 'data-mode': mode, 'aria-selected': 'false', 'aria-controls': 'main' },
      }, [icon(MODE_ICON[mode]), h('span', { class: 'mode-name', text: t(modeKey(mode)) }), h('span', { class: 'mode-desc', text: t(modeDescriptionKey(mode)) })]);
      button.addEventListener('click', () => this.switchMode(mode));
      button.addEventListener('keydown', (event) => {
        const next = nextTabIndex(event.key, index, MODES.length);
        if (next === null || event.key === 'ArrowUp' || event.key === 'ArrowDown') return;
        event.preventDefault();
        this.switchMode(MODES[next]!);
        this.modeTabs[next]?.focus();
      });
      list.append(button);
      return button;
    });
    return list;
  }

  private buildRail(): HTMLElement {
    const rail = h('div', { class: 'rail', attrs: { role: 'tablist', 'aria-label': t('settings.rail'), 'aria-orientation': 'vertical', 'data-testid': 'settings-tabs' } });
    this.groupTabs = SETTINGS_GROUPS.map((group, index) => {
      const button = h('button', {
        class: 'rail-tab',
        id: `tab-${group}`,
        attrs: { type: 'button', role: 'tab', 'data-group': group, 'aria-controls': `group-${group}`, 'aria-selected': 'false' },
      }, [icon(GROUP_ICON[group]), h('span', { text: t(GROUP_LABEL[group]) })]);
      button.addEventListener('click', () => this.selectGroup(group, true));
      button.addEventListener('keydown', (event) => {
        const next = nextTabIndex(event.key, index, SETTINGS_GROUPS.length);
        if (next === null) return;
        event.preventDefault();
        this.selectGroup(SETTINGS_GROUPS[next]!, true);
        this.groupTabs[next]?.focus();
      });
      rail.append(button);
      return button;
    });
    return rail;
  }

  private buildFooter(): HTMLElement {
    const notes = h('button', { class: 'link-btn', attrs: { type: 'button', 'data-testid': 'footer-notes' }, text: t('footer.openNotes') });
    notes.addEventListener('click', () => this.openModal('notes'));
    return h('footer', { class: 'footer' }, [h('p', { text: t('footer.local') }), notes, h('p', { class: 'muted', text: `© 2026 ${t('app.name')}` })]);
  }

  // ── sync ──

  private syncUi(): void {
    const scene = this.scene;
    const template = templateOf(this.state);
    this.settings.sync(scene);
    this.exportPanel.sync(scene, this.preview.model.timeline.duration);
    this.preview.setExit(scene.motion.exitEnabled, scene.mode === 'trailer' && scene.motion.trailer.flow === 'scroll');
    this.gallery.update(this.state.mode, template);
    this.modeTabs.forEach((button, index) => {
      const selected = MODES[index] === this.state.mode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    const lang = getLanguage();
    this.langButtons.forEach((button) => setPressed(button, button.dataset.lang === lang));
    const toDark = this.theme === 'light';
    const themeLabel = `${t(toDark ? 'header.theme.currentLight' : 'header.theme.currentDark')} — ${t(toDark ? 'header.theme.toDark' : 'header.theme.toLight')}`;
    if (this.themeButton.dataset.theme !== this.theme || this.themeButton.getAttribute('aria-label') !== themeLabel) {
      this.themeButton.replaceChildren(icon(toDark ? 'sun' : 'moon'), h('span', { class: 'theme-knob', attrs: { 'aria-hidden': 'true' } }));
      this.themeButton.setAttribute('aria-label', themeLabel);
      this.themeButton.title = themeLabel;
      this.themeButton.dataset.theme = this.theme;
    }
    this.sheet.setSummary(t('sheet.summary', { mode: t(modeKey(this.state.mode)), template: templateName(template, lang) }));
  }

  private setState(state: AppState): void {
    this.state = state;
    this.saver.schedule();
  }

  // ── scene updates ──

  update(next: Scene, options: UpdateOptions = {}): void {
    if (this.exporting) return;
    const previous = this.scene;
    if (next === previous) return;
    const mode = this.state.mode;
    let state = withModeState(this.state, mode, { scene: next });
    if (!sameExport(previous, next)) {
      for (const other of MODES) if (other !== mode) state = withModeState(state, other, { scene: withSharedExport(state.modes[other].scene, next) });
    }
    if (options.textEdit) state = { ...state, memory: recordText(state.memory, mode, templateOf(state), next.text) };
    this.setState(state);
    if (previous.motion.exitEnabled && !next.motion.exitEnabled && next.export.loop.kind === 'forever') {
      this.toast('info', t('toast.exitOffLoop'), {
        label: t('toast.exitOffLoopAction'),
        run: () => this.update({ ...this.scene, export: { ...this.scene.export, loop: { kind: 'once' } } }),
      });
    }
    this.preview.setScene(next, { restart: options.restart });
    this.syncUi();
    this.requestFonts(options.textEdit === true);
  }

  private requestFonts(debounced: boolean): void {
    clearTimeout(this.fontTimer);
    if (debounced) this.fontTimer = setTimeout(() => void this.loader.ensureScene(this.scene), 250);
    else void this.loader.ensureScene(this.scene);
  }

  private onFontsLoaded(): void {
    invalidateMiniModels();
    if (!this.preview) return;
    this.preview.fontsChanged();
    this.gallery.redraw();
    this.settings.redrawMinis();
    this.syncUi();
  }

  private setFontBusy(busy: boolean): void {
    this.fontBusy = busy;
    if (this.preview) this.preview.fontStatus.textContent = busy ? t('font.loading') : '';
  }

  private onFontRemoved(font: MyFont): void {
    void font;
    this.repairAllFonts();
  }

  private repairAllFonts(): void {
    this.loader.setMyFonts(this.store.list());
    let state = this.state;
    for (const mode of MODES) state = withModeState(state, mode, { scene: repairFonts(state.modes[mode].scene, (family) => this.loader.isKnownFamily(family)) });
    this.setState(state);
    if (this.preview) {
      this.preview.setScene(this.scene);
      this.syncUi();
      this.requestFonts(false);
    }
  }

  /** Replaces the whole state with one produced by the AI assistant (or its undo). */
  private applyAiState(state: AppState): void {
    if (this.exporting) return;
    this.setState(state);
    this.preview.setScene(this.scene, { restart: true });
    this.syncUi();
    this.requestFonts(false);
  }

  // ── templates & modes ──

  applyTemplate(template: TemplateDef): void {
    if (this.exporting) return;
    let state = this.state;
    if (template.mode !== state.mode) state = { ...state, mode: template.mode, modes: { ...state.modes, [template.mode]: { ...state.modes[template.mode], scene: withSharedExport(state.modes[template.mode].scene, this.scene) } } };
    const scene = sceneForTemplate(state, template, getLanguage());
    state = withModeState(state, template.mode, { scene, templateId: template.id });
    for (const other of MODES) if (other !== template.mode) state = withModeState(state, other, { scene: withSharedExport(state.modes[other].scene, scene) });
    this.setState(state);
    this.preview.setScene(scene, { restart: true });
    this.syncUi();
    this.requestFonts(false);
    this.toast('success', t('toast.templateApplied', { name: templateName(template, getLanguage()) }));
  }

  switchMode(mode: SceneMode): void {
    if (this.exporting || mode === this.state.mode) return;
    const shared = withSharedExport(this.state.modes[mode].scene, this.scene);
    this.setState(withModeState({ ...this.state, mode }, mode, { scene: shared }));
    this.preview.setScene(shared, { restart: true });
    this.syncUi();
    this.requestFonts(false);
  }

  private selectCategory(category: TemplateCategory): void {
    if (this.exporting || templateOf(this.state).category === category) return;
    this.applyTemplate(firstTemplate('message', category));
  }

  private selectSystem(system: RollSystem): void {
    const current = templateOf(this.state);
    if (this.exporting || current.system === system) return;
    this.applyTemplate(firstTemplate('message', current.category, system));
  }

  private resetCurrentMode(): void {
    if (this.exporting) return;
    if (!window.confirm(t('template.resetConfirm'))) return;
    const mode = this.state.mode;
    this.setState(resetMode(this.state, mode, getLanguage()));
    this.preview.setScene(this.scene, { restart: true });
    this.syncUi();
    this.requestFonts(false);
    this.toast('success', t('toast.modeReset', { mode: t(modeKey(mode)) }));
  }

  selectGroup(group: SettingsGroup, save: boolean): void {
    if (save && group !== this.state.group) this.setState({ ...this.state, group });
    this.groupTabs.forEach((button, index) => {
      const selected = SETTINGS_GROUPS[index] === group;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    for (const [key, el] of Object.entries(this.settings.groups)) el.hidden = key !== group;
  }

  // ── language / theme ──

  changeLanguage(lang: Lang): void {
    if (this.exporting || lang === getLanguage()) return;
    setLanguage(lang);
    saveLanguage(lang, this.storage);
    applyDocumentLanguage(document, lang);
    let state = this.state;
    let restart = false;
    for (const mode of MODES) {
      const template = getTemplate(state.modes[mode].templateId);
      if (!template) continue;
      const scene = relocalizeSample(state.modes[mode].scene, template, lang);
      if (scene !== state.modes[mode].scene) {
        state = withModeState(state, mode, { scene });
        if (mode === state.mode) restart = true;
      }
    }
    this.setState(state);
    const wasOpen = this.exportPanel.open;
    const playing = this.preview.isPlaying;
    const time = this.preview.currentTime;
    const focusedLang = document.activeElement instanceof HTMLElement && document.activeElement.dataset.lang;
    this.animator.stop();
    this.mount();
    if (restart) this.preview.restart();
    else {
      this.preview.seek(time);
      if (playing) this.preview.play();
    }
    if (wasOpen) this.setExportOpen(true);
    if (focusedLang) this.root.querySelector<HTMLElement>(`[data-lang="${lang}"]`)?.focus();
    this.requestFonts(false);
  }

  toggleTheme(): void {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    applyTheme(document.documentElement, this.theme);
    saveTheme(this.storage, this.theme);
    this.syncUi();
  }

  // ── modals / panels ──

  openModal(id: ModalId): void {
    for (const [key, dialog] of Object.entries(this.modals) as [ModalId, HTMLDialogElement][]) {
      if (key !== id && dialog.open) dialog.close();
    }
    const dialog = this.modals[id];
    if (!dialog.open) dialog.showModal();
    this.headerButtons.get(id)?.setAttribute('aria-expanded', 'true');
    if (this.sheet.current !== 'closed' && this.phoneQuery.matches) this.sheet.setStop('closed');
  }

  private closeModals(): boolean {
    let closed = false;
    for (const dialog of Object.values(this.modals)) {
      if (dialog.open) {
        dialog.close();
        closed = true;
      }
    }
    return closed;
  }

  setExportOpen(open: boolean): void {
    if (!open && this.exporting) return;
    this.exportPanel.el.hidden = !open;
    this.root.classList.toggle('export-open', open);
    this.exportToggle.setAttribute('aria-expanded', String(open));
    this.fab.setAttribute('aria-expanded', String(open));
    if (open) {
      if (this.phoneQuery.matches) this.sheet.setStop('closed');
      this.exportPanel.focusFirst();
    } else if (document.activeElement && this.exportPanel.el.contains(document.activeElement)) {
      (this.phoneQuery.matches ? this.fab : this.exportToggle).focus();
    }
  }

  private applyPhone(): void {
    const phone = this.phoneQuery.matches;
    this.root?.classList.toggle('is-phone', phone);
    this.sheet?.setActive(phone);
    this.preview?.setPhone(phone);
  }

  // ── keyboard ──

  private onKey(event: KeyboardEvent): void {
    const action = matchShortcut(event);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      switch (action) {
        case 'play-pause':
          this.preview.togglePlay();
          break;
        case 'export-apng':
          void this.startExport('apng');
          break;
        case 'export-png':
          void this.startExport('png');
          break;
        case 'toggle-theme':
          this.toggleTheme();
          break;
        case 'mode-message':
          this.switchMode('message');
          break;
        case 'mode-trailer':
          this.switchMode('trailer');
          break;
        case 'mode-place-time':
          this.switchMode('place-time');
          break;
      }
      return;
    }
    if (event.key !== 'Escape') return;
    if (this.closeModals()) {
      event.preventDefault();
      return;
    }
    if (this.exportPanel.open && !this.exporting) {
      event.preventDefault();
      this.setExportOpen(false);
      return;
    }
    if (this.preview.isPlaying) {
      event.preventDefault();
      this.preview.pause();
    }
  }

  // ── export ──

  private setLocked(locked: boolean): void {
    this.root.classList.toggle('is-exporting', locked);
    this.leftColumn.inert = locked;
    this.rightColumn.inert = locked;
    this.preview.setLocked(locked);
  }

  private failureText(failure: ExportFailure): string {
    switch (failure.reason) {
      case 'empty':
        return t('error.emptyText');
      case 'unsupported':
        return t('error.unsupported');
      case 'frame-limit':
        return t('error.frameLimit', { n: failure.frames, max: 1800 });
      case 'work-limit':
        return t('error.workLimit');
      case 'size-limit':
        return t('error.movSize', { size: formatLargeSize(failure.estimate, getLanguage()), max: formatLargeSize(failure.max, getLanguage()) });
      case 'cancelled':
        return t('status.cancelled');
      case 'error':
        return t('error.generic');
    }
  }

  /** Runs an export without touching the UI (test hook). */
  exportQuiet(kind: ExportKind): Promise<ExportResult> {
    return runExport({
      scene: this.scene,
      kind,
      fontFamily: this.loader.fontFamily,
      previewTime: this.preview.currentTime,
      previewPlaying: this.preview.isPlaying,
      candidateName: this.exportPanel.candidateName,
      waitForFonts: () => this.fontsReady(),
    });
  }

  async fontsReady(): Promise<boolean> {
    const ok = await this.loader.ensureScene(this.scene);
    await this.loader.whenIdle();
    return ok;
  }

  async startExport(kind: ExportKind): Promise<void> {
    if (this.exporting) return;
    const scene = this.scene;
    if (!this.exportPanel.open) this.setExportOpen(true);
    const wasPlaying = this.preview.isPlaying;
    const time = this.preview.currentTime;
    this.preview.pause();
    this.exportPanel.clearResult(true);
    const controller = new AbortController();
    this.exporting = controller;
    this.setLocked(true);
    this.exportPanel.setBusy(true, kind);
    this.exportPanel.setProgress(0, t('progress.fonts'), kind !== 'png');
    try {
      const result = await runExport({
        scene,
        kind,
        fontFamily: this.loader.fontFamily,
        previewTime: time,
        previewPlaying: wasPlaying,
        candidateName: this.exportPanel.candidateName,
        waitForFonts: () => this.fontsReady(),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!('current' in progress)) {
            if (progress.phase === 'fonts') this.exportPanel.setProgress(0, t('progress.fonts'), kind !== 'png');
            else this.exportPanel.setProgress(progress.percent, t('progress.still'), false);
          } else {
            const text = kind === 'zip'
              ? t('progress.zip', { i: progress.current, n: progress.total })
              : kind === 'mov'
                ? t('progress.mov', { i: progress.current, n: progress.total })
                : t(progress.phase === 'analyze' ? 'progress.analyze' : 'progress.encode', { i: progress.current, n: progress.total });
            this.exportPanel.setProgress(progress.percent, text, true);
          }
        },
      });
      if (result.ok) {
        const url = this.exportPanel.showResult(result.output, scene);
        // APNG and .mov are downloaded from the result panel; PNG / ZIP start automatically.
        if (kind !== 'apng' && kind !== 'mov') this.triggerDownload(url, result.output.fileName);
        this.exportPanel.setStatus(t('status.done'));
        this.toast('success', t('toast.exported'));
      } else {
        const text = this.failureText(result.failure);
        this.exportPanel.setStatus(result.failure.reason === 'empty' ? '' : text);
        if (result.failure.reason === 'cancelled') this.toast('info', t('toast.cancelled'));
        else if (result.failure.reason === 'empty') this.toast('warning', text);
        else this.toast('error', text);
      }
    } finally {
      this.exporting = null;
      this.exportPanel.setBusy(false);
      this.setLocked(false);
    }
  }

  private triggerDownload(url: string, name: string): void {
    const anchor = h('a', { attrs: { href: url, download: name, hidden: true } });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }
}
