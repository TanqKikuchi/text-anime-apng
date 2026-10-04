import { expect, test } from '@playwright/test';
import { gotoApp, waitFonts } from './helpers';

const RAW_KEY = /\b(?:app|header|field|opt|note|heading|toast|export|result|progress|status|error|template|category|settings|preview|transport|legend|loop|colors|sheet|help|notes|shortcuts|font|fontCat|weight|flow|fx|easing|order|direction|deco|bg|canvas|anchor|unit|mode|preset|gradient|badge|system|filename|common|lang|footer|color)\.[a-zA-Z][\w.-]+/u;

for (const lang of ['ja', 'en', 'ko'] as const) {
  test(`UI-01 / I18N-02: loads in ${lang} without console errors or raw keys`, async ({ page }) => {
    const app = await gotoApp(page, { storage: { 'mojimotion.lang': lang } });
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByTestId('preview-canvas')).toBeVisible();
    await expect(page.getByTestId('mode-tabs')).toBeVisible();
    await expect(page.getByTestId('template-grid')).toBeVisible();
    await expect(page.getByTestId('settings-tabs')).toBeVisible();
    await expect(page.getByTestId('transport')).toBeVisible();
    await expect(page.getByTestId('open-export')).toBeVisible();
    // Visit every settings group and the export panel so their labels are checked too.
    for (const group of ['text', 'font', 'motion', 'decoration', 'layout']) {
      await page.locator(`.rail-tab[data-group="${group}"]`).click();
      const text = await page.locator(`#group-${group}`).innerText();
      expect(text, group).not.toMatch(RAW_KEY);
    }
    await page.getByTestId('open-export').click();
    expect(await page.getByTestId('export-panel').innerText()).not.toMatch(RAW_KEY);
    for (const id of ['help', 'notes', 'shortcuts'] as const) {
      await page.getByTestId(`open-${id}`).click();
      const dialog = page.getByTestId(`modal-${id}`);
      await expect(dialog).toBeVisible();
      expect(await dialog.innerText()).not.toMatch(RAW_KEY);
      await page.getByTestId(`close-${id}`).click();
      await expect(dialog).toBeHidden();
    }
    expect(await page.locator('body').innerText()).not.toMatch(RAW_KEY);
    expect(app.errors).toEqual([]);
  });
}

test('UI-02 / I18N-01: language buttons switch every label at once and update <html lang> and the title', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await expect(page.locator('.mode-tab[data-mode="message"] .mode-name')).toHaveText('メッセージ');
  await page.locator('[data-lang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.mode-tab[data-mode="message"] .mode-name')).toHaveText('Message');
  await expect(page).toHaveTitle(/MojiMotion/);
  await expect(page.locator('[data-lang="en"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-lang="ko"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
});

test.describe('I18N-01 browser language', () => {
  test.use({ locale: 'en-US' });
  test('an English browser without a saved choice starts in English', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test('UI-16: help, notes and shortcut dialogs open one at a time and close with ×', async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('open-help').click();
  await expect(page.getByTestId('modal-help')).toBeVisible();
  await expect(page.getByTestId('open-help')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('close-help').click();
  await expect(page.getByTestId('open-help')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('open-shortcuts').click();
  await expect(page.getByTestId('modal-shortcuts').locator('kbd').first()).toBeVisible();
  await expect(page.getByTestId('modal-help')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('modal-shortcuts')).toBeHidden();
});

test('UI-20: the footer opens the notes dialog (local processing, font licences)', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'en' } });
  await page.getByTestId('footer-notes').click();
  const notes = page.getByTestId('modal-notes');
  await expect(notes).toBeVisible();
  await expect(notes).toContainText('OFL');
});

test('UI-15: theme toggles, survives reload and follows the OS when nothing is saved', async ({ page, browser }) => {
  await gotoApp(page);
  const initial = await page.locator('html').getAttribute('data-theme');
  await page.getByTestId('theme-toggle').click();
  const toggled = await page.locator('html').getAttribute('data-theme');
  expect(toggled).not.toBe(initial);
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-label', /./);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', toggled!);
  const dark = await browser.newContext({ colorScheme: 'dark' });
  const darkPage = await dark.newPage();
  await gotoApp(darkPage, { waitFonts: false });
  await expect(darkPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dark.close();
});

test('accessibility: visible form controls have accessible names', async ({ page }) => {
  await gotoApp(page);
  for (const group of ['text', 'font', 'motion', 'decoration', 'layout']) {
    await page.locator(`.rail-tab[data-group="${group}"]`).click();
    const unlabeled = await page.evaluate(() => {
      const missing: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea, button')) {
        if (el.offsetParent === null || el.closest('[hidden]')) continue;
        const input = el as HTMLInputElement;
        const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (input.labels && input.labels.length > 0) || (el.tagName === 'BUTTON' && el.textContent?.trim()) || el.getAttribute('title');
        if (!named) missing.push(el.outerHTML.slice(0, 80));
      }
      return missing;
    });
    expect(unlabeled, group).toEqual([]);
  }
});

test('UI-21: a font that fails to load shows a fallback warning and drawing continues', async ({ page }) => {
  await page.route(/css2\?family=Rampart\+One/u, (route) => route.abort());
  await gotoApp(page, { storage: { 'mojimotion.lang': 'en' } });
  await page.evaluate(() => window.__tanim!.setScene({ text: { mainFont: { family: 'Rampart One' } } }));
  await waitFonts(page);
  await expect(page.getByTestId('toasts').locator('.toast.warning')).toContainText('Rampart One');
  const frame = await page.evaluate(() => window.__tanim!.renderRgba(1.2));
  expect(frame.width).toBe(1280);
});

test('FNT-02: choosing a font requests its CSS once', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('css2?family=Train+One') && !request.url().includes('text=')) requests.push(request.url());
  });
  await gotoApp(page);
  await page.evaluate(() => window.__tanim!.setScene({ text: { mainFont: { family: 'Train One' } } }));
  await waitFonts(page);
  await page.evaluate(() => window.__tanim!.setScene({ text: { main: '別の文' } }));
  await waitFonts(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain('display=swap');
});
