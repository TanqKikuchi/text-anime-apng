# Engine API (src/core + src/render)

Short reference for the UI / template engineer. Everything is exported from `src/core/index.ts` (DOM-free) and `src/render/index.ts` (Canvas 2D).

## 1. Scene (`src/core/scene.ts`)

`Scene` is plain JSON (safe to persist / diff). Always pass scenes through `validateScene()` (or `mergeScene()`), which fills missing fields from the mode defaults, clamps numbers to the spec ranges and repairs unknown enum values (unknown exit effect → `FX-O01`, STO-02).

| Function | Purpose |
|---|---|
| `createDefaultScene(mode)` | Global defaults + mode defaults (06 tables; message 130 px, trailer 46 px / line height 1.9 / no sub, place-time 110 px). |
| `validateScene(partialOrJson)` | Normalise any (partial, untrusted) object to a full `Scene`. |
| `deepMerge(base, patch)` / `mergeScene(base, patch)` | Deep merge (objects recurse, arrays replace, type mismatches ignored); `mergeScene` also validates. Use for TPL-02 ("global → mode → template patch") and STO-02. |
| `canvasSize(preset, w?, h?)`, `CANVAS_PRESETS` | LAY-16 presets; custom sizes clamp to 32〜3840 integers. |
| `isSceneTextEmpty(scene)` | EXP-24 "nothing to export" check. |
| `resolveSubFont(scene, S)` | Effective sub font (family follows main when `subFontInherit`). |
| `FPS_CHOICES`, `ENTER_EFFECT_IDS`, `EXIT_EFFECT_IDS`, `HOLD_EFFECT_IDS`, `EASING_IDS` | Option lists. |

Field notes (non-obvious semantics):

- Effect ids are the spec feature ids: enter `FX-I01…I23`, exit `FX-O01…O17`, hold `FX-H00…H08`. Easing `'auto'` = effect default curve.
- `text.subFont.size` is **ignored** (sub size = S × `subScale`). `text.subFontInherit: true` = "メインと同じ" font family. Sub weight stays independent.
- `text.subPosition`: `'before'` = above (vertical: right), `'after'` = below (vertical: left).
- `style.fill.colors = [c1, c2, c3]`; `''` (or missing) third colour = unused (2-colour gradient).
- `style.decoration.lineExtent` is both "線の長さ" (0〜4 em) and the title frame "枠の広がり" (0〜12 em) — one shared value, as in 06.
- `style.decoration.fillOpacity` default 0.55 is shared by band / box / title frame (templates may set 0 for a transparent frame).
- `motion.enter.direction` / `motion.exit.direction` keep the last chosen value; an invalid one for the current effect resolves to the effect's first direction at render time (FX-02). Valid values: slide `left|right|up|down`; wipe `left-to-right|right-to-left|top-to-bottom|bottom-to-top|center`; expand/close `vertical|horizontal`.
- `export.loop: LoopMode` (`once` / `forever` / `count`) plus `export.loopCount` (remembered count, default 3) and `export.fileName` ('' = automatic).
- `seed` is a constant mixed into random stagger order; leave it at 1.
- Styles with px units (stroke, shadow, glow, decoration line / tape widths) are base-size values; the engine multiplies them by the shrink factor f.

## 2. Effects metadata & card behaviour (`effects.ts`, `preview.ts`)

- `ENTER_EFFECT_DEFAULTS[id]` / `EXIT_EFFECT_DEFAULTS[id]`: `{ unit: 'character'|'block', duration, stagger, easing, directions?, hasStrength }` — use `unit` for the "1文字ずつ / 全体" badge, `directions` for the direction select, `hasStrength` to hide the strength slider (FX-02).
- `selectEnterEffect(scene, id)` / `selectExitEffect(scene, id)`: FX-03 card initialisation (duration / stagger defaults, curve auto, strength 1, valid direction, trailer typewriter ⇒ character duration 0 and back to 0.4, erase ⇒ order "reverse"). Returns a new scene; restart preview afterwards.
- `listedEnterEffects(mode)`: trailer hides block effects and FX-I07. `isTrailerEnterAllowed(id)`.
- `GLITCH_EFFECTS`: ids that should show the noise-colour fields (DEC-08).
- Mini previews (FX-04): `createMiniPreviewScene(scene, 'enter'|'exit', id)` builds the 320×180 card scene; `miniPreviewTimes(model.timeline, phase)` → `{ still, loopPeriod }` (55 % / 45 % representative time, D + 0.25 loop).

## 3. Text measurement

```ts
interface TextMeasurer { measure(text: string, font: FontSettings): { width: number; ascent?: number; descent?: number } }
```

- Browser: `new CanvasTextMeasurer(ctx, fontFamily?)` (cached `measureText`; ascent/descent = actualBoundingBox).
- Tests / headless: `new MonospaceMeasurer(advanceEm = 1, ascentEm = 0.8, descentEm = 0.2)`.
- `RenderOptions.fontFamily(family) => cssFamilyList` lets the UI inject FNT-03 fallback chains (default: quoted family + `serif`/`sans-serif`). Pass the **same function instance** every frame (measurers and layouts are cached per function).
- After web fonts finish loading call `invalidateRenderCache()` (layouts are cached per scene object).

