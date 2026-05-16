import { describe, expect, it } from 'vitest';
import { parseDisplayCellId, parseDragId } from '@/lib/drag-id';

/**
 * Test the parser the way `<ShelfLayoutEditor>` actually uses it —
 * importing directly from the source so a regression on the
 * delimiter or the synthetic-release escaping fails the build
 * before users see it.
 *
 * Critical guardrail: the original delimiter was `:`, which collided
 * with synthetic release ids (`synthetic:v1234`) and produced silent
 * drag-drop failures. The new delimiter is `|`.
 */

describe('parseDragId', () => {
  it('parses pool drag ids with VNDB release', () => {
    expect(parseDragId('pool|v123|r456')).toEqual({
      kind: 'pool',
      vn_id: 'v123',
      release_id: 'r456',
    });
  });

  it('parses pool drag ids with synthetic release', () => {
    expect(parseDragId('pool|v123|synthetic:v123')).toEqual({
      kind: 'pool',
      vn_id: 'v123',
      release_id: 'synthetic:v123',
    });
  });

  it('parses slot drag ids with synthetic release', () => {
    expect(parseDragId('slot|v123|synthetic:v123|7|2|5')).toEqual({
      kind: 'slot',
      vn_id: 'v123',
      release_id: 'synthetic:v123',
      shelf_id: 7,
      row: 2,
      col: 5,
    });
  });

  it('parses slot drag ids with VNDB release', () => {
    expect(parseDragId('slot|v123|r456|3|0|0')).toEqual({
      kind: 'slot',
      vn_id: 'v123',
      release_id: 'r456',
      shelf_id: 3,
      row: 0,
      col: 0,
    });
  });

  it('parses front-display drag ids', () => {
    expect(parseDragId('display|v123|synthetic:v123|9|2|1')).toEqual({
      kind: 'display',
      vn_id: 'v123',
      release_id: 'synthetic:v123',
      shelf_id: 9,
      after_row: 2,
      position: 1,
    });
  });

  it('rejects malformed slot ids (wrong segment count)', () => {
    expect(parseDragId('slot|v123|r456|3|0')).toBeNull();
    expect(parseDragId('slot|v123|r456|3|0|0|extra')).toBeNull();
  });

  it('rejects slot ids with non-integer shelf/row/col', () => {
    expect(parseDragId('slot|v123|r456|NaN|0|0')).toBeNull();
    expect(parseDragId('slot|v123|r456|3|1.5|0')).toBeNull();
  });

  it('rejects unknown prefixes', () => {
    expect(parseDragId('cell|7|0|0')).toBeNull();
    expect(parseDragId('random|stuff')).toBeNull();
  });
});

describe('parseDisplayCellId', () => {
  it('parses front-display drop targets', () => {
    expect(parseDisplayCellId('display-cell|7|3|1')).toEqual({
      shelf_id: 7,
      after_row: 3,
      position: 1,
    });
  });

  it('rejects malformed front-display drop targets', () => {
    expect(parseDisplayCellId('display-cell|7|3')).toBeNull();
    expect(parseDisplayCellId('display-cell|7|x|1')).toBeNull();
    expect(parseDisplayCellId('cell|7|3|1')).toBeNull();
  });
});
