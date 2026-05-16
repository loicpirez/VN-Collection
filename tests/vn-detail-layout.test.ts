import { describe, expect, it } from 'vitest';
import {
  VN_SECTION_IDS,
  defaultVnDetailLayoutV1,
  parseVnDetailLayoutV1,
  validateVnDetailLayoutV1,
} from '@/lib/vn-detail-layout';

/**
 * Layout validation tests. These lock the safe-fallback contract: any
 * corrupted / stale / partial input must produce a usable layout
 * containing every known section id with sane defaults — a misconfig
 * must never blank the VN page.
 */

describe('validateVnDetailLayoutV1', () => {
  it('returns a complete default layout for null/empty input', () => {
    const out = validateVnDetailLayoutV1(null);
    expect(out.order).toEqual([...VN_SECTION_IDS]);
    for (const id of VN_SECTION_IDS) {
      expect(out.sections[id]).toEqual({ visible: true, collapsedByDefault: false });
    }
  });

  it('returns defaults for invalid (array / primitive) input', () => {
    expect(validateVnDetailLayoutV1([] as unknown).order).toEqual([...VN_SECTION_IDS]);
    expect(validateVnDetailLayoutV1('not an object' as unknown).order).toEqual([...VN_SECTION_IDS]);
    expect(validateVnDetailLayoutV1(42 as unknown).order).toEqual([...VN_SECTION_IDS]);
  });

  it('drops unknown ids and appends missing known ids in canonical order', () => {
    const out = validateVnDetailLayoutV1({
      order: ['quotes', 'characters', 'totally-not-a-section', 'releases'],
    });
    // First three known ids retained in user order, then everything
    // missing is appended in canonical order.
    expect(out.order.slice(0, 3)).toEqual(['quotes', 'characters', 'releases']);
    // Every known id is present exactly once.
    expect(new Set(out.order)).toEqual(new Set(VN_SECTION_IDS));
    expect(out.order).toHaveLength(VN_SECTION_IDS.length);
  });

  it('honours visible=false and collapsedByDefault=true overrides', () => {
    const out = validateVnDetailLayoutV1({
      sections: {
        notes: { visible: false, collapsedByDefault: true },
        characters: { collapsedByDefault: true },
      },
    });
    expect(out.sections.notes).toEqual({ visible: false, collapsedByDefault: true });
    // Missing `visible` defaults to true.
    expect(out.sections.characters).toEqual({ visible: true, collapsedByDefault: true });
    // Untouched sections stay at defaults.
    expect(out.sections.releases).toEqual({ visible: true, collapsedByDefault: false });
  });

  it('rejects duplicate ids in order (keeps the first occurrence)', () => {
    const out = validateVnDetailLayoutV1({
      order: ['quotes', 'quotes', 'characters', 'characters'],
    });
    // Each id appears at most once.
    const seen = new Set<string>();
    for (const id of out.order) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('parseVnDetailLayoutV1 falls back to default on malformed JSON', () => {
    expect(parseVnDetailLayoutV1('not-json{').order).toEqual(defaultVnDetailLayoutV1().order);
    expect(parseVnDetailLayoutV1(null).order).toEqual(defaultVnDetailLayoutV1().order);
  });

  it('parseVnDetailLayoutV1 round-trips a normalized layout', () => {
    const layout = validateVnDetailLayoutV1({
      order: ['releases', 'characters'],
      sections: { notes: { visible: false, collapsedByDefault: false } },
    });
    const json = JSON.stringify(layout);
    const back = parseVnDetailLayoutV1(json);
    expect(back).toEqual(layout);
  });
});
