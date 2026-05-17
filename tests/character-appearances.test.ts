import { describe, expect, it } from 'vitest';
import { dedupAppearances } from '../src/lib/character-appearances';
import type { VndbCharacterVn } from '../src/lib/vndb';

function mk(over: Partial<VndbCharacterVn> & Pick<VndbCharacterVn, 'id' | 'role'>): VndbCharacterVn {
  return {
    spoiler: 0,
    title: `Title ${over.id}`,
    ...over,
  } as VndbCharacterVn;
}

describe('dedupAppearances', () => {
  it('returns the same shape when every row already has a unique id', () => {
    const rows = [
      mk({ id: 'v9001', role: 'main' }),
      mk({ id: 'v9002', role: 'side' }),
    ];
    const out = dedupAppearances(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'v9001', role: 'main', releaseCount: 1 });
    expect(out[1]).toMatchObject({ id: 'v9002', role: 'side', releaseCount: 1 });
  });

  it('collapses duplicate (vn, release) rows for the same VN id', () => {
    const rows = [
      mk({ id: 'v9001', role: 'main' }),
      mk({ id: 'v9001', role: 'main' }),
      mk({ id: 'v9001', role: 'main' }),
    ];
    const out = dedupAppearances(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'v9001', releaseCount: 3 });
  });

  it('keeps the strongest role when duplicates disagree', () => {
    const rows = [
      mk({ id: 'v9001', role: 'side' }),
      mk({ id: 'v9001', role: 'main' }),
      mk({ id: 'v9001', role: 'appears' }),
    ];
    const out = dedupAppearances(rows);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('main');
    expect(out[0].releaseCount).toBe(3);
  });

  it('does not mutate the input array or rows', () => {
    const first = mk({ id: 'v9001', role: 'main' });
    const second = mk({ id: 'v9001', role: 'side' });
    const rows = [first, second];
    const snapshot = JSON.stringify(rows);
    dedupAppearances(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('handles an empty input', () => {
    expect(dedupAppearances([])).toEqual([]);
  });

  it('treats unknown roles as the weakest rank', () => {
    const rows = [
      mk({ id: 'v9001', role: 'main' }),
      mk({ id: 'v9001', role: 'totally-bogus' as VndbCharacterVn['role'] }),
    ];
    const out = dedupAppearances(rows);
    expect(out[0].role).toBe('main');
    expect(out[0].releaseCount).toBe(2);
  });
});
