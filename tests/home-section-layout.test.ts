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
        library: { visible: true, collapsed: true },
      },
      order: ['library', 'anniversary', 'reading-queue', 'recently-viewed'],
    });
    expect(out.sections['recently-viewed']).toEqual({ visible: false, collapsed: true });
    expect(out.sections.library).toEqual({ visible: true, collapsed: true });
    expect(out.sections['reading-queue']).toEqual({ visible: true, collapsed: false });
    expect(out.order).toEqual(['library', 'anniversary', 'reading-queue', 'recently-viewed']);
  });

  it('migrates split library state and order back to one coherent section', () => {
    const out = validateHomeSectionLayoutV1({
      sections: {
        'library-controls': { visible: false, collapsed: true },
        'library-grid': { visible: true, collapsed: false },
      },
      order: ['recently-viewed', 'library-controls', 'library-grid', 'anniversary'],
    });
    expect(out.sections.library).toEqual({ visible: true, collapsed: false });
    expect(out.order).toEqual([
      'recently-viewed',
      'library',
      'anniversary',
      'reading-queue',
    ]);
  });

  it('preserves a fully hidden and collapsed split library', () => {
    const out = validateHomeSectionLayoutV1({
      sections: {
        'library-controls': { visible: false, collapsed: true },
        'library-grid': { visible: false, collapsed: true },
      },
    });
    expect(out.sections.library).toEqual({ visible: false, collapsed: true });
  });

  it('accepts the legacy v0 shape (flat sections, no order)', () => {
    const out = validateHomeSectionLayoutV1({
      'recently-viewed': { visible: false, collapsed: false },
      anniversary: { visible: true, collapsed: true },
    });
    expect(out.sections['recently-viewed'].visible).toBe(false);
    expect(out.sections.anniversary.collapsed).toBe(true);
    expect(out.order).toEqual([...HOME_SECTION_IDS]);
  });

  it('appends missing section ids to the end of order', () => {
    const out = validateHomeSectionLayoutV1({
      order: ['library', 'reading-queue'],
    });
    expect(out.order).toContain('recently-viewed');
    expect(out.order).toContain('anniversary');
    expect(out.order.slice(0, 2)).toEqual(['library', 'reading-queue']);
  });

  it('drops unknown section ids from order', () => {
    const out = validateHomeSectionLayoutV1({
      order: ['library', 'foobar', 'recently-viewed', 'baz'],
    });
    expect(out.order).not.toContain('foobar');
    expect(out.order).not.toContain('baz');
    expect(out.order).toContain('library');
    expect(out.order).toContain('recently-viewed');
  });

  it('deduplicates ids in order', () => {
    const out = validateHomeSectionLayoutV1({
      order: ['library', 'library', 'recently-viewed', 'library'],
    });
    const libs = out.order.filter((id) => id === 'library');
    expect(libs.length).toBe(1);
  });

  it('drops non-string order values and deduplicates split migration ids', () => {
    const out = validateHomeSectionLayoutV1({ order: [4, 'library-controls', 'library-grid'] });
    expect(out.order.filter((id) => id === 'library')).toHaveLength(1);
  });

  it('only an explicit false hides a section (typo-safe)', () => {
    const out = validateHomeSectionLayoutV1({
      sections: {
        'recently-viewed': { collapsed: false },
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
      sections: { library: { visible: false, collapsed: true } },
      order: ['library', 'anniversary', 'recently-viewed', 'reading-queue'],
    });
    const round = parseHomeSectionLayoutV1(JSON.stringify(original));
    expect(round).toEqual(original);
    expect(parseHomeSectionLayoutV1(JSON.stringify(original))).toBe(round);
  });
});