## 4. Model: layout + timeline

```ts
const model = createSceneModel(scene, measurer); // { scene (validated), layout, timeline, measurer }
```

- `model.layout`: `pages[]` (each with `main`, optional `sub`, `glyphs`, `box`), `fontSize` (actual S), `baseSize` (setting), `scale` (f), `shrunk` (`f < 0.999` ⇒ show the LAY-12 note "baseSize px → fontSize px").
- `model.timeline`:
  - `duration` — total length D (TL-01). `completedTime` — still PNG / APNG default image / paused-edit time.
  - `pages[]` — `start, characterStart, enterComplete, displayEnd, exitComplete (∞ if persistent), end, persistent, exitMode`.
  - Page count for the "全体の長さ" note = `timeline.pages.length`.
- Frame times for export / the info line: `frameCount(D, fps)` and `createFrameTimeline(D, fps).times` (EXP-01 / EXP-26).
- Playback (TL-17/18): `advancePlayback(state, dt, D, loop)`, `playbackStartTime(t, D)` (restart near the end), `seekTime(t, D)`, `timeAfterEdit(t, timeline)` (jump to completed time when nothing would be visible), `playbackSegments(timeline)` → `{ page, phase: 'enter'|'hold'|'exit', start, end }[]` for the coloured scrubber.
- `computeFrame(model, t)` returns the pure per-frame plan (block state, glyph states, decoration primitives, cursor, wipe, glitch, background); the renderer only draws it.

## 5. Rendering (`src/render/canvas.ts`)

```ts
renderFrame(scene, t, ctx, options?): FrameState        // draws scene at time t
createRgbaRenderer(scene, width, height, options?)      // (t) => Uint8ClampedArray for exportApng
renderModelFrame(model, t, ctx, options?)                // same as renderFrame for a precomputed model
getSceneModel(scene, measurer)                           // cached model per scene object
```

- `ctx` may be an `HTMLCanvasElement` or `OffscreenCanvas` 2D context (main thread or worker). Its **current transform maps scene px to canvas px** — for the preview (UI-11) call `ctx.setTransform(k, 0, 0, k, 0, 0)` with `k = internalWidth / scene.canvas.width` before `renderFrame`. The canvas is fully cleared; the transform is preserved.
- `createRgbaRenderer` draws the scene scaled to `width × height` (identity when equal to the scene size). Fonts must be loaded before export.
- `RenderOptions`: `fontFamily` (see §3), `canvasFactory(width, height) => { canvas, context }` (offscreen layers; default OffscreenCanvas, else DOM canvas).
- Deterministic: same scene + t ⇒ identical pixels (verified in Firefox and WebKit). Mutating a scene object in place will not invalidate the cache — create a new object per change (or call `invalidateRenderCache()`).

Export wiring:

```ts
const model = createSceneModel(scene, new CanvasTextMeasurer(ctx, fontFamily));
const result = await exportApng({
  width: scene.canvas.width, height: scene.canvas.height,
  duration: model.timeline.duration, fps: scene.export.fps, loop: scene.export.loop,
  colorMode: scene.export.colorMode, autoTrim: scene.export.autoTrim,
  includeDefaultImage: scene.export.includeDefaultImage, completedTime: model.timeline.completedTime,
  render: createRgbaRenderer(scene, scene.canvas.width, scene.canvas.height, { fontFamily }),
  signal, onProgress,
});
```

Still PNG (EXP-18): render `model.timeline.completedTime` once.

## 6. Known limitations

- WebKit has no `CanvasRenderingContext2D.filter`; blur components (FX-I08, FX-O07, the blur part of FX-I17/I18/O13) are skipped there (opacity / scale still animate). Chrome and Firefox blur.
- No bitmap glyph-sprite cache: glyphs are drawn as vectors every frame (scaling effects stay sharp; measured metrics are cached). Max case cost is dominated by `getImageData`.
- DEC-22 style presets and DEC-01 gradient presets live in `src/templates/presets.ts` (template task), not in core.

## 7. Compatibility notes (changes to the earlier untested draft of scene.ts)

- `SceneTemplate.names` / `samples` keys are now `'ja' | 'en' | 'ko'` (was `'zh'`), matching the KO UI language; `SceneTemplate.patch` is a `ScenePatch` (deep partial).
- Defaults were corrected to the spec (letter spacing 0.08, sub scale 0.3, line height 1.5, FPS 24, auto-trim off, …).
- Added fields: `text.subFontInherit`, `export.loopCount`, `export.fileName`; `ExportSettings.fps` widened to `12|15|20|24|30|60`. No existing field was renamed.
- `src/core/timeline.ts` keeps only the export timeline (EXP-01); the scene timeline lives in `src/core/scene-timeline.ts` (both re-exported from `src/core`).
