import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultScene, mergeScene } from '../../src/core/scene';
import type { Scene } from '../../src/core/scene';
import { firstTemplate, getTemplate, templateSample } from '../../src/templates';
import {
  FONT_CATALOG,
  catalogByCategory,
  containsHangul,
  fallbackChain,
  familiesToLoad,
  googleFontsUrl,
  hangulFallback,
  snapWeight,
} from '../../src/ui/fonts/catalog';
import type { MyFont } from '../../src/ui/fonts/catalog';
import { fontDisplayName, isFontFileName, localFontExists, parseMyFontList } from '../../src/ui/fonts/myfonts';
import {
  SIZE_WARNING_BYTES,
  fileNameCandidate,
  formatSize,
  infoLine,
  loopLabel,
  manualFileName,
  previewAvailableHeight,
  previewDisplaySize,
  previewInternalWidth,
  roundToStep,
} from '../../src/ui/format';
import type { StorageLike } from '../../src/ui/i18n';
import { STATE_VERSION, createSaver, loadStateJson, restoreState, saveStateJson, serializeState } from '../../src/ui/persist';
import { settleStop, tapStop, halfHeight } from '../../src/ui/sheetMath';
import { matchShortcut, nextTabIndex, shortcutRows } from '../../src/ui/shortcuts';
import {
  EMPTY_MEMORY,
  createInitialState,
  recordText,
  rememberedText,
  repairFonts,
  resetMode,
  sceneForTemplate,
  withModeState,
  withSharedExport,
} from '../../src/ui/state';
import { initialTheme, saveTheme } from '../../src/ui/theme';
import { toastDuration } from '../../src/ui/toast';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => (key in data ? data[key]! : null), setItem: (key, value) => { data[key] = value; } };
}
const throwing: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
const knownAll = () => true;

describe('FNT-01 font catalogue', () => {
  it('has 88 fonts in the specified categories', () => {
    expect(FONT_CATALOG).toHaveLength(88);
    const count = (c: string) => FONT_CATALOG.filter((f) => f.category === c).length;
    expect([count('gothic'), count('mincho'), count('rounded'), count('design'), count('brush'), count('korean'), count('latin')]).toEqual([7, 9, 7, 12, 7, 21, 25]);
    expect(new Set(FONT_CATALOG.map((f) => f.family)).size).toBe(88);
    expect(FONT_CATALOG.find((f) => f.family === 'Noto Serif JP')?.weights).toEqual([400, 700, 900]);
  });
  it('filters the picker by category ("欧文" shows only latin fonts)', () => {
    const latin = catalogByCategory('latin');
    expect(latin).toHaveLength(25);
    expect(latin.every((f) => f.category === 'latin')).toBe(true);
    expect(catalogByCategory('all')).toHaveLength(88);
    expect(catalogByCategory('mine')).toHaveLength(0);
  });
  it('gives latin and korean fonts a Japanese substitute', () => {
    for (const font of FONT_CATALOG.filter((f) => f.category === 'latin' || f.category === 'korean')) expect(font.jpFallback, font.family).toBeTruthy();
  });
});

describe('FNT-02 Google Fonts URL', () => {
  it('requests every weight with display=swap, and a text subset for samples', () => {
    expect(googleFontsUrl('Noto Serif JP', [400, 700, 900])).toBe('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;900&display=swap');
    expect(googleFontsUrl('Stick', [400])).toBe('https://fonts.googleapis.com/css2?family=Stick&display=swap');
    expect(googleFontsUrl('Cinzel', [700], 'Aa')).toContain('&text=Aa');
  });
});

describe('FNT-03 fallback chain', () => {
  it('chains font → Japanese substitute → Hangul substitute → generic, quoting names', () => {
    expect(fallbackChain('Cinzel', undefined)).toBe('"Cinzel", "Shippori Mincho", "Noto Serif KR", serif');
    expect(fallbackChain('Noto Sans KR', undefined)).toBe('"Noto Sans KR", "Noto Sans JP", sans-serif');
  });
  it('adds Noto Sans JP after registered fonts', () => {
    const mine: MyFont = { id: 'a', family: 'MojiMotion User a', name: 'Mine', size: 1, kind: 'file' };
    expect(fallbackChain(mine.family, mine)).toBe('"MojiMotion User a", "Noto Sans JP", "Noto Sans KR", sans-serif');
  });
});

