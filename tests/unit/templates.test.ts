import { describe, expect, it } from 'vitest';
import { createDefaultScene, validateScene } from '../../src/core/scene';
import type { Direction, EnterEffectId, ExitEffectId, Scene, TrailerFlow } from '../../src/core/scene';
import {
  ALL_CATEGORIES,
  GRADIENT_PRESETS,
  MESSAGE_CATEGORIES,
  STYLE_PRESETS,
  TEMPLATES,
  applyGradientPreset,
  applyStylePreset,
  applyTemplate,
  composeTemplateScene,
  createModeScene,
  defaultLoop,
  firstTemplate,
  getTemplate,
  listCategories,
  listSystems,
  listTemplates,
  matchingSampleLanguage,
  relocalizeSample,
  shouldRememberText,
  templateSample,
} from '../../src/templates';
import type { TemplateDef } from '../../src/templates';
import { LANGUAGES } from '../../src/ui/i18n/languages';

// Weights per family from the FNT-01 catalogue (only the families the templates may use need to be listed).
const FONT_WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  'Noto Sans JP': [400, 700, 900],
  'Zen Kaku Gothic New': [400, 700, 900],
  'Zen Kaku Gothic Antique': [400, 700, 900],
  'M PLUS 1p': [400, 700, 900],
  Murecho: [400, 700, 900],
  'BIZ UDPGothic': [400, 700],
  'Noto Serif JP': [400, 700, 900],
  'Shippori Mincho': [400, 700, 800],
  'Shippori Mincho B1': [400, 700, 800],
  'Zen Old Mincho': [400, 700, 900],
  'Kaisei Tokumin': [400, 700, 800],
  'Kaisei Opti': [400, 700],
  'Hina Mincho': [400],
  'BIZ UDPMincho': [400, 700],
  'M PLUS Rounded 1c': [400, 700, 900],
  'Zen Maru Gothic': [400, 700, 900],
  'Mochiy Pop One': [400],
  'Potta One': [400],
  'Dela Gothic One': [400],
  'RocknRoll One': [400],
  'Rampart One': [400],
  DotGothic16: [400],
  'Kaisei Decol': [400, 700],
  'Zen Antique': [400],
  'Yuji Syuku': [400],
  'Yuji Mai': [400],
  'Yuji Boku': [400],
  'Klee One': [400, 600],
  'Zen Kurenaido': [400],
  Cinzel: [400, 700, 900],
  'Bebas Neue': [400],
  Oswald: [400, 700],
  Orbitron: [400, 700, 900],
  Audiowide: [400],
  'Share Tech Mono': [400],
  'Press Start 2P': [400],
};

const DIRECTIONS: Partial<Record<EnterEffectId | ExitEffectId, readonly Direction[]>> = {
  'FX-I05': ['left', 'right', 'up', 'down'],
  'FX-O05': ['left', 'right', 'up', 'down'],
  'FX-I20': ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'center'],
  'FX-O15': ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'center'],
  'FX-I21': ['vertical', 'horizontal'],
  'FX-O16': ['vertical', 'horizontal'],
};
const BLOCK_EFFECTS = new Set<string>(['FX-I17', 'FX-I18', 'FX-I19', 'FX-I20', 'FX-I21', 'FX-I22', 'FX-I23', 'FX-O13', 'FX-O14', 'FX-O15', 'FX-O16', 'FX-O17']);
const GLITCH_EFFECTS = new Set<string>(['FX-I22', 'FX-O17', 'FX-H08']);
const HEX = /^#[0-9a-f]{6}$/i;

function colorsOf(scene: Scene): string[] {
  const s = scene.style;
  const d = s.decoration;
  return [...s.fill.colors.filter((c): c is string => Boolean(c)), s.innerStroke.color, s.outerStroke.color, s.shadow.color,
    s.glow.color, s.subColor, ...s.glitchColors, d.fillColor, d.lineColor, d.tapeColor, d.tapeStripeColor, scene.background.color,
    ...(s.cursorColor ? [s.cursorColor] : [])];
}

const base = createDefaultScene('message');

