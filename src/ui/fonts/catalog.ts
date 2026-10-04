/**
 * FNT-01 font catalogue (Google Fonts), FNT-03 fallback chains, FNT-04 Hangul substitutes and
 * FNT-05 weight snapping. Pure data + functions (no DOM) so it can be unit-tested.
 */

export type FontCategory = 'gothic' | 'mincho' | 'rounded' | 'design' | 'brush' | 'korean' | 'latin';
export type GenericFamily = 'sans-serif' | 'serif' | 'monospace' | 'cursive';

export interface CatalogFont {
  readonly family: string;
  readonly weights: readonly number[];
  readonly category: FontCategory;
  readonly generic: GenericFamily;
  /** Japanese substitute (latin / korean fonts only). */
  readonly jpFallback?: string;
  /** Hangul substitute override (non-korean fonts; otherwise the category default). */
  readonly hangul?: string;
}

/** Picker tab order (FNT-01); "mine" is shown only when the user registered fonts. */
export const FONT_CATEGORIES = ['all', 'gothic', 'mincho', 'rounded', 'design', 'brush', 'korean', 'latin', 'mine'] as const;
export type FontCategoryTab = (typeof FONT_CATEGORIES)[number];

export const DEFAULT_FONT = 'Noto Serif JP';
/** Replacement for a font that no longer exists (FNT-09, STO-02). */
export const MISSING_FONT_REPLACEMENT = 'Noto Sans JP';

const W3 = [400, 700, 900] as const;
const W1 = [400] as const;

function f(family: string, category: FontCategory, generic: GenericFamily, weights: readonly number[] = W1, extra: { jpFallback?: string; hangul?: string } = {}): CatalogFont {
  return { family, category, generic, weights, ...extra };
}

