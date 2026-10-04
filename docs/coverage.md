# Feature coverage (feature ID → test)

All 189 feature IDs of `docs/spec/00_overview.md` map to at least one automated test.

- **Unit** (Vitest, `npm test`): `tests/unit/*.test.ts`; describe blocks carry the feature IDs. Files: `EXP-*.test.ts` (export core), `LAY-layout.test.ts`, `TL-timeline.test.ts`, `FX-effects.test.ts`, `DEC-decoration.test.ts`, `engine-scene-render.test.ts` (scene model, renderer smoke on a recording canvas), `templates.test.ts`, `i18n.test.ts`, `ui-logic.test.ts` (fonts, state, persistence, shortcuts, sheet, display helpers, export job helpers).
- **E2E** (Playwright, `npx playwright test`, projects chrome / firefox / webkit): `tests/e2e/<file>.spec.ts › <test title>`; titles start with the feature IDs.
- **Fixtures** (`node tools/e2e_export_fixtures.mjs`, Chrome): 35 cases → `fixtures_out/`, checked with `tools/verify_apng.py` (structure, size, `num_plays`, total time, default image) and `tools/compare_frames.py` (preview render vs. composited APNG frames, D-04).

## EXP — export

| ID | Unit | E2E / fixtures |
|---|---|---|
| EXP-01 | `EXP-01 frame timeline and guards`; `EXP-15 / EXP-18 / EXP-01 export job helpers` | export › `EXP-01 / D-05b: frame and pixel limits stop the export with an error`; fixtures `frame_times` / `source_frames` |
| EXP-02, EXP-03 | `EXP-02/03/05/06/09/10/12/13 APNG container` | fixtures (`verify_apng.py` chunk order, CRC, IHDR) |
| EXP-04 | `EXP-04 loop modes`; APNG `num_plays` cases | export › `UI-14 / EXP-04 / EXP-21 / EXP-26 / EXP-27 …` (count field 1000 → 999); playback › `TL-07 / UI-13 … EXP-04 toast offers play-once`; fixtures `num_plays` 1 / 0 / 3 |
| EXP-05, EXP-06 | APNG chunk order, frame control and sequence-number tests | fixtures (`verify_apng.py` sequence numbers, `default_image_in_animation`) |
| EXP-07, EXP-08 | `EXP-07/08 difference rectangles and merging` | fixtures `edge__identical_consecutive_frames`, `edge__single_stored_frame` |
| EXP-09, EXP-10 | Full-colour / palette decoder round trips; missing-CompressionStream test | export › `EXP-10 without CompressionStream › APNG export shows an error and creates no file` |
| EXP-11 | `EXP-11 palette quantization` | fixtures (`*__palette__*`, compare_frames palette mode — see FINAL.md known issue) |
| EXP-12 | `EXP-02/03/05/06/09/10/12/13 APNG container` (exact round trip) | fixtures (`*__full__*`: composited frames equal the preview render, difference 0) |
| EXP-13 | default image on/off tests | fixtures (`__img__` / `__noimg__` cases) |
| EXP-14 | `EXP-14/15 two-pass auto-trim` | fixtures `edge__trim_center`, `edge__trim_edges` (independent trim box in `case.json`) |
| EXP-15 | Two-pass progress / yield cadence; `EXP-15 / EXP-18 / EXP-01 export job helpers` (second-pass reuse) | export › `EXP-16 / EXP-25 …` (progress text "i / N" while running) |
| EXP-16 | Cancellation unit test (export core) | export › `EXP-16 / EXP-25: a long export can be cancelled, the UI is locked meanwhile, and exporting works again` |
| EXP-17 | `UI-05 / UI-17 / EXP-17 / EXP-22 / EXP-26 display helpers` (size format, 5 MB threshold) | export › `UI-14 / EXP-17 / EXP-22: APNG export shows the result panel and downloads with the automatic name` |
| EXP-18 | `EXP-18 still PNG`; `EXP-15 / EXP-18 / EXP-01 export job helpers` (still time) | export › `EXP-18 / EXP-19: PNG and ZIP exports download automatically`; shortcuts › `KEY-01: Ctrl+Shift+K …` |
| EXP-19, EXP-20 | `EXP-19/20 sequential PNG ZIP` | export › `EXP-18 / EXP-19 …`; fixtures `out.zip` (entry count, CRC via `zipfile.testzip`) |
| EXP-21 | `Scene model defaults (06 tables, EXP-21 / EXP-27)` | export › `UI-14 / EXP-04 / EXP-21 / EXP-26 / EXP-27 …` (6 options, 60 FPS ≈ 2.5 × frames) |
| EXP-22 | Filename candidate tests; `… display helpers` (candidate, manual-name rule) | export › `UI-14 / EXP-17 / EXP-22 …`, `EXP-23 / EXP-22: manual names are sanitized; the reset button restores the automatic name` |
| EXP-23 | Filename sanitizing / suffix tests | export › `EXP-23 / EXP-22 …` ("a/b:c*?.png" → `abc_still.png`) |
| EXP-24 | `EXP-24 / EXP-26 helpers` (`isSceneTextEmpty`) | export › `EXP-24: empty text blocks all three exports with a warning`; fixtures `edge__empty_text` |
| EXP-25 | — | export › `EXP-16 / EXP-25 …` (buttons disabled, settings inert, mode tab / shortcut ignored) |
| EXP-26 | `EXP-24 / EXP-26 helpers`; `… display helpers` ("2.50秒 ・ 24FPS ・ 60フレーム") | export › `UI-14 / EXP-04 / EXP-21 / EXP-26 / EXP-27 …` |
| EXP-27 | `Scene model defaults (06 tables, EXP-21 / EXP-27)` | export › `UI-14 / EXP-04 / EXP-21 / EXP-26 / EXP-27 …` (fresh profile defaults) |

