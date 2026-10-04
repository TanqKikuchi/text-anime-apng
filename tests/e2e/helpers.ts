import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const FONT_WAIT_MS = 20_000;

/** Console errors that are not app bugs (network font fetches can fail on CI; we fall back to system fonts). */
function ignorable(text: string): boolean {
  return /fonts\.(googleapis|gstatic)\.com|Failed to load resource|downloadable font|ERR_INTERNET_DISCONNECTED|net::/iu.test(text);
}

export interface AppHandle {
  readonly errors: string[];
}

export interface GotoOptions {
  /** localStorage entries set before the app boots. */
  readonly storage?: Record<string, string>;
  readonly waitFonts?: boolean;
  /** Clear storage before boot (default true). */
  readonly fresh?: boolean;
}

export async function gotoApp(page: Page, options: GotoOptions = {}): Promise<AppHandle> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignorable(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  if (options.fresh !== false || options.storage) {
    await page.addInitScript((entries: Record<string, string> | null) => {
      if (sessionStorage.getItem('__e2e_init')) return;
      sessionStorage.setItem('__e2e_init', '1');
      try {
        localStorage.clear();
        if (entries) for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      } catch {
        // storage blocked: nothing to prepare
      }
    }, options.storage ?? null);
  }
  await page.goto('./');
  await page.waitForFunction(() => window.__tanim !== undefined);
  if (options.waitFonts !== false) await waitFonts(page);
  return { errors };
}

/** Waits for fonts with a timeout so missing network never hangs a test (system fonts are used then). */
export async function waitFonts(page: Page): Promise<void> {
  await page.evaluate((ms) => Promise.race([window.__tanim!.fontsReady(), new Promise((resolve) => setTimeout(resolve, ms))]), FONT_WAIT_MS);
}

/** Number of pixels with alpha > 0 (and optionally the alpha at a point) of a base64 PNG, decoded in the page. */
export async function pngStats(page: Page, base64: string, point?: { x: number; y: number }): Promise<{ width: number; height: number; opaque: number; alphaAt: number; colors: number }> {
  return page.evaluate(async ({ data, at }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let opaque = 0;
    const colors = new Set<number>();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3]! > 0) {
        opaque += 1;
        if (colors.size < 64) colors.add((pixels[index]! << 16) | (pixels[index + 1]! << 8) | pixels[index + 2]!);
      }
    }
    const alphaAt = at ? pixels[(at.y * bitmap.width + at.x) * 4 + 3]! : -1;
    return { width: bitmap.width, height: bitmap.height, opaque, alphaAt, colors: colors.size };
  }, { data: base64, at: point ?? null });
}

export async function scene(page: Page): Promise<Record<string, unknown> & { mode: string; text: { main: string; sub: string; mainFont: { family: string; weight: number } }; canvas: { width: number; height: number; preset: string }; export: { fps: number; loop: { kind: string }; fileName: string }; motion: { exitEnabled: boolean; enter: { id: string; duration: number; stagger: number } } }> {
  return page.evaluate(() => window.__tanim!.getScene() as never);
}

export async function setScene(page: Page, patch: unknown): Promise<void> {
  await page.evaluate((p) => {
    window.__tanim!.setScene(p as never);
  }, patch);
}

export async function openGroup(page: Page, group: 'text' | 'font' | 'motion' | 'decoration' | 'layout'): Promise<void> {
  await page.locator(`.rail-tab[data-group="${group}"]`).click();
  await expect(page.locator(`#group-${group}`)).toBeVisible();
}

export async function openExport(page: Page): Promise<void> {
  if (await page.getByTestId('export-panel').isHidden()) {
    const fab = page.getByTestId('fab-export');
    if (await fab.isVisible()) await fab.click();
    else await page.getByTestId('open-export').click();
  }
  await expect(page.getByTestId('export-panel')).toBeVisible();
}

export const modKey = 'Control';
