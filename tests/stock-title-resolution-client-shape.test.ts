import { describe, expect, it } from 'vitest';
import { decodeStockTitleResolutionMap } from '../src/lib/stock-title-resolution-client-shape';

describe('stock title-resolution response adapter', () => {
  it('decodes matches, canonicalizes ids, and keeps null misses', () => {
    expect(
      decodeStockTitleResolutionMap({
        Alpha: { vnId: 'V90001', title: 'Alpha' },
        Missing: null,
      }),
    ).toEqual({
      Alpha: { vnId: 'v90001', title: 'Alpha' },
      Missing: null,
    });
  });

  it('rejects malformed maps', () => {
    expect(decodeStockTitleResolutionMap([])).toBeNull();
    expect(decodeStockTitleResolutionMap({ '': null })).toBeNull();
    expect(decodeStockTitleResolutionMap({ Alpha: { vnId: 'bad', title: 'Alpha' } })).toBeNull();
    expect(decodeStockTitleResolutionMap({ Alpha: { vnId: 'v90001', title: 4 } })).toBeNull();
    expect(
      decodeStockTitleResolutionMap(
        Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`Title ${index}`, null])),
      ),
    ).toBeNull();
  });
});