## LAY — layout

| ID | Unit | E2E |
|---|---|---|
| LAY-01 | `LAY-01 text decomposition` | fixtures `edge__combining_and_emoji*` |
| LAY-02 | `LAY-02 horizontal lines` | |
| LAY-03 | `LAY-03 vertical columns` | fixtures `edge__vertical_writing` |
| LAY-04 | `LAY-04 vertical punctuation offsets` | |
| LAY-05 | `LAY-05 rotated characters in vertical writing` | |
| LAY-06 | `LAY-06 automatic wrapping (horizontal)` | |
| LAY-07 | `LAY-07 automatic wrapping (vertical)` | |
| LAY-08 | `LAY-08 kinsoku character classes` | |
| LAY-09 | `LAY-09 alignment` | settings › `LAY-09: vertical writing relabels the alignment buttons` |
| LAY-10 | `LAY-10 sub text placement` | |
| LAY-11 | `LAY-11 trailer pages` | settings › `TL-14 …` (3 pages) |
| LAY-12 | `LAY-12 auto shrink` | settings › `LAY-12: overflowing text shows the auto-shrink note; turning shrink off hides it` |
| LAY-13 | `LAY-13 shift to avoid clipping when shrinking` | |
| LAY-14 | `LAY-14 anchor, margins and offsets` | fixtures `edge__trim_edges` (top-left anchor, negative offset) |
| LAY-15 | `LAY-15 outset estimation` | |
| LAY-16 | `LAY-16 canvas size` | settings › `LAY-16 / TPL-02: custom size clamps to 3840 and survives a template change` |
| LAY-17 | `LAY-17 per-glyph information` | |

## TL — timeline and modes

