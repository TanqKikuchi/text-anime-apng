import type {
  BackgroundSettings,
  DeepPartial,
  LayoutSettings,
  MotionSettings,
  SceneTemplate,
  StyleSettings,
  TextSettings,
} from '../core/scene';
import type { Lang } from '../ui/i18n/languages';

export type { DeepPartial };

/**
 * Message-mode categories are shown as tabs (TPL-01). Trailer and place/time templates carry a
 * category too, but only as a mood tag: those modes show a flat chip list.
 */
export type TemplateCategory =
  | 'battle'
  | 'mystery'
  | 'horror'
  | 'scifi'
  | 'comedy'
  | 'scene'
  | 'gm'
  | 'roll'
  | 'cinema'
  | 'fantasy'
  | 'daily';

/** Dice-system row shown under the "roll" category (TPL-01 / TPL-04). Generic mechanics, no product names. */
export type RollSystem = 'd100' | '2d6';

export interface TemplateSample {
  readonly main: string;
  readonly sub?: string;
}

/**
 * Fields a template may set. Text content comes from `samples`; canvas size and export settings
 * are carried over from the current scene (TPL-02), so they are not part of the patch.
 */
export interface TemplateOverrides {
  readonly text?: DeepPartial<Omit<TextSettings, 'main' | 'sub'>>;
  readonly layout?: DeepPartial<LayoutSettings>;
  readonly motion?: DeepPartial<MotionSettings>;
  readonly style?: DeepPartial<StyleSettings>;
  readonly background?: DeepPartial<BackgroundSettings>;
}

/** Compatible with core's `SceneTemplate`, with a required category and a narrower patch. */
export interface TemplateDef extends SceneTemplate {
  readonly category: TemplateCategory;
  readonly system?: RollSystem;
  readonly names: Readonly<Record<Lang, string>>;
  readonly samples: Readonly<Record<Lang, TemplateSample>>;
  readonly patch: TemplateOverrides;
}

/** Template data as written in the tables (mode is filled in by the per-mode list). */
export type TemplateInput = Omit<TemplateDef, 'mode'>;
