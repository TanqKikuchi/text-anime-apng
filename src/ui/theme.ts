import type { StorageLike } from './i18n';
import { THEME_STORAGE_KEY } from './persist';

/** UI-15 / STO-03 theme: saved value, else the OS colour scheme. */

export type Theme = 'light' | 'dark';

export function initialTheme(storage: StorageLike | null, prefersDark: boolean): Theme {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage unavailable: use the OS setting.
  }
  return prefersDark ? 'dark' : 'light';
}

export function saveTheme(storage: StorageLike | null, theme: Theme): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