| ID | Unit | E2E |
|---|---|---|
| TL-01 | `TL-01 common time structure` | |
| TL-02 | `TL-02 per-character enter (message / place-time)` | |
| TL-03 | `TL-03 stagger order` | |
| TL-04 | `TL-04 block enter` | |
| TL-05 | `TL-05 sub text enter` | |
| TL-06 | `TL-06 exit` | |
| TL-07 | `TL-07 exit on/off` | playback › `TL-07 / UI-13: the preview exit switch and the motion exit switch stay in sync …` (frame at D still shows text) |
| TL-08 | `TL-08 trailer: one character at a time` | fixtures `trailer__tr-letter-typewriter__*` |
| TL-09 | `TL-09 trailer: centre one at a time` | TPL-01 E2E (template `tr-center-impact`) |
| TL-10 | `TL-10 trailer: expand from the centre` | TPL-01 E2E (template `tr-tower-expand`) |
| TL-11 | `TL-11 trailer: line by line / smooth` | fixtures `trailer__tr-oath-lines__*` |
| TL-12 | `TL-12 trailer: all at once` | settings › `TL-14 …` (simultaneous flow) |
| TL-13 | `TL-13 trailer: scroll` | settings › `UI-08 / FX-03 …` (scroll hides exit); export › `EXP-01 / D-05b …` |
| TL-14 | `TL-14 page sequencing` | settings › `TL-14: the motion tab shows the total length with the page count` |
| TL-15 | `TL-15 decoration timing` | |
| TL-16 | `TL-16 background fade sync` | fixtures `edge__solid_background` (sync fade on) |
| TL-17 | `TL-17 preview playback` | playback › `UI-13 / TL-17 …`, `TL-17: with loop off playback stops at the end showing D`, `TL-17: hiding the tab pauses playback` |
| TL-18 | `TL-18 editing while paused` | playback › `TL-18: editing while paused at 0 shows the completed frame` |
| TL-19 | `TL-19 deterministic drawing`; `Renderer (TL-19 / TL-20) — smoke test` | playback › `TL-19: rendering the same time twice gives identical pixels (glitch scene)`; fixtures (`*__full__*` preview = export exactly) |
| TL-20 | `TL-20 drawing order (frame plan)`; `Renderer (TL-19 / TL-20) — smoke test` | |

## FX — effects

| ID | Unit | E2E |
|---|---|---|
| FX-01 | `FX-01 state model` | |
| FX-02 | `FX-02 common parameters` | settings › `UI-08 / FX-03 …` (curve / duration fields per effect) |
| FX-03 | `FX-03 effect card selection` | settings › `UI-08 / FX-03: effect cards initialise parameters …` (pop: 0.5 s / 0.07 s) |
| FX-04 | `FX-04 mini preview` | settings › `FX-04: trailer lists no block effects; hovering a card animates it and leaving restores the still` |
| FX-E01 | `FX-E01 easing curves` | |
| FX-I01 … FX-I16 | `FX-I01〜I16 per-character enter effects (common acceptance)` (one `it` per ID) + `FX-I per-effect values` | fixtures `edge__transparent_move_erase*` (FX-I05 / FX-I02), `edge__single_stored_frame` (FX-I15) |
| FX-I17 … FX-I23 | `FX-I17〜I23 block enter effects (common acceptance)` (one `it` per ID) + `FX-I block per-effect values` | fixtures `message__msg-battle-clash__*` (FX-I17); playback › `TL-19 …` (FX-I22) |
| FX-O01 … FX-O12 | `FX-O01〜O12 per-character exit effects (common acceptance)` (one `it` per ID) + `FX-O per-effect values` | fixtures `edge__transparent_move_erase*` (FX-O11) |
| FX-O13 … FX-O17 | `FX-O13〜O17 block exit effects (common acceptance)` (one `it` per ID) | fixtures `message__msg-battle-clash__*` (FX-O13) |
| FX-H00 … FX-H08 | `FX-H00〜H08 hold effects` (one `it` per ID); all holds rendered in the renderer smoke test | playback › `TL-19 …` (FX-H08); settings › `UI-10 …` (FX-H05 glow note) |
| FX-P01 | `FX-P01 wipe mask`; destination-in mask in the renderer smoke test | |
| FX-P02 | `FX-P02 glitch rendering plan`; glitch colours in the renderer smoke test | playback › `TL-19 …` (glitch identical at the same t) |
| FX-P03 | `FX-P03 white flash`; source-atop flash in the renderer smoke test | |

Every enter, exit and hold id also renders without error in `renders every enter, exit and hold effect without errors, deterministically`.

## DEC — decoration and background

