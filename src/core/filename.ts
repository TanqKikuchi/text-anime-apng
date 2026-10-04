const BREAK_MARKS = new Set(['、', '。', '，', '．', '！', '？', '!', '?', ',', '.', '―', '—', '…', '‥']);
const TRAILING_MARKS = /[―—…‥\s]+$/u;
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/gu;

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(value)].map((part) => part.segment);
  }
  return Array.from(value);
}

export function shortTitle(text: string, emptyFallback: string): string {
  const firstLine = text.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0);
  if (firstLine === undefined) return emptyFallback;
  const parts = graphemes(firstLine);
  if (parts.length <= 16) return firstLine;
  let end = 16;
  for (let index = 15; index >= 3; index -= 1) {
    if (BREAK_MARKS.has(parts[index]!)) {
      end = index;
      break;
    }
  }
  if (end === 16 && !/^\s$/u.test(parts[16]!)) {
    for (let index = 15; index >= 3; index -= 1) {
      if (parts[index] === ' ') {
        end = index;
        break;
      }
    }
  }
  return parts.slice(0, end).join('').replace(TRAILING_MARKS, '');
}

export function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(FORBIDDEN, '')
    .replace(/\s+/gu, '_')
    .replace(/^[._]+|[._]+$/gu, '');
  return graphemes(cleaned).slice(0, 60).join('');
}

export interface FilenameCandidateOptions {
  readonly text: string;
  readonly modeLabel: string;
  readonly motionLabel: string;
  readonly hasExit: boolean;
  readonly isTrailerScroll?: boolean;
  readonly noExitLabel: string;
  readonly loopsForever: boolean;
  readonly loopLabel: string;
}

export function filenameCandidate(options: FilenameCandidateOptions): string {
  const components = [shortTitle(options.text, options.modeLabel), options.motionLabel];
  if (!options.hasExit && !options.isTrailerScroll) components.push(options.noExitLabel);
  if (options.loopsForever) components.push(options.loopLabel);
  return sanitizeFilename(components.join('_'));
}

export function exportBaseName(manual: string, candidate: string, fallback = 'text-animation'): string {
  const manualName = sanitizeFilename(manual).replace(/\.(?:apng|png|zip|mov)$/iu, '');
  if (manualName.length > 0) return manualName;
  const candidateName = sanitizeFilename(candidate).replace(/\.(?:apng|png|zip|mov)$/iu, '');
  return candidateName || fallback;
}

export function exportFilenames(baseName: string): { apng: string; still: string; frames: string; mov: string } {
  return {
    apng: `${baseName}.png`,
    mov: `${baseName}.mov`,
    still: `${baseName}_still.png`,
    frames: `${baseName}_frames.zip`,
  };
}
