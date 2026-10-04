import { describe, expect, it } from 'vitest';
import { exportBaseName, exportFilenames, filenameCandidate, sanitizeFilename, shortTitle } from '../../src/core';

describe('EXP-22 automatic export filename', () => {
  it('builds a candidate from the title and export settings', () => {
    expect(filenameCandidate({
      text: 'Battle start',
      modeLabel: 'Message',
      motionLabel: 'Drop',
      hasExit: false,
      noExitLabel: 'No exit',
      loopsForever: true,
      loopLabel: 'Loop',
    })).toBe('Battle_start_Drop_No_exit_Loop');
  });

  it('cuts long titles at punctuation or an English word boundary', () => {
    expect(shortTitle('123456789、abcdefghijkl', 'Message')).toBe('123456789');
    expect(shortTitle('alpha beta gamma delta', 'Message')).toBe('alpha beta gamma');
    expect(shortTitle('   \n ', 'Message')).toBe('Message');
  });
});

describe('EXP-23 filename sanitizing and suffixes', () => {
  it('removes unsafe characters, duplicate extensions, and limits length', () => {
    expect(exportBaseName('a/b:c*?.png', 'candidate')).toBe('abc');
    expect(exportFilenames('abc')).toEqual({ apng: 'abc.png', still: 'abc_still.png', frames: 'abc_frames.zip' });
    expect(graphemeLength(sanitizeFilename(`.${'a'.repeat(61)}_`))).toBe(60);
    expect(exportBaseName('', '', 'fallback')).toBe('fallback');
  });
});

function graphemeLength(value: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length;
}
