/**
 * Pin the shared section-layout factory. Item 15 of the operator's
 * round-4-followup-continuation prompt requires:
 *   - config parser
 *   - unknown section handling
 *   - reset behavior
 *   - section order application
 *   - hidden section not rendered
 *   - collapsed default
 *
 * The factory drives staff / character / producer scopes via three
 * thin wrapper modules; the contract is identical so we exercise it
 * once via the factory and once via the staff wrapper for
 * confidence that the wrapper does not regress.
 */
import { describe, expect, it } from 'vitest';
import { createSectionLayoutModule } from '@/lib/section-layout';
import {
  STAFF_SECTION_IDS,
  defaultStaffDetailLayoutV1,
  parseStaffDetailLayoutV1,
  validateStaffDetailLayoutV1,
} from '@/lib/staff-detail-layout';
import { CHARACTER_SECTION_IDS } from '@/lib/character-detail-layout';
import { PRODUCER_SECTION_IDS } from '@/lib/producer-detail-layout';

describe('createSectionLayoutModule — generic factory contract', () => {
  const mod = createSectionLayoutModule<'a' | 'b' | 'c'>({
    sectionIds: ['a', 'b', 'c'] as const,
    scope: 'fixture',
    eventName: 'fixture:changed',
  });

  it('default layout exposes every id in canonical order, all visible / expanded', () => {
    const d = mod.defaultLayout();
    expect(d.order).toEqual(['a', 'b', 'c']);
    expect(d.sections.a).toEqual({ visible: true, collapsedByDefault: false });
    expect(d.sections.b).toEqual({ visible: true, collapsedByDefault: false });
    expect(d.sections.c).toEqual({ visible: true, collapsedByDefault: false });
  });

  it('validate returns defaults for garbage input', () => {
    expect(mod.validate(null)).toEqual(mod.defaultLayout());
    expect(mod.validate(42)).toEqual(mod.defaultLayout());
    expect(mod.validate([])).toEqual(mod.defaultLayout());
  });

  it('validate drops unknown ids in order', () => {
    const out = mod.validate({ order: ['c', 'unknown', 'a'] });
    // Known order respected; unknown dropped; missing-from-list 'b'
    // appended in canonical position.
    expect(out.order).toEqual(['c', 'a', 'b']);
  });

  it('validate appends missing-canonical ids to the end', () => {
    const out = mod.validate({ order: ['b'] });
    expect(out.order).toEqual(['b', 'a', 'c']);
  });

  it('validate dedupes order entries', () => {
    const out = mod.validate({ order: ['a', 'a', 'b'] });
    expect(out.order).toEqual(['a', 'b', 'c']);
  });

  it('validate preserves per-section visibility and collapse flags', () => {
    const out = mod.validate({
      sections: {
        a: { visible: false, collapsedByDefault: true },
        b: { collapsedByDefault: true },
      },
    });
    expect(out.sections.a).toEqual({ visible: false, collapsedByDefault: true });
    // Missing `visible` defaults to true.
    expect(out.sections.b).toEqual({ visible: true, collapsedByDefault: true });
    expect(out.sections.c).toEqual({ visible: true, collapsedByDefault: false });
  });

  it('parse handles JSON round-trip', () => {
    const json = JSON.stringify({ order: ['c', 'a'], sections: { c: { visible: false } } });
    const out = mod.parse(json);
    expect(out.order).toEqual(['c', 'a', 'b']);
    expect(out.sections.c).toEqual({ visible: false, collapsedByDefault: false });
  });

  it('parse returns defaults on malformed JSON', () => {
    expect(mod.parse('not json')).toEqual(mod.defaultLayout());
    expect(mod.parse(null)).toEqual(mod.defaultLayout());
  });

  it('SETTINGS_KEY follows the documented suffix', () => {
    expect(mod.SETTINGS_KEY).toBe('fixture_section_layout_v1');
    expect(mod.LAYOUT_EVENT).toBe('fixture:changed');
  });
});

describe('staff-detail-layout wrapper matches the factory contract', () => {
  it('exposes the canonical staff section ids', () => {
    expect(STAFF_SECTION_IDS).toEqual([
      'timeline',
      'voice-credits',
      'production-credits',
      'extra-credits',
    ]);
  });

  it('default visible + expanded for every section', () => {
    const d = defaultStaffDetailLayoutV1();
    for (const id of STAFF_SECTION_IDS) {
      expect(d.sections[id]).toEqual({ visible: true, collapsedByDefault: false });
    }
  });

  it('validate drops unknown ids and tolerates partial sections', () => {
    const out = validateStaffDetailLayoutV1({
      order: ['production-credits', 'unknown-section', 'timeline'],
      sections: { timeline: { visible: false } },
    });
    expect(out.order[0]).toBe('production-credits');
    expect(out.order).toContain('timeline');
    expect(out.order).not.toContain('unknown-section' as never);
    expect(out.sections.timeline.visible).toBe(false);
  });

  it('parse on null returns defaults', () => {
    expect(parseStaffDetailLayoutV1(null)).toEqual(defaultStaffDetailLayoutV1());
  });
});

describe('character + producer wrappers share the same shape', () => {
  it('character section ids are canonical', () => {
    expect(CHARACTER_SECTION_IDS).toEqual([
      'siblings',
      'description',
      'meta',
      'instances',
      'voiced-by-all',
      'also-voiced-by',
      'appears-in',
    ]);
  });

  it('producer section ids are canonical', () => {
    // Aliases stay inside the producer identity header; dev/pub
    // works are presented together via <ProducerVnsSections>.
    expect(PRODUCER_SECTION_IDS).toEqual([
      'description',
      'extlinks',
      'works',
      'stats',
    ]);
  });
});
