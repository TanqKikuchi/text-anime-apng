import { expect, test } from '@playwright/test';
import { gotoApp, openExport, pngStats, scene, setScene } from './helpers';

test('UI-14 / EXP-17 / EXP-22: APNG export shows the result panel and downloads with the automatic name', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await setScene(page, { text: { main: '戦闘開始', sub: '' }, motion: { enter: { id: 'FX-I03' }, holdDuration: 0.3 }, export: { fps: 12, loop: { kind: 'once' } } });
  await openExport(page);
  await expect(page.getByTestId('export-filename')).toHaveValue('戦闘開始_降りてくる');
  await expect(page.getByTestId('filename-auto')).toBeVisible();
  await page.getByTestId('export-apng').click();
  const result = page.getByTestId('result-panel');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const meta = await page.getByTestId('result-meta').innerText();
  expect(meta).toMatch(/^戦闘開始_降りてくる\.png ・ \d+ KB ・ 1280 × 720 ・ \d+ フレーム \(保存 \d+ 枚\) ・ 256色.* ・ 1回再生$/u);
  await expect(page.getByTestId('result-advice')).toHaveClass(/ok/);
  await expect(page.getByTestId('result-image')).toHaveAttribute('src', /^blob:/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('result-download').click()]);
  expect(download.suggestedFilename()).toBe('戦闘開始_降りてくる.png');
  await page.getByTestId('result-clear').click();
  await expect(result).toBeHidden();
});

test('EXP-18 / EXP-19: PNG and ZIP exports download automatically', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'en' } });
  await setScene(page, { motion: { holdDuration: 0.2 }, export: { fps: 12 } });
  await openExport(page);
  const name = await page.getByTestId('export-filename').inputValue();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
  expect(png.suggestedFilename()).toBe(`${name}_still.png`);
  await expect(page.getByTestId('result-meta')).toContainText('PNG');
  const [zip] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('export-zip').click()]);
  expect(zip.suggestedFilename()).toBe(`${name}_frames.zip`);
  await expect(page.getByTestId('result-meta')).toContainText('12 FPS');
  await expect(page.getByTestId('result-image')).toBeHidden();
});

test('EXP-23 / EXP-22: manual names are sanitized; the reset button restores the automatic name', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { motion: { holdDuration: 0.2 }, export: { fps: 12 } });
  await openExport(page);
  const auto = await page.getByTestId('export-filename').inputValue();
  await page.getByTestId('export-filename').fill('a/b:c*?.png');
  await expect(page.getByTestId('filename-reset')).toBeVisible();
  await expect(page.getByTestId('filename-auto')).toBeHidden();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
  expect(png.suggestedFilename()).toBe('abc_still.png');
  await page.getByTestId('filename-reset').click();
  await expect(page.getByTestId('export-filename')).toHaveValue(auto);
  expect((await scene(page)).export.fileName).toBe('');
});

test('UI-14 / EXP-04 / EXP-21 / EXP-26 / EXP-27: export settings, count field and the info line', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await openExport(page);
  await expect(page.getByTestId('export-fps').locator('option')).toHaveCount(6);
  await expect(page.getByTestId('export-fps')).toHaveValue('24');
  await expect(page.getByTestId('export-colors')).toHaveValue('palette');
  await expect(page.getByTestId('export-default-image')).toBeChecked();
  await expect(page.getByTestId('export-autotrim')).not.toBeChecked();
  const frames = async () => Number((await page.getByTestId('export-info').innerText()).match(/(\d+)フレーム/u)![1]);
  await expect(page.getByTestId('export-info')).toHaveText(/^1280 × 720 ・ [\d.]+秒 ・ 24FPS ・ \d+フレーム$/u);
  const at24 = await frames();
  await page.getByTestId('export-fps').selectOption('60');
  const at60 = await frames();
  expect(Math.abs(at60 - at24 * 2.5)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('export-count')).toBeHidden();
  await page.getByTestId('export-loop').selectOption('count');
  await expect(page.getByTestId('export-count')).toBeVisible();
  await page.getByTestId('export-count').fill('1000');
  await page.getByTestId('export-count').press('Enter');
  await expect(page.getByTestId('export-count')).toHaveValue('999');
  expect((await scene(page)).export.loop).toEqual({ kind: 'count', count: 999 });
  await setScene(page, { text: { main: '一' }, motion: { preDelay: 0, holdDuration: 1.3, postDelay: 0, enter: { id: 'FX-I01', duration: 0.6, stagger: 0 }, exit: { id: 'FX-O01', duration: 0.6, stagger: 0 } }, export: { fps: 24 } });
  await expect(page.getByTestId('export-info')).toContainText('24FPS');
});

