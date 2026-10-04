import { expect, test } from '@playwright/test';
import { gotoApp, openGroup, scene, setScene } from './helpers';

test('UI-03 / KEY-02: mode tabs switch by click and arrow keys; settings tabs wrap around', async ({ page }) => {
  await gotoApp(page);
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  expect((await scene(page)).mode).toBe('trailer');
  await expect(page.locator('.mode-tab[data-mode="trailer"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('.mode-tab[data-mode="trailer"]').press('ArrowRight');
  expect((await scene(page)).mode).toBe('place-time');
  await expect(page.locator('.mode-tab[data-mode="place-time"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect((await scene(page)).mode).toBe('message');
  await page.keyboard.press('End');
  expect((await scene(page)).mode).toBe('place-time');
  await openGroup(page, 'layout');
  await page.locator('.rail-tab[data-group="layout"]').press('ArrowRight');
  await expect(page.locator('.rail-tab[data-group="text"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#group-text')).toBeVisible();
  await expect(page.locator('.rail-tab[data-group="text"]')).toHaveAttribute('tabindex', '0');
});

test('UI-06: trailer hides the sub text and shows the wrap slider', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByTestId('sub-text')).toBeVisible();
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await expect(page.getByTestId('sub-text')).toBeHidden();
  await expect(page.getByTestId('max-chars')).toBeVisible();
});

test('LAY-09: vertical writing relabels the alignment buttons', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  const start = page.getByTestId('alignment').locator('[data-value="start"]');
  await expect(start).toHaveText('左');
  await page.getByTestId('writing-mode').locator('[data-value="vertical"]').click();
  await expect(start).toHaveText('上');
  expect((await scene(page)).layout).toMatchObject({ writingMode: 'vertical' });
});

test('LAY-12: overflowing text shows the auto-shrink note; turning shrink off hides it', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { text: { main: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ', mainFont: { size: 120 } }, canvas: { preset: 'hd', width: 1280, height: 720 } });
  await expect(page.getByTestId('shrink-note')).toBeVisible();
  await expect(page.getByTestId('shrink-note')).toContainText('120');
  await page.getByTestId('auto-shrink').locator('xpath=..').click();
  await expect(page.getByTestId('shrink-note')).toBeHidden();
});

test('UI-05: slider moves update the scene; out-of-range numbers are clamped', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'font');
  const field = page.getByTestId('font-size').locator('xpath=ancestor::div[contains(@class,"field-slider")]');
  const number = field.locator('input[type="number"]');
  await number.fill('999');
  await number.press('Enter');
  await expect(number).toHaveValue('400');
  expect((await scene(page)).text.mainFont.weight).toBeGreaterThan(0);
  expect(((await scene(page)).text.mainFont as unknown as { size: number }).size).toBe(400);
  await page.getByTestId('font-size').fill('80');
  expect(((await scene(page)).text.mainFont as unknown as { size: number }).size).toBe(80);
});

test('LAY-16 / TPL-02: custom size clamps to 3840 and survives a template change', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'layout');
  await page.getByTestId('canvas-preset').selectOption('custom');
  await page.getByTestId('canvas-width').fill('5000');
  await page.getByTestId('canvas-width').press('Enter');
  await page.getByTestId('canvas-width').blur();
  await expect(page.getByTestId('canvas-width')).toHaveValue('3840');
  await page.locator('[data-template="msg-battle-round"]').click();
  expect((await scene(page)).canvas.width).toBe(3840);
});

test('UI-11: a portrait canvas gives a portrait preview that fits', async ({ page }) => {
  await gotoApp(page);
  await setScene(page, { canvas: { preset: 'portrait', width: 720, height: 1280 } });
  await page.waitForTimeout(200);
  const box = (await page.getByTestId('preview-stage').boundingBox())!;
  expect(box.height).toBeGreaterThan(box.width);
  expect(box.y + box.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 900) + 1);
});

test('UI-07 / FNT-05 / FNT-06: picking a single-weight font snaps the weight; the latin tab lists latin fonts', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'font');
  await page.getByTestId('font-picker').click();
  await page.locator('.fp-tabs [data-category="latin"]').click();
  const families = await page.getByTestId('font-grid').locator('.fp-card').evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.family));
  expect(families).toContain('Cinzel');
  expect(families).not.toContain('Noto Sans JP');
  await page.locator('.fp-tabs [data-category="design"]').click();
  await page.locator('.fp-card[data-family="Stick"]').click();
  const s = await scene(page);
  expect(s.text.mainFont.family).toBe('Stick');
  expect(s.text.mainFont.weight).toBe(400);
  await expect(page.getByTestId('font-weight').locator('option')).toHaveCount(1);
});

