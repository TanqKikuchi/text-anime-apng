import { defineTemplates, enter, exit, font, glow, gradient, shadow, solid, stroke, GLOW_OFF, SHADOW_OFF, STROKE_OFF } from './build';
import type { TemplateDef } from './types';

/** Trailer templates: one or more per display flow (TL-08〜13). Trailers have no sub text. */
export const TRAILER_TEMPLATES: readonly TemplateDef[] = defineTemplates('trailer', [
  {
    id: 'tr-cinema-title',
    category: 'cinema',
    names: { ja: '映画の幕開け', en: 'Opening Card', ko: '영화의 막' },
    samples: {
      ja: { main: 'かつて、星は歌っていた。\n\nその歌を最後に聴いた者が\nいま、目を覚ます。' },
      en: { main: 'Once, the stars could sing.\n\nThe last one who heard that song\nis waking up now.' },
      ko: { main: '한때 별들은 노래했다.\n\n그 노래를 마지막으로 들은 자가\n지금 눈을 뜬다.' },
    },
    patch: {
      text: { mainFont: font('Shippori Mincho', 52, 700, 0.12), lineHeight: 2, maxCharactersPerLine: 0 },
      motion: {
        enter: enter('FX-I08', 0.6, 0),
        exit: exit('FX-O01', 0.9),
        holdDuration: 2.4,
        pageGap: 0.5,
        trailer: { flow: 'simultaneous', characterDuration: 1.4 },
      },
      style: {
        fill: solid('#f5efe0'),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.7, 14, 0, 2),
        glow: glow('#ffcf7a', 30, 0.5),
      },
      background: { kind: 'vignette', color: '#000000', opacity: 0.55, syncFade: true },
    },
  },
  {
    id: 'tr-letter-typewriter',
    category: 'daily',
    names: { ja: '手紙のタイプライター', en: 'Letter Typewriter', ko: '편지 타자기' },
    samples: {
      ja: { main: '拝啓\nこの手紙が届くころ、\n私はもう、この街にはいません。' },
      en: { main: 'Dear friend,\nby the time this letter reaches you,\nI will have left this town.' },
      ko: { main: '친애하는 친구에게\n이 편지가 닿을 무렵\n나는 이미 이 도시에 없을 거야.' },
    },
    patch: {
      text: { mainFont: font('Klee One', 46, 600, 0.06), lineHeight: 1.9, maxCharactersPerLine: 24 },
      layout: { alignment: 'start' },
      motion: {
        enter: enter('FX-I15', 0, 0.08),
        exit: exit('FX-O01', 0.8),
        holdDuration: 2.5,
        trailer: { flow: 'characters', charactersPerSecond: 10, punctuationPause: 0.35, linePause: 0.5, cursor: true },
      },
      style: {
        fill: solid('#fdf8ee'),
        innerStroke: stroke('#3a2a1a', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.45, 8, 0, 3),
        glow: GLOW_OFF,
        cursorColor: '#d9534f',
      },
    },
  },
  {
    id: 'tr-system-log',
    category: 'scifi',
    names: { ja: 'システムログ', en: 'System Log', ko: '시스템 로그' },
    samples: {
      ja: { main: '> 起動シーケンス開始\n> 生命維持装置……正常\n> 乗員 4 名の覚醒を確認\n> 警告: 航路上に未知の構造物' },
      en: { main: '> BOOT SEQUENCE START\n> LIFE SUPPORT ...... OK\n> 4 CREW MEMBERS AWAKE\n> WARNING: UNKNOWN STRUCTURE AHEAD' },
      ko: { main: '> 부팅 시퀀스 시작\n> 생명 유지 장치…… 정상\n> 승무원 4명 각성 확인\n> 경고: 항로 위 미지의 구조물' },
    },
    patch: {
      text: { mainFont: font('DotGothic16', 40, 400, 0.04), lineHeight: 1.7, maxCharactersPerLine: 0 },
      layout: { alignment: 'start' },
      motion: {
        enter: enter('FX-I01', 0.1, 0),
        hold: { id: 'FX-H06', strength: 0.4 },
        exit: exit('FX-O01', 0.5),
        holdDuration: 2,
        trailer: { flow: 'characters', charactersPerSecond: 28, characterDuration: 0.08, punctuationPause: 0.05, linePause: 0.4, cursor: true },
      },
      style: {
        fill: solid('#7dffb0'),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: SHADOW_OFF,
        glow: glow('#2bff88', 14, 0.9),
      },
      background: { kind: 'solid', color: '#020c06', opacity: 0.75, syncFade: true },
    },
  },
  {
    id: 'tr-oath-lines',
    category: 'fantasy',
    names: { ja: '誓いの言葉', en: 'The Oath', ko: '맹세의 말' },
    samples: {
      ja: { main: '剣を取れ。\n盾を掲げよ。\n灯を絶やすな。\n\n夜明けは、我らが運ぶ。' },
      en: { main: 'Take up the sword.\nRaise the shield.\nKeep the flame alive.\n\nWe carry the dawn.' },
      ko: { main: '검을 들어라.\n방패를 높이 들어라.\n불꽃을 꺼뜨리지 마라.\n\n새벽은 우리가 데려온다.' },
    },
    patch: {
      text: { mainFont: font('Zen Old Mincho', 54, 900, 0.1), lineHeight: 2 },
      motion: {
        enter: enter('FX-I02', 0.6, 0),
        exit: exit('FX-O02', 0.8, 0.02),
        holdDuration: 1.8,
        trailer: { flow: 'lines', lineInterval: 0.9, characterDuration: 0.6 },
      },
      style: {
        fill: gradient(['#fff4d6', '#e0b85a']),
        innerStroke: stroke('#2b1a05', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 10, 0, 3),
        glow: GLOW_OFF,
      },
    },
  },
  {
    id: 'tr-dusk-drift',
    category: 'mystery',
    names: { ja: '夕暮れの教室', en: 'Dusk Classroom', ko: '해질녘 교실' },
    samples: {
      ja: { main: '放課後の教室に\n夕陽が長く伸びていた。\n誰もいないはずの席で\nページが一枚、めくれた。' },
      en: { main: 'In the empty classroom\nthe sunset stretched long.\nAt a desk no one used,\na single page turned.' },
      ko: { main: '방과 후 교실에\n노을이 길게 드리웠다.\n아무도 없어야 할 자리에서\n책장이 한 장 넘어갔다.' },
    },
    patch: {
      text: { mainFont: font('Zen Kurenaido', 48, 400, 0.08), lineHeight: 2 },
      motion: {
        enter: enter('FX-I01', 0.6, 0),
        exit: exit('FX-O07', 1),
        holdDuration: 2,
        trailer: { flow: 'smooth-lines', lineInterval: 1, lineFlowDuration: 1.6, characterDuration: 0.8 },
      },
      style: {
        fill: solid('#fff3e3'),
        innerStroke: stroke('#4a2e1a', 2.5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 12, 0, 2),
        glow: GLOW_OFF,
      },
    },
  },
  {
    id: 'tr-center-impact',
    category: 'battle',
    names: { ja: '一文字ずつ叩き込む', en: 'One by One', ko: '한 글자씩 쾅' },
    samples: {
      ja: { main: '運命を\n覆せ' },
      en: { main: 'DEFY\nFATE' },
      ko: { main: '운명을\n뒤집어라' },
    },
    patch: {
      text: { mainFont: font('Dela Gothic One', 72, 400, 0.08), lineHeight: 1.4 },
      motion: {
        exit: exit('FX-O13', 0.5),
        holdDuration: 1.8,
        trailer: { flow: 'center-characters', charactersPerSecond: 6, centerSize: 0.55, centerPause: 0.5, impact: 1.4 },
      },
      style: {
        fill: gradient(['#ffffff', '#ffb4a2', '#e5383b']),
        innerStroke: stroke('#1a0000', 5),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 10, 0, 4),
        glow: glow('#ff4d4d', 30, 1),
      },
    },
  },
  {
    id: 'tr-tower-expand',
    category: 'fantasy',
    names: { ja: '中央から広がる題名', en: 'Unfolding Title', ko: '펼쳐지는 제목' },
    samples: {
      ja: { main: '星詠みの塔' },
      en: { main: 'The Starward Tower' },
      ko: { main: '별읽기의 탑' },
    },
    patch: {
      text: { mainFont: font('Kaisei Tokumin', 84, 800, 0.3), lineHeight: 1.6 },
      motion: {
        exit: exit('FX-O07', 0.9),
        holdDuration: 2.2,
        trailer: { flow: 'expand', overlapHold: 0.6, expandDuration: 1.2 },
      },
      style: {
        fill: gradient(['#ffffff', '#cfe0ff', '#8fb0ff'], 'block-horizontal'),
        innerStroke: stroke('#0b1630', 3),
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.5, 12, 0, 3),
        glow: glow('#a8c8ff', 40, 0.9),
      },
    },
  },
  {
    id: 'tr-end-roll',
    category: 'cinema',
    names: { ja: 'エンドロール', en: 'End Credits', ko: '엔딩 크레디트' },
    samples: {
      ja: { main: '— 本日の物語 —\n\nゲームマスター\n夜更かしの語り部\n\nプレイヤー\n寄り道好きの旅人たち\n\nそして、見届けてくれたあなた\n\nありがとうございました' },
      en: { main: "— Tonight's Tale —\n\nGame Master\nThe Night-Owl Narrator\n\nPlayers\nTravellers Who Love Detours\n\nAnd you, for watching\n\nThank you for playing" },
      ko: { main: '— 오늘의 이야기 —\n\n게임 마스터\n밤샘하는 이야기꾼\n\n플레이어\n샛길을 좋아하는 여행자들\n\n그리고 지켜봐 준 당신\n\n고맙습니다' },
    },
    patch: {
      text: { mainFont: font('Noto Serif JP', 44, 700, 0.1), lineHeight: 2.2, splitPages: false },
      motion: {
        enter: enter('FX-I01', 0.4, 0),
        trailer: { flow: 'scroll', scrollSpeed: 80, edgeFade: true },
      },
      style: {
        fill: solid('#f0ece4'),
        innerStroke: STROKE_OFF,
        outerStroke: STROKE_OFF,
        shadow: shadow('#000000', 0.6, 8, 0, 2),
        glow: GLOW_OFF,
      },
    },
  },
]);
