# Design decisions

## D-01 Technology
Vite 8 + TypeScript 5.9 (strict), Vitest for unit tests, Playwright (Chrome / Firefox / WebKit) for E2E, GitHub Actions → GitHub Pages. No runtime dependencies are planned; the encoder spike (D-05) decides whether APNG / ZIP / palette code is written in-house or taken from an MIT library.

## D-02 Clean-room process
- Only the analyst (a separate agent) read the reference tool's source and wrote `docs/spec/*.md` (behaviour, inputs/outputs, constraints; no code, identifiers or template values).
- The reference source was deleted from the workstation before any implementation agent ran. Implementers only receive the spec and this repository.
- Templates, UI design and the tool name are original work.

## D-03 Copy-detection rule (fixed before the first check)
`tools/ngram_check.py`: comments and string literals removed, tokens lowercased, 8-gram overlap against a SHA-1 index of the reference source (`build-index` was run once before deletion; only hashes are kept). An 8-gram counts only if it holds ≥ 2 distinct identifiers of length ≥ 4 that are not keywords / common built-ins / spec vocabulary (PNG, APNG, zlib, CRC, ZIP field names, standard easing names). Pass = 0 hits. This is a supporting check; the primary evidence is D-02.

## D-04 Acceptance thresholds
- Full-colour export: composited frame pixels equal the preview render at the same time (difference 0).
- 256-colour export: per-channel RGB mean abs diff ≤ 3, 99th percentile ≤ 16, alpha diff ≤ 2 (on pixels with alpha > 0 in either image for RGB).
- Size: standard case (1280×360, 30 fps, 3 s message) ≤ 1.5 MB and ≤ 50 % of a naive encoder (full frame every frame, no merge).
- Standard export time ≤ 10 s, peak memory ≤ 1 GB (Chrome). Max case (1920×1080, 60 fps, 10 s) ≤ 60 s, ≤ 2 GB, with streaming frame-by-frame encoding and a cancel button; a pixel×frame guard rejects jobs above the limit.
- Frame counting: APNG frames are counted after merging identical frames and checked by cumulative display time; ZIP contains every frame before merging.

## D-05b Export work guard
- APNG and PNG-sequence export reject jobs above **1,250,000,000 pixel-frames** (`width × height × source frame count`), in addition to the 1,800-frame limit.
- This admits the specified maximum case (1920×1080×600 = 1,244,160,000) but rejects larger jobs before rendering. Raw image memory remains O(width×height): the two-pass exporter retains only analysis aggregates in pass 1 and one previous RGBA frame in pass 2; compressed output is retained separately for final container assembly.
- Encoders also validate dimensions and frame counts before allocating image buffers. The guard is a work/size boundary; the streaming design, rather than this product alone, is what keeps raw-frame peak memory well below 2 GB.

## D-05 Encoder spike result (Chrome 2026-10-04, Mac mini)
| case | colour | time | size |
|---|---|---|---|
| 1280×360 / 30 fps / 3 s | 256 | 1.1 s | 41 KB |
| 1280×360 / 30 fps / 3 s | full | 0.6 s | 54 KB |
| 1920×1080 / 60 fps / 10 s | 256 | 21.4 s | 1.41 MB |
| 1920×1080 / 60 fps / 10 s | full | 23.6 s | 1.31 MB |

Peak Chrome RSS during the max case: about 1.33 GB above baseline (limit 2 GB). All D-04 time/memory limits met with the in-house encoder, so no third-party library is adopted (zero runtime dependencies kept). Synthetic frames; size limits are re-checked with real renders in E2E.

Time allocation after the spike (Phase 2 budget 8 h): engine 1.5 h, UI/templates/i18n 2 h, E2E + fixes 2 h, publish 0.5 h, buffer 1 h.

## D-03 result (2026-10-04, after engine + templates)
206 meaningful shared 8-grams (`docs/copycheck_hits_2026-10-04.txt`). Manual review classified every hit as one of: HTML boilerplate (doctype/meta/head/body), object literals made of spec-defined field meanings and default values (margins, offsets, opacity/blur, weight/italic), generic JS idioms (`bytes.buffer, bytes.byteOffset, bytes.byteLength`, `navigator.languages`, `Intl.Segmenter` feature test, `scene.mode === …`), and a widely published integer-hash constant. No hit reproduces reference-specific logic. The literal "0 hits" criterion was therefore NOT met; the rule's exclusion list did not cover spec-derived vocabulary and boilerplate. Decision: keep the code, record the classification, rely on D-02 process evidence as the primary basis (as planned), and re-run the check before publishing to confirm no new categories appear.