describe('FNT-04 Hangul substitutes', () => {
  it('maps categories and overrides; none for korean fonts', () => {
    expect(hangulFallback('Noto Serif JP')).toBe('Noto Serif KR');
    expect(hangulFallback('Noto Sans JP')).toBe('Noto Sans KR');
    expect(hangulFallback('Zen Maru Gothic')).toBe('Gowun Dodum');
    expect(hangulFallback('Share Tech Mono')).toBe('Nanum Gothic Coding');
    expect(hangulFallback('Jua')).toBeUndefined();
  });
  it('loads the Hangul substitute only when the text contains Hangul', () => {
    expect(containsHangul('안녕')).toBe(true);
    expect(containsHangul('戦闘')).toBe(false);
    expect(familiesToLoad('Noto Serif JP', '戦闘', undefined)).toEqual(['Noto Serif JP']);
    expect(familiesToLoad('Noto Serif JP', '안녕', undefined)).toEqual(['Noto Serif JP', 'Noto Serif KR']);
    expect(familiesToLoad('Cinzel', 'Hi', undefined)).toEqual(['Cinzel', 'Shippori Mincho']);
  });
});

describe('FNT-05 weight snapping', () => {
  it('picks the nearest weight, earlier entry on ties', () => {
    expect(snapWeight(900, [400, 700, 800])).toBe(800);
    expect(snapWeight(700, [400])).toBe(400);
    expect(snapWeight(550, [400, 500, 600])).toBe(500);
    expect(snapWeight(550, [600, 500])).toBe(600);
  });
});

describe('FNT-07 / FNT-08 / STO-04 registered fonts', () => {
  it('derives the display name and accepts TTF/OTF/WOFF/WOFF2 only', () => {
    expect(fontDisplayName('MyFont-Bold.ttf')).toBe('MyFont-Bold');
    expect(isFontFileName('a.woff2')).toBe(true);
    expect(isFontFileName('a.otf')).toBe(true);
    expect(isFontFileName('a.png')).toBe(false);
  });
  it('parses the saved list and ignores junk', () => {
    const list = parseMyFontList(JSON.stringify([{ id: 'x', family: 'F', name: 'N', size: 3, kind: 'file' }, { bad: true }, 5]));
    expect(list).toEqual([{ id: 'x', family: 'F', name: 'N', size: 3, kind: 'file' }]);
    expect(parseMyFontList('{broken')).toEqual([]);
    expect(parseMyFontList(null)).toEqual([]);
  });
  it('detects a local font by a width difference against any generic family', () => {
    const widths: Record<string, number> = { '72px monospace': 500, '72px serif': 480, '72px sans-serif': 470 };
    const present = (font: string) => widths[font] ?? (font.includes('Real') ? 520 : widths[`72px ${font.split(', ')[1]}`]!);
    const absent = (font: string) => widths[font] ?? widths[`72px ${font.split(', ')[1]}`]!;
    expect(localFontExists('Real Font', present)).toBe(true);
    expect(localFontExists('Nope', absent)).toBe(false);
    expect(localFontExists('', present)).toBe(false);
  });
});

