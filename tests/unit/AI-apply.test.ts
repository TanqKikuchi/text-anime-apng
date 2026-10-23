import { describe, expect, it } from 'vitest';
import { applyDesign, describeState } from '../../src/ai/apply';
import { buildCatalog, templateIds } from '../../src/ai/catalog';
import { TEMPLATES } from '../../src/templates';
import { activeScene, createInitialState } from '../../src/ui/state';

const known = (family: string) => ['Noto Sans JP', 'Noto Serif JP', 'Zen Maru Gothic', 'Dela Gothic One'].includes(family);

describe('AI-01 applyDesign', () => {
  it('applies a template, text and a patch in one command', () => {
    const state = createInitialState('ja');
    const horror = TEMPLATES.find((template) => template.mode === 'message' && template.category === 'horror')!;
    const result = applyDesign(state, {
      templateId: horror.id,
      text: { main: '逃げろ', sub: '' },
      patch: { style: { fill: { kind: 'solid', colors: ['#8B0000', '#8B0000', ''] } } },
    }, 'ja', known);
    const scene = activeScene(result.state);
    expect(result.changed).toBe(true);
    expect(result.state.modes.message.templateId).toBe(horror.id);
    expect(scene.text.main).toBe('逃げろ');
    expect(scene.style.fill.colors[0]).toBe('#8B0000');
    expect(result.adjusted).toEqual([]);
    expect(result.state.memory.message[horror.id]?.main).toBe('逃げろ');
  });

  it('switches mode when the template belongs to another mode', () => {
    const state = createInitialState('ja');
    const trailer = TEMPLATES.find((template) => template.mode === 'trailer')!;
    const result = applyDesign(state, { templateId: trailer.id }, 'ja', known);
    expect(result.state.mode).toBe('trailer');
    expect(result.state.modes.trailer.templateId).toBe(trailer.id);
  });

  it('reports unknown ids, locked keys, clamped numbers and unknown fonts', () => {
    const state = createInitialState('ja');
    const before = activeScene(state);
    const result = applyDesign(state, {
      templateId: 'no-such-template',
      mode: 'video',
      patch: {
        version: 2,
        export: { fileName: 'hack' },
        nonsense: { a: 1 },
        text: { mainFont: { size: 9999, family: 'Comic Sans Imaginary' } },
        motion: { enter: { id: 'FX-I99' } },
      },
    }, 'ja', known);
    const scene = activeScene(result.state);
    expect(result.adjusted).toEqual(expect.arrayContaining([
      'templateId', 'mode', 'version', 'export.fileName', 'nonsense', 'text.mainFont.size', 'text.mainFont.family', 'motion.enter.id',
    ]));
    expect(scene.text.mainFont.size).toBe(400);
    expect(scene.text.mainFont.family).toBe(before.text.mainFont.family);
    expect(scene.motion.enter.id).toBe(before.motion.enter.id);
    expect(scene.export.fileName).toBe(before.export.fileName);
  });

  it('ignores the sub text in trailer mode', () => {
    const state = createInitialState('ja');
    const result = applyDesign(state, { mode: 'trailer', text: { main: 'かつて', sub: 'x' } }, 'ja', known);
    expect(activeScene(result.state).text.main).toBe('かつて');
    expect(result.adjusted).toContain('text.sub');
  });

  it('fills canvas size from a preset and keeps export settings shared across modes', () => {
    const state = createInitialState('ja');
    const result = applyDesign(state, { patch: { canvas: { preset: 'square' }, export: { fps: 30 } } }, 'ja', known);
    const scene = activeScene(result.state);
    expect(scene.canvas).toEqual({ width: 1080, height: 1080, preset: 'square' });
    expect(result.state.modes.trailer.scene.export.fps).toBe(30);
    expect(result.adjusted).toEqual([]);
  });

  it('does not report colour case differences, and is a no-op for an empty command', () => {
    const state = createInitialState('ja');
    expect(applyDesign(state, { reply: 'ok' }, 'ja', known)).toEqual({ state, adjusted: [], changed: false });
    const result = applyDesign(state, { patch: { style: { shadow: { color: '#ff0000' } } } }, 'ja', known);
    expect(result.adjusted).toEqual([]);
  });

  it('rejects non-object payloads without throwing', () => {
    const state = createInitialState('ja');
    const result = applyDesign(state, { text: 'oops', patch: [1, 2] }, 'ja', known);
    expect(result.changed).toBe(false);
    expect(result.adjusted).toEqual(['text', 'patch']);
  });
});

describe('AI-02 catalog and state description', () => {
  it('lists every template id and effect', () => {
    const catalog = buildCatalog();
    expect(templateIds()).toHaveLength(TEMPLATES.length);
    for (const id of templateIds()) expect(catalog).toContain(id);
    expect(catalog).toContain('FX-I23');
    expect(catalog).toContain('Noto Sans JP');
    expect(buildCatalog()).toBe(catalog);
  });

  it('describes the active scene without the file name', () => {
    const json = JSON.parse(describeState(createInitialState('ja'))) as { templateId: string; scene: { export: Record<string, unknown> } };
    expect(typeof json.templateId).toBe('string');
    expect('fileName' in json.scene.export).toBe(false);
  });
});
