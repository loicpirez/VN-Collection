/**
 * Layout validation tests for the `/series/[id]` versioned config.
 * Mirrors `vn-detail-layout.test.ts` — same drop-unknown / append-
 * missing / dedupe / malformed-JSON contracts. The series page must
 * survive a stale persisted blob the same way the VN page does.
 */
import { describe, expect, it } from 'vitest';
import {
  SERIES_DETAIL_SECTION_IDS,
  defaultSeriesDetailLayoutV1,
  parseSeriesDetailLayoutV1,
  validateSeriesDetailLayoutV1,
} from '@/lib/series-detail-layout';

describe('validateSeriesDetailLayoutV1', () => {
  it('returns a complete default layout for null/empty input', () => {
    const out = validateSeriesDetailLayoutV1(null);
    expect(out.order).toEqual([...SERIES_DETAIL_SECTION_IDS]);
    for (const id of SERIES_DETAIL_SECTION_IDS) {
      expect(out.sections[id]).toEqual({ visible: true, collapsedByDefault: false });
    }
  });

  it('returns defaults for invalid (array / primitive) input', () => {
    expect(validateSeriesDetailLayoutV1([] as unknown).order).toEqual([...SERIES_DETAIL_SECTION_IDS]);
    expect(validateSeriesDetailLayoutV1('not an object' as unknown).order).toEqual([
      ...SERIES_DETAIL_SECTION_IDS,
    ]);
    expect(validateSeriesDetailLayoutV1(42 as unknown).order).toEqual([...SERIES_DETAIL_SECTION_IDS]);
  });

  it('drops unknown ids and appends missing known ids in canonical order', () => {
    const out = validateSeriesDetailLayoutV1({
      order: ['works', 'hero', 'totally-not-a-section', 'metadata'],
    });
    expect(out.order.slice(0, 3)).toEqual(['works', 'hero', 'metadata']);
    expect(new Set(out.order)).toEqual(new Set(SERIES_DETAIL_SECTION_IDS));
    expect(out.order).toHaveLength(SERIES_DETAIL_SECTION_IDS.length);
  });

  it('honours visible=false and collapsedByDefault=true overrides', () => {
    const out = validateSeriesDetailLayoutV1({
      sections: {
        hero: { visible: false, collapsedByDefault: true },
        works: { collapsedByDefault: true },
      },
    });
    expect(out.sections.hero).toEqual({ visible: false, collapsedByDefault: true });
    expect(out.sections.works).toEqual({ visible: true, collapsedByDefault: true });
    expect(out.sections.metadata).toEqual({ visible: true, collapsedByDefault: false });
  });

  it('rejects duplicate ids in order (keeps the first occurrence)', () => {
    const out = validateSeriesDetailLayoutV1({
      order: ['hero', 'hero', 'works', 'works'],
    });
    const seen = new Set<string>();
    for (const id of out.order) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('tolerates a v0 flat shape (no `order` / `sections` wrapper)', () => {
    // Older shape: top-level keys are section ids.
    const out = validateSeriesDetailLayoutV1({
      hero: { visible: false, collapsedByDefault: false },
      works: { visible: true, collapsedByDefault: true },
    });
    expect(out.sections.hero).toEqual({ visible: false, collapsedByDefault: false });
    expect(out.sections.works).toEqual({ visible: true, collapsedByDefault: true });
    // Order falls back to canonical because the v0 shape had no order array.
    expect(out.order).toEqual([...SERIES_DETAIL_SECTION_IDS]);
  });

  it('parseSeriesDetailLayoutV1 falls back to default on malformed JSON', () => {
    expect(parseSeriesDetailLayoutV1('not-json{').order).toEqual(defaultSeriesDetailLayoutV1().order);
    expect(parseSeriesDetailLayoutV1(null).order).toEqual(defaultSeriesDetailLayoutV1().order);
  });

  it('parseSeriesDetailLayoutV1 round-trips a normalized layout', () => {
    const layout = validateSeriesDetailLayoutV1({
      order: ['works', 'hero'],
      sections: { metadata: { visible: false, collapsedByDefault: false } },
    });
    const json = JSON.stringify(layout);
    const back = parseSeriesDetailLayoutV1(json);
    expect(back).toEqual(layout);
  });
});
