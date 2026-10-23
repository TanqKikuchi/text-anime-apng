import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { gotoApp, scene } from './helpers';

const API = /^https:\/\/api\.anthropic\.com\/v1\/messages(\?.*)?$/;
const JA = { 'mojimotion.lang': 'ja' };
const KEY_STORAGE = { ...JA, 'mojimotion.ai.key': 'sk-ant-test' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

function message(content: unknown[], stopReason = 'tool_use') {
  return {
    id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: stopReason, stop_sequence: null,
    content, usage: { input_tokens: 4000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

async function mockApi(page: Page, handler: (body: Record<string, unknown>) => { status: number; json: unknown }): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = [];
  await page.route(API, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    const { status, json } = handler(body);
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return bodies;
}

test('AI-UI-01: without a key only the key form is shown and nothing is sent', async ({ page }) => {
  let called = false;
  await page.route(API, (route) => {
    called = true;
    return route.abort();
  });
  const app = await gotoApp(page, { storage: JA, waitFonts: false });
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await expect(page.getByTestId('ai-setup')).toBeVisible();
  await expect(page.getByTestId('ai-input')).toBeHidden();
  await expect(page.getByTestId('template-grid')).toBeVisible();
  expect(called).toBe(false);
  expect(app.errors).toEqual([]);
});

test('AI-UI-02: a request applies template, text and colour, and undo restores the previous design', async ({ page }) => {
  const app = await gotoApp(page, { storage: KEY_STORAGE, waitFonts: false });
  const horror = (await page.evaluate(() => window.__tanim!.listTemplates())).find((t) => t.mode === 'message' && t.category === 'horror')!;
  const before = await scene(page);
  const bodies = await mockApi(page, () => ({
    status: 200,
    json: message([{
      type: 'tool_use', id: 'toolu_e2e', name: 'apply_design',
      input: { templateId: horror.id, text: { main: '逃げろ', sub: '' }, patch: { style: { fill: { kind: 'solid', colors: ['#8B0000', '#8B0000', ''] } } }, reply: 'ホラー風にして文字を赤くしました。' },
    }]),
  }));

  await expect(page.getByTestId('ai-input')).toBeVisible();
  await page.getByTestId('ai-input').fill('ホラーっぽく、血の色で「逃げろ」');
  await page.getByTestId('ai-input').press('Enter');
  await expect(page.getByTestId('ai-log')).toContainText('ホラー風にして文字を赤くしました。');

  const after = await scene(page) as Awaited<ReturnType<typeof scene>> & { style: { fill: { colors: string[] } } };
  expect(after.text.main).toBe('逃げろ');
  expect(after.style.fill.colors[0]).toBe('#8B0000');
  await expect(page.locator('.tpl-card[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByTestId('ai-cost')).toContainText('円');

  // The request carried the key, the browser opt-in header's counterpart (model) and the current state.
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.model).toBe('claude-sonnet-5-5');
  expect(JSON.stringify(bodies[0]!.messages)).toContain('ホラーっぽく');

  await page.getByTestId('ai-undo').click();
  await expect(page.getByTestId('ai-log')).toContainText('取り消しました');
  expect((await scene(page)).text.main).toBe(before.text.main);
  await expect(page.getByTestId('ai-undo')).toBeDisabled();
  expect(app.errors).toEqual([]);
});

test('AI-UI-03: an invalid key shows a friendly error and keeps the typed request', async ({ page }) => {
  await gotoApp(page, { storage: KEY_STORAGE, waitFonts: false });
  await mockApi(page, () => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }));
  const before = await scene(page);
  await page.getByTestId('ai-input').fill('ポップにして');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-log').locator('[data-role="error"]')).toContainText('API キー');
  await expect(page.getByTestId('ai-input')).toHaveValue('ポップにして');
  expect((await scene(page)).text.main).toBe(before.text.main);
});

test('AI-UI-04: a question from the AI changes nothing, and the key can be saved and deleted', async ({ page }) => {
  await gotoApp(page, { storage: JA, waitFonts: false });
  await mockApi(page, () => ({ status: 200, json: message([{ type: 'text', text: 'どんな文字を出しますか?' }], 'end_turn') }));
  await page.getByTestId('ai-key').fill('sk-ant-typed');
  await page.getByTestId('ai-save-key').click();
  expect(await page.evaluate(() => localStorage.getItem('mojimotion.ai.key'))).toBe('sk-ant-typed');
  const before = await scene(page);
  await page.getByTestId('ai-input').fill('かっこよく');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-log')).toContainText('どんな文字を出しますか?');
  expect(await scene(page)).toEqual(before);
  await expect(page.getByTestId('ai-undo')).toBeDisabled();

  await page.getByTestId('ai-open-settings').click();
  await page.getByTestId('ai-forget-key').click();
  expect(await page.evaluate(() => localStorage.getItem('mojimotion.ai.key'))).toBeNull();
  await expect(page.getByTestId('ai-input')).toBeHidden();
});

test('AI-UI-05: "do not remember" keeps the key out of storage', async ({ page }) => {
  await gotoApp(page, { storage: JA, waitFonts: false });
  await page.getByTestId('ai-key').fill('sk-ant-temp');
  await page.getByTestId('ai-remember').uncheck();
  await page.getByTestId('ai-save-key').click();
  await expect(page.getByTestId('ai-input')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mojimotion.ai.key'))).toBeNull();
});
