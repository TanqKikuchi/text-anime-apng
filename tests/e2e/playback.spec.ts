import { expect, test } from '@playwright/test';
import { gotoApp, openGroup, pngStats, scene, setScene } from './helpers';

const readTime = async (page: import('@playwright/test').Page) => {
  const text = await page.getByTestId('time-readout').innerText();
  const [t, d] = text.match(/[\d.]+/gu)!.map(Number);
  return { t: t!, d: d! };
};

test('UI-13 / TL-17: autoplay, play/pause, seeking pauses, restart', async ({ page }) => {
  await gotoApp(page);
  const toggle = page.getByTestId('play-toggle');
  await expect(toggle).toHaveAttribute('data-state', 'playing');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-state', 'paused');
  const label = await toggle.getAttribute('aria-label');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-state', 'playing');
  expect(await toggle.getAttribute('aria-label')).not.toBe(label);
  await page.getByTestId('scrubber').fill('1');
  await expect(toggle).toHaveAttribute('data-state', 'paused');
  expect((await readTime(page)).t).toBeCloseTo(1, 1);
  await page.getByTestId('restart').click();
  await expect(toggle).toHaveAttribute('data-state', 'playing');
});

test('TL-17: with loop off playback stops at the end showing D', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { motion: { holdDuration: 0.2, preDelay: 0, postDelay: 0 } });
  await page.getByTestId('loop-switch').uncheck();
  await page.getByTestId('restart').click();
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'paused', { timeout: 15_000 });
  const { t, d } = await readTime(page);
  expect(t).toBe(d);
});

test('TL-17: hiding the tab pauses playback', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'paused');
});

test('TL-18: editing while paused at 0 shows the completed frame', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('scrubber').fill('0');
  await page.getByTestId('main-text').fill('編集した');
  const { t } = await readTime(page);
  expect(t).toBeGreaterThan(0);
});

test('TL-07 / UI-13: the preview exit switch and the motion exit switch stay in sync; EXP-04 toast offers play-once', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { export: { loop: { kind: 'forever' } } });
  await openGroup(page, 'motion');
  await page.getByTestId('exit-switch').uncheck();
  await expect(page.getByTestId('exit-switch-motion')).not.toBeChecked();
  const toast = page.getByTestId('toasts').locator('.toast').filter({ has: page.locator('.toast-action') });
  await expect(toast).toBeVisible();
  await toast.locator('.toast-action').click();
  expect((await scene(page)).export.loop.kind).toBe('once');
  await page.getByTestId('exit-switch-motion').check();
  await expect(page.getByTestId('exit-switch')).toBeChecked();
  // TL-07: with exit off the frame at D still shows text.
  await page.getByTestId('exit-switch').uncheck();
  const times = await page.evaluate(() => window.__tanim!.frameTimes());
  const last = await page.evaluate((t) => window.__tanim!.renderRgba(t), times[times.length - 1]!);
  expect((await pngStats(page, last.data)).opaque).toBeGreaterThan(100);
});

test('TL-19: rendering the same time twice gives identical pixels (glitch scene)', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { motion: { enter: { id: 'FX-I22' }, hold: { id: 'FX-H08' } } });
  const a = await page.evaluate(() => window.__tanim!.renderRgba(1.234));
  const b = await page.evaluate(() => window.__tanim!.renderRgba(1.234));
  expect(a.data).toBe(b.data);
});

test('UI-12: the preview background does not leak into the export', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('preview-bg').locator('[data-bg="black"]').click();
  await expect(page.getByTestId('preview-stage')).toHaveClass(/bg-black/);
  await setScene(page, { background: { kind: 'none' } });
  const png = await page.evaluate(() => window.__tanim!.exportBytes('png'));
  const stats = await pngStats(page, png, { x: 1, y: 1 });
  expect(stats.alphaAt).toBe(0);
  await page.getByTestId('preview-bg').locator('[data-bg="grey"]').click();
  await expect(page.getByTestId('preview-stage')).toHaveClass(/bg-grey/);
});

test('UI-12: the image background uses a picked file and is not stored', async ({ page }) => {
  await gotoApp(page);
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('bg-image-input').setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.getByTestId('preview-stage')).toHaveClass(/bg-image/);
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId('preview-stage')).toHaveClass(/bg-transparent/);
});
