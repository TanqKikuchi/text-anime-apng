export const LANGUAGES = ['ja', 'en', 'ko'] as const;
export type Lang = (typeof LANGUAGES)[number];

/** Value for the `<html lang>` attribute. */
export const HTML_LANG: Readonly<Record<Lang, string>> = { ja: 'ja', en: 'en', ko: 'ko' };

/** Short labels on the language switch buttons. */
export const LANGUAGE_BUTTON_LABEL: Readonly<Record<Lang, string>> = { ja: 'JA', en: 'EN', ko: 'KO' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
