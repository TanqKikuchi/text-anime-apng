import type { Scene, ScenePatch } from '../core/scene';
import { mergeScene } from '../core/scene';
import { createFrameTimeline } from '../core/timeline';
import { TEMPLATES, getTemplate } from '../templates';
import type { App } from './app';
import { rgbaToPng, sceneRgbaRenderer, sceneTimeline, toBase64 } from './exporter';
import type { ExportKind } from './exporter';

/** `window.__tanim` test hook (E2E only needs these functions). */

export interface TanimHook {
  getScene(): Scene;
  setScene(partial: ScenePatch): Scene;
  applyTemplate(id: string): void;
  listTemplates(): { id: string; mode: string; category: string; system?: string; names: Record<string, string> }[];
  renderRgba(t: number): Promise<{ width: number; height: number; data: string }>;
  /** Source frame times; APNG may store fewer frames (duplicates merged), .mov stores every one of them. */
  frameTimes(kind?: ExportKind): number[];
  exportBytes(kind: ExportKind): Promise<string>;
  fontsReady(): Promise<boolean>;
}

declare global {
  interface Window {
    __tanim?: TanimHook;
  }
}

export function installTestHook(app: App): void {
  const hook: TanimHook = {
    getScene: () => JSON.parse(JSON.stringify(app.scene)) as Scene,
    setScene(partial) {
      app.update(mergeScene(app.scene, partial));
      return hook.getScene();
    },
    applyTemplate(id) {
      const template = getTemplate(id);
      if (!template) throw new Error(`unknown template ${id}`);
      app.applyTemplate(template);
    },
    listTemplates: () => TEMPLATES.map((template) => ({
      id: template.id,
      mode: template.mode,
      category: template.category,
      ...(template.system ? { system: template.system } : {}),
      names: { ...template.names },
    })),
    async renderRgba(time) {
      const scene = app.scene;
      const rgba = sceneRgbaRenderer(scene, app.loader.fontFamily)(time);
      const png = await rgbaToPng(rgba, scene.canvas.width, scene.canvas.height);
      return { width: scene.canvas.width, height: scene.canvas.height, data: toBase64(png) };
    },
    frameTimes(_kind = 'apng') {
      // APNG, ZIP and .mov all sample the same timeline (MOV-06: the video keeps every source frame).
      const scene = app.scene;
      const timeline = sceneTimeline(scene, app.loader.fontFamily);
      return [...createFrameTimeline(timeline.duration, scene.export.fps).times];
    },
    async exportBytes(kind) {
      const result = await app.exportQuiet(kind);
      if (!result.ok) throw new Error(`export failed: ${result.failure.reason}`);
      return toBase64(result.output.bytes);
    },
    fontsReady: () => app.fontsReady(),
  };
  window.__tanim = hook;
}
