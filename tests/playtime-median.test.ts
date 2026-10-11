import { describe, expect, it } from 'vitest';
import { medianPlaytime } from '@/lib/playtime';

describe('four-source playtime median', () => {
  it.each([
    { sources: [], median: null },
    { sources: [null, undefined, 0, -1, Number.NaN, Infinity], median: null },
    { sources: [null, 900, 0, undefined], median: 900 },
    { sources: [901, 600], median: 750.5 },
    { sources: [2400, 600, 600], median: 600 },
    { sources: [600, 600, 600, 2400], median: 600 },
    { sources: [2400, 901, 600, 1200], median: 1050.5 },
  ])('computes $median from $sources without including absent sources', ({ sources, median }) => {
    expect(medianPlaytime(...sources)).toBe(median);
  });
});