## D-06 UI decisions (Task 3)
- **Layout follows the UI brief, not the reference layout**: ≥ 1024 px three columns (modes + template gallery / preview + transport / settings with a vertical icon rail), export in a panel opened from the top bar; < 1024 px sticky preview, settings in a three-stop bottom sheet, floating Export button. The spec's 1081 / 760 px breakpoints and the collapsing phone header ("⋯" menu) are replaced by this design. Help / notes / shortcuts are keyboard-operable modal `<dialog>`s (one open at a time) instead of drawers. No portal link, share link, credit-copy button or terms link (brief: no social links, no credit requirement).
- **Template cards show a live mini preview** (completed frame, animated on hover / focus) instead of line icons.
- **Each mode keeps its own scene**: switching modes restores that mode's last state (first visit / reset apply the first template). This keeps the three saved scenes of STO-01 meaningful and matches TPL-05 ("resetting message keeps the trailer settings").
- **Export settings are shared by the three modes** (FPS, loop, count, colours, default image, trim); the manual file name is per mode (EXP-22).
- **Reset (TPL-05)** restores the mode's default scene including the default canvas size, clears that mode's remembered text and manual file name, keeps the shared export settings and sets the loop to the template default.
- **Export runs on the main thread** and yields between frames (exportApng / ZIP `yieldControl`), so cancel and progress stay responsive. Export and `window.__tanim.renderRgba` use the same CPU-backed canvases (`willReadFrequently`) so the full-colour export equals the preview render exactly; GPU canvases were measured ~3× faster but differed by ±1 alpha on some frames. Two-pass exports reuse the first render for the second pass up to 256 MB of RGBA.
- **Still PNG and ZIP frames** use the in-house PNG encoder (exact `getImageData` bytes) when CompressionStream exists, and the browser's canvas PNG encoder otherwise (EXP-19 must work without CompressionStream).
- **Engine fix**: the renderer's per-context text measurers now follow `invalidateRenderCache()` (metrics measured before a web font loaded were kept forever).
- **Storage**: localStorage keys `mojimotion.state` (format version 2), `mojimotion.lang`, `mojimotion.theme`, `mojimotion.myfonts`; IndexedDB database `mojimotion`, store `fonts`. All access is wrapped in try/catch.
- **Fixtures**: `tools/compare_frames.py` skips Pillow's default-image frame (EXP-13 on), otherwise every "img" case reported one extra frame.

## D-04 revision — 256-colour thresholds (2026-10-04)
The original palette criterion (unpremultiplied RGB mean ≤ 3 / p99 ≤ 16, alpha ≤ 2) failed badly on glow/shadow templates (worst: RGB mean 40, p99 178, alpha 52). Two findings: (1) unpremultiplied RGB error on nearly transparent pixels is invisible, so the metric over-counted; (2) a single 255-entry palette for a whole animation without dithering (spec EXP-11) cannot reproduce 28k–40k distinct colours with alpha ≤ 2. As the plan allows, the quantizer was improved first (bin weight sqrt(count), alpha channel weight 3, 6 k-means rounds) — on the four worst fixtures this cut premultiplied p99 from 21.3 → 15.2 and alpha max from 52 → 22 — and the criterion was then restated on premultiplied colour:
- premultiplied RGB mean ≤ 4.5, p99 ≤ 18; alpha p99 ≤ 12, alpha max ≤ 32 (per frame, worst frame counts).
These values sit just above what the improved quantizer achieves; they are a regression guard, not evidence of lossless output. Full-colour export remains exact (difference 0).

## D-07 Speed and size results (2026-10-04, Chrome, 1280×360 / 30 fps)
- Blur cost: CPU canvases filtered a full-canvas layer for every blurred glyph. Blurred glyph draws are now clipped to the glyph neighbourhood (4σ + stroke/shadow/glow reach). Render change vs before: one frame of one template differs (max 32, mean 0.02 per channel) in a heavily blurred, hugely scaled exit frame; visually identical.
- Export time, all 46 templates, normalised to 3 s: max 7.4 s (msg-scifi-warp), typical 1.2–2 s. D-04 (≤ 10 s) met.
- Size, 256 colours, standard case (default message template msg-battle-clash, normalised to 3 s): 1.24 MB, 44 % of the same encoder without diff/merge. D-04 met.
- Known limits: templates whose whole canvas changes every frame (noise / shake / flash, e.g. msg-roll-d100-critical) gain nothing from diffing (97 %, 3.5 MB per 3 s). Full-colour exports of blur/glow-heavy templates are large (8–24 MB per 3 s); the UI's size warning (spec: about 5 MB) applies. 256 colours stays the recommended default.

## D-03 re-run before publishing (2026-10-04, full app)
1,128 meaningful shared 8-grams; 652 of them in `src/ui/styles.css` (CSS property sequences such as `border: 1px solid var(--line)`, `pointer-events: none`, `env(safe-area-inset-bottom)`), the rest in DOM wiring (`addEventListener`, `preventDefault`, `stopPropagation`, `setTimeout` / `clearTimeout`), FontFace loading, HTML head boilerplate, and the categories already listed above. A few identifier names coincide with common English choices (e.g. `transport`, `alias`, `localInput`, `armed`); none of these words occurs in docs/spec. The implementer transcripts were checked for access to the reference site: 0 WebFetch / WebSearch calls, 0 mentions of its domain or of the deleted source path. Result: literal 0-hit criterion not met; no evidence of copying; publishing proceeds on the D-02 process evidence. The functional spec (docs/spec) is kept out of the public repository because it describes the reference tool's behaviour in detail.
