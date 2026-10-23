import { EASING_IDS } from '../core/easing';
import { ENTER_EFFECT_IDS, EXIT_EFFECT_IDS, HOLD_EFFECT_IDS } from '../core/scene';
import { TEMPLATES } from '../templates';
import { FONT_CATALOG } from '../ui/fonts/catalog';
import { translate } from '../ui/i18n';
import type { MessageKey } from '../ui/i18n';

/**
 * What the assistant may choose from, generated from the app's own tables so that new templates,
 * effects and fonts reach the model without editing this file. Kept deterministic (no dates, no
 * random order) because it sits in the cached prompt prefix.
 */

const label = (key: string): string => translate('ja', key as MessageKey);

export function templateIds(): readonly string[] {
  return TEMPLATES.map((template) => template.id);
}

function templateLines(): string {
  return TEMPLATES.map((template) => {
    const sample = template.samples.ja;
    const sub = sample.sub ? ` / ${sample.sub}` : '';
    return `- ${template.id} [${template.mode}, ${label(`category.${template.category}`)}] ${template.names.ja} — 例:「${sample.main.replace(/\n/g, ' ')}${sub}」`;
  }).join('\n');
}

function effectLines(ids: readonly string[]): string {
  return ids.map((id) => `${id}=${label(`fx.${id}`)}`).join(', ');
}

function fontLines(): string {
  const groups = new Map<string, string[]>();
  for (const font of FONT_CATALOG) {
    const list = groups.get(font.category) ?? [];
    list.push(`${font.family}(${font.weights.join('/')})`);
    groups.set(font.category, list);
  }
  return [...groups].map(([category, families]) => `- ${label(`fontCat.${category}`)}: ${families.join(', ')}`).join('\n');
}

export function buildCatalog(): string {
  return [
    '## テンプレート (templateId)',
    templateLines(),
    '',
    '## 登場の動き (motion.enter.id)',
    effectLines(ENTER_EFFECT_IDS),
    '## 退場の動き (motion.exit.id)',
    effectLines(EXIT_EFFECT_IDS),
    '## 表示中の動き (motion.hold.id)',
    effectLines(HOLD_EFFECT_IDS),
    `## イージング (easing): ${EASING_IDS.join(', ')}`,
    '',
    '## フォント (text.mainFont.family / text.subFont.family。括弧内は使える太さ)',
    fontLines(),
  ].join('\n');
}

export const SCHEMA_NOTES = `## patch で変えられる主な項目と範囲 (範囲外は自動で丸められる)
- text: main, sub (trailer では sub なし), mainFont{family,size 12-400,weight 100-900,italic,letterSpacing -0.2-1.2}, subFontInherit, subFont{family,weight,italic,letterSpacing}, subScale 0.1-0.9, subGap 0-1.5, subPosition before|after, lineHeight 0.9-3.2, maxCharactersPerLine 0-60
- layout: writingMode horizontal|vertical, alignment start|center|end, anchor top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right, marginX/marginY 0-400, offsetX/offsetY -800-800, autoShrink
- motion: enter/exit{id,duration 0.05-4,stagger 0-0.6,order forward|reverse|center|edges|random,easing,strength 0.2-2.5,direction left|right|up|down|left-to-right|right-to-left|top-to-bottom|bottom-to-top|center|vertical|horizontal}, hold{id,strength 0.2-3}, exitEnabled, preDelay 0-3, holdDuration 0-10, postDelay 0-5
- motion.trailer (trailer モード): flow characters|center-characters|expand|lines|smooth-lines|simultaneous|scroll, charactersPerSecond 2-40, cursor, edgeFade
- style: fill{kind solid|gradient, colors[色1,色2,色3任意], direction line-vertical|block-horizontal|block-diagonal, opacity 0-1}, innerStroke/outerStroke{enabled,color,width}, shadow{enabled,color,opacity,blur 0-80,offsetX,offsetY}, glow{enabled,color,spread 2-150,strength 0.1-4}, subColorEnabled, subColor, decoration{kind none|band|hazard|box|title-frame|lines|underline|side-lines|accent-bar|corners, fillColor, fillOpacity, lineColor, lineWidth}
- background: kind none|solid|vignette|bottom-gradient|top-gradient, color, opacity 0-1
- canvas: preset fhd|hd|light|banner|caption|square|portrait (width/height は preset に合わせる)
- 色は #RRGGBB で書く。配列 (colors) は全要素を書く`;
