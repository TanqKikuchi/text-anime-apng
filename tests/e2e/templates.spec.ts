import { expect, test } from '@playwright/test';
import { gotoApp, pngStats, scene, setScene, waitFonts } from './helpers';

test('TPL-01: every template renders a non-empty frame', async ({ page }) => {
  test.setTimeout(240_000);
  await gotoApp(page);
  const templates = await page.evaluate(() => window.__tanim!.listTemplates());
  expect(templates.length).toBeGreaterThanOrEqual(46);
  expect(new Set(templates.map((t) => t.mode))).toEqual(new Set(['message', 'trailer', 'place-time']));
  for (const template of templates) {
    await page.evaluate((id) => window.__tanim!.applyTemplate(id), template.id);
    await waitFonts(page);
    const times = await page.evaluate(() => window.__tanim!.frameTimes());
    // Sample a few frames across the timeline; the busiest one must have visible pixels.
    const samples = [0.25, 0.5, 0.75].map((f) => times[Math.floor((times.length - 1) * f)]!);
    let best = 0;
    for (const time of samples) {
      const frame = await page.evaluate((t) => window.__tanim!.renderRgba(t), time);
      const stats = await pngStats(page, frame.data);
      best = Math.max(best, stats.opaque);
      if (best > 200) break;
    }
    expect(best, template.id).toBeGreaterThan(200);
  }
});

test('TPL-01 / UI-04: message categories filter the cards without moving the settings', async ({ page }) => {
  await gotoApp(page);
  const grid = page.getByTestId('template-grid');
  const before = await grid.boundingBox();
  const settingsTop = (await page.getByTestId('settings-tabs').boundingBox())!.y;
  await page.getByTestId('categories').locator('[data-category="gm"]').click();
  await expect(page.getByTestId('categories').locator('[data-category="gm"]')).toHaveAttribute('aria-pressed', 'true');
  const ids = await grid.locator('.tpl-card').evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.template));
  expect(ids.every((id) => id?.startsWith('msg-gm-'))).toBe(true);
  const after = await grid.boundingBox();
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
  expect((await page.getByTestId('settings-tabs').boundingBox())!.y).toBe(settingsTop);
});

test('TPL-04: the roll category shows a system row; switching system selects its first template', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('categories').locator('[data-category="roll"]').click();
  await expect(page.getByTestId('systems')).toBeVisible();
  expect((await scene(page)).mode).toBe('message');
  await page.getByTestId('systems').locator('[data-system="2d6"]').click();
  await expect(page.locator('.tpl-card[aria-pressed="true"]')).toHaveAttribute('data-template', /msg-roll-2d6-/);
  await page.getByTestId('categories').locator('[data-category="battle"]').click();
  await expect(page.getByTestId('systems')).toBeHidden();
});

test('TPL-02 / UI-17: applying a template keeps the size and exit switch and shows a success toast', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { canvas: { preset: 'fhd', width: 1920, height: 1080 }, motion: { exitEnabled: false } });
  await page.locator('[data-template="msg-battle-victory"]').click();
  const toast = page.getByTestId('toasts').locator('.toast.success');
  await expect(toast).toBeVisible();
  const s = await scene(page);
  expect(s.canvas.width).toBe(1920);
  expect(s.canvas.height).toBe(1080);
  expect(s.motion.exitEnabled).toBe(false);
  await expect(toast).toBeHidden({ timeout: 10_000 });
});

test('TPL-06: GM templates loop forever, battle templates play once', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('categories').locator('[data-category="gm"]').click();
  expect((await scene(page)).export.loop.kind).toBe('forever');
  await page.getByTestId('categories').locator('[data-category="battle"]').click();
  expect((await scene(page)).export.loop.kind).toBe('once');
});

test('TPL-03: edited message text is remembered per template; place/time text is shared', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('main-text').fill('書き換えた文');
  await page.locator('[data-template="msg-battle-victory"]').click();
  expect((await scene(page)).text.main).not.toBe('書き換えた文');
  await page.locator('[data-template="msg-battle-clash"]').click();
  await expect(page.getByTestId('main-text')).toHaveValue('書き換えた文');
  await page.locator('.mode-tab[data-mode="place-time"]').click();
  await page.getByTestId('main-text').fill('港町の朝');
  const second = page.locator('.tpl-card').nth(1);
  await second.click();
  await expect(page.getByTestId('main-text')).toHaveValue('港町の朝');
});

test('I18N-03: untouched sample text follows the language; edited text stays', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await page.locator('[data-lang="en"]').click();
  expect((await scene(page)).text.main).toBe('Hour of Reckoning');
  await page.getByTestId('main-text').fill('My own words');
  await page.locator('[data-lang="ko"]').click();
  expect((await scene(page)).text.main).toBe('My own words');
});

test('TPL-05: reset asks for confirmation and only resets the current mode', async ({ page }) => {
  await gotoApp(page);
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await page.getByTestId('main-text').fill('トレイラーの文');
  await page.locator('.mode-tab[data-mode="message"]').click();
  await page.getByTestId('main-text').fill('消える文');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('reset-mode').click();
  await expect(page.getByTestId('main-text')).not.toHaveValue('消える文');
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await expect(page.getByTestId('main-text')).toHaveValue('トレイラーの文');
});
