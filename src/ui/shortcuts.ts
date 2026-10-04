/** KEY-01 shortcut matching (physical key codes) and KEY-02 tab navigation. DOM-free. */

export type ShortcutAction = 'play-pause' | 'export-apng' | 'export-png' | 'toggle-theme' | 'mode-message' | 'mode-trailer' | 'mode-place-time';

export interface KeyLike {
  readonly code: string;
  readonly key?: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const BY_CODE: Readonly<Record<string, ShortcutAction>> = {
  KeyP: 'play-pause',
  KeyE: 'export-apng',
  KeyK: 'export-png',
  KeyT: 'toggle-theme',
  Digit1: 'mode-message',
  Digit2: 'mode-trailer',
  Digit3: 'mode-place-time',
  Numpad1: 'mode-message',
  Numpad2: 'mode-trailer',
  Numpad3: 'mode-place-time',
};

/** Modifier = Shift + (Cmd / Ctrl / Alt). Works with focus in inputs too. */
export function matchShortcut(event: KeyLike): ShortcutAction | null {
  if (!event.shiftKey || !(event.ctrlKey || event.metaKey || event.altKey)) return null;
  return BY_CODE[event.code] ?? null;
}

export interface ShortcutRow {
  readonly keys: readonly string[];
  readonly action: 'playPause' | 'exportApng' | 'exportPng' | 'theme' | 'modes' | 'esc';
}

/** Rows of the shortcut table (UI-16). `mod` is the platform's main modifier label. */
export function shortcutRows(mod: string): readonly ShortcutRow[] {
  return [
    { keys: ['Shift', mod, 'P'], action: 'playPause' },
    { keys: ['Shift', mod, 'E'], action: 'exportApng' },
    { keys: ['Shift', mod, 'K'], action: 'exportPng' },
    { keys: ['Shift', mod, 'T'], action: 'theme' },
    { keys: ['Shift', mod, '1 / 2 / 3'], action: 'modes' },
    { keys: ['Esc'], action: 'esc' },
  ];
}

/** KEY-02: next index for ←/→/Home/End in a tablist (wraps around); null for other keys. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