export const FONT_CATALOG: readonly CatalogFont[] = [
  // gothic (7)
  f('Noto Sans JP', 'gothic', 'sans-serif', W3),
  f('Zen Kaku Gothic New', 'gothic', 'sans-serif', W3),
  f('Zen Kaku Gothic Antique', 'gothic', 'sans-serif', W3),
  f('M PLUS 1p', 'gothic', 'sans-serif', W3),
  f('Murecho', 'gothic', 'sans-serif', W3),
  f('BIZ UDPGothic', 'gothic', 'sans-serif', [400, 700]),
  f('Sawarabi Gothic', 'gothic', 'sans-serif'),
  // mincho (9)
  f('Noto Serif JP', 'mincho', 'serif', W3),
  f('Shippori Mincho', 'mincho', 'serif', [400, 700, 800]),
  f('Shippori Mincho B1', 'mincho', 'serif', [400, 700, 800]),
  f('Zen Old Mincho', 'mincho', 'serif', W3, { hangul: 'Gowun Batang' }),
  f('Kaisei Tokumin', 'mincho', 'serif', [400, 700, 800]),
  f('Kaisei Opti', 'mincho', 'serif', [400, 700]),
  f('Hina Mincho', 'mincho', 'serif', W1, { hangul: 'Song Myung' }),
  f('BIZ UDPMincho', 'mincho', 'serif', [400, 700]),
  f('Sawarabi Mincho', 'mincho', 'serif'),
  // rounded / pop (7)
  f('M PLUS Rounded 1c', 'rounded', 'sans-serif', W3, { hangul: 'Gowun Dodum' }),
  f('Zen Maru Gothic', 'rounded', 'sans-serif', W3, { hangul: 'Gowun Dodum' }),
  f('Kosugi Maru', 'rounded', 'sans-serif', W1, { hangul: 'Gowun Dodum' }),
  f('Kiwi Maru', 'rounded', 'serif', [400, 500]),
  f('Mochiy Pop One', 'rounded', 'sans-serif'),
  f('Hachi Maru Pop', 'rounded', 'cursive', W1, { hangul: 'Gaegu' }),
  f('Potta One', 'rounded', 'sans-serif', W1, { hangul: 'Black Han Sans' }),
  // design (12)
  f('Dela Gothic One', 'design', 'sans-serif', W1, { hangul: 'Black Han Sans' }),
  f('RocknRoll One', 'design', 'sans-serif'),
  f('Reggae One', 'design', 'sans-serif', W1, { hangul: 'Black Han Sans' }),
  f('Rampart One', 'design', 'sans-serif'),
  f('Train One', 'design', 'sans-serif'),
  f('Stick', 'design', 'sans-serif'),
  f('DotGothic16', 'design', 'monospace', W1, { hangul: 'Nanum Gothic Coding' }),
  f('Kaisei Decol', 'design', 'serif', [400, 700], { hangul: 'Gowun Batang' }),
  f('Zen Antique', 'design', 'serif', W1, { hangul: 'Song Myung' }),
  f('Shippori Antique', 'design', 'sans-serif', W1, { hangul: 'Song Myung' }),
  f('New Tegomin', 'design', 'serif', W1, { hangul: 'Song Myung' }),
  f('Darumadrop One', 'design', 'sans-serif', W1, { jpFallback: 'Mochiy Pop One', hangul: 'Jua' }),
  // brush / handwriting (7)
  f('Yuji Syuku', 'brush', 'serif'),
  f('Yuji Mai', 'brush', 'serif'),
  f('Yuji Boku', 'brush', 'serif'),
  f('Klee One', 'brush', 'cursive', [400, 600], { hangul: 'Nanum Pen Script' }),
  f('Yomogi', 'brush', 'cursive', W1, { hangul: 'Gaegu' }),
  f('Zen Kurenaido', 'brush', 'cursive', W1, { hangul: 'Nanum Pen Script' }),
  f('Yusei Magic', 'brush', 'cursive', W1, { hangul: 'Gaegu' }),
  // korean (21)
  f('Noto Sans KR', 'korean', 'sans-serif', W3, { jpFallback: 'Noto Sans JP' }),
  f('Gothic A1', 'korean', 'sans-serif', W3, { jpFallback: 'Zen Kaku Gothic New' }),
  f('Nanum Gothic', 'korean', 'sans-serif', [400, 700, 800], { jpFallback: 'Noto Sans JP' }),
  f('IBM Plex Sans KR', 'korean', 'sans-serif', [400, 700], { jpFallback: 'BIZ UDPGothic' }),
  f('Noto Serif KR', 'korean', 'serif', W3, { jpFallback: 'Noto Serif JP' }),
  f('Nanum Myeongjo', 'korean', 'serif', [400, 700, 800], { jpFallback: 'Shippori Mincho' }),
  f('Gowun Batang', 'korean', 'serif', [400, 700], { jpFallback: 'Zen Old Mincho' }),
  f('Hahmlet', 'korean', 'serif', W3, { jpFallback: 'Noto Serif JP' }),
  f('Song Myung', 'korean', 'serif', W1, { jpFallback: 'Hina Mincho' }),
  f('Gowun Dodum', 'korean', 'sans-serif', W1, { jpFallback: 'Zen Maru Gothic' }),
  f('Jua', 'korean', 'sans-serif', W1, { jpFallback: 'Kiwi Maru' }),
  f('Do Hyeon', 'korean', 'sans-serif', W1, { jpFallback: 'Zen Kaku Gothic Antique' }),
  f('Black Han Sans', 'korean', 'sans-serif', W1, { jpFallback: 'Dela Gothic One' }),
  f('Gugi', 'korean', 'sans-serif', W1, { jpFallback: 'RocknRoll One' }),
  f('Bagel Fat One', 'korean', 'sans-serif', W1, { jpFallback: 'Mochiy Pop One' }),
  f('Gasoek One', 'korean', 'sans-serif', W1, { jpFallback: 'Dela Gothic One' }),
  f('Nanum Brush Script', 'korean', 'cursive', W1, { jpFallback: 'Yuji Syuku' }),
  f('East Sea Dokdo', 'korean', 'cursive', W1, { jpFallback: 'Yuji Boku' }),
  f('Nanum Pen Script', 'korean', 'cursive', W1, { jpFallback: 'Zen Kurenaido' }),
  f('Gaegu', 'korean', 'cursive', [400, 700], { jpFallback: 'Yomogi' }),
  f('Nanum Gothic Coding', 'korean', 'monospace', [400, 700], { jpFallback: 'DotGothic16' }),
  // latin (25)
  f('Cinzel', 'latin', 'serif', W3, { jpFallback: 'Shippori Mincho' }),
  f('Cinzel Decorative', 'latin', 'serif', W3, { jpFallback: 'Zen Old Mincho' }),
  f('Playfair Display', 'latin', 'serif', W3, { jpFallback: 'Noto Serif JP' }),
  f('Cormorant Garamond', 'latin', 'serif', [400, 700], { jpFallback: 'Shippori Mincho B1' }),
  f('IM Fell English', 'latin', 'serif', W1, { jpFallback: 'Zen Antique', hangul: 'Song Myung' }),
  f('UnifrakturMaguntia', 'latin', 'serif', W1, { jpFallback: 'Zen Antique', hangul: 'Song Myung' }),
  f('Bebas Neue', 'latin', 'sans-serif', W1, { jpFallback: 'Zen Kaku Gothic New' }),
  f('Oswald', 'latin', 'sans-serif', [400, 700], { jpFallback: 'Zen Kaku Gothic New' }),
  f('Anton', 'latin', 'sans-serif', W1, { jpFallback: 'Dela Gothic One', hangul: 'Black Han Sans' }),
  f('Orbitron', 'latin', 'sans-serif', W3, { jpFallback: 'Murecho' }),
  f('Audiowide', 'latin', 'sans-serif', W1, { jpFallback: 'Murecho' }),
  f('Russo One', 'latin', 'sans-serif', W1, { jpFallback: 'M PLUS 1p', hangul: 'Black Han Sans' }),
  f('Black Ops One', 'latin', 'sans-serif', W1, { jpFallback: 'Dela Gothic One', hangul: 'Black Han Sans' }),
  f('Special Elite', 'latin', 'monospace', W1, { jpFallback: 'Klee One' }),
  f('Share Tech Mono', 'latin', 'monospace', W1, { jpFallback: 'DotGothic16' }),
  f('VT323', 'latin', 'monospace', W1, { jpFallback: 'DotGothic16' }),
  f('Press Start 2P', 'latin', 'monospace', W1, { jpFallback: 'DotGothic16' }),
  f('Creepster', 'latin', 'sans-serif', W1, { jpFallback: 'Yuji Boku', hangul: 'East Sea Dokdo' }),
  f('Nosifer', 'latin', 'sans-serif', W1, { jpFallback: 'Yuji Boku', hangul: 'East Sea Dokdo' }),
  f('Butcherman', 'latin', 'sans-serif', W1, { jpFallback: 'Zen Antique', hangul: 'East Sea Dokdo' }),
  f('Eater', 'latin', 'sans-serif', W1, { jpFallback: 'Yuji Boku', hangul: 'East Sea Dokdo' }),
  f('Rubik Glitch', 'latin', 'sans-serif', W1, { jpFallback: 'RocknRoll One', hangul: 'Black Han Sans' }),
  f('Metal Mania', 'latin', 'sans-serif', W1, { jpFallback: 'Dela Gothic One', hangul: 'Black Han Sans' }),
  f('Great Vibes', 'latin', 'cursive', W1, { jpFallback: 'Yuji Mai', hangul: 'Nanum Pen Script' }),
  f('Pinyon Script', 'latin', 'cursive', W1, { jpFallback: 'Yuji Mai', hangul: 'Nanum Pen Script' }),
];

