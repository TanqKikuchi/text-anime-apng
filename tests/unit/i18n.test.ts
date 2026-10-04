import { describe, expect, it } from 'vitest';
import { EASING_IDS } from '../../src/core/easing';
import { ENTER_EFFECT_IDS, EXIT_EFFECT_IDS, HOLD_EFFECT_IDS } from '../../src/core/scene';
import { ALL_CATEGORIES, GRADIENT_PRESETS, ROLL_SYSTEMS, STYLE_PRESETS } from '../../src/templates';
import {
  DICTIONARIES,
  LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  applyDocumentLanguage,
  categoryKey,
  detectLanguage,
  easingKey,
  effectKey,
  format,
  getLanguage,
  gradientPresetKey,
  loadLanguage,
  onLanguageChange,
  saveLanguage,
  setLanguage,
  stylePresetKey,
  systemKey,
  t,
  translate,
} from '../../src/ui/i18n';
import type { MessageKey, StorageLike } from '../../src/ui/i18n';

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('I18N-02 dictionaries', () => {
  const jaKeys = Object.keys(DICTIONARIES.ja).sort();

  it('have identical key sets in all three languages', () => {
    for (const lang of LANGUAGES) expect(Object.keys(DICTIONARIES[lang]).sort()).toEqual(jaKeys);
    expect(jaKeys.length).toBeGreaterThan(400);
  });

  it('have a non-empty value for every key, and the same placeholders across languages', () => {
    for (const key of jaKeys as MessageKey[]) {
      const expected = placeholders(DICTIONARIES.ja[key]);
      for (const lang of LANGUAGES) {
        const value = DICTIONARIES[lang][key];
        expect(value.trim(), `${lang} ${key}`).not.toBe('');
        expect(placeholders(value), `${lang} ${key}`).toEqual(expected);
      }
    }
  });

  it('actually translate (Korean and English differ from Japanese for most keys)', () => {
    const differ = (lang: 'en' | 'ko') => jaKeys.filter((k) => DICTIONARIES[lang][k as MessageKey] !== DICTIONARIES.ja[k as MessageKey]).length;
    expect(differ('en') / jaKeys.length).toBeGreaterThan(0.85);
    expect(differ('ko') / jaKeys.length).toBeGreaterThan(0.85);
  });

  it('name every effect, easing, category, system and preset', () => {
    for (const id of [...ENTER_EFFECT_IDS, ...EXIT_EFFECT_IDS, ...HOLD_EFFECT_IDS]) {
      for (const lang of LANGUAGES) expect(translate(lang, effectKey(id))).not.toBe(effectKey(id));
    }
    for (const id of EASING_IDS) expect(DICTIONARIES.ko[easingKey(id)]).toBeTruthy();
    for (const id of ALL_CATEGORIES) expect(DICTIONARIES.en[categoryKey(id)]).toBeTruthy();
    for (const id of ROLL_SYSTEMS) expect(DICTIONARIES.en[systemKey(id)]).toBeTruthy();
    for (const p of STYLE_PRESETS) expect(DICTIONARIES.ko[stylePresetKey(p.id)]).toBeTruthy();
    for (const p of GRADIENT_PRESETS) expect(DICTIONARIES.ko[gradientPresetKey(p.id)]).toBeTruthy();
  });

  it('use the product name and subtitles from the brief', () => {
    expect(translate('ja', 'app.subtitle')).toBe('文字アニメ APNG スタジオ');
    expect(translate('en', 'app.subtitle')).toBe('Text animation APNG studio');
    expect(translate('ko', 'app.subtitle')).toBe('텍스트 애니메이션 APNG 스튜디오');
    for (const lang of LANGUAGES) expect(translate(lang, 'app.name')).toBe('MojiMotion');
  });
});

describe('I18N-02 t() and formatting', () => {
  it('interpolates parameters and leaves unknown placeholders intact', () => {
    expect(format('{a} / {b}', { a: 1, b: 'x' })).toBe('1 / x');
    expect(format('{a} {missing}', { a: 2 })).toBe('2 {missing}');
    expect(translate('en', 'error.frameLimit', { n: 2400, max: 1800 })).toBe('That is 2400 frames (limit 1800). Shorten the duration or lower the FPS.');
    expect(translate('ja', 'progress.encode', { i: 3, n: 48 })).toBe('APNG を作成中… 3 / 48');
  });

  it('follows the current language and notifies listeners', () => {
    const seen: string[] = [];
    const off = onLanguageChange((lang) => seen.push(lang));
    setLanguage('ko');
    expect(getLanguage()).toBe('ko');
    expect(t('export.apng')).toBe('APNG 내보내기');
    setLanguage('en');
    expect(t('export.apng')).toBe('Export APNG');
    off();
    setLanguage('ja');
    expect(seen).toEqual(['ko', 'en']);
    expect(t('export.apng')).toBe('APNG を書き出す');
  });
});

describe('I18N-01 language detection and persistence', () => {
  it('detects from the first browser language', () => {
    expect(detectLanguage(['ja-JP', 'en'])).toBe('ja');
    expect(detectLanguage(['ko-KR'])).toBe('ko');
    expect(detectLanguage(['en-US', 'ja'])).toBe('en');
    expect(detectLanguage(['fr'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });

  it('prefers a valid saved choice and ignores junk', () => {
    expect(loadLanguage(memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'ko' }), ['en-US'])).toBe('ko');
    expect(loadLanguage(memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'xx' }), ['ja'])).toBe('ja');
    expect(loadLanguage(null, ['ko'])).toBe('ko');
  });

  it('saves the choice and survives storage that throws', () => {
    const storage = memoryStorage();
    expect(saveLanguage('en', storage)).toBe(true);
    expect(storage.data[LANGUAGE_STORAGE_KEY]).toBe('en');
    expect(saveLanguage('en', throwingStorage)).toBe(false);
    expect(saveLanguage('en', null)).toBe(false);
    expect(loadLanguage(throwingStorage, ['ko-KR'])).toBe('ko');
  });

  it('updates the html lang attribute and page title', () => {
    const doc = { documentElement: { lang: '' }, title: '' } as unknown as Document;
    applyDocumentLanguage(doc, 'ko');
    expect(doc.documentElement.lang).toBe('ko');
    expect(doc.title).toBe('MojiMotion — 텍스트 애니메이션 APNG 스튜디오');
  });
});
