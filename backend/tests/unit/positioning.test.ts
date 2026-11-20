import { describe, expect, it } from 'vitest';
import { POSITION_GAP, evenlySpaced, positionBetween } from '../../src/modules/tasks/positioning.js';

describe('positionBetween', () => {
  it('starts an empty column at the gap', () => {
    expect(positionBetween(null, null)).toBe(POSITION_GAP);
  });
  it('appends after the last card', () => {
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_GAP);
  });
  it('prepends before the first card', () => {
    expect(positionBetween(null, 1024)).toBe(0);
  });
  it('uses the midpoint between neighbours', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });
  it('signals re-spacing when the gap is exhausted', () => {
    let after = 2048;
    let inserts = 0;
    let position: number | null = 1536;
    while (position !== null && inserts < 200) {
      position = positionBetween(1024, after);
      if (position !== null) after = position;
      inserts += 1;
    }
    expect(position).toBeNull();
    expect(inserts).toBeGreaterThan(20);
  });
});

describe('evenlySpaced', () => {
  it('produces increasing positions one gap apart', () => {
    expect(evenlySpaced(3)).toEqual([1024, 2048, 3072]);
  });
});
