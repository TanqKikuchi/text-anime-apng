#!/usr/bin/env node
/**
 * Writes export fixtures for independent verification (tools/verify_apng.py, tools/compare_frames.py).
 *
 * For every case: fixtures_out/<case>/out.apng, out.zip, expected/frame_XXXX.png (window.__tanim.renderRgba
 * at each frameTimes() entry, untrimmed) and case.json (expected width/height/fps/loop/num_plays/total_ms/
 * default image flag …). Uses Node + Playwright with the Chrome channel.
 *
 * Usage: node tools/e2e_export_fixtures.mjs [--only <substring>]
 * Base URL: env E2E_BASE_URL, else http://localhost:4173/ (a `vite preview` server is started when nothing answers there).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fixtures_out');
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173/';
const FONT_WAIT_MS = 25_000;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

// Small canvas + 12 fps keep the fixture set reasonably sized.
const SMALL = { preset: 'custom', width: 640, height: 360 };

const COMBOS = [
  { color: 'full', defaultImage: true, loop: { kind: 'once' } },
  { color: 'full', defaultImage: false, loop: { kind: 'forever' } },
  { color: 'palette', defaultImage: true, loop: { kind: 'count', count: 3 } },
  { color: 'palette', defaultImage: false, loop: { kind: 'once' } },
];

const TEMPLATE_CASES = {
  message: ['msg-battle-clash', 'msg-mystery-alert'],
  trailer: ['tr-letter-typewriter', 'tr-oath-lines'],
  'place-time': ['pt-harbor-converge', 'pt-temple-vertical'],
};

function buildCases() {
  const cases = [];
  for (const [mode, templates] of Object.entries(TEMPLATE_CASES)) {
    templates.forEach((template, templateIndex) => {
      COMBOS.forEach((combo, comboIndex) => {
        // Rotate the combos so each template still covers all four, but the loop/colour pairing varies.
        const c = COMBOS[(comboIndex + templateIndex) % COMBOS.length];
        void combo;
        cases.push({
          name: `${mode}__${template}__${c.color}__${c.defaultImage ? 'img' : 'noimg'}__${c.loop.kind}`,
          mode,
          template,
          patch: { canvas: SMALL, export: { fps: 12, colorMode: c.color, includeDefaultImage: c.defaultImage, autoTrim: false, loop: c.loop } },
          pixel: true,
        });
      });
    });
  }
  const edge = (name, template, patch, extra = {}) => cases.push({ name: `edge__${name}`, mode: null, template, patch, pixel: true, ...extra });
  const exportBase = (color, overrides = {}) => ({ fps: 12, colorMode: color, includeDefaultImage: true, autoTrim: false, loop: { kind: 'once' }, ...overrides });
  edge('transparent_move_erase', 'msg-battle-clash', {
    canvas: SMALL,
    background: { kind: 'none' },
    style: { decoration: { kind: 'none' } },
    motion: { enter: { id: 'FX-I05', duration: 0.5, stagger: 0.05, direction: 'left' }, exit: { id: 'FX-O11', duration: 0, stagger: 0.08, order: 'reverse' }, hold: { id: 'FX-H00' }, holdDuration: 0.5 },
    export: exportBase('full'),
  });
  edge('transparent_move_erase_palette', 'msg-battle-clash', {
    canvas: SMALL,
    background: { kind: 'none' },
    style: { decoration: { kind: 'none' } },
    motion: { enter: { id: 'FX-I02', duration: 0.5, stagger: 0.05 }, exit: { id: 'FX-O11', duration: 0, stagger: 0.08, order: 'reverse' }, hold: { id: 'FX-H00' }, holdDuration: 0.5 },
    export: exportBase('palette', { includeDefaultImage: false }),
  });
  edge('identical_consecutive_frames', 'msg-scene-chapter', {
    canvas: SMALL,
    motion: { hold: { id: 'FX-H00' }, holdDuration: 3, preDelay: 1, postDelay: 1 },
    style: { decoration: { kind: 'none' } },
    export: exportBase('palette'),
  });
  edge('single_stored_frame', 'msg-gm-simple', {
    canvas: SMALL,
    text: { sub: '' },
    background: { kind: 'none' },
    style: { decoration: { kind: 'none', animation: 'none' } },
    motion: { enter: { id: 'FX-I15', duration: 0, stagger: 0 }, hold: { id: 'FX-H00' }, exitEnabled: false, preDelay: 0, holdDuration: 0.5, postDelay: 0.3 },
    export: exportBase('full', { loop: { kind: 'forever' } }),
  });
  edge('empty_text', 'msg-battle-clash', { canvas: SMALL, text: { main: '', sub: '' }, export: exportBase('full') }, { expectError: 'empty', pixel: false });
  edge('combining_and_emoji', 'msg-gm-simple', {
    canvas: SMALL,
    text: { main: 'がぎ é́ 👨‍👩‍👧 🇯🇵', sub: 'ñ̃ 👍🏽' },
    export: exportBase('full'),
  });
  edge('combining_and_emoji_palette', 'msg-gm-simple', {
    canvas: SMALL,
    text: { main: 'Å̊ 🧑‍🚀✨ パ', sub: '' },
    export: exportBase('palette'),
  });
  edge('vertical_writing', 'pt-temple-vertical', { canvas: SMALL, export: exportBase('full', { includeDefaultImage: false }) });
  edge('solid_background', 'msg-battle-victory', { canvas: SMALL, background: { kind: 'solid', color: '#102030', opacity: 0.5, syncFade: true }, export: exportBase('palette') });
  edge('trim_center', 'msg-gm-simple', {
    canvas: SMALL,
    text: { main: '中央', sub: '', mainFont: { size: 60 } },
    background: { kind: 'none' },
    style: { decoration: { kind: 'none' } },
    export: exportBase('palette', { autoTrim: true }),
  }, { pixel: false, trim: true });
  edge('trim_edges', 'msg-gm-simple', {
    canvas: SMALL,
    text: { main: 'はみ出す文字', sub: '', mainFont: { size: 90 } },
    layout: { anchor: 'top-left', marginX: 0, marginY: 0, offsetX: -40, offsetY: -20, autoShrink: false },
    background: { kind: 'none' },
    style: { decoration: { kind: 'none' } },
    export: exportBase('full', { autoTrim: true, includeDefaultImage: false }),
  }, { pixel: false, trim: true });
  return only ? cases.filter((c) => c.name.includes(only)) : cases;
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(BASE_URL)) return null;
  if (process.env.E2E_BASE_URL) throw new Error(`E2E_BASE_URL ${BASE_URL} is not reachable`);
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    const build = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('vite build failed');
  }
  const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i += 1) {
    if (await reachable(BASE_URL)) return server;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

function numPlays(loop) {
  if (loop.kind === 'once') return 1;
  if (loop.kind === 'forever') return 0;
  return Math.max(1, Math.min(999, Math.round(loop.count)));
}

async function waitFonts(page) {
  return page.evaluate((ms) => Promise.race([window.__tanim.fontsReady(), new Promise((r) => setTimeout(() => r('timeout'), ms))]), FONT_WAIT_MS);
}

/** Independent EXP-14 expectation: union of alpha ≠ 0 boxes over all frames, +2 px, clamped to the canvas. */
async function expectedTrim(page, times) {
  return page.evaluate(async ({ times }) => {
    const all = times;
    let box = null;
    let size = null;
    for (const t of all) {
      const frame = await window.__tanim.renderRgba(t);
      size = { w: frame.width, h: frame.height };
      const bytes = Uint8Array.from(atob(frame.data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      for (let y = 0; y < bitmap.height; y += 1) {
        for (let x = 0; x < bitmap.width; x += 1) {
          if (px[(y * bitmap.width + x) * 4 + 3] === 0) continue;
          if (!box) box = { x0: x, y0: y, x1: x, y1: y };
          else {
            if (x < box.x0) box.x0 = x;
            if (y < box.y0) box.y0 = y;
            if (x > box.x1) box.x1 = x;
            if (y > box.y1) box.y1 = y;
          }
        }
      }
    }
    if (!box || !size) return null;
    const x = Math.max(0, box.x0 - 2);
    const y = Math.max(0, box.y0 - 2);
    const right = Math.min(size.w, box.x1 + 1 + 2);
    const bottom = Math.min(size.h, box.y1 + 1 + 2);
    if (x === 0 && y === 0 && right === size.w && bottom === size.h) return null;
    return { x, y, width: right - x, height: bottom - y };
  }, { times });
}

async function runCase(page, testCase) {
  const dir = join(OUT, testCase.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'expected'), { recursive: true });
  await page.evaluate((id) => window.__tanim.applyTemplate(id), testCase.template);
  await page.evaluate((patch) => window.__tanim.setScene(patch), testCase.patch);
  const fontsOk = await waitFonts(page);
  const scene = await page.evaluate(() => window.__tanim.getScene());
  const info = {
    name: testCase.name,
    mode: scene.mode,
    template: testCase.template,
    color_mode: scene.export.colorMode,
    fps: scene.export.fps,
    loop: scene.export.loop.kind,
    loop_count: scene.export.loop.kind === 'count' ? scene.export.loop.count : null,
    num_plays: numPlays(scene.export.loop),
    default_image: scene.export.includeDefaultImage,
    default_image_in_animation: !scene.export.includeDefaultImage,
    auto_trim: scene.export.autoTrim,
    pixel_case: testCase.pixel,
    canvas_width: scene.canvas.width,
    canvas_height: scene.canvas.height,
    fonts_loaded: fontsOk === true,
    text: { main: scene.text.main, sub: scene.text.sub },
  };
  if (testCase.expectError) {
    let error = null;
    try {
      await page.evaluate(() => window.__tanim.exportBytes('apng'));
    } catch (e) {
      error = String(e.message ?? e);
    }
    writeFileSync(join(dir, 'case.json'), `${JSON.stringify({ ...info, expect_error: testCase.expectError, observed_error: error, outputs: null }, null, 2)}\n`);
    rmSync(join(dir, 'expected'), { recursive: true, force: true });
    if (!error || !error.includes(testCase.expectError)) throw new Error(`${testCase.name}: expected export error "${testCase.expectError}", got ${error}`);
    return { name: testCase.name, frames: 0, error };
  }
  const times = await page.evaluate(() => window.__tanim.frameTimes());
  const apng = await page.evaluate(() => window.__tanim.exportBytes('apng'));
  writeFileSync(join(dir, 'out.apng'), Buffer.from(apng, 'base64'));
  const zip = await page.evaluate(() => window.__tanim.exportBytes('zip'));
  writeFileSync(join(dir, 'out.zip'), Buffer.from(zip, 'base64'));
  for (const [index, time] of times.entries()) {
    const frame = await page.evaluate((t) => window.__tanim.renderRgba(t), time);
    writeFileSync(join(dir, 'expected', `frame_${String(index).padStart(4, '0')}.png`), Buffer.from(frame.data, 'base64'));
  }
  const duration = times[times.length - 1];
  let width = scene.canvas.width;
  let height = scene.canvas.height;
  let trimRect = null;
  if (scene.export.autoTrim) {
    // Hold phases are static in the trim cases, so the default image (completed state) is covered by the frames.
    trimRect = await expectedTrim(page, times);
    if (trimRect) {
      width = trimRect.width;
      height = trimRect.height;
    }
  }
  const caseJson = {
    ...info,
    width,
    height,
    trim_rect: trimRect,
    source_frames: times.length,
    duration_s: duration,
    total_ms: Math.round((times.length / scene.export.fps) * 1000),
    frame_times: times,
    outputs: { apng: 'out.apng', zip: 'out.zip', expected_dir: 'expected' },
    zip_entries: times.length + 1,
    check: {
      verify_apng: `python tools/verify_apng.py fixtures_out/${testCase.name}/out.apng --expect-json '${JSON.stringify({ width, height, num_plays: numPlays(scene.export.loop), total_ms: Math.round((times.length / scene.export.fps) * 1000), default_image_in_animation: !scene.export.includeDefaultImage })}'`,
      compare_frames: testCase.pixel ? `python tools/compare_frames.py fixtures_out/${testCase.name}/out.apng fixtures_out/${testCase.name}/expected --fps ${scene.export.fps} --mode ${scene.export.colorMode}` : null,
    },
  };
  writeFileSync(join(dir, 'case.json'), `${JSON.stringify(caseJson, null, 2)}\n`);
  return { name: testCase.name, frames: times.length };
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__fixtures')) return;
    sessionStorage.setItem('__fixtures', '1');
    try {
      localStorage.clear();
      localStorage.setItem('mojimotion.lang', 'ja');
    } catch {
      // ignore
    }
  });
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__tanim !== undefined);
  // Pause the preview so the UI does not compete with rendering.
  await page.evaluate(() => (document.querySelector('[data-testid="play-toggle"][data-state="playing"]'))?.click());
  mkdirSync(OUT, { recursive: true });
  const cases = buildCases();
  const results = [];
  let failed = 0;
  for (const testCase of cases) {
    try {
      const result = await runCase(page, testCase);
      results.push(result);
      console.log(`ok   ${testCase.name} (${result.frames} frames)`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${testCase.name}: ${error.message}`);
    }
  }
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ base_url: BASE_URL, generated: new Date().toISOString(), cases: results }, null, 2)}\n`);
  await browser.close();
  if (server) process.kill(-server.pid);
  console.log(`${results.length} fixture cases written to ${OUT}${failed ? `, ${failed} failed` : ''}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
