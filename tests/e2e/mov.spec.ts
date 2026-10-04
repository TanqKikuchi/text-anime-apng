import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { gotoApp, openExport, scene, setScene } from './helpers';

/** Top-level QuickTime atoms (type → payload range); handles 64-bit sizes. */
function topLevelAtoms(bytes: Uint8Array): Map<string, { start: number; end: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const atoms = new Map<string, { start: number; end: number }>();
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (size < header) break;
    atoms.set(type, { start: offset + header, end: offset + size });
    offset += size;
  }
  return atoms;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function indexOfAscii(bytes: Uint8Array, text: string, from = 0, to = bytes.length): number {
  const codes = [...text].map((c) => c.charCodeAt(0));
  for (let index = from; index + codes.length <= to; index += 1) {
    if (codes.every((code, k) => bytes[index + k] === code)) return index;
  }
  return -1;
}

/** MOV-06: ftyp brand `qt  `, an 'ap4h' sample entry in moov, and the stsz sample count. */
function inspectMov(bytes: Uint8Array): { brand: string; hasAp4h: boolean; samples: number } {
  expect(ascii(bytes, 4, 4)).toBe('ftyp');
  const atoms = topLevelAtoms(bytes);
  const moov = atoms.get('moov');
  expect(moov, 'moov atom').toBeDefined();
  const stsz = indexOfAscii(bytes, 'stsz', moov!.start, moov!.end);
  expect(stsz).toBeGreaterThan(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    brand: ascii(bytes, 8, 4),
    hasAp4h: indexOfAscii(bytes, 'ap4h', moov!.start, moov!.end) > 0,
    samples: view.getUint32(stsz + 12),
  };
}

async function smallScene(page: Page): Promise<void> {
  await setScene(page, {
    text: { main: '戦闘開始', sub: '' },
    canvas: { preset: 'custom', width: 640, height: 180 },
    motion: { enter: { id: 'FX-I03' }, holdDuration: 0.3 },
    export: { fps: 12, loop: { kind: 'once' } },
  });
}

test('MOV-01 / MOV-03 / MOV-05 / MOV-06: the video export shows the result panel and downloads a ProRes 4444 QuickTime file', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await smallScene(page);
  await openExport(page);
  await expect(page.getByTestId('export-mov')).toHaveText('透過動画 (.mov・Keynote 用)');
  await expect(page.getByTestId('export-filename')).toHaveValue('戦闘開始_降りてくる');
  await page.getByTestId('export-mov').click();
  const result = page.getByTestId('result-panel');
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('result-meta')).toHaveText(/^戦闘開始_降りてくる\.mov ・ [\d.]+ (?:KB|MB) ・ 640 × 180 ・ \d+ フレーム ・ 12 FPS ・ ProRes 4444 \(透過\) ・ 標準 ・ 1回再生$/u);
  await expect(page.getByTestId('result-advice')).toContainText('Keynote');
  await expect(page.getByTestId('result-image')).toBeHidden();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('result-download').click()]);
  expect(download.suggestedFilename()).toBe('戦闘開始_降りてくる.mov');
  const file = new Uint8Array(readFileSync(await download.path()));
  const info = inspectMov(file);
  expect(info.brand).toBe('qt  ');
  expect(info.hasAp4h).toBe(true);

  // Test hook: same bytes as base64, and every source frame is stored.
  const base64 = await page.evaluate(() => window.__tanim!.exportBytes('mov'));
  const hooked = inspectMov(new Uint8Array(Buffer.from(base64, 'base64')));
  const times = await page.evaluate(() => window.__tanim!.frameTimes('mov'));
  expect(hooked.samples).toBe(times.length);
  expect(info.samples).toBe(times.length);
});