const BY_FAMILY = new Map(FONT_CATALOG.map((font) => [font.family, font]));

export function findCatalogFont(family: string): CatalogFont | undefined {
  return BY_FAMILY.get(family);
}

export function catalogByCategory(category: FontCategoryTab): readonly CatalogFont[] {
  if (category === 'all') return FONT_CATALOG;
  if (category === 'mine') return [];
  return FONT_CATALOG.filter((font) => font.category === category);
}

/** FNT-04 category defaults. */
const HANGUL_BY_CATEGORY: Readonly<Record<Exclude<FontCategory, 'korean' | 'latin'>, string>> = {
  gothic: 'Noto Sans KR',
  mincho: 'Noto Serif KR',
  rounded: 'Jua',
  design: 'Do Hyeon',
  brush: 'Nanum Brush Script',
};

/** A registered font (FNT-07 upload or FNT-08 local name). */
export interface MyFont {
  readonly id: string;
  /** CSS family used for drawing (unique generated name for uploads, the local name for PC fonts). */
  readonly family: string;
  /** Name shown in the picker. */
  readonly name: string;
  readonly size: number;
  readonly kind: 'file' | 'local';
}

export function myFontWeights(font: MyFont): readonly number[] {
  return font.kind === 'local' ? [400, 700] : [400];
}