test('EXP-24: empty text blocks all three exports with a warning', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { text: { main: '   ', sub: '' } });
  await openExport(page);
  let downloads = 0;
  page.on('download', () => (downloads += 1));
  for (const kind of ['apng', 'png', 'zip']) {
    await page.getByTestId(`export-${kind}`).click();
    await expect(page.getByTestId('toasts').locator('.toast.warning').last()).toBeVisible();
  }
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
  await expect(page.getByTestId('result-panel')).toBeHidden();
});

test('EXP-16 / EXP-25: a long export can be cancelled, the UI is locked meanwhile, and exporting works again', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoApp(page);
  await setScene(page, { canvas: { preset: 'fhd', width: 1920, height: 1080 }, motion: { holdDuration: 10, hold: { id: 'FX-H04' } }, export: { fps: 30, colorMode: 'palette' } });
  await openExport(page);
  await page.getByTestId('export-apng').click();
  await expect(page.getByTestId('export-status')).toContainText(/\d+ \/ \d+/u, { timeout: 30_000 });
  await expect(page.getByTestId('export-apng')).toBeDisabled();
  await expect(page.getByTestId('settings-column')).toHaveAttribute('inert', '');
  await page.keyboard.press('Control+Shift+Digit2');
  expect((await scene(page)).mode).toBe('message');
  await page.locator('.mode-tab[data-mode="trailer"]').click({ force: true });
  expect((await scene(page)).mode).toBe('message');
  await page.getByTestId('export-cancel').click();
  await expect(page.getByTestId('export-apng')).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByTestId('export-progress')).toBeHidden();
  await expect(page.getByTestId('result-panel')).toBeHidden();
  await expect(page.getByTestId('settings-column')).not.toHaveAttribute('inert', '');
  await setScene(page, { canvas: { preset: 'light', width: 960, height: 540 }, motion: { holdDuration: 0.2, hold: { id: 'FX-H00' } }, export: { fps: 12 } });
  await page.getByTestId('export-apng').click();
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 60_000 });
});

test('EXP-01 / D-05b: frame and pixel limits stop the export with an error', async ({ page }) => {
  await gotoApp(page);
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await setScene(page, { motion: { trailer: { flow: 'scroll', scrollSpeed: 10 } }, export: { fps: 60 } });
  await openExport(page);
  await page.getByTestId('export-apng').click();
  await expect(page.getByTestId('toasts').locator('.toast.error')).toContainText('1800');
  await expect(page.getByTestId('result-panel')).toBeHidden();
  await page.locator('.mode-tab[data-mode="message"]').click();
  await setScene(page, { canvas: { preset: 'custom', width: 3840, height: 2160 }, export: { fps: 60 } });
  await page.getByTestId('export-zip').click();
  await expect(page.getByTestId('toasts').locator('.toast.error')).toHaveCount(2);
  await expect(page.getByTestId('result-panel')).toBeHidden();
});

test('DEC-21: a 50 % solid background exports with alpha ≈ 128; none keeps it transparent', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { background: { kind: 'solid', color: '#000000', opacity: 0.5, syncFade: false } });
  const solid = await pngStats(page, await page.evaluate(() => window.__tanim!.exportBytes('png')), { x: 2, y: 2 });
  expect(Math.abs(solid.alphaAt - 128)).toBeLessThanOrEqual(1);
  await setScene(page, { background: { kind: 'none' } });
  const none = await pngStats(page, await page.evaluate(() => window.__tanim!.exportBytes('png')), { x: 2, y: 2 });
  expect(none.alphaAt).toBe(0);
});

test.describe('EXP-10 without CompressionStream', () => {
  test('APNG export shows an error and creates no file', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'CompressionStream', { value: undefined, configurable: true });
    });
    await gotoApp(page);
    await openExport(page);
    await page.getByTestId('export-apng').click();
    await expect(page.getByTestId('toasts').locator('.toast.error')).toBeVisible();
    await expect(page.getByTestId('result-panel')).toBeHidden();
  });
});
