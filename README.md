# MojiMotion — 文字アニメ APNG スタジオ

Browser-only tool that turns text into animated PNG (APNG) clips: cut-ins, trailer text and place/time captions for tabletop RPG sessions, streams and videos. Everything runs locally in the browser; nothing is uploaded.

## Features
- Three modes: message cut-in, trailer, place/time caption
- Horizontal / vertical writing with Japanese line-break rules, auto wrap and auto shrink
- 48 enter / exit / idle effects with easing, fills, multi strokes, shadow, glow, decorations and backgrounds
- 46 original templates (30 message cut-ins in 8 categories, 8 trailers, 8 place/time captions) with live mini previews
- 88 Google Fonts with Japanese / Hangul fallbacks, plus your own font files or installed fonts
- Export: APNG (256 colours or full colour, loop control, auto trim, still fallback), still PNG, PNG sequence (ZIP)
- Transparent video for Keynote: ProRes 4444 with alpha in a QuickTime .mov (high / standard quality, size estimate, plays once — loop it in Keynote), encoded in the browser
- Japanese / English / Korean UI, light / dark theme, keyboard shortcuts, settings persistence, phone layout with a bottom sheet
- AI assistant (v2): describe the look in words and Claude picks the template, text, motion, colours and layout through the same settings you can tweak by hand. Every AI change can be undone. Bring your own Claude API key (Claude Console); the key stays in this browser (or only in the page, if you choose not to save it) and is sent only to api.anthropic.com. Without a key the app works exactly as before.
  - Models: Claude Sonnet 5.5 (default) or Claude Haiku 5.5 (cheaper). A typical request costs a few yen with Sonnet and well under one yen with Haiku; the panel shows a running estimate.
  - All GitHub Pages sites of the same account share one browser storage area, so set a monthly spend limit for each key in Claude Console and turn off "remember" on shared computers.

## Development
```sh
npm ci --ignore-scripts
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run e2e        # browser tests (Playwright: Chrome, Firefox, WebKit)
npm run build      # production build to dist/
node tools/e2e_export_fixtures.mjs   # export fixtures → fixtures_out/ (Chrome; checked by tools/*.py)
```

Developed clean-room from a written functional specification; see `docs/decisions.md`.

© 2026 TanqKikuchi. All rights reserved.