describe('KEY-01 shortcuts', () => {
  const key = (code: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('needs Shift plus Cmd/Ctrl/Alt and matches physical key codes', () => {
    expect(matchShortcut(key('Digit2', { shiftKey: true, ctrlKey: true }))).toBe('mode-trailer');
    expect(matchShortcut(key('KeyP', { shiftKey: true, metaKey: true }))).toBe('play-pause');
    expect(matchShortcut(key('KeyE', { shiftKey: true, altKey: true }))).toBe('export-apng');
    expect(matchShortcut(key('KeyK', { shiftKey: true, ctrlKey: true }))).toBe('export-png');
    expect(matchShortcut(key('KeyT', { shiftKey: true, ctrlKey: true }))).toBe('toggle-theme');
    expect(matchShortcut(key('KeyP', { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(key('KeyP', { shiftKey: true }))).toBeNull();
  });
  it('lists the shortcut table rows', () => {
    expect(shortcutRows('Ctrl').map((r) => r.action)).toEqual(['playPause', 'exportApng', 'exportPng', 'theme', 'modes', 'esc']);
  });
});

describe('KEY-02 tab keyboard navigation', () => {
  it('wraps with arrows and jumps with Home/End', () => {
    expect(nextTabIndex('ArrowRight', 4, 5)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
    expect(nextTabIndex('a', 0, 3)).toBeNull();
  });
});

describe('UI-19 bottom sheet snapping', () => {
  const heights = { closed: 56, half: 400, full: 780 };
  it('settles on the nearest stop, or the next stop on a fast fling', () => {
    expect(settleStop(380, 0, heights)).toBe('half');
    expect(settleStop(120, 0, heights)).toBe('closed');
    expect(settleStop(120, 0.6, heights)).toBe('half');
    expect(settleStop(420, 0.6, heights)).toBe('full');
    expect(settleStop(700, -0.6, heights)).toBe('half');
  });
  it('toggles closed ⇔ half on tap and keeps the half height within 36〜72 %', () => {
    expect(tapStop('closed')).toBe('half');
    expect(tapStop('half')).toBe('closed');
    expect(halfHeight(1000, 100)).toBe(720);
    expect(halfHeight(1000, 900)).toBe(360);
  });
});

describe('UI-11 preview size', () => {
  it('fits the scene aspect ratio inside the available box', () => {
    expect(previewDisplaySize(1280, 720, 640, 620)).toEqual({ width: 640, height: 360 });
    const portrait = previewDisplaySize(720, 1280, 640, 540);
    expect(portrait.height).toBeLessThanOrEqual(540);
    expect(portrait.width).toBeLessThan(portrait.height);
  });
  it('uses min(0.6 vh, 620) on wide screens and 0.32 vh on phones', () => {
    expect(previewAvailableHeight(900, false)).toBe(540);
    expect(previewAvailableHeight(1400, false)).toBe(620);
    expect(previewAvailableHeight(200, false)).toBe(160);
    expect(previewAvailableHeight(844, true)).toBeCloseTo(270.08);
    expect(previewInternalWidth(640, 3, 1280)).toBe(1280);
    expect(previewInternalWidth(640, 1, 1280)).toBe(640);
    expect(previewInternalWidth(640, 2, 800)).toBe(800);
  });
});

describe('UI-05 / UI-17 / EXP-17 / EXP-22 / EXP-26 display helpers', () => {
  it('rounds slider values to the step decimals', () => {
    expect(roundToStep(0.123456, 0.05)).toBe(0.1);
    expect(roundToStep(12.6, 1)).toBe(13);
    expect(roundToStep(-0.204, 0.01)).toBe(-0.2);
  });
  it('formats sizes (MB with two decimals, KB rounded, minimum 1)', () => {
    expect(formatSize(5 * 1024 * 1024, 'ja')).toBe('5.00 MB');
    expect(formatSize(1536, 'en')).toBe('2 KB');
    expect(formatSize(10, 'ja')).toBe('1 KB');
    expect(SIZE_WARNING_BYTES).toBe(5242880);
  });
  it('shows the info line "W × H ・ D秒 ・ fFPS ・ Nフレーム"', () => {
    const scene = createDefaultScene('message');
    expect(infoLine(scene, 2.5, 'ja')).toBe('1280 × 720 ・ 2.50秒 ・ 24FPS ・ 60フレーム');
    expect(infoLine({ ...scene, export: { ...scene.export, fps: 60 } }, 2.5, 'ja')).toContain('150');
  });
  it('builds the file name candidate from text, motion, exit and loop', () => {
    const base = mergeScene(createDefaultScene('message'), { text: { main: '戦闘開始' }, motion: { enter: { id: 'FX-I03' } } });
    expect(fileNameCandidate(base, 'ja')).toBe('戦闘開始_降りてくる');
    expect(fileNameCandidate(mergeScene(base, { export: { loop: { kind: 'forever' } } }), 'ja')).toBe('戦闘開始_降りてくる_ループ');
    expect(fileNameCandidate(mergeScene(base, { motion: { exitEnabled: false } }), 'ja')).toBe('戦闘開始_降りてくる_退場なし');
    expect(manualFileName('戦闘開始_降りてくる', '戦闘開始_降りてくる')).toBe('');
    expect(manualFileName('  ', 'x')).toBe('');
    expect(manualFileName('mine', 'x')).toBe('mine');
  });
  it('labels loops', () => {
    const scene = createDefaultScene('message');
    expect(loopLabel(scene, 'ja')).toBe('1回再生');
    expect(loopLabel(mergeScene(scene, { export: { loop: { kind: 'count', count: 4 } } }), 'ja')).toBe('4回ループ');
    expect(loopLabel(mergeScene(scene, { export: { loop: { kind: 'forever' } } }), 'en')).toBeTruthy();
  });
  it('keeps toast durations between 2.2 and 8 seconds', () => {
    expect(toastDuration('info', 'short', false)).toBe(2200);
    expect(toastDuration('error', 'x', false)).toBe(6000);
    expect(toastDuration('info', 'x', true)).toBe(8000);
    expect(toastDuration('warning', 'x'.repeat(1000), false)).toBe(8000);
  });
});

describe('UI-15 / STO-03 theme', () => {
  it('uses the saved theme, else the OS preference; storage failures are ignored', () => {
    expect(initialTheme(memoryStorage({ 'mojimotion.theme': 'dark' }), false)).toBe('dark');
    expect(initialTheme(memoryStorage(), true)).toBe('dark');
    expect(initialTheme(memoryStorage(), false)).toBe('light');
    expect(initialTheme(throwing, true)).toBe('dark');
    const storage = memoryStorage();
    expect(saveTheme(storage, 'light')).toBe(true);
    expect(storage.data['mojimotion.theme']).toBe('light');
    expect(saveTheme(throwing, 'light')).toBe(false);
  });
});

describe('TPL-03 text memory', () => {
  const victory = getTemplate('msg-battle-victory')!;
  it('remembers edited message text per template and forgets samples', () => {
    let memory = recordText(EMPTY_MEMORY, 'message', victory, { main: '大勝利', sub: '' });
    expect(rememberedText(memory, 'message', victory.id)).toEqual({ main: '大勝利', sub: '' });
    memory = recordText(memory, 'message', victory, templateSample(victory, 'en'));
    expect(rememberedText(memory, 'message', victory.id)).toBeNull();
  });
  it('shares one text across place/time templates and ignores empty main text', () => {
    const pt = firstTemplate('place-time');
    let memory = recordText(EMPTY_MEMORY, 'place-time', pt, { main: '港町', sub: '夜' });
    memory = recordText(memory, 'place-time', pt, { main: ' ', sub: '' });
    expect(rememberedText(memory, 'place-time', 'anything')).toEqual({ main: '港町', sub: '夜' });
  });
  it('restores remembered text when the template is chosen again', () => {
    const state = { ...createInitialState('ja'), memory: recordText(EMPTY_MEMORY, 'message', victory, { main: '大勝利', sub: 'x' }) };
    expect(sceneForTemplate(state, victory, 'ja').text.main).toBe('大勝利');
  });
});

describe('TPL-05 reset keeps other modes', () => {
  it('resets one mode, its memory and manual file name only', () => {
    let state = createInitialState('ja');
    const trailer = mergeScene(state.modes.trailer.scene, { text: { main: 'keep me' } });
    state = withModeState(state, 'trailer', { scene: trailer });
    const message = mergeScene(state.modes.message.scene, { text: { main: 'edited' }, export: { fileName: 'manual', fps: 30 } });
    state = withModeState(state, 'message', { scene: message });
    state = { ...state, memory: { ...state.memory, message: { 'msg-battle-clash': { main: 'edited', sub: '' } } } };
    const reset = resetMode(state, 'message', 'ja');
    expect(reset.modes.message.scene.text.main).toBe(firstTemplate('message').samples.ja.main);
    expect(reset.modes.message.scene.export.fileName).toBe('');
    expect(reset.modes.message.scene.export.fps).toBe(30);
    expect(reset.memory.message).toEqual({});
    expect(reset.modes.trailer.scene.text.main).toBe('keep me');
  });
  it('shares export settings except the file name', () => {
    const a = mergeScene(createDefaultScene('message'), { export: { fps: 60, fileName: 'a' } });
    const b = mergeScene(createDefaultScene('trailer'), { export: { fileName: 'b' } });
    const shared = withSharedExport(b, a);
    expect(shared.export.fps).toBe(60);
    expect(shared.export.fileName).toBe('b');
  });
});

describe('STO-01 saving state', () => {
  afterEach(() => vi.useRealTimers());
  it('round-trips mode, tab, scenes, memory, export settings and preview options', () => {
    let state = createInitialState('en');
    state = withModeState(state, 'trailer', { scene: mergeScene(state.modes.trailer.scene, { text: { main: 'Hello\n\nWorld' }, export: { fps: 30, fileName: 'mine' } }) });
    state = { ...state, mode: 'trailer', group: 'motion', previewBackground: 'black', loopPlayback: false };
    const storage = memoryStorage();
    expect(saveStateJson(storage, state)).toBe(true);
    const restored = restoreState(loadStateJson(storage), 'en', knownAll);
    expect(restored.mode).toBe('trailer');
    expect(restored.group).toBe('motion');
    expect(restored.previewBackground).toBe('black');
    expect(restored.loopPlayback).toBe(false);
    expect(restored.modes.trailer.scene.text.main).toBe('Hello\n\nWorld');
    expect(restored.modes.trailer.scene.export.fps).toBe(30);
    expect(restored.modes.trailer.scene.export.fileName).toBe('mine');
  });
  it('never stores the preview image and survives unavailable storage', () => {
    const state = { ...createInitialState('ja'), previewBackground: 'image' as const };
    expect(JSON.parse(serializeState(state)).previewBackground).toBe('transparent');
    expect(saveStateJson(throwing, state)).toBe(false);
    expect(saveStateJson(null, state)).toBe(false);
    expect(loadStateJson(throwing)).toBeNull();
  });
  it('debounces writes by 300 ms', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createSaver(save);
    saver.schedule();
    saver.schedule();
    vi.advanceTimersByTime(299);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    saver.schedule();
    saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('STO-02 restoring and migrating', () => {
  const saved = (patch: (state: ReturnType<typeof createInitialState>) => unknown) => JSON.stringify(patch(createInitialState('ja')));
  it('ignores broken JSON and fills missing fields with defaults', () => {
    expect(restoreState('{not json', 'ja', knownAll).mode).toBe('message');
    const partial = JSON.stringify({ version: STATE_VERSION, mode: 'place-time', modes: { 'place-time': { templateId: firstTemplate('place-time').id, scene: { text: { main: '港' } } } } });
    const state = restoreState(partial, 'ja', knownAll);
    expect(state.mode).toBe('place-time');
    expect(state.modes['place-time'].scene.text.main).toBe('港');
    expect(state.modes['place-time'].scene.layout.marginX).toBeGreaterThanOrEqual(0);
    expect(state.group).toBe('text');
  });
  it('repairs unknown exit effects and missing fonts', () => {
    const json = saved((s) => ({
      version: STATE_VERSION,
      mode: 'message',
      modes: { message: { templateId: 'msg-battle-clash', scene: { ...s.modes.message.scene, motion: { ...s.modes.message.scene.motion, exit: { ...s.modes.message.scene.motion.exit, id: 'FX-O99' } }, text: { ...s.modes.message.scene.text, mainFont: { ...s.modes.message.scene.text.mainFont, family: 'Gone Font', weight: 900 }, subFontInherit: false, subFont: { ...s.modes.message.scene.text.subFont, family: 'Gone Font' } } } } },
    }));
    const scene = restoreState(json, 'ja', (family) => family !== 'Gone Font').modes.message.scene;
    expect(scene.motion.exit.id).toBe('FX-O01');
    expect(scene.text.mainFont.family).toBe('Noto Sans JP');
    expect(scene.text.mainFont.weight).toBe(900);
    expect(scene.text.subFontInherit).toBe(true);
  });
  it('rebuilds the message mode from the first template when its template is gone (size and exit kept)', () => {
    const json = saved((s) => ({
      version: STATE_VERSION,
      modes: { message: { templateId: 'msg-deleted', scene: { ...s.modes.message.scene, canvas: { width: 1920, height: 1080, preset: 'fhd' }, motion: { ...s.modes.message.scene.motion, exitEnabled: false, holdDuration: 9 } } } },
    }));
    const mode = restoreState(json, 'ja', knownAll).modes.message;
    expect(mode.templateId).toBe(firstTemplate('message').id);
    expect(mode.scene.canvas.width).toBe(1920);
    expect(mode.scene.motion.exitEnabled).toBe(false);
    expect(mode.scene.motion.holdDuration).not.toBe(9);
  });
  it('restores the export loop only from current-format data', () => {
    const make = (version: number) => saved((s) => ({ version, modes: { message: { templateId: 'msg-battle-clash', scene: { ...s.modes.message.scene, export: { ...s.modes.message.scene.export, loop: { kind: 'forever' } } } } } }));
    expect(restoreState(make(STATE_VERSION), 'ja', knownAll).modes.message.scene.export.loop.kind).toBe('forever');
    expect(restoreState(make(1), 'ja', knownAll).modes.message.scene.export.loop.kind).toBe('once');
  });
  it('repairFonts leaves known fonts alone', () => {
    const scene: Scene = createInitialState('ja').modes.message.scene;
    expect(repairFonts(scene, knownAll)).toBe(scene);
  });
});

describe('EXP-15 / EXP-18 / EXP-01 export job helpers', () => {
  it('reuses the first render for the second pass within the memory budget', async () => {
    const { reuseSecondRender } = await import('../../src/ui/exporter');
    let calls = 0;
    const render = (t: number) => {
      calls += 1;
      return new Uint8ClampedArray([t]);
    };
    const reuse = reuseSecondRender(render, 2);
    const first = [0, 1, 2].map((t) => reuse(t));
    const second = [0, 1, 2].map((t) => reuse(t));
    expect(calls).toBe(4); // t = 2 did not fit in the 2-byte budget
    expect(second[0]).toBe(first[0]);
    expect(second[2]).not.toBe(first[2]);
  });
  it('picks the still PNG time (completed time while playing or outside the text)', async () => {
    const { stillTime } = await import('../../src/ui/exporter');
    const page = { characterStart: 0.5, end: 3, persistent: false };
    const timeline = { pages: [page], duration: 3.3, completedTime: 1.2 } as unknown as Parameters<typeof stillTime>[0];
    expect(stillTime(timeline, 2, true)).toBe(1.2);
    expect(stillTime(timeline, 1, false)).toBe(1);
    expect(stillTime(timeline, 0.1, false)).toBe(1.2);
    expect(stillTime(timeline, 3.2, false)).toBe(1.2);
  });
  it('rejects jobs over 1800 frames or the pixel-frame limit before rendering', async () => {
    const { checkLimits } = await import('../../src/ui/exporter');
    const scene = createDefaultScene('message');
    expect(checkLimits(scene, 3)).toBeNull();
    expect(checkLimits({ ...scene, export: { ...scene.export, fps: 60 } }, 31)).toEqual({ reason: 'frame-limit', frames: 1860 });
    expect(checkLimits({ ...scene, canvas: { width: 3840, height: 2160, preset: 'custom' }, export: { ...scene.export, fps: 60 } }, 5)).toEqual({ reason: 'work-limit' });
  });
});
