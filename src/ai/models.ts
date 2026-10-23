/** Model list, pricing and error type for the assistant. Kept free of the SDK so the UI can load it eagerly. */

export const AI_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = 'claude-sonnet-5-5';

/** USD per million tokens (input, output). Cache writes cost 1.25× input, cache reads 0.1×. */
const PRICE: Readonly<Record<AiModel, { readonly input: number; readonly output: number }>> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
/** Rough yen rate for the on-screen estimate only. */
export const YEN_PER_USD = 150;

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_input_tokens?: number | null;
  readonly cache_read_input_tokens?: number | null;
}

export function costUsd(model: AiModel, usage: Usage): number {
  const price = PRICE[model];
  const input = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * price.input + usage.output_tokens * price.output) / 1_000_000;
}

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'refusal' | 'other';

export class AiError extends Error {
  constructor(readonly kind: AiErrorKind, message: string) {
    super(message);
  }
}
