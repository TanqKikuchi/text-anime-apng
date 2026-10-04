import type { ja } from './ja';

/** Every UI message key. The Japanese dictionary is the source of the key set. */
export type MessageKey = keyof typeof ja;

/** A complete dictionary: missing or extra keys are type errors. */
export type Dictionary = Readonly<Record<MessageKey, string>>;

export type MessageParams = Readonly<Record<string, string | number>>;
