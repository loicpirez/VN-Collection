import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_IDS,
  parseHomeSectionLayoutV1,
  validateHomeSectionLayoutV1,
} from '../src/lib/home-section-layout';

describe('home_section_layout_v1 validator', () => {
  it('returns the default layout for null / undefined / non-object input', () => {
    expect(validateHomeSectionLayoutV1(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(validateHomeSectionLayoutV1(undefined)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(validateHomeSectionLayoutV1('not an object')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(validateHomeSectionLayoutV1([1, 2, 3])).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('accepts the new v1 shape with sections + order', () => {
    const out = validateHomeSectionLayoutV1({
      sections: {
        'recently-viewed': { visible: false, collapsed: true },
        'library-controls': { visible: true, collapsed: true },
      },
      // Note: 'library' as a literal here triggers the migration path
      // tested separately; this case uses the new ids directly.
      order: ['library-controls', 'library-grid', 'anniversary', 'reading-queue', 'recently-viewed'],
    });
    expect(out.sections['recently-viewed']).toEqual({ visible: false, collapsed: true });
    expect(out.sections['library-controls']).toEqual({ visible: true, collapsed: true });
    // Untouched section stays at default.
    expect(out.sections['reading-queue']).toEqual({ visible: true, collapsed: false });
    expect(out.order).toEqual(['library-controls', 'library-grid', 'anniversary', 'reading-queue', 'recently-viewed']);
  });

  it('migrates legacy "library" id to library-controls + library-grid in both sections and order', () => {
    const out = validateHomeSectionLayoutV1({
      sections: { library: { visible: false, collapsed: true } },
      order: ['recently-viewed', 'library', 'anniversary'],
    });
    // Both new ids inherit the legacy library state.
    expect(out.sections['library-controls']).toEqual({ visible: false, collapsed: true });
    expect(out.sections['library-grid']).toEqual({ visible: false, collapsed: true });
    // Order expands 'library' in place to the split pair.
    expect(out.order).toEqual([
      'recently-viewed',
      'library-controls',
      'library-grid',
      'anniversary',
      // 'reading-queue' was missing → appended at the end.
      'reading-queue',
    ]);
  });

  it('accepts the legacy v0 shape (flat sections, no order)', () => {
    const out = validateHomeSectionLayoutV1({
      'recently-viewed': { visible: false, collapsed: false },
      anniversary: { visible: true, collapsed: true },
    });
    expect(out.sections['recently-viewed'].visible).toBe(false);
    expect(out.sections.anniversary.collapsed).toBe(true);
    // Order falls back to the canonical default when missing.
    expect(out.order).toEqual([...HOME_SECTION_IDS]);
  });

  it('appends missing section ids to the end of order', () => {
    const out = validateHomeSectionLayoutV1({
      order: ['library-controls', 'reading-queue'],
    });
    expect(out.order).toContain('recently-viewed');
    expect(out.order).toContain('anniversary');
    expect(out.order).toContain('library-grid');
    expect(out.order.slice(0, 2)).toEqual(['library-controls', 'reading-queue']);
  });

  it('drops unknown section ids from order', () => {
    const out = validateHomeSectionLayoutV1({
      order: ['library-grid', 'foobar', 'recently-viewed', 'baz'],
    });
    expect(out.order).not.toContain('foobar');
    expect(out.order).not.toContain('baz');
    expect(out.order).toContain('library-grid');
    expect(out.order).toContain('recently-viewed');
  });

  it('deduplicates ids in order', () => {
    const out = validateHomeSectionLayoutV1({
      order: ['library-grid', 'library-grid', 'recently-viewed', 'library-grid'],
    });
    const libs = out.order.filter((id) => id === 'library-grid');
    expect(libs.length).toBe(1);
  });

  it('only an explicit false hides a section (typo-safe)', () => {
    const out = validateHomeSectionLayoutV1({
      sections: {
        'recently-viewed': { collapsed: false }, // visible field missing
      },
    });
    expect(out.sections['recently-viewed'].visible).toBe(true);
  });

  it('parseHomeSectionLayoutV1 handles malformed JSON safely', () => {
    expect(parseHomeSectionLayoutV1('not json')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeSectionLayoutV1(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeSectionLayoutV1('{}')).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('round-trips a layout via JSON.stringify / parseHomeSectionLayoutV1', () => {
    const original = validateHomeSectionLayoutV1({
      sections: { 'library-grid': { visible: false, collapsed: true } },
      order: ['library-grid', 'library-controls', 'anniversary', 'recently-viewed', 'reading-queue'],
    });
    const round = parseHomeSectionLayoutV1(JSON.stringify(original));
    expect(round).toEqual(original);
  });
});