| ID | Unit | E2E |
|---|---|---|
| DEC-01 | `DEC-01 fill (solid / gradient)`; `DEC-22 / DEC-01 presets` | |
| DEC-02 | `DEC-02 fill opacity`; knockout in `skips the fill pass at 0 % fill opacity …` | |
| DEC-03 | `DEC-03 inner stroke` | |
| DEC-04 | `DEC-04 outer stroke` | |
| DEC-05 | `DEC-05 shadow` | settings › `UI-09: switching the shadow off hides its fields …` |
| DEC-06 | `DEC-06 glow` | settings › `UI-10 … the glow note appears for glow pulse without glow` |
| DEC-07 | `DEC-07 sub text colour` | |
| DEC-08 | `DEC-08 glitch colours` | settings › `DEC-08: noise colours appear only for glitch effects` |
| DEC-09 | `DEC-09 cursor colour` | |
| DEC-10 | `DEC-10 band` | fixtures `message__msg-battle-clash__*` |
| DEC-11 | `DEC-11 hazard tape` | settings › `UI-10: the hazard tape shows the tape fields …`; fixtures `message__msg-mystery-alert__*` |
| DEC-12 | `DEC-12 box` | |
| DEC-13 | `DEC-13 title frame` | |
| DEC-14 | `DEC-14 top and bottom lines` | |
| DEC-15 | `DEC-15 underline` | |
| DEC-16 | `DEC-16 side lines` | |
| DEC-17 | `DEC-17 accent bar` | |
| DEC-18 | `DEC-18 corner brackets` | |
| DEC-19 | `DEC-19 decoration animation` | |
| DEC-20 | `DEC-20 text stroke on lines` | |
| DEC-21 | `DEC-21 background` | export › `DEC-21: a 50 % solid background exports with alpha ≈ 128; none keeps it transparent` |
| DEC-22 | `DEC-22 / DEC-01 presets` | settings › `UI-09 … DEC-22 presets change only the paint and toast` |

All decorations (both writing modes, DEC-20 on) and all backgrounds also render in `renders every decoration, background and trailer flow`.

## TPL — templates

| ID | Unit | E2E |
|---|---|---|
| TPL-01 | `TPL-01 template catalogue`, `TPL-01 every template is a valid scene` | templates › `TPL-01: every template renders a non-empty frame`, `TPL-01 / UI-04: message categories filter the cards without moving the settings` |
| TPL-02 | `TPL-02 applying a template` | templates › `TPL-02 / UI-17: applying a template keeps the size and exit switch and shows a success toast`; settings › `LAY-16 / TPL-02 …` |
| TPL-03 | `TPL-03 remembered text rules`; `TPL-03 text memory` | templates › `TPL-03: edited message text is remembered per template; place/time text is shared` |
| TPL-04 | `TPL-04 first templates` | templates › `TPL-04: the roll category shows a system row; switching system selects its first template` |
| TPL-05 | `TPL-05 mode reset`; `TPL-05 reset keeps other modes` | templates › `TPL-05: reset asks for confirmation and only resets the current mode` |
| TPL-06 | `TPL-06 export loop defaults` | templates › `TPL-06: GM templates loop forever, battle templates play once` |

## UI — screen

| ID | Unit | E2E |
|---|---|---|
| UI-01 | — | app › `UI-01 / I18N-02: loads in ja / en / ko without console errors or raw keys`; mobile › `UI-18 desktop width › 1280 px shows the three columns side by side` |
| UI-02 | — | app › `UI-02 / I18N-01: language buttons switch every label at once …` |
| UI-03 | `KEY-02 tab keyboard navigation` | settings › `UI-03 / KEY-02: mode tabs switch by click and arrow keys; settings tabs wrap around` |
| UI-04 | — | templates › `TPL-01 / UI-04 …` |
| UI-05 | `UI-05 / UI-17 / EXP-17 / EXP-22 / EXP-26 display helpers` (step rounding) | settings › `UI-05: slider moves update the scene; out-of-range numbers are clamped` |
| UI-06 | — | settings › `UI-06: trailer hides the sub text and shows the wrap slider` |
| UI-07 | `FNT-05 weight snapping` | settings › `UI-07 / FNT-05 / FNT-06: picking a single-weight font snaps the weight …` |
| UI-08 | — | settings › `UI-08 / FX-03: … typewriter hides duration and curve; scroll hides exit` |
| UI-09 | — | settings › `UI-09: switching the shadow off hides its fields …` |
| UI-10 | — | settings › `UI-10: the hazard tape shows the tape fields …` |
| UI-11 | `UI-11 preview size` | settings › `UI-11: a portrait canvas gives a portrait preview that fits` |
| UI-12 | `STO-01 saving state` (image never stored) | playback › `UI-12: the preview background does not leak into the export`, `UI-12: the image background uses a picked file and is not stored` |
| UI-13 | — | playback › `UI-13 / TL-17 …`, `TL-07 / UI-13 …` |
| UI-14 | — | export › `UI-14 / EXP-17 / EXP-22 …`, `UI-14 / EXP-04 / EXP-21 / EXP-26 / EXP-27 …` |
| UI-15 | `UI-15 / STO-03 theme` | app › `UI-15: theme toggles, survives reload and follows the OS when nothing is saved` |
| UI-16 | `KEY-01 shortcuts` (table rows) | app › `UI-16: help, notes and shortcut dialogs open one at a time and close with ×`; shortcuts › `KEY-03 / UI-16 …` |
| UI-17 | `… display helpers` (toast durations) | templates › `TPL-02 / UI-17 …` (success toast appears and disappears) |
| UI-18 | — | mobile › `UI-18 narrow widths › 360 px …`, `UI-18 tablet width › 900 px …`, `UI-18 desktop width › 1280 px …` |
| UI-19 | `UI-19 bottom sheet snapping` | mobile › `UI-19 phone layout (390 × 844) › no horizontal overflow; the sheet opens to half …`, `… fling up opens the sheet …` |
| UI-20 | — | app › `UI-20: the footer opens the notes dialog (local processing, font licences)` |
| UI-21 | — | app › `UI-21: a font that fails to load shows a fallback warning and drawing continues`; export › `EXP-16 / EXP-25 …` |

