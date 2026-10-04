/** UI-19 bottom sheet snapping (pure). Heights are in px of visible sheet. */

export type SheetStop = 'closed' | 'half' | 'full';
export const SHEET_STOPS: readonly SheetStop[] = ['closed', 'half', 'full'];
export const FLING_VELOCITY = 0.45; // px / ms
export const TAP_SLOP = 6; // px

export interface SheetHeights {
  readonly closed: number;
  readonly half: number;
  readonly full: number;
}

/** Half height: keeps preview + transport visible, within 36〜72 % of the viewport. */
export function halfHeight(viewportHeight: number, coveredTop: number): number {
  const wanted = viewportHeight - coveredTop;
  return Math.round(Math.max(viewportHeight * 0.36, Math.min(viewportHeight * 0.72, wanted)));
}

/**
 * Where the sheet settles after a drag. `velocity` > 0 means moving up (opening). A fast fling goes
 * to the next stop in that direction, otherwise the nearest stop.
 */
export function settleStop(height: number, velocity: number, heights: SheetHeights): SheetStop {
  const order = SHEET_STOPS.map((stop) => ({ stop, h: heights[stop] })).sort((a, b) => a.h - b.h);
  if (Math.abs(velocity) > FLING_VELOCITY) {
    if (velocity > 0) return (order.find((entry) => entry.h > height + 1) ?? order[order.length - 1]!).stop;
    return ([...order].reverse().find((entry) => entry.h < height - 1) ?? order[0]!).stop;
  }
  let best = order[0]!;
  for (const entry of order) if (Math.abs(entry.h - height) < Math.abs(best.h - height)) best = entry;
  return best.stop;
}

/** Tap on the band toggles closed ⇔ half (from full it goes back to half). */
export function tapStop(current: SheetStop): SheetStop {
  return current === 'closed' ? 'half' : current === 'half' ? 'closed' : 'half';
}