/** FNT-04: Hangul substitute for a font, or undefined for Korean fonts. `mine` = registered font. */
export function hangulFallback(family: string, mine = false): string | undefined {
  if (mine) return 'Noto Sans KR';
  const font = findCatalogFont(family);
  if (!font) return 'Noto Sans KR';
  if (font.category === 'korean') return undefined;
  if (font.hangul) return font.hangul;
  if (font.category === 'latin') {
    if (font.generic === 'serif') return 'Noto Serif KR';
    if (font.generic === 'monospace') return 'Nanum Gothic Coding';
    if (font.generic === 'cursive') return 'Nanum Brush Script';
    return 'Noto Sans KR';
  }
  return HANGUL_BY_CATEGORY[font.category];
}

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;

export function containsHangul(text: string): boolean {
  return HANGUL.test(text);
}

function quote(name: string): string {
  return `"${name.replace(/["\\]/g, '')}"`;
}

/**
 * FNT-03 fallback chain: [font] → [Japanese substitute (latin/korean)] → [Noto Sans JP (registered
 * fonts only)] → [Hangul substitute (non-korean)] → [generic]. Non-generic names are quoted.
 */
export function fallbackFamilies(family: string, mine: MyFont | undefined): string[] {
  const chain: string[] = [family];
  let generic: GenericFamily = 'sans-serif';
  if (mine) {
    chain.push(MISSING_FONT_REPLACEMENT);
    chain.push('Noto Sans KR');
  } else {
    const font = findCatalogFont(family);
    if (font) {
      generic = font.generic;
      if (font.jpFallback && (font.category === 'latin' || font.category === 'korean' || font.family === 'Darumadrop One')) chain.push(font.jpFallback);
      const hangul = hangulFallback(family);
      if (hangul) chain.push(hangul);
    }
  }
  return [...new Set(chain)].map(quote).concat(generic);
}

export function fallbackChain(family: string, mine: MyFont | undefined): string {
  return fallbackFamilies(family, mine).join(', ');
}

/** FNT-05: nearest available weight (ties → the earlier entry in the list). */
export function snapWeight(weight: number, available: readonly number[]): number {
  let best = available[0] ?? 400;
  let bestDistance = Infinity;
  for (const candidate of available) {
    const distance = Math.abs(candidate - weight);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Families to load for drawing `family` with `text` (FNT-02: substitutes too; Hangul only when needed). */
export function familiesToLoad(family: string, text: string, mine: MyFont | undefined): string[] {
  if (mine) {
    const list = [MISSING_FONT_REPLACEMENT];
    if (containsHangul(text)) list.push('Noto Sans KR');
    return list;
  }
  const font = findCatalogFont(family);
  if (!font) return [];
  const list = [font.family];
  if (font.jpFallback) list.push(font.jpFallback);
  const hangul = hangulFallback(family);
  if (hangul && containsHangul(text)) list.push(hangul);
  return list;
}

/** Google Fonts css2 URL with every weight the family has (FNT-02). `text` = subset (FNT-06 samples). */
export function googleFontsUrl(family: string, weights: readonly number[], text?: string): string {
  const name = family.trim().replace(/ /g, '+');
  const sorted = [...new Set(weights)].sort((a, b) => a - b);
  const axis = sorted.length === 1 && sorted[0] === 400 ? '' : `:wght@${sorted.join(';')}`;
  const subset = text === undefined ? '' : `&text=${encodeURIComponent(text)}`;
  return `https://fonts.googleapis.com/css2?family=${name}${axis}&display=swap${subset}`;
}

export function isLatinFont(family: string): boolean {
  return findCatalogFont(family)?.category === 'latin';
}