describe('TPL-01 template catalogue', () => {
  it('has at least 20 message, 8 trailer and 8 place/time templates', () => {
    expect(listTemplates('message').length).toBeGreaterThanOrEqual(20);
    expect(listTemplates('trailer').length).toBeGreaterThanOrEqual(8);
    expect(listTemplates('place-time').length).toBeGreaterThanOrEqual(8);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(36);
  });

  it('uses unique kebab-case ids that getTemplate resolves', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
      expect(getTemplate(id)?.id).toBe(id);
    }
    expect(getTemplate('nope')).toBeUndefined();
  });

  it('has names and samples in all three languages', () => {
    for (const t of TEMPLATES) {
      for (const lang of LANGUAGES) {
        expect(t.names[lang].trim(), `${t.id} name ${lang}`).not.toBe('');
        expect(t.samples[lang].main.trim(), `${t.id} sample ${lang}`).not.toBe('');
        if (t.mode === 'trailer') expect(t.samples[lang].sub ?? '').toBe('');
      }
    }
  });

  it('groups message templates into category tabs, with a system row only under "roll"', () => {
    const categories = listCategories('message');
    expect(categories.length).toBeGreaterThanOrEqual(5);
    for (const category of categories) expect(listTemplates('message', { category }).length).toBeGreaterThanOrEqual(2);
    for (const t of listTemplates('message')) {
      expect(MESSAGE_CATEGORIES).toContain(t.category);
      expect(t.system !== undefined).toBe(t.category === 'roll');
    }
    expect(listSystems('roll')).toEqual(['d100', '2d6']);
    expect(listSystems('battle')).toEqual([]);
    expect(listCategories('trailer')).toEqual([]);
    expect(listCategories('place-time')).toEqual([]);
    for (const t of TEMPLATES) expect(ALL_CATEGORIES).toContain(t.category);
  });

  it('covers every trailer display flow', () => {
    const flows = new Set(listTemplates('trailer').map((t) => applyTemplate(base, t).motion.trailer.flow));
    const all: TrailerFlow[] = ['characters', 'center-characters', 'expand', 'lines', 'smooth-lines', 'simultaneous', 'scroll'];
    for (const flow of all) expect(flows.has(flow), flow).toBe(true);
  });
});