test('FNT-08: an unknown local font name warns and keeps the font', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'font');
  const before = (await scene(page)).text.mainFont.family;
  await page.getByTestId('font-picker').click();
  await page.getByTestId('local-font-input').fill('No Such Font 12345');
  await page.getByTestId('local-font-input').press('Enter');
  await expect(page.getByTestId('toasts').locator('.toast.warning')).toBeVisible();
  expect((await scene(page)).text.mainFont.family).toBe(before);
});

test('UI-08 / FX-03: effect cards initialise parameters; typewriter hides duration and curve; scroll hides exit', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'motion');
  await page.getByTestId('enter-cards').locator('[data-effect="FX-I09"]').click();
  let s = await scene(page);
  expect(s.motion.enter.id).toBe('FX-I09');
  expect(s.motion.enter.duration).toBeCloseTo(0.5);
  expect(s.motion.enter.stagger).toBeCloseTo(0.07);
  await expect(page.getByTestId('enter-cards').locator('[data-effect="FX-I09"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('enter-cards').locator('[data-effect="FX-I15"]').click();
  await expect(page.getByTestId('enter-duration')).toBeHidden();
  await expect(page.getByTestId('enter-easing')).toBeHidden();
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await page.getByTestId('flow').locator('[data-value="scroll"]').click();
  await expect(page.getByTestId('exit-section')).toBeHidden();
  await expect(page.getByTestId('hold-duration')).toBeHidden();
  await expect(page.getByTestId('exit-switch')).toBeDisabled();
  s = await scene(page);
  expect(s.mode).toBe('trailer');
});

test('FX-04: trailer lists no block effects; hovering a card animates it and leaving restores the still', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'motion');
  const card = page.getByTestId('enter-cards').locator('[data-effect="FX-I02"]');
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const still = await card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await card.hover();
  const frames = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(150);
    frames.add(await card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL()));
  }
  expect(frames.size).toBeGreaterThan(1);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
  expect(await card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(still);
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await expect(page.getByTestId('enter-cards').locator('[data-effect="FX-I17"]')).toHaveCount(0);
  await expect(page.getByTestId('enter-cards').locator('[data-effect="FX-I07"]')).toHaveCount(0);
  await expect(page.getByTestId('enter-cards').locator('[data-effect="FX-I01"]')).toHaveCount(1);
});

test('TL-14: the motion tab shows the total length with the page count', async ({ page }) => {
  await gotoApp(page, { storage: { 'mojimotion.lang': 'ja' } });
  await page.locator('.mode-tab[data-mode="trailer"]').click();
  await setScene(page, { text: { main: '一\n\n二\n\n三', splitPages: true }, motion: { trailer: { flow: 'simultaneous' } } });
  await openGroup(page, 'motion');
  await expect(page.getByTestId('total-length')).toContainText('3 ページ');
});

test('UI-09: switching the shadow off hides its fields; DEC-22 presets change only the paint and toast', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'decoration');
  await setScene(page, { style: { shadow: { enabled: true } } });
  await expect(page.getByTestId('shadow-blur')).toBeVisible();
  await page.getByTestId('shadow-switch').click();
  await expect(page.getByTestId('shadow-blur')).toBeHidden();
  expect(((await scene(page)).style as { shadow: { enabled: boolean } }).shadow.enabled).toBe(false);
  const before = await scene(page);
  await page.getByTestId('style-presets').locator('[data-preset="neon"]').click();
  await expect(page.getByTestId('toasts').locator('.toast.success')).toBeVisible();
  const after = await scene(page);
  expect(after.text.main).toBe(before.text.main);
  expect(after.motion).toEqual(before.motion);
  expect((after.style as { glow: { enabled: boolean } }).glow.enabled).toBe(true);
});

test('DEC-08: noise colours appear only for glitch effects', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'decoration');
  await setScene(page, { motion: { enter: { id: 'FX-I01' }, exit: { id: 'FX-O01' }, hold: { id: 'FX-H00' } } });
  await expect(page.getByTestId('glitch-color-1')).toBeHidden();
  await setScene(page, { motion: { enter: { id: 'FX-I22' } } });
  await expect(page.getByTestId('glitch-color-1')).toBeVisible();
});

test('UI-10: the hazard tape shows the tape fields; the glow note appears for glow pulse without glow', async ({ page }) => {
  await gotoApp(page);
  await openGroup(page, 'layout');
  await page.getByTestId('decoration-kind').locator('[data-value="hazard"]').click();
  const section = page.getByTestId('decoration-section');
  const visibleLabels = await section.locator('.field-label:visible, .field-toggle:visible span').allInnerTexts();
  expect(visibleLabels.length).toBeGreaterThanOrEqual(5);
  await page.getByTestId('decoration-kind').locator('[data-value="box"]').click();
  await setScene(page, { motion: { hold: { id: 'FX-H05' } }, style: { glow: { enabled: false } } });
  await openGroup(page, 'motion');
  await expect(page.getByTestId('glow-off-note')).toBeVisible();
});
