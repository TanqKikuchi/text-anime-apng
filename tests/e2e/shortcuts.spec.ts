import { expect, test } from '@playwright/test';
import { gotoApp, scene, setScene } from './helpers';

test('KEY-01: Ctrl+Shift+1/2/3 switch modes, Ctrl+Shift+T toggles the theme, Ctrl+Shift+P toggles playback', async ({ page }) => {
  await gotoApp(page);
  await page.keyboard.press('Control+Shift+Digit2');
  expect((await scene(page)).mode).toBe('trailer');
  await page.keyboard.press('Control+Shift+Digit3');
  expect((await scene(page)).mode).toBe('place-time');
  // Works with focus inside a text field too.
  await page.getByTestId('main-text').focus();
  await page.keyboard.press('Control+Shift+Digit1');
  expect((await scene(page)).mode).toBe('message');
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.keyboard.press('Control+Shift+KeyT');
  expect(await page.locator('html').getAttribute('data-theme')).not.toBe(theme);
  const state = await page.getByTestId('play-toggle').getAttribute('data-state');
  await page.keyboard.press('Control+Shift+KeyP');
  await expect(page.getByTestId('play-toggle')).not.toHaveAttribute('data-state', state!);
  // Shift without Ctrl/Cmd/Alt does nothing.
  await page.keyboard.press('Shift+Digit2');
  expect((await scene(page)).mode).toBe('message');
});

test('KEY-01: Ctrl+Shift+K exports a still PNG and Ctrl+Shift+E an APNG', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { motion: { holdDuration: 0.2 }, export: { fps: 12 } });
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+Shift+KeyK')]);
  expect(download.suggestedFilename()).toMatch(/_still\.png$/u);
  await page.keyboard.press('Control+Shift+KeyE');
  await expect(page.getByTestId('result-meta')).toContainText('.png', { timeout: 60_000 });
});

test('KEY-03 / UI-16: Esc closes an open dialog first, then pauses playback', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('open-help').click();
  await expect(page.getByTestId('modal-help')).toBeVisible();
  await page.getByTestId('open-help').evaluate(() => undefined);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('modal-help')).toBeHidden();
  await page.getByTestId('play-toggle').evaluate((el) => el.getAttribute('data-state') === 'paused' && (el as HTMLButtonElement).click());
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'playing');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'paused');
});