test('MOV-01 / MOV-02: APNG-only options are marked, the quality select persists across reload', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await openExport(page);
  const apng = page.getByTestId('export-apng-options');
  const mov = page.getByTestId('export-mov-options');
  await expect(apng).toContainText('APNG のみ');
  for (const id of ['export-loop', 'export-colors', 'export-default-image', 'export-autotrim', 'export-apng']) await expect(apng.getByTestId(id)).toBeAttached();
  await expect(mov).toContainText('.mov のみ');
  await expect(mov.getByTestId('export-mov-quality')).toBeVisible();
  await expect(mov.getByTestId('export-mov')).toBeVisible();
  // FPS and the file name apply to every format.
  await expect(apng.getByTestId('export-fps')).toHaveCount(0);
  await expect(mov.getByTestId('export-fps')).toHaveCount(0);
  await expect(page.getByTestId('export-mov-hint')).toContainText('ループ');
  await expect(page.getByTestId('export-mov-estimate')).toHaveText(/^推定サイズ: 約 [\d.]+ (?:KB|MB)〜[\d.]+ (?:KB|MB) \(内容により変わります\)$/u);

  await expect(page.getByTestId('export-mov-quality')).toHaveValue('standard');
  const before = await page.getByTestId('export-mov-estimate').innerText();
  await page.getByTestId('export-mov-quality').selectOption('high');
  await expect(page.getByTestId('export-mov-estimate')).not.toHaveText(before);
  expect((await scene(page)).export).toMatchObject({ movQuality: 'high' });
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.__tanim !== undefined);
  await openExport(page);
  await expect(page.getByTestId('export-mov-quality')).toHaveValue('high');
  expect((await scene(page)).export).toMatchObject({ movQuality: 'high' });
});

test('MOV-05: a video export can be cancelled within about a second and exporting works again', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoApp(page);
  await setScene(page, { canvas: { preset: 'fhd', width: 1920, height: 1080 }, motion: { holdDuration: 10, hold: { id: 'FX-H04' } }, export: { fps: 30 } });
  await openExport(page);
  await page.getByTestId('export-mov').click();
  await expect(page.getByTestId('export-status')).toContainText(/\d+ \/ \d+/u, { timeout: 30_000 });
  await expect(page.getByTestId('export-mov')).toBeDisabled();
  await expect(page.getByTestId('export-apng-options')).toHaveClass(/inactive/);
  await expect(page.getByTestId('settings-column')).toHaveAttribute('inert', '');
  const started = Date.now();
  await page.getByTestId('export-cancel').click();
  await expect(page.getByTestId('export-mov')).toBeEnabled({ timeout: 5_000 });
  expect(Date.now() - started).toBeLessThan(1_500);
  await expect(page.getByTestId('export-progress')).toBeHidden();
  await expect(page.getByTestId('result-panel')).toBeHidden();
  await expect(page.getByTestId('export-apng-options')).not.toHaveClass(/inactive/);
  await smallScene(page);
  await page.getByTestId('export-mov').click();
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 60_000 });
});

test('MOV-04: jobs projected above 2 GB are refused before rendering', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'en' } });
  await setScene(page, { canvas: { preset: 'custom', width: 3840, height: 2160 }, motion: { holdDuration: 12 }, export: { fps: 60, movQuality: 'high' } });
  await openExport(page);
  await expect(page.getByTestId('export-mov-estimate')).toHaveClass(/warn/);
  await expect(page.getByTestId('export-mov-estimate')).toContainText('2 GB');
  await page.getByTestId('export-mov').click();
  await expect(page.getByTestId('toasts').locator('.toast.error')).toContainText('2 GB');
  await expect(page.getByTestId('result-panel')).toBeHidden();
  await expect(page.getByTestId('export-mov')).toBeEnabled();
});

test('MOV-07: the help dialog explains how to use the video in Keynote', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await page.getByTestId('open-help').click();
  await expect(page.getByTestId('help-keynote')).toHaveText('Keynote で使う');
  await expect(page.getByTestId('modal-help')).toContainText('ループ');
});