## FNT — fonts

| ID | Unit | E2E |
|---|---|---|
| FNT-01 | `FNT-01 font catalogue` | settings › `UI-07 / FNT-05 / FNT-06 …` (latin tab) |
| FNT-02 | `FNT-02 Google Fonts URL` | app › `FNT-02: choosing a font requests its CSS once`; exports wait for fonts (`fontsReady`) |
| FNT-03 | `FNT-03 fallback chain` | |
| FNT-04 | `FNT-04 Hangul substitutes` | |
| FNT-05 | `FNT-05 weight snapping` | settings › `UI-07 / FNT-05 / FNT-06 …` |
| FNT-06 | — | settings › `UI-07 / FNT-05 / FNT-06 …` (picker, category tabs, card selection) |
| FNT-07 | `FNT-07 / FNT-08 / STO-04 registered fonts` | persistence › `FNT-07 / STO-04 / FNT-09: an uploaded font is selected, survives reload and can be removed`, `FNT-07: a non-font file shows the supported formats error` |
| FNT-08 | `FNT-07 / FNT-08 / STO-04 registered fonts` (width test) | settings › `FNT-08: an unknown local font name warns and keeps the font` |
| FNT-09 | `STO-02 restoring and migrating` (missing font → Noto Sans JP) | persistence › `FNT-07 / STO-04 / FNT-09 …` |

## I18N — languages

| ID | Unit | E2E |
|---|---|---|
| I18N-01 | `I18N-01 language detection and persistence` | app › `UI-02 / I18N-01 …`, `I18N-01 browser language › an English browser without a saved choice starts in English` |
| I18N-02 | `I18N-02 dictionaries`, `I18N-02 t() and formatting` | app › `UI-01 / I18N-02 …` (no raw keys in any group, panel or dialog, 3 languages) |
| I18N-03 | `I18N-03 sample text follows the language` | templates › `I18N-03: untouched sample text follows the language; edited text stays` |

## KEY — keyboard

| ID | Unit | E2E |
|---|---|---|
| KEY-01 | `KEY-01 shortcuts` (incl. Ctrl+P without Shift → nothing) | shortcuts › `KEY-01: Ctrl+Shift+1/2/3 switch modes …`, `KEY-01: Ctrl+Shift+K exports a still PNG and Ctrl+Shift+E an APNG` |
| KEY-02 | `KEY-02 tab keyboard navigation` | settings › `UI-03 / KEY-02 …` |
| KEY-03 | — | shortcuts › `KEY-03 / UI-16: Esc closes an open dialog first, then pauses playback` |

## STO — saving

| ID | Unit | E2E |
|---|---|---|
| STO-01 | `STO-01 saving state` (round trip, 300 ms debounce, storage failures) | persistence › `STO-01: mode, settings tab, scene and export settings persist across reload`, `STO-01 without storage › the app works when localStorage throws` |
| STO-02 | `STO-02 restoring and migrating` | persistence › `STO-02: a broken saved value still boots with defaults; old data fills missing fields` |
| STO-03 | `UI-15 / STO-03 theme`; `I18N-01 language detection and persistence` | persistence › `STO-03: language and theme survive a mode reset` |
| STO-04 | `FNT-07 / FNT-08 / STO-04 registered fonts` | persistence › `FNT-07 / STO-04 / FNT-09 …` |

