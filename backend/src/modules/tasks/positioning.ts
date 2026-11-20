/**
 * Fractional ordering for Kanban columns.
 *
 * Each card has a floating-point `position`; a column is sorted by it. Dropping a
 * card between two neighbours gives it the midpoint, so a move rewrites ONE row
 * instead of renumbering the whole column.
 *
 * Repeatedly inserting into the same gap halves it each time. After ~50 inserts the
 * midpoint can no longer be represented exactly, so `positionBetween` returns null
 * and the caller re-spaces the column (`evenlySpaced`) before trying again.
 */
export const POSITION_GAP = 1024;
const MIN_GAP = 1e-6;

export function positionBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return POSITION_GAP;
  if (before === null) return after! - POSITION_GAP;
  if (after === null) return before + POSITION_GAP;
  if (after - before < MIN_GAP) return null;
  const middle = (before + after) / 2;
  return middle > before && middle < after ? middle : null;
}

/** Positions 1024, 2048, 3072, ... for a column of `count` cards. */
export function evenlySpaced(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * POSITION_GAP);
}
