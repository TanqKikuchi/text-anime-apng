import { defineTemplates, enter, exit, font, glow, gradient, shadow, solid, stroke, subFont, GLOW_OFF, SHADOW_OFF, STROKE_OFF } from './build';
import type { TemplateDef, TemplateInput } from './types';

const message = (def: TemplateInput): TemplateInput => def;

/** Message cut-ins, grouped by category. The first entry is the mode's start template. */
export const MESSAGE_TEMPLATES: readonly TemplateDef[] = defineTemplates('message', [
  // ── battle ────────────────────────────────────────────────
  message({
    id: 'msg-battle-clash',
    category: 'battle',
    names: { ja: '決戦の刻', en: 'Showdown', ko: '결전' },
    samples: {
      ja: { main: '決戦の刻', sub: 'BATTLE START' },
      en: { main: 'Hour of Reckoning', sub: 'BATTLE START' },
      ko: { main: '결전의 때', sub: 'BATTLE START' },
    },
    patch: {
      text: {
        mainFont: font('Zen Old Mincho', 150, 900, 0.06),
        subFont: subFont('Cinzel', 150, 0.26, 700, 0.4),
        subScale: 0.26,
        subGap: 0.25,
      },
      motion: {
        enter: enter('FX-I17', 0.75),
        exit: exit('FX-O13', 0.5),
        subEnter: 'FX-I06',
        subDelay: -0.1,
        holdDuration: 1.6,
      },
      style: {
        fill: gradient(['#ffffff', '#ffd27a', '#e8892b']),
        innerStroke: stroke('#2a0a00', 6),
        outerStroke: stroke('#ffb347', 3),
        shadow: shadow('#000000', 0.7, 18, 0, 6),
        glow: glow('#ff7a1a', 40, 1),
        decoration: { kind: 'band', fillColor: '#120804', fillOpacity: 0.7, padding: 0.35, bandEdgeBlur: 0.6, bandEndFade: 0.4, animation: 'grow', duration: 0.4 },
      },
    },
  }),
  message({
    id: 'msg-battle-victory',
    category: 'battle',
    names: { ja: '勝利', en: 'Victory', ko: '승리' },
    samples: {
      ja: { main: '勝利', sub: '— 戦いは終わった —' },
      en: { main: 'Victory', sub: '— The battle is won —' },
      ko: { main: '승리', sub: '— 싸움은 끝났다 —' },
    },
    patch: {
      text: {
        mainFont: font('Shippori Mincho B1', 170, 800, 0.15),
        subFont: subFont('Shippori Mincho', 170, 0.24, 700, 0.2),
        subScale: 0.24,
        subGap: 0.3,
      },
      motion: {
        enter: enter('FX-I23', 0.9),
        hold: { id: 'FX-H05', strength: 0.8 },
        exit: exit('FX-O14', 0.8),
        subEnter: 'FX-I01',
        subDelay: 0.1,
        holdDuration: 2,
      },
      style: {
        fill: gradient(['#fff7d6', '#f5c84c', '#b07a18'], 'block-diagonal'),
        innerStroke: stroke('#3b2a06', 4),
        outerStroke: stroke('#fff1b8', 2),
        shadow: shadow('#000000', 0.5, 14, 0, 4),
        glow: glow('#ffd36b', 48, 1.2),
        decoration: { kind: 'lines', lineColor: '#f5d27a', lineWidth: 2, lineExtent: 1.5, padding: 0.3, animation: 'grow', duration: 0.6 },
      },
    },
  }),
  message({
    id: 'msg-battle-round',
    category: 'battle',
    names: { ja: 'ラウンド表示', en: 'Round Counter', ko: '라운드 표시' },
    samples: {
      ja: { main: 'ROUND 2', sub: 'ラウンド開始' },
      en: { main: 'ROUND 2', sub: 'Next round' },
      ko: { main: 'ROUND 2', sub: '라운드 시작' },
    },
    patch: {
      text: {
        mainFont: font('Bebas Neue', 190, 400, 0.12),
        subFont: subFont('M PLUS 1p', 190, 0.22, 700, 0.3),
        subScale: 0.22,
        subGap: 0.15,
      },
      motion: {
        enter: enter('FX-I05', 0.45, 0.04, { direction: 'right', easing: 'outExpo', strength: 1.2 }),
        exit: exit('FX-O05', 0.4, 0.03, { direction: 'left' }),
        holdDuration: 1.2,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#0d1b2a', 5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#e63946', 0.9, 0, 6, 6),
        glow: GLOW_OFF,
        decoration: { kind: 'accent-bar', lineColor: '#e63946', lineWidth: 10, padding: 0.3, animation: 'grow', duration: 0.3 },
      },
    },
  }),
  message({
    id: 'msg-battle-defeat',
    category: 'battle',
    names: { ja: '敗北', en: 'Defeat', ko: '패배' },
    samples: {
      ja: { main: '敗北', sub: '— 力尽きた —' },
      en: { main: 'Defeat', sub: '— All strength spent —' },
      ko: { main: '패배', sub: '— 힘이 다했다 —' },
    },
    patch: {
      text: {
        mainFont: font('Hina Mincho', 160, 400, 0.3),
        subFont: subFont('Hina Mincho', 160, 0.24, 400, 0.2),
        subScale: 0.24,
        subGap: 0.35,
      },
      motion: {
        enter: enter('FX-I08', 1.4, 0.12, { easing: 'inOutCubic' }),
        exit: exit('FX-O07', 1.2, 0.05),
        subEnter: 'FX-I01',
        subDelay: 0.2,
        holdDuration: 2.2,
      },
      style: {
        fill: gradient(['#d9d9d9', '#7a1f1f']),
        innerStroke: stroke('#000000', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.8, 24, 0, 0),
        glow: GLOW_OFF,
      },
      background: { kind: 'vignette', color: '#000000', opacity: 0.6, syncFade: true },
    },
  }),

  // ── mystery ───────────────────────────────────────────────
  message({
    id: 'msg-mystery-start',
    category: 'mystery',
    names: { ja: '調査開始', en: 'Investigation', ko: '조사 개시' },
    samples: {
      ja: { main: '調査開始', sub: '— 手がかりを探せ —' },
      en: { main: 'Investigation Begins', sub: '— Leave no stone unturned —' },
      ko: { main: '조사 개시', sub: '— 단서를 찾아라 —' },
    },
    patch: {
      text: {
        mainFont: font('Zen Kaku Gothic New', 130, 900, 0.2),
        subFont: subFont('Zen Kaku Gothic New', 130, 0.28, 400, 0.25),
        subScale: 0.28,
        subGap: 0.3,
      },
      motion: {
        enter: enter('FX-I20', 0.8, 0, { direction: 'left-to-right' }),
        exit: exit('FX-O15', 0.6, 0, { direction: 'left-to-right' }),
        holdDuration: 1.6,
      },
      style: {
        fill: solid('#f2efe6'),
        innerStroke: stroke('#1b2a3a', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 10, 0, 4),
        glow: GLOW_OFF,
        decoration: { kind: 'title-frame', lineColor: '#c9a24a', lineWidth: 2.5, lineExtent: 0.8, fillColor: '#0e1622', fillOpacity: 0.55, padding: 0.35, animation: 'grow', duration: 0.6 },
      },
    },
  }),
  message({
    id: 'msg-mystery-clue',
    category: 'mystery',
    names: { ja: '手がかり発見', en: 'Clue Found', ko: '단서 발견' },
    samples: {
      ja: { main: '手がかり発見', sub: '— 新たな証拠 —' },
      en: { main: 'Clue Found', sub: '— New evidence —' },
      ko: { main: '단서 발견', sub: '— 새로운 증거 —' },
    },
    patch: {
      text: {
        mainFont: font('Kaisei Tokumin', 120, 800, 0.08),
        subFont: subFont('Kaisei Tokumin', 120, 0.3, 400, 0.2),
        subScale: 0.3,
      },
      motion: {
        enter: enter('FX-I09', 0.5, 0.07),
        hold: { id: 'FX-H01', strength: 0.6 },
        exit: exit('FX-O09', 0.5, 0.04),
        holdDuration: 1.5,
      },
      style: {
        fill: gradient(['#fffbe8', '#ffe08a']),
        innerStroke: stroke('#3a2a12', 5),
        outerStroke: stroke('#ffffff', 4),
        shadow: shadow('#000000', 0.45, 8, 0, 5),
        glow: GLOW_OFF,
        decoration: { kind: 'corners', lineColor: '#ffe08a', lineWidth: 3, padding: 0.35, animation: 'grow', duration: 0.45 },
      },
    },
  }),
  message({
    id: 'msg-mystery-alert',
    category: 'mystery',
    names: { ja: '緊急事態', en: 'Emergency', ko: '긴급 사태' },
    samples: {
      ja: { main: '緊急事態', sub: 'EMERGENCY ALERT' },
      en: { main: 'Emergency', sub: 'ALL UNITS RESPOND' },
      ko: { main: '긴급 사태', sub: 'EMERGENCY ALERT' },
    },
    patch: {
      text: {
        mainFont: font('Dela Gothic One', 140, 400, 0.06),
        subFont: subFont('Oswald', 140, 0.24, 700, 0.35),
        subScale: 0.24,
        subGap: 0.2,
      },
      motion: {
        enter: enter('FX-I16', 0.7, 0.04),
        hold: { id: 'FX-H07', strength: 0.6 },
        exit: exit('FX-O16', 0.4, 0, { direction: 'vertical' }),
        holdDuration: 1.8,
      },
      style: {
        fill: solid('#ffe14d'),
        innerStroke: stroke('#1a1a1a', 6),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 0, 0, 6),
        glow: GLOW_OFF,
        subColorEnabled: true,
        subColor: '#ffffff',
        decoration: { kind: 'hazard', tapeColor: '#ffd23f', tapeStripeColor: '#1a1a1a', tapeWidth: 34, tapeSpeed: 120, tapeBlink: 0.4, padding: 0.35, animation: 'grow', duration: 0.45 },
      },
    },
  }),
  message({
    id: 'msg-mystery-call',
    category: 'mystery',
    names: { ja: '着信', en: 'Incoming Call', ko: '착신' },
    samples: {
      ja: { main: '着信', sub: '非通知' },
      en: { main: 'Incoming Call', sub: 'Unknown number' },
      ko: { main: '착신', sub: '발신자 표시 제한' },
    },
    patch: {
      text: {
        mainFont: font('M PLUS Rounded 1c', 120, 700, 0.1),
        subFont: subFont('M PLUS Rounded 1c', 120, 0.3, 400, 0.1),
        subScale: 0.3,
        subGap: 0.25,
      },
      motion: {
        enter: enter('FX-I21', 0.5, 0, { direction: 'horizontal' }),
        hold: { id: 'FX-H04', strength: 0.6 },
        exit: exit('FX-O16', 0.35, 0, { direction: 'horizontal' }),
        holdDuration: 1.8,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#0b3b2e', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.4, 10, 0, 4),
        glow: glow('#3ee6a8', 30, 0.8),
        decoration: { kind: 'box', fillColor: '#0b3b2e', fillOpacity: 0.8, lineColor: '#3ee6a8', lineWidth: 2, cornerRadius: 0.5, padding: 0.45, animation: 'grow', duration: 0.35 },
      },
    },
  }),

  // ── horror ────────────────────────────────────────────────
  message({
    id: 'msg-horror-presence',
    category: 'horror',
    names: { ja: '背後の気配', en: 'Presence', ko: '등 뒤의 기척' },
    samples: {
      ja: { main: '背後に、気配', sub: '' },
      en: { main: 'Something Behind You', sub: '' },
      ko: { main: '등 뒤에, 기척', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('Yuji Boku', 140, 400, 0.12),
        subFont: subFont('Yuji Boku', 140, 0.3, 400, 0.1),
        subScale: 0.3,
      },
      motion: {
        enter: enter('FX-I01', 1.6, 0.18, { order: 'random', easing: 'inOutCubic' }),
        hold: { id: 'FX-H06', strength: 1 },
        exit: exit('FX-O07', 1.4, 0.04),
        holdDuration: 2,
      },
      style: {
        fill: gradient(['#e8e2d8', '#8a1c1c']),
        innerStroke: stroke('#0a0000', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#3a0000', 0.9, 30, 0, 0),
        glow: glow('#5a0000', 60, 0.8),
      },
      background: { kind: 'bottom-gradient', color: '#000000', opacity: 0.6, syncFade: true },
    },
  }),
  message({
    id: 'msg-horror-run',
    category: 'horror',
    names: { ja: '逃げろ', en: 'Run', ko: '도망쳐' },
    samples: {
      ja: { main: '逃げろ', sub: '— 振り返るな —' },
      en: { main: 'RUN', sub: "— Don't look back —" },
      ko: { main: '도망쳐', sub: '— 뒤돌아보지 마 —' },
    },
    patch: {
      text: {
        mainFont: font('Zen Antique', 190, 400, 0.05),
        subFont: subFont('Zen Antique', 190, 0.2, 400, 0.3),
        subScale: 0.2,
        subGap: 0.2,
      },
      motion: {
        enter: enter('FX-I22', 0.8, 0, { strength: 1.2 }),
        hold: { id: 'FX-H08', strength: 0.8 },
        exit: exit('FX-O17', 0.6),
        holdDuration: 1.6,
      },
      style: {
        fill: solid('#f4f0ea'),
        innerStroke: stroke('#220000', 5),
        outerStroke: stroke('#b3001b', 3),
        shadow: shadow('#000000', 0.7, 12, 0, 0),
        glow: GLOW_OFF,
        glitchColors: ['#ff1f3d', '#2ee6d6'],
      },
    },
  }),
  message({
    id: 'msg-horror-watching',
    category: 'horror',
    names: { ja: '見ている', en: 'Watching', ko: '보고 있다' },
    samples: {
      ja: { main: '見ている', sub: '' },
      en: { main: 'It Is Watching', sub: '' },
      ko: { main: '보고 있다', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('Yuji Syuku', 150, 400, 0.4),
        subFont: subFont('Yuji Syuku', 150, 0.3, 400, 0.1),
        subScale: 0.3,
      },
      motion: {
        enter: enter('FX-I14', 1.6, 0.04, { strength: 0.8 }),
        hold: { id: 'FX-H02', strength: 0.4 },
        exit: exit('FX-O10', 1.2, 0.03, { strength: 0.9 }),
        holdDuration: 1.8,
      },
      style: {
        fill: solid('#c7c2ba', 0.85),
        innerStroke: stroke('#000000', 2),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.9, 22, 0, 3),
        glow: glow('#7d0d0d', 26, 0.6),
      },
    },
  }),

  // ── sci-fi ────────────────────────────────────────────────
  message({
    id: 'msg-scifi-warning',
    category: 'scifi',
    names: { ja: '警報', en: 'Warning', ko: '경보' },
    samples: {
      ja: { main: 'WARNING', sub: '未確認の反応を検知' },
      en: { main: 'WARNING', sub: 'Unidentified signal detected' },
      ko: { main: 'WARNING', sub: '미확인 반응 감지' },
    },
    patch: {
      text: {
        mainFont: font('Orbitron', 150, 900, 0.2),
        subFont: subFont('Share Tech Mono', 150, 0.22, 400, 0.15),
        subScale: 0.22,
        subGap: 0.25,
      },
      motion: {
        enter: enter('FX-I21', 0.45, 0, { direction: 'vertical', easing: 'outExpo' }),
        hold: { id: 'FX-H05', strength: 1 },
        exit: exit('FX-O16', 0.35, 0, { direction: 'vertical' }),
        holdDuration: 1.8,
      },
      style: {
        fill: solid('#ff4d4d'),
        innerStroke: stroke('#2a0000', 3),
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: glow('#ff2a2a', 36, 1.4),
        subColorEnabled: true,
        subColor: '#ffd0d0',
        decoration: { kind: 'band', fillColor: '#2a0000', fillOpacity: 0.65, bandEdgeBlur: 0.2, bandEndFade: 0.15, padding: 0.3, animation: 'grow', duration: 0.35 },
      },
    },
  }),
  message({
    id: 'msg-scifi-link',
    category: 'scifi',
    names: { ja: '接続完了', en: 'Link Established', ko: '접속 완료' },
    samples: {
      ja: { main: '接続完了', sub: 'SYNC 100%' },
      en: { main: 'Link Established', sub: 'SYNC 100%' },
      ko: { main: '접속 완료', sub: 'SYNC 100%' },
    },
    patch: {
      text: {
        mainFont: font('Murecho', 120, 900, 0.12),
        subFont: subFont('Share Tech Mono', 120, 0.28, 400, 0.2),
        subScale: 0.28,
      },
      motion: {
        enter: enter('FX-I15', 0, 0.07),
        exit: exit('FX-O11', 0, 0.04, { order: 'reverse' }),
        subEnter: 'FX-I15',
        subDelay: 0,
        holdDuration: 1.5,
      },
      style: {
        fill: gradient(['#e9fdff', '#5fe1ff'], 'block-horizontal'),
        innerStroke: stroke('#062430', 3),
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: glow('#35d0ff', 24, 1),
        decoration: { kind: 'corners', lineColor: '#5fe1ff', lineWidth: 2, padding: 0.4, animation: 'grow', duration: 0.4 },
      },
    },
  }),
  message({
    id: 'msg-scifi-warp',
    category: 'scifi',
    names: { ja: 'ワープ', en: 'Hyperjump', ko: '워프' },
    samples: {
      ja: { main: 'ワープ開始', sub: 'ETA 00:03:00' },
      en: { main: 'Jump Initiated', sub: 'ETA 00:03:00' },
      ko: { main: '워프 개시', sub: 'ETA 00:03:00' },
    },
    patch: {
      text: {
        mainFont: font('Audiowide', 130, 400, 0.1),
        subFont: subFont('Share Tech Mono', 130, 0.26, 400, 0.25),
        subScale: 0.26,
      },
      motion: {
        enter: enter('FX-I18', 0.7),
        hold: { id: 'FX-H01', strength: 0.5 },
        exit: exit('FX-O13', 0.45, 0, { strength: 1.6 }),
        holdDuration: 1.5,
      },
      style: {
        fill: gradient(['#ffffff', '#b8a6ff', '#5a3dff'], 'block-horizontal'),
        innerStroke: stroke('#120a33', 3),
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: glow('#8c7bff', 50, 1.3),
      },
      background: { kind: 'vignette', color: '#05001a', opacity: 0.55, syncFade: true },
    },
  }),

  // ── comedy ────────────────────────────────────────────────
  message({
    id: 'msg-comedy-whoa',
    category: 'comedy',
    names: { ja: 'まさかの展開', en: 'Plot Twist', ko: '설마의 전개' },
    samples: {
      ja: { main: 'まさかの!?', sub: '' },
      en: { main: 'No Way!?', sub: '' },
      ko: { main: '설마!?', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('Mochiy Pop One', 150, 400, 0),
        subFont: subFont('Mochiy Pop One', 150, 0.3, 400, 0.05),
        subScale: 0.3,
      },
      motion: {
        enter: enter('FX-I13', 0.9, 0.07),
        hold: { id: 'FX-H02', strength: 1 },
        exit: exit('FX-O08', 0.5, 0.03),
        holdDuration: 1.4,
      },
      style: {
        fill: solid('#ffef5a'),
        innerStroke: stroke('#e8336d', 7),
        outerStroke: stroke('#ffffff', 6),
        shadow: shadow('#000000', 0.35, 0, 4, 6),
        glow: GLOW_OFF,
      },
    },
  }),
  message({
    id: 'msg-comedy-boom',
    category: 'comedy',
    names: { ja: 'ドーン', en: 'Boom', ko: '쾅' },
    samples: {
      ja: { main: 'ドーン!', sub: '' },
      en: { main: 'BOOM!', sub: '' },
      ko: { main: '쾅!', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('Potta One', 200, 400, 0),
        subFont: subFont('Potta One', 200, 0.25, 400, 0.05),
        subScale: 0.25,
      },
      motion: {
        enter: enter('FX-I10', 0.4, 0.05, { easing: 'outBack', strength: 1.4 }),
        hold: { id: 'FX-H04', strength: 0.8 },
        exit: exit('FX-O04', 0.6, 0.06),
        holdDuration: 1.2,
      },
      style: {
        fill: gradient(['#fff6a8', '#ff9a1f', '#ff3d1f']),
        innerStroke: stroke('#3b0f00', 8),
        outerStroke: stroke('#ffffff', 5),
        shadow: shadow('#000000', 0.5, 0, 0, 8),
        glow: GLOW_OFF,
      },
    },
  }),

  // ── scene ─────────────────────────────────────────────────
  message({
    id: 'msg-scene-chapter',
    category: 'scene',
    names: { ja: '章タイトル', en: 'Chapter Title', ko: '장 제목' },
    samples: {
      ja: { main: '第一章', sub: '灯のない街' },
      en: { main: 'Chapter One', sub: 'The Lightless City' },
      ko: { main: '제1장', sub: '등불 없는 거리' },
    },
    patch: {
      text: {
        mainFont: font('Shippori Mincho', 120, 800, 0.35),
        subFont: subFont('Shippori Mincho', 120, 0.4, 400, 0.3),
        subScale: 0.4,
        subGap: 0.45,
      },
      motion: {
        enter: enter('FX-I01', 1.2, 0.08),
        exit: exit('FX-O01', 1.0),
        subEnter: 'FX-I08',
        subDelay: 0.1,
        holdDuration: 2.5,
      },
      style: {
        fill: solid('#f7f3ea'),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 16, 0, 2),
        glow: GLOW_OFF,
        decoration: { kind: 'title-frame', lineColor: '#e9e1cf', lineWidth: 1.5, lineExtent: 2, fillOpacity: 0, padding: 0.45, animation: 'grow', duration: 0.9 },
      },
    },
  }),
  message({
    id: 'msg-scene-flashback',
    category: 'scene',
    names: { ja: '回想', en: 'Flashback', ko: '회상' },
    samples: {
      ja: { main: '回想', sub: '— あの日の約束 —' },
      en: { main: 'Flashback', sub: '— A promise from that day —' },
      ko: { main: '회상', sub: '— 그날의 약속 —' },
    },
    patch: {
      text: {
        mainFont: font('Kaisei Opti', 120, 700, 0.5),
        subFont: subFont('Kaisei Opti', 120, 0.3, 400, 0.2),
        subScale: 0.3,
        subGap: 0.35,
      },
      motion: {
        enter: enter('FX-I08', 1.2),
        hold: { id: 'FX-H01', strength: 0.4 },
        exit: exit('FX-O07', 1.2),
        holdDuration: 2.2,
      },
      style: {
        fill: solid('#f3e6cf', 0.95),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: shadow('#5a3b1a', 0.5, 18, 0, 0),
        glow: glow('#ffd9a0', 40, 0.6),
      },
      background: { kind: 'vignette', color: '#3b2a14', opacity: 0.5, syncFade: true },
    },
  }),
  message({
    id: 'msg-scene-later',
    category: 'scene',
    names: { ja: '時間経過', en: 'Time Skip', ko: '시간 경과' },
    samples: {
      ja: { main: '三日後', sub: '' },
      en: { main: 'Three Days Later', sub: '' },
      ko: { main: '사흘 후', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('Noto Serif JP', 110, 700, 0.25),
        subFont: subFont('Noto Serif JP', 110, 0.3, 400, 0.2),
        subScale: 0.3,
      },
      motion: {
        enter: enter('FX-I06', 1.4, 0, { strength: 0.8 }),
        exit: exit('FX-O06', 1.2),
        holdDuration: 1.6,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#1c1c1c', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 10, 0, 3),
        glow: GLOW_OFF,
        decoration: { kind: 'side-lines', lineColor: '#ffffff', lineWidth: 2, lineExtent: 1.2, padding: 0.6, animation: 'grow', duration: 0.7 },
      },
    },
  }),
  message({
    id: 'msg-scene-tbc',
    category: 'scene',
    names: { ja: 'つづく', en: 'To Be Continued', ko: '다음 화에 계속' },
    samples: {
      ja: { main: 'つづく', sub: '次回、霧の向こうへ' },
      en: { main: 'To Be Continued', sub: 'Next time: beyond the fog' },
      ko: { main: '다음 화에 계속', sub: '다음 회, 안개 너머로' },
    },
    patch: {
      text: {
        mainFont: font('Kaisei Decol', 110, 700, 0.15),
        subFont: subFont('Kaisei Decol', 110, 0.3, 400, 0.1),
        subScale: 0.3,
        subGap: 0.4,
      },
      motion: {
        enter: enter('FX-I05', 0.8, 0.04, { direction: 'left' }),
        exit: exit('FX-O05', 0.6, 0.03, { direction: 'right' }),
        holdDuration: 2,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#1d3557', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#1d3557', 0.7, 0, 5, 5),
        glow: GLOW_OFF,
        decoration: { kind: 'underline', lineColor: '#f4a261', lineWidth: 4, lineExtent: 0.6, padding: 0.25, animation: 'grow', duration: 0.6 },
      },
    },
  }),

  // ── GM (stays on screen: loops by default) ────────────────
  message({
    id: 'msg-gm-break',
    category: 'gm',
    names: { ja: '休憩中', en: 'Break', ko: '휴식 중' },
    samples: {
      ja: { main: '休憩中', sub: 'BREAK TIME — すぐ戻ります' },
      en: { main: 'On a Break', sub: 'Back in a moment' },
      ko: { main: '휴식 중', sub: '곧 돌아옵니다' },
    },
    patch: {
      text: {
        mainFont: font('Zen Maru Gothic', 130, 900, 0.1),
        subFont: subFont('Zen Maru Gothic', 130, 0.26, 700, 0.15),
        subScale: 0.26,
        subGap: 0.3,
      },
      motion: {
        enter: enter('FX-I02', 0.8, 0.06),
        hold: { id: 'FX-H01', strength: 0.8 },
        exit: exit('FX-O01', 0.6),
        holdDuration: 3,
      },
      style: {
        fill: solid('#fffaf0'),
        innerStroke: stroke('#6b4f2a', 5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.3, 6, 0, 4),
        glow: GLOW_OFF,
        decoration: { kind: 'box', fillColor: '#6b4f2a', fillOpacity: 0.35, lineColor: '#fffaf0', lineWidth: 0, cornerRadius: 0.6, padding: 0.5, animation: 'fade', duration: 0.5 },
      },
    },
  }),
  message({
    id: 'msg-gm-secret',
    category: 'gm',
    names: { ja: '秘匿確認中', en: 'Secret Check', ko: '비밀 확인 중' },
    samples: {
      ja: { main: '秘匿確認中', sub: 'しばらくお待ちください' },
      en: { main: 'Checking Secrets', sub: 'Please stand by' },
      ko: { main: '비밀 확인 중', sub: '잠시 기다려 주세요' },
    },
    patch: {
      text: {
        mainFont: font('BIZ UDPGothic', 110, 700, 0.15),
        subFont: subFont('BIZ UDPGothic', 110, 0.3, 400, 0.15),
        subScale: 0.3,
        subGap: 0.3,
      },
      motion: {
        enter: enter('FX-I01', 0.6),
        hold: { id: 'FX-H05', strength: 0.7 },
        exit: exit('FX-O01', 0.6),
        holdDuration: 3,
      },
      style: {
        fill: solid('#e8edff'),
        innerStroke: stroke('#1a2340', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.4, 8, 0, 3),
        glow: glow('#7aa2ff', 26, 1),
        decoration: { kind: 'lines', lineColor: '#7aa2ff', lineWidth: 2, lineExtent: 0.5, padding: 0.35, animation: 'grow', duration: 0.5 },
      },
    },
  }),
  message({
    id: 'msg-gm-loading',
    category: 'gm',
    names: { ja: 'ロード中', en: 'Loading', ko: '로딩 중' },
    samples: {
      ja: { main: 'Now Loading', sub: '準備中…' },
      en: { main: 'Now Loading', sub: 'Getting ready…' },
      ko: { main: 'Now Loading', sub: '준비 중…' },
    },
    patch: {
      text: {
        mainFont: font('Press Start 2P', 70, 400, 0.05),
        subFont: subFont('DotGothic16', 70, 0.5, 400, 0.1),
        subScale: 0.5,
        subGap: 0.5,
      },
      motion: {
        enter: enter('FX-I15', 0, 0.09),
        hold: { id: 'FX-H02', strength: 0.6 },
        exit: exit('FX-O01', 0.4),
        subEnter: 'FX-I01',
        holdDuration: 2,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#000000', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 0, 4, 4),
        glow: GLOW_OFF,
      },
    },
  }),
  message({
    id: 'msg-gm-simple',
    category: 'gm',
    names: { ja: 'シンプル', en: 'Plain Text', ko: '심플' },
    samples: {
      ja: { main: 'ここに文字', sub: '' },
      en: { main: 'Your text here', sub: '' },
      ko: { main: '여기에 텍스트', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('Noto Sans JP', 120, 700, 0.04),
        subFont: subFont('Noto Sans JP', 120, 0.32, 400, 0.1),
        subScale: 0.32,
      },
      motion: {
        enter: enter('FX-I01', 0.5),
        exit: exit('FX-O01', 0.5),
        holdDuration: 2,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#111111', 5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 10, 0, 4),
        glow: GLOW_OFF,
      },
    },
  }),

  // ── roll results (loops by default), split by dice system ─
  message({
    id: 'msg-roll-d100-critical',
    category: 'roll',
    system: 'd100',
    names: { ja: 'クリティカル', en: 'Critical', ko: '크리티컬' },
    samples: {
      ja: { main: 'クリティカル!', sub: '出目 01' },
      en: { main: 'CRITICAL!', sub: 'Rolled 01' },
      ko: { main: '크리티컬!', sub: '주사위 01' },
    },
    patch: {
      text: {
        mainFont: font('RocknRoll One', 140, 400, 0.04),
        subFont: subFont('Share Tech Mono', 140, 0.24, 400, 0.2),
        subScale: 0.24,
        subGap: 0.2,
      },
      motion: {
        enter: enter('FX-I23', 0.8),
        hold: { id: 'FX-H05', strength: 1 },
        exit: exit('FX-O13', 0.5),
        holdDuration: 1.8,
      },
      style: {
        fill: gradient(['#fffbe0', '#ffd700', '#ff9f00']),
        innerStroke: stroke('#4a2600', 6),
        outerStroke: stroke('#ffffff', 3),
        shadow: shadow('#000000', 0.5, 10, 0, 5),
        glow: glow('#ffcc33', 50, 1.5),
      },
    },
  }),
  message({
    id: 'msg-roll-d100-success',
    category: 'roll',
    system: 'd100',
    names: { ja: '成功', en: 'Success', ko: '성공' },
    samples: {
      ja: { main: '成功', sub: '' },
      en: { main: 'SUCCESS', sub: '' },
      ko: { main: '성공', sub: '' },
    },
    patch: {
      text: {
        mainFont: font('M PLUS 1p', 150, 900, 0.1),
        subFont: subFont('M PLUS 1p', 150, 0.24, 700, 0.2),
        subScale: 0.24,
      },
      motion: {
        enter: enter('FX-I09', 0.5, 0.06),
        exit: exit('FX-O01', 0.5),
        holdDuration: 1.5,
      },
      style: {
        fill: solid('#e9fbff'),
        innerStroke: stroke('#0b4f6c', 6),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 8, 0, 5),
        glow: GLOW_OFF,
        decoration: { kind: 'underline', lineColor: '#20c4f4', lineWidth: 5, lineExtent: 0.4, padding: 0.2, animation: 'grow', duration: 0.4 },
      },
    },
  }),
  message({
    id: 'msg-roll-d100-fumble',
    category: 'roll',
    system: 'd100',
    names: { ja: 'ファンブル', en: 'Fumble', ko: '펌블' },
    samples: {
      ja: { main: 'ファンブル', sub: '出目 100' },
      en: { main: 'FUMBLE', sub: 'Rolled 100' },
      ko: { main: '펌블', sub: '주사위 100' },
    },
    patch: {
      text: {
        mainFont: font('Rampart One', 140, 400, 0.04),
        subFont: subFont('Share Tech Mono', 140, 0.24, 400, 0.2),
        subScale: 0.24,
        subGap: 0.2,
      },
      motion: {
        enter: enter('FX-I13', 0.9, 0.06, { strength: 1.2 }),
        hold: { id: 'FX-H04', strength: 0.5 },
        exit: exit('FX-O03', 0.8, 0.04),
        holdDuration: 1.6,
      },
      style: {
        fill: gradient(['#d0d0ff', '#5a4fcf']),
        innerStroke: stroke('#120a3a', 5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 10, 0, 6),
        glow: GLOW_OFF,
      },
    },
  }),
  message({
    id: 'msg-roll-2d6-great',
    category: 'roll',
    system: '2d6',
    names: { ja: '大成功', en: 'Great Success', ko: '대성공' },
    samples: {
      ja: { main: '大成功', sub: '6 + 6' },
      en: { main: 'Great Success', sub: '6 + 6' },
      ko: { main: '대성공', sub: '6 + 6' },
    },
    patch: {
      text: {
        mainFont: font('Dela Gothic One', 160, 400, 0.06),
        subFont: subFont('Oswald', 160, 0.26, 700, 0.3),
        subScale: 0.26,
        subGap: 0.2,
      },
      motion: {
        enter: enter('FX-I17', 0.75),
        hold: { id: 'FX-H03', strength: 1 },
        exit: exit('FX-O14', 0.6),
        holdDuration: 1.8,
      },
      style: {
        fill: gradient(['#ffffff', '#9cff8f', '#16a34a']),
        innerStroke: stroke('#052e16', 6),
        outerStroke: stroke('#ffffff', 3),
        shadow: shadow('#000000', 0.5, 10, 0, 5),
        glow: glow('#4ade80', 40, 1.2),
      },
    },
  }),
  message({
    id: 'msg-roll-2d6-success',
    category: 'roll',
    system: '2d6',
    names: { ja: '成功', en: 'Success', ko: '성공' },
    samples: {
      ja: { main: '成功', sub: '目標値 達成' },
      en: { main: 'Success', sub: 'Target reached' },
      ko: { main: '성공', sub: '목표치 달성' },
    },
    patch: {
      text: {
        mainFont: font('Zen Kaku Gothic Antique', 140, 900, 0.1),
        subFont: subFont('Zen Kaku Gothic Antique', 140, 0.26, 700, 0.2),
        subScale: 0.26,
        subGap: 0.25,
      },
      motion: {
        enter: enter('FX-I12', 0.6, 0.06),
        exit: exit('FX-O09', 0.5, 0.04),
        holdDuration: 1.5,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#1e3a8a', 6),
        outerStroke: STROKE_OFF,
        shadow: shadow('#1e3a8a', 0.5, 0, 0, 6),
        glow: GLOW_OFF,
        decoration: { kind: 'box', fillColor: '#1e3a8a', fillOpacity: 0.5, lineColor: '#93c5fd', lineWidth: 2, cornerRadius: 0.15, padding: 0.35, animation: 'grow', duration: 0.4 },
      },
    },
  }),
  message({
    id: 'msg-roll-2d6-failure',
    category: 'roll',
    system: '2d6',
    names: { ja: '失敗', en: 'Failure', ko: '실패' },
    samples: {
      ja: { main: '失敗', sub: '— 次こそは —' },
      en: { main: 'Failure', sub: '— Maybe next time —' },
      ko: { main: '실패', sub: '— 다음엔 꼭 —' },
    },
    patch: {
      text: {
        mainFont: font('Zen Kaku Gothic New', 140, 900, 0.1),
        subFont: subFont('Zen Kaku Gothic New', 140, 0.26, 400, 0.2),
        subScale: 0.26,
        subGap: 0.3,
      },
      motion: {
        enter: enter('FX-I03', 0.6, 0.05, { easing: 'outBounce' }),
        exit: exit('FX-O03', 0.8, 0.04),
        holdDuration: 1.5,
      },
      style: {
        fill: gradient(['#e5e7eb', '#6b7280']),
        innerStroke: stroke('#111827', 5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 6, 0, 6),
        glow: GLOW_OFF,
      },
    },
  }),
]);
