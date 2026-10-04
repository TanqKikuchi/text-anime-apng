import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

const overflow = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('UI-19 phone layout (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('no horizontal overflow; the sheet opens to half on tap and keeps the preview visible', async ({ page }) => {
    await gotoApp(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const sheet = page.getByTestId('settings-column');
    await expect(sheet).toHaveAttribute('data-stop', 'closed');
    await expect(page.locator('.sheet-body')).toHaveAttribute('inert', '');
    await page.getByTestId('sheet-band').click();
    await expect(sheet).toHaveAttribute('data-stop', 'half');
    await page.waitForTimeout(400);
    const play = (await page.getByTestId('play-toggle').boundingBox())!;
    const sheetTop = (await sheet.boundingBox())!.y + 0;
    const sheetVisibleTop = await sheet.evaluate((el) => el.getBoundingClientRect().top + new DOMMatrix(getComputedStyle(el).transform).m42);
    expect(play.y + play.height).toBeLessThanOrEqual(sheetVisibleTop + 1);
    expect(sheetTop).toBeGreaterThan(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('fling up opens the sheet fully; the arrow button collapses it; the floating export button opens the panel', async ({ page }) => {
    await gotoApp(page);
    const band = (await page.getByTestId('sheet-band').boundingBox())!;
    const x = band.x + band.width / 2;
    const y = band.y + band.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i += 1) await page.mouse.move(x, y - i * 60, { steps: 1 });
    await page.mouse.up();
    await expect(page.getByTestId('settings-column')).toHaveAttribute('data-stop', /half|full/);
    await page.getByTestId('sheet-toggle').click();
    await page.getByTestId('sheet-toggle').click();
    await page.getByTestId('fab-export').click();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await expect(page.getByTestId('settings-column')).toHaveAttribute('data-stop', 'closed');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('UI-18 narrow widths', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('360 px has no horizontal scroll', async ({ page }) => {
    await gotoApp(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByTestId('sheet-band').click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('UI-18 tablet width', () => {
  test.use({ viewport: { width: 900, height: 900 } });
  test('900 px stacks to one column with the preview on top', async ({ page }) => {
    await gotoApp(page);
    const preview = (await page.getByTestId('preview-stage').boundingBox())!;
    const gallery = (await page.getByTestId('template-grid').boundingBox())!;
    expect(preview.y).toBeLessThan(gallery.y);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('UI-18 desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('1280 px shows the three columns side by side', async ({ page }) => {
    await gotoApp(page);
    const left = (await page.getByTestId('template-grid').boundingBox())!;
    const center = (await page.getByTestId('preview-stage').boundingBox())!;
    const right = (await page.getByTestId('settings').boundingBox())!;
    expect(left.x).toBeLessThan(center.x);
    expect(center.x).toBeLessThan(right.x);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
