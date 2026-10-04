import {
  createDefaultScene,
  createSceneModel,
  deepMerge,
  MonospaceMeasurer,
  validateScene,
  type Scene,
  type SceneMode,
  type SceneModel,
  type ScenePatch,
} from '../../../src/core';

export const mono = new MonospaceMeasurer(1, 0.8, 0.2);

/** Mode defaults + patch, validated. The default subtitle is removed unless the patch sets one. */
export function scene(patch: ScenePatch = {}, mode: SceneMode = (patch.mode as SceneMode | undefined) ?? 'message'): Scene {
  const base = createDefaultScene(mode);
  return validateScene(deepMerge({ ...base, text: { ...base.text, sub: '' } }, patch));
}

export function model(patch: ScenePatch = {}, mode?: SceneMode): SceneModel {
  return createSceneModel(scene(patch, mode), mono);
}

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }

function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

/** A recording stand-in for CanvasRenderingContext2D (enough for the renderer to run in Node). */
export class MockContext {
  readonly log: string[] = [];
  readonly canvas: { width: number; height: number };
  private matrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private stack: { matrix: Matrix; props: Record<string, unknown> }[] = [];
  font = '10px sans-serif';
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  miterLimit = 10;
  textAlign = 'start';
  textBaseline = 'alphabetic';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  shadowColor = 'transparent';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  filter = 'none';

  constructor(width: number, height: number, readonly name = 'main') {
    this.canvas = { width, height };
  }

  private props(): Record<string, unknown> {
    return {
      font: this.font, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap,
      lineJoin: this.lineJoin, miterLimit: this.miterLimit, textAlign: this.textAlign, textBaseline: this.textBaseline, globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation, shadowColor: this.shadowColor, shadowBlur: this.shadowBlur,
      shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY, filter: this.filter,
    };
  }

  private record(op: string, ...args: unknown[]): void {
    const style = typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient';
    this.log.push(`${this.name}:${op}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : String(a))).join(',')}) op=${this.globalCompositeOperation} a=${this.globalAlpha.toFixed(3)} fill=${style}`);
  }

  save(): void { this.stack.push({ matrix: { ...this.matrix }, props: this.props() }); }
  restore(): void {
    const top = this.stack.pop();
    if (!top) return;
    this.matrix = top.matrix;
    Object.assign(this, top.props);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.matrix = { a, b, c, d, e, f }; }
  getTransform(): Matrix { return { ...this.matrix }; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.matrix = multiply(this.matrix, { a, b, c, d, e, f }); }
  translate(x: number, y: number): void { this.transform(1, 0, 0, 1, x, y); }
  scale(x: number, y: number): void { this.transform(x, 0, 0, y, 0, 0); }
  rotate(r: number): void { this.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0); }
  clearRect(...args: number[]): void { this.record('clearRect', ...args); }
  fillRect(...args: number[]): void { this.record('fillRect', ...args); }
  drawImage(image: { name?: string }, ...args: number[]): void { this.record('drawImage', image?.name ?? '?', ...args); }
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arcTo(): void {}
  rect(): void {}
  clip(): void { this.record('clip'); }
  fill(): void { this.record('fill'); }
  stroke(): void { this.record('stroke', this.lineWidth); }
  fillText(text: string, x: number, y: number): void { this.record('fillText', text, x, y, this.matrix.e, this.matrix.f); }
  strokeText(text: string, x: number, y: number): void { this.record('strokeText', text, x, y, this.lineWidth); }
  measureText(text: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
    const count = Array.from(text).length;
    return { width: count * size, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
  }
  createLinearGradient(...args: number[]): { addColorStop: (o: number, c: string) => void } {
    this.record('linearGradient', ...args);
    return { addColorStop: (o, c) => this.record('stop', o, c) };
  }
  createRadialGradient(...args: number[]): { addColorStop: (o: number, c: string) => void } {
    this.record('radialGradient', ...args);
    return { addColorStop: (o, c) => this.record('stop', o, c) };
  }
  getImageData(_x: number, _y: number, w: number, h: number): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(w * h * 4) };
  }
}

/** Canvas factory producing mock layers that share one log. */
export function mockFactory(shared: string[]): (width: number, height: number) => { canvas: never; context: never } {
  let count = 0;
  return (width, height) => {
    const context = new MockContext(width, height, `layer${count++}`);
    const canvas = Object.assign(context.canvas, { name: context.name });
    (context as unknown as { log: string[] }).log.push = (...items: string[]) => shared.push(...items);
    return { canvas: canvas as never, context: context as never };
  };
}