describe('TPL-01 every template is a valid scene', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s validates without clamping', (_id, template: TemplateDef) => {
    for (const lang of LANGUAGES) {
      const raw = composeTemplateScene(base, template, { lang });
      expect(validateScene(raw)).toEqual(raw);
    }
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s uses catalogue fonts, valid effects and hex colours', (_id, template: TemplateDef) => {
    const scene = applyTemplate(base, template);
    const { mainFont, subFont, subFontInherit } = scene.text;
    expect(FONT_WEIGHTS[mainFont.family], mainFont.family).toContain(mainFont.weight);
    if (!subFontInherit) expect(FONT_WEIGHTS[subFont.family], subFont.family).toContain(subFont.weight);
    if (!subFontInherit) expect(subFont.family).not.toBe(mainFont.family);

    const { enter, exit, hold } = scene.motion;
    for (const fx of [enter, exit]) {
      const allowed = DIRECTIONS[fx.id];
      if (allowed) expect(allowed, `${fx.id} direction`).toContain(fx.direction);
      if (BLOCK_EFFECTS.has(fx.id)) expect(fx.stagger, `${fx.id} stagger`).toBe(0);
    }
    if (template.mode === 'trailer') {
      expect(BLOCK_EFFECTS.has(enter.id) || enter.id === 'FX-I07', `trailer enter ${enter.id}`).toBe(false);
    }
    if (hold.id === 'FX-H05') expect(scene.style.glow.enabled).toBe(true);
    if ([enter.id, exit.id, hold.id].some((id) => GLITCH_EFFECTS.has(id))) expect(scene.style.glitchColors.every((c) => HEX.test(c))).toBe(true);
    for (const color of colorsOf(scene)) expect(color, `${template.id} colour`).toMatch(HEX);
  });

  it('templates look different from one another (no duplicated style + motion)', () => {
    const signatures = TEMPLATES.map((t) => {
      const s = applyTemplate(base, t);
      return JSON.stringify([s.mode, s.text.mainFont.family, s.motion.enter.id, s.motion.exit.id, s.style.fill.colors, s.style.decoration.kind]);
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe('TPL-02 applying a template', () => {
  const template = getTemplate('msg-mystery-alert')!;

  it('rebuilds from defaults and the patch, discarding previous settings', () => {
    const edited: Scene = { ...base, style: { ...base.style, glow: { ...base.style.glow, enabled: true, color: '#123456' } } };
    const scene = applyTemplate(edited, template, { lang: 'en' });
    expect(scene.mode).toBe('message');
    expect(scene.style.glow.color).not.toBe('#123456');
    expect(scene.style.decoration.kind).toBe('hazard');
    expect(scene.text.main).toBe(template.samples.en.main);
    expect(scene.text.sub).toBe(template.samples.en.sub);
  });

  it('keeps the canvas size and the exit switch', () => {
    const custom: Scene = { ...base, canvas: { width: 1920, height: 1080, preset: 'fhd' }, motion: { ...base.motion, exitEnabled: false } };
    const scene = applyTemplate(custom, template);
    expect(scene.canvas).toEqual({ width: 1920, height: 1080, preset: 'fhd' });
    expect(scene.motion.exitEnabled).toBe(false);
  });

  it('keeps export settings except the loop', () => {
    const custom: Scene = { ...base, export: { ...base.export, fps: 60, colorMode: 'full', loop: { kind: 'forever' }, fileName: 'mine' } };
    const scene = applyTemplate(custom, getTemplate('msg-battle-clash')!);
    expect(scene.export.fps).toBe(60);
    expect(scene.export.colorMode).toBe('full');
    expect(scene.export.fileName).toBe('mine');
    expect(scene.export.loop).toEqual({ kind: 'once' });
  });

  it('uses remembered text when provided and drops the sub text in trailers', () => {
    const scene = applyTemplate(base, template, { text: { main: 'Custom', sub: 'Line' } });
    expect(scene.text.main).toBe('Custom');
    const trailer = applyTemplate(createDefaultScene('trailer'), firstTemplate('trailer'), { text: { main: 'A\n\nB', sub: 'x' } });
    expect(trailer.text.sub).toBe('');
    expect(trailer.mode).toBe('trailer');
  });
});

describe('TPL-03 remembered text rules', () => {
  const t = getTemplate('msg-battle-victory')!;
  it('does not remember samples (any language) or empty main text', () => {
    expect(shouldRememberText(t, templateSample(t, 'ja'))).toBe(false);
    expect(shouldRememberText(t, templateSample(t, 'ko'))).toBe(false);
    expect(shouldRememberText(t, { main: '  ', sub: 'x' })).toBe(false);
    expect(shouldRememberText(t, { main: 'Victory!!', sub: '' })).toBe(true);
  });
});

describe('TPL-04 first templates', () => {
  it('returns the first template of a mode, category and system', () => {
    expect(firstTemplate('message').id).toBe('msg-battle-clash');
    expect(firstTemplate('message', 'gm').category).toBe('gm');
    expect(firstTemplate('message', 'roll').system).toBe('d100');
    expect(firstTemplate('message', 'roll', '2d6').system).toBe('2d6');
    expect(firstTemplate('trailer').mode).toBe('trailer');
    expect(firstTemplate('place-time').mode).toBe('place-time');
  });
});

describe('TPL-05 mode reset', () => {
  it('re-applies the first template, keeps size and clears the manual file name', () => {
    const carry: Scene = { ...createDefaultScene('trailer'), canvas: { width: 720, height: 1280, preset: 'portrait' }, export: { ...base.export, fileName: 'x' } };
    const scene = createModeScene('trailer', 'ko', carry);
    expect(scene.text.main).toBe(firstTemplate('trailer').samples.ko.main);
    expect(scene.canvas.preset).toBe('portrait');
    expect(scene.export.fileName).toBe('');
    expect(createModeScene('place-time').mode).toBe('place-time');
  });
});

describe('TPL-06 export loop defaults', () => {
  it('loops forever for GM and roll categories, once otherwise', () => {
    for (const t of TEMPLATES) {
      const expected = t.category === 'gm' || t.category === 'roll' ? 'forever' : 'once';
      expect(defaultLoop(t).kind, t.id).toBe(expected);
      expect(applyTemplate(base, t).export.loop.kind).toBe(expected);
    }
  });
});

describe('I18N-03 sample text follows the language', () => {
  const t = getTemplate('msg-scene-chapter')!;
  it('swaps untouched samples and keeps edited text', () => {
    const ja = applyTemplate(base, t, { lang: 'ja' });
    expect(matchingSampleLanguage(t, ja.text)).toBe('ja');
    const en = relocalizeSample(ja, t, 'en');
    expect(en.text.main).toBe(t.samples.en.main);
    expect(en.text.sub).toBe(t.samples.en.sub);
    const edited: Scene = { ...ja, text: { ...ja.text, main: '第二章' } };
    expect(relocalizeSample(edited, t, 'en')).toBe(edited);
  });
});

describe('DEC-22 / DEC-01 presets', () => {
  it('has 10 style presets that only change paint fields and validate cleanly', () => {
    expect(STYLE_PRESETS).toHaveLength(10);
    expect(new Set(STYLE_PRESETS.map((p) => p.id)).size).toBe(10);
    const scene = applyTemplate(base, getTemplate('msg-scene-tbc')!);
    for (const preset of STYLE_PRESETS) {
      const next = applyStylePreset(scene, preset);
      expect(validateScene(next)).toEqual(next);
      expect(next.text).toEqual(scene.text);
      expect(next.motion).toEqual(scene.motion);
      expect(next.style.decoration).toEqual(scene.style.decoration);
      expect(next.style.fill).toEqual(preset.fill);
    }
  });

  it('has 10 three-colour gradient swatches', () => {
    expect(GRADIENT_PRESETS).toHaveLength(10);
    const next = applyGradientPreset(base, GRADIENT_PRESETS[0]!);
    expect(next.style.fill.kind).toBe('gradient');
    expect(validateScene(next)).toEqual(next);
    for (const p of GRADIENT_PRESETS) for (const c of p.colors) expect(c).toMatch(HEX);
  });
});