Additional E2E: app › `accessibility: visible form controls have accessible names` (all five settings groups).

## MOV — transparent video export (D-08; not part of docs/spec)

| Area | Unit (`tests/unit/MOV-prores.test.ts`) | Other |
|---|---|---|
| VLC (RDD 36 §7.1.1) | `MOV-PR-01 variable-length codes` | — |
| Alpha RLE (§7.1.2) | `MOV-PR-02 alpha run-length coding` | — |
| Scan / qScale / slice layout / frame rate code | `MOV-PR-03 scan, quantization and slice tables` | — |
| Forward DCT | `MOV-PR-04 forward DCT` | — |
| Colour conversion, transparent fill | `MOV-PR-05 RGB → Y′CbCr` | — |
| Frame syntax | `MOV-PR-06 ProRes 4444 frame syntax` | — |
| Encode → independent decode (`tests/unit/helpers/prores-decoder.ts`) | `MOV-PR-07 encode → independent decode` | `node tools/make_test_mov.ts <dir>` + `swift tools/verify_mov.swift` (AVFoundation) |
| QuickTime container | `MOV-QT-01 QuickTime container` | AVFoundation `isPlayable`, codec `ap4h`, frame count, duration |
| Export job (progress, cancel, guards) | `MOV-EXP-01 exportMov` | — |

### MOV — app integration (Task 5)

IDs defined for the UI wiring of the transparent video export (no docs/spec section; behaviour per D-08).

| ID | Behaviour | Unit (`tests/unit/MOV-UI.test.ts`) | E2E (`tests/e2e/mov.spec.ts`) |
|---|---|---|---|
| MOV-01 | Export panel: fourth action 「透過動画 (.mov・Keynote 用)」 in its own section; APNG-only options (loop, count, colours, still image, auto trim) in a section marked 「APNG のみ」 and dimmed during a video export; FPS / canvas size / file name shared | — | `MOV-01 / MOV-02: APNG-only options are marked …`, `MOV-01 / MOV-03 / MOV-05 / MOV-06: the video export …` |
| MOV-02 | Quality select 高画質 / 標準 (`high` / `standard`, default standard), stored in `scene.export.movQuality`, persisted and shared like the other export settings | `MOV-02 video quality setting` | `MOV-01 / MOV-02: … the quality select persists across reload` |
| MOV-03 | File name: EXP-22 auto-fill / manual rules with `.mov` | `MOV-03 video file name`; `EXP-23 filename sanitizing and suffixes` | `MOV-01 / MOV-03 / MOV-05 / MOV-06 …` |
| MOV-04 | Size estimate shown before exporting (range: half the measured typical rate … conservative guard rate, × pixels × frames); frame limit (1,800) first, then jobs projected above 2 GB are refused with a message, then the pixel-frame limit | `MOV-04 size estimate and guards` | `MOV-04: jobs projected above 2 GB are refused before rendering` |
| MOV-05 | Progress 「動画を作成中… i / n」, cancel within ~1 s (buffers dropped), result panel (name ・ size ・ size px ・ frames ・ FPS ・ ProRes 4444 ・ quality ・ plays once) with download, Keynote advice, no image preview | — | `MOV-05: a video export can be cancelled within about a second …`, `MOV-01 / MOV-03 / MOV-05 / MOV-06 …` |
| MOV-06 | Output: QuickTime `ftyp` brand `qt  `, `ap4h` sample entry, one sample per source frame; test hook `exportBytes('mov')` (base64) and `frameTimes('mov')` | MOV-QT-01 / MOV-EXP-01 (Task 4) | `MOV-01 / MOV-03 / MOV-05 / MOV-06 …` |
| MOV-07 | Strings in ja / en / ko (typecheck parity); help section 「Keynote で使う」 | `MOV-07 strings` | `MOV-07: the help dialog explains how to use the video in Keynote`; app › `UI-01 / I18N-02 …` (no raw keys) |

