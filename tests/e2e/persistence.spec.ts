import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { gotoApp, openExport, openGroup, scene, setScene, waitFonts } from './helpers';

test('STO-01: mode, settings tab, scene and export settings persist across reload', async ({ page }) => {
  await gotoApp(page);
  await page.locator('.mode-tab[data-mode="place-time"]').click();
  await page.getByTestId('main-text').fill('保存される文');
  await openGroup(page, 'decoration');
  await openExport(page);
  await page.getByTestId('export-fps').selectOption('30');
  await page.getByTestId('export-colors').selectOption('full');
  await page.getByTestId('preview-bg').locator('[data-bg="white"]').click({ force: true });
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.__tanim !== undefined);
  const s = await scene(page);
  expect(s.mode).toBe('place-time');
  expect(s.text.main).toBe('保存される文');
  expect(s.export.fps).toBe(30);
  await expect(page.locator('.rail-tab[data-group="decoration"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('preview-stage')).toHaveClass(/bg-white/);
  // STO-02: start-up shows the completed time, then plays.
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'playing');
});

test('STO-02: a broken saved value still boots with defaults; old data fills missing fields', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.state': '{"version":2,"mode":"trailer",' } });
  expect((await scene(page)).mode).toBe('message');
  const page2 = await page.context().newPage();
  await gotoApp(page2, { storage: { 'mojimotion.state': JSON.stringify({ version: 1, mode: 'trailer', modes: { trailer: { templateId: 'tr-cinema-title', scene: { text: { main: '古いデータ' } } } } }) } });
  const s = await scene(page2);
  expect(s.mode).toBe('trailer');
  expect(s.text.main).toBe('古いデータ');
  expect(s.export.fps).toBe(24);
});

test('STO-03: language and theme survive a mode reset', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ko', 'mojimotion.theme': 'dark' } });
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('reset-mode').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
});

test.describe('STO-01 without storage', () => {
  test('the app works when localStorage throws', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__tanim !== undefined);
    await waitFonts(page);
    await page.getByTestId('main-text').fill('保存できなくても動く');
    await page.waitForTimeout(500);
    expect((await scene(page)).text.main).toBe('保存できなくても動く');
    expect(errors).toEqual([]);
  });
});

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Courier New.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  'C:/Windows/Fonts/arial.ttf',
];

test('FNT-07 / STO-04 / FNT-09: an uploaded font is selected, survives reload and can be removed', async ({ page }) => {
  const path = FONT_CANDIDATES.find((candidate) => existsSync(candidate));
  test.skip(!path, 'no TTF file available on this machine');
  await gotoApp(page, { storage: { 'mojimotion.lang': 'en' } });
  await openGroup(page, 'font');
  await page.getByTestId('font-upload').setInputFiles({ name: 'TestFace.ttf', mimeType: 'font/ttf', buffer: readFileSync(path!) });
  await expect.poll(async () => (await scene(page)).text.mainFont.family).toMatch(/^MojiMotion User /u);
  const family = (await scene(page)).text.mainFont.family;
  await expect(page.locator('.fp-name')).toHaveText('TestFace');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.__tanim !== undefined);
  expect((await scene(page)).text.mainFont.family).toBe(family);
  await openGroup(page, 'font');
  await page.getByTestId('font-picker').click();
  await page.locator('.fp-tabs [data-category="mine"]').click();
  const remove = page.locator('.fp-card-wrap .fp-remove').first();
  await remove.click();
  await expect(remove).toHaveClass(/armed/);
  await remove.click();
  await expect.poll(async () => (await scene(page)).text.mainFont.family).toBe('Noto Sans JP');
  await expect(page.getByTestId('toasts').locator('.toast.success').last()).toBeVisible();
});

test('FNT-07: a non-font file shows the supported formats error', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'font');
  await page.getByTestId('font-upload').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('toasts').locator('.toast.error')).toBeVisible();
  void setScene;
});
