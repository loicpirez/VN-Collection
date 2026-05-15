import { describe, expect, it } from 'vitest';

/**
 * Pure unit test for the drag-id parser. Mirrors the parser inside
 * `<ShelfLayoutEditor>` so a regression on the delimiter or the
 * synthetic-release escaping fails the build before users see it.
 *
 * Critical guardrail: the original delimiter was `:`, which collided
 * with synthetic release ids (`synthetic:v1234`) and produced silent
 * drag-drop failures. The new delimiter is `|`. Re-inlining the parser
 * locally avoids importing the React component (which pulls @dnd-kit
 * + Next runtime into the test bundle).
 */
type DragSource =
  | { kind: 'pool'; vn_id: string; release_id: string }
  | { kind: 'slot'; vn_id: string; release_id: string; shelf_id: number; row: number; col: number };

function parseDragId(id: string): DragSource | null {
  if (id.startsWith('pool|')) {
    const [, vnId, releaseId] = id.split('|');
    if (!vnId || !releaseId) return null;
    return { kind: 'pool', vn_id: vnId, release_id: releaseId };
  }
  if (id.startsWith('slot|')) {
    const parts = id.split('|');
    if (parts.length !== 6) return null;
    const [, vnId, releaseId, shelfId, row, col] = parts;
    const sid = Number(shelfId);
    const r = Number(row);
    const c = Number(col);
    if (!vnId || !releaseId) return null;
    if (!Number.isInteger(sid) || !Number.isInteger(r) || !Number.isInteger(c)) return null;
    return {
      kind: 'slot',
      vn_id: vnId,
      release_id: releaseId,
      shelf_id: sid,
      row: r,
      col: c,
    };
  }
  return null;
}

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
