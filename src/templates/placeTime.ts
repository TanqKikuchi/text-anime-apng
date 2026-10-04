import { defineTemplates, enter, exit, font, glow, gradient, shadow, solid, stroke, subFont, GLOW_OFF, SHADOW_OFF, STROKE_OFF } from './build';
import type { TemplateDef } from './types';

/** Place / time captions. Several sit in a corner of the frame rather than the centre. */
export const PLACE_TIME_TEMPLATES: readonly TemplateDef[] = defineTemplates('place-time', [
  {
    id: 'pt-harbor-converge',
    category: 'fantasy',
    names: { ja: '上下から合流', en: 'Converge', ko: '위아래에서 합류' },
    samples: {
      ja: { main: '霧の港町', sub: 'ルメール 東埠頭' },
      en: { main: 'Harbor of Mist', sub: 'Lumere, East Pier' },
      ko: { main: '안개 낀 항구 마을', sub: '뤼메르 동쪽 부두' },
    },
    patch: {
      text: {
        mainFont: font('Shippori Mincho B1', 110, 800, 0.15),
        subFont: subFont('Shippori Mincho', 110, 0.32, 400, 0.3),
        subScale: 0.32,
        subGap: 0.35,
      },
      motion: {
        enter: enter('FX-I04', 0.9, 0.1),
        exit: exit('FX-O04', 0.8, 0.06),
        subEnter: 'FX-I01',
        subDelay: -0.1,
        holdDuration: 2,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#10202c', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 14, 0, 3),
        glow: GLOW_OFF,
      },
    },
  },
  {
    id: 'pt-capital-rise',
    category: 'fantasy',
    names: { ja: '下から浮上', en: 'Rise Up', ko: '아래에서 떠오름' },
    samples: {
      ja: { main: '王都ヴェルナ', sub: '第三区画・商人街' },
      en: { main: 'Royal City of Verna', sub: 'Third Ward — Merchant Row' },
      ko: { main: '왕도 베르나', sub: '제3구역 · 상인 거리' },
    },
    patch: {
      text: {
        mainFont: font('Zen Old Mincho', 100, 900, 0.12),
        subFont: subFont('Zen Old Mincho', 100, 0.32, 400, 0.25),
        subScale: 0.32,
        subGap: 0.3,
      },
      layout: { anchor: 'bottom', marginY: 80 },
      motion: {
        enter: enter('FX-I02', 0.9, 0.06),
        exit: exit('FX-O02', 0.7, 0.03),
        holdDuration: 2,
      },
      style: {
        fill: gradient(['#fffaf0', '#e9cf8f']),
        innerStroke: stroke('#2a1d08', 4),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 12, 0, 3),
        glow: GLOW_OFF,
      },
      background: { kind: 'bottom-gradient', color: '#000000', opacity: 0.5, syncFade: true },
    },
  },
  {
    id: 'pt-archive-spacing',
    category: 'mystery',
    names: { ja: '字間が縮まる', en: 'Tracking In', ko: '자간이 좁혀짐' },
    samples: {
      ja: { main: '地下書庫', sub: 'B3F' },
      en: { main: 'Underground Archive', sub: 'B3F' },
      ko: { main: '지하 서고', sub: 'B3F' },
    },
    patch: {
      text: {
        mainFont: font('Noto Serif JP', 110, 900, 0.4),
        subFont: subFont('Share Tech Mono', 110, 0.3, 400, 0.6),
        subScale: 0.3,
        subGap: 0.3,
        subPosition: 'before',
      },
      motion: {
        enter: enter('FX-I06', 1.6),
        exit: exit('FX-O06', 1.2),
        holdDuration: 1.8,
      },
      style: {
        fill: solid('#f2f2f2'),
        innerStroke: stroke('#0d0d0d', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.7, 18, 0, 0),
        glow: GLOW_OFF,
      },
    },
  },
  {
    id: 'pt-countdown-clock',
    category: 'scifi',
    names: { ja: '時刻表示', en: 'Clock', ko: '시각 표시' },
    samples: {
      ja: { main: '23:47', sub: '決行まで、あと13分' },
      en: { main: '23:47', sub: '13 minutes until go time' },
      ko: { main: '23:47', sub: '작전 개시까지 13분' },
    },
    patch: {
      text: {
        mainFont: font('Orbitron', 150, 700, 0.08),
        subFont: subFont('Zen Kaku Gothic New', 150, 0.18, 700, 0.15),
        subScale: 0.18,
        subGap: 0.2,
      },
      layout: { anchor: 'top-right', alignment: 'end', marginX: 72, marginY: 56 },
      motion: {
        enter: enter('FX-I16', 0.8, 0.06),
        hold: { id: 'FX-H05', strength: 0.8 },
        exit: exit('FX-O12', 0.6, 0.04),
        holdDuration: 2,
      },
      style: {
        fill: solid('#9df9ff'),
        innerStroke: stroke('#002a33', 3),
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: glow('#00d5ff', 28, 1.1),
        subColorEnabled: true,
        subColor: '#e6fdff',
      },
    },
  },
  {
    id: 'pt-old-town-underline',
    category: 'daily',
    names: { ja: '下線テロップ (左下)', en: 'Underline (bottom left)', ko: '밑줄 자막 (왼쪽 아래)' },
    samples: {
      ja: { main: '旧市街・時計塔前', sub: 'AM 06:12' },
      en: { main: 'Old Town, Clock Tower Square', sub: '6:12 AM' },
      ko: { main: '구시가지 · 시계탑 앞', sub: '오전 6:12' },
    },
    patch: {
      text: {
        mainFont: font('Zen Kaku Gothic New', 72, 700, 0.08),
        subFont: subFont('Zen Kaku Gothic New', 72, 0.45, 400, 0.15),
        subScale: 0.45,
        subGap: 0.5,
      },
      layout: { anchor: 'bottom-left', alignment: 'start', marginX: 72, marginY: 64 },
      motion: {
        enter: enter('FX-I05', 0.6, 0.03, { direction: 'left' }),
        exit: exit('FX-O05', 0.5, 0.02, { direction: 'left' }),
        holdDuration: 2.2,
      },
      style: {
        fill: solid('#ffffff'),
        innerStroke: stroke('#111111', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 8, 0, 3),
        glow: GLOW_OFF,
        decoration: { kind: 'underline', lineColor: '#ffffff', lineWidth: 3, lineExtent: 0.6, padding: 0.2, animation: 'grow', duration: 0.6 },
      },
    },
  },
  {
    id: 'pt-temple-vertical',
    category: 'fantasy',
    names: { ja: '縦書き (右上)', en: 'Vertical (top right)', ko: '세로쓰기 (오른쪽 위)' },
    samples: {
      ja: { main: '山寺の参道', sub: '黄昏時' },
      en: { main: 'Temple Path', sub: 'At dusk' },
      ko: { main: '산사의 참배길', sub: '해질녘' },
    },
    patch: {
      text: {
        mainFont: font('Yuji Mai', 90, 400, 0.2),
        subFont: subFont('Yuji Mai', 90, 0.38, 400, 0.3),
        subScale: 0.38,
        subGap: 0.4,
      },
      layout: { writingMode: 'vertical', anchor: 'top-right', alignment: 'start', marginX: 80, marginY: 64 },
      motion: {
        enter: enter('FX-I03', 1, 0.1),
        exit: exit('FX-O01', 1),
        holdDuration: 2.2,
      },
      style: {
        fill: solid('#fbf7ef'),
        innerStroke: stroke('#2a1f14', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 12, 0, 2),
        glow: GLOW_OFF,
        decoration: { kind: 'accent-bar', lineColor: '#c0392b', lineWidth: 4, padding: 0.35, animation: 'grow', duration: 0.6 },
      },
    },
  },
  {
    id: 'pt-lodge-box',
    category: 'horror',
    names: { ja: 'ボックス (左上)', en: 'Box (top left)', ko: '박스 (왼쪽 위)' },
    samples: {
      ja: { main: '三日目・夜', sub: '山荘 二階廊下' },
      en: { main: 'Day 3 — Night', sub: 'Mountain lodge, 2F hallway' },
      ko: { main: '사흘째 · 밤', sub: '산장 2층 복도' },
    },
    patch: {
      text: {
        mainFont: font('BIZ UDPMincho', 64, 700, 0.1),
        subFont: subFont('BIZ UDPGothic', 64, 0.42, 400, 0.12),
        subScale: 0.42,
        subGap: 0.35,
      },
      layout: { anchor: 'top-left', alignment: 'start', marginX: 56, marginY: 48 },
      motion: {
        enter: enter('FX-I20', 0.7, 0, { direction: 'left-to-right' }),
        exit: exit('FX-O15', 0.6, 0, { direction: 'left-to-right' }),
        holdDuration: 2.2,
      },
      style: {
        fill: solid('#ececf2'),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: GLOW_OFF,
        decoration: { kind: 'box', fillColor: '#0b0b0f', fillOpacity: 0.7, lineColor: '#c9c9d1', lineWidth: 1.5, cornerRadius: 0.08, padding: 0.45, animation: 'grow', duration: 0.45 },
      },
    },
  },
  {
    id: 'pt-station-band',
    category: 'scifi',
    names: { ja: '帯テロップ (下)', en: 'Band (bottom)', ko: '띠 자막 (아래)' },
    samples: {
      ja: { main: '軌道ステーション〈アマツ〉', sub: '2189.04.12 — 標準時 09:00' },
      en: { main: 'Orbital Station AMATSU', sub: '2189.04.12 — 09:00 Standard' },
      ko: { main: '궤도 정거장 〈아마츠〉', sub: '2189.04.12 — 표준시 09:00' },
    },
    patch: {
      text: {
        mainFont: font('Murecho', 64, 700, 0.1),
        subFont: subFont('Share Tech Mono', 64, 0.4, 400, 0.2),
        subScale: 0.4,
        subGap: 0.3,
      },
      layout: { anchor: 'bottom', marginY: 72 },
      motion: {
        enter: enter('FX-I15', 0, 0.04),
        exit: exit('FX-O01', 0.6),
        subEnter: 'FX-I01',
        subDelay: 0,
        holdDuration: 2.2,
      },
      style: {
        fill: solid('#e6f6ff'),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: glow('#4cc9ff', 16, 0.6),
        subColorEnabled: true,
        subColor: '#7fd8ff',
        decoration: { kind: 'band', fillColor: '#04121f', fillOpacity: 0.7, bandEdgeBlur: 0.3, bandEndFade: 0.5, padding: 0.4, animation: 'grow', duration: 0.5 },
      },
    },
  },
]);
