/**
 * AUD-UX-043 — DetailReorderLayout unit/integration tests.
 *
 * The React component itself runs in a node test environment (no jsdom),
 * so tests cover:
 *   1. The pure `section-layout.ts` factory (defaultLayout, validate,
 *      parse) — the same contract the React component uses for its state
 *      shape (SectionLayoutV1 with `collapsedByDefault`, not `collapsed`).
 *   2. Persist round-trip via PATCH /api/settings → GET /api/settings
 *      using a character detail layout payload.
 *   3. Source-pin: `defaultSectionLayoutV1` in DetailReorderLayout.tsx
 *      uses `collapsedByDefault` (AUD-UX-044 regression guard).
 */
import { describe, expect, it } from 'vitest';
import { createSectionLayoutModule, defaultSectionState } from '@/lib/section-layout';
import {
  CHARACTER_SECTION_IDS,
  CHARACTER_DETAIL_SETTINGS_KEY,
  defaultCharacterDetailLayoutV1,
  parseCharacterDetailLayoutV1,
  validateCharacterDetailLayoutV1,
} from '@/lib/character-detail-layout';
import { PATCH as settingsPATCH, GET as settingsGET } from '@/app/api/settings/route';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Pure factory — defaultLayout
// ---------------------------------------------------------------------------
describe('section-layout factory — defaultLayout', () => {
  it('returns all sections visible and not collapsed by default', () => {
    const layout = defaultCharacterDetailLayoutV1();
    for (const id of CHARACTER_SECTION_IDS) {
      expect(layout.sections[id].visible, `${id} should be visible`).toBe(true);
      expect(layout.sections[id].collapsedByDefault, `${id} should not be collapsed`).toBe(false);
    }
  });

  it('order matches canonical CHARACTER_SECTION_IDS', () => {
    const layout = defaultCharacterDetailLayoutV1();
    expect(layout.order).toEqual([...CHARACTER_SECTION_IDS]);
  });

  it('defaultSectionState() returns { visible: true, collapsedByDefault: false }', () => {
    expect(defaultSectionState()).toEqual({ visible: true, collapsedByDefault: false });
  });
});

// ---------------------------------------------------------------------------
// 2. Pure factory — validate (reorder, hide/show, collapse)
// ---------------------------------------------------------------------------
describe('section-layout factory — validate', () => {
  it('preserves a user-defined order that is a valid permutation', () => {
    const customOrder = [...CHARACTER_SECTION_IDS].reverse();
    const input = {
      order: customOrder,
      sections: Object.fromEntries(CHARACTER_SECTION_IDS.map((id) => [id, { visible: true, collapsedByDefault: false }])),
    };
    const result = validateCharacterDetailLayoutV1(input);
    expect(result.order).toEqual(customOrder);
  });

  it('reorder: moves a section to the front', () => {
    const moved = CHARACTER_SECTION_IDS[CHARACTER_SECTION_IDS.length - 1];
    const customOrder = [moved, ...CHARACTER_SECTION_IDS.filter((id) => id !== moved)];
    const result = validateCharacterDetailLayoutV1({ order: customOrder, sections: {} });
    expect(result.order[0]).toBe(moved);
  });

  it('hide: visible: false is preserved for a section', () => {
    const id = CHARACTER_SECTION_IDS[0];
    const input = {
      order: [...CHARACTER_SECTION_IDS],
      sections: { [id]: { visible: false, collapsedByDefault: false } },
    };
    const result = validateCharacterDetailLayoutV1(input);
    expect(result.sections[id].visible).toBe(false);
  });

  it('show: visible: true is preserved for a section', () => {
    const id = CHARACTER_SECTION_IDS[1];
    const input = {
      order: [...CHARACTER_SECTION_IDS],
      sections: { [id]: { visible: true, collapsedByDefault: false } },
    };
    const result = validateCharacterDetailLayoutV1(input);
    expect(result.sections[id].visible).toBe(true);
  });

  it('collapse: collapsedByDefault: true is preserved', () => {
    const id = CHARACTER_SECTION_IDS[0];
    const input = {
      order: [...CHARACTER_SECTION_IDS],
      sections: { [id]: { visible: true, collapsedByDefault: true } },
    };
    const result = validateCharacterDetailLayoutV1(input);
    expect(result.sections[id].collapsedByDefault).toBe(true);
  });

  it('expand: collapsedByDefault: false is preserved', () => {
    const id = CHARACTER_SECTION_IDS[0];
    const input = {
      order: [...CHARACTER_SECTION_IDS],
      sections: { [id]: { visible: true, collapsedByDefault: false } },
    };
    const result = validateCharacterDetailLayoutV1(input);
    expect(result.sections[id].collapsedByDefault).toBe(false);
  });

  it('drops unknown section ids from order, appends missing canonical ids at end', () => {
    const input = {
      order: ['unknown-section', CHARACTER_SECTION_IDS[0]],
      sections: {},
    };
    const result = validateCharacterDetailLayoutV1(input);
    expect(result.order).not.toContain('unknown-section');
    expect(result.order[0]).toBe(CHARACTER_SECTION_IDS[0]);
    for (const id of CHARACTER_SECTION_IDS) {
      expect(result.order).toContain(id);
    }
  });

  it('handles null/undefined input gracefully (returns default)', () => {
    expect(validateCharacterDetailLayoutV1(null)).toEqual(defaultCharacterDetailLayoutV1());
    expect(validateCharacterDetailLayoutV1(undefined)).toEqual(defaultCharacterDetailLayoutV1());
  });
});

// ---------------------------------------------------------------------------
// 3. Pure factory — parse (JSON round-trip)
// ---------------------------------------------------------------------------
describe('section-layout factory — parse / JSON round-trip', () => {
  it('round-trips a custom layout through JSON', () => {
    const original = validateCharacterDetailLayoutV1({
      order: [...CHARACTER_SECTION_IDS].reverse(),
      sections: {
        [CHARACTER_SECTION_IDS[0]]: { visible: false, collapsedByDefault: true },
        [CHARACTER_SECTION_IDS[1]]: { visible: true, collapsedByDefault: true },
      },
    });
    const json = JSON.stringify(original);
    const parsed = parseCharacterDetailLayoutV1(json);
    expect(parsed).toEqual(original);
  });

  it('returns default layout for null input', () => {
    expect(parseCharacterDetailLayoutV1(null)).toEqual(defaultCharacterDetailLayoutV1());
  });

  it('returns default layout for malformed JSON', () => {
    expect(parseCharacterDetailLayoutV1('not json {')).toEqual(defaultCharacterDetailLayoutV1());
  });
});

// ---------------------------------------------------------------------------
// 4. Persist round-trip via PATCH /api/settings → GET /api/settings
// ---------------------------------------------------------------------------
describe('detail layout persist round-trip via /api/settings', () => {
  const LOOPBACK = 'http://127.0.0.1';

  const customLayout = validateCharacterDetailLayoutV1({
    order: [...CHARACTER_SECTION_IDS].reverse(),
    sections: {
      [CHARACTER_SECTION_IDS[0]]: { visible: false, collapsedByDefault: false },
      [CHARACTER_SECTION_IDS[2]]: { visible: true, collapsedByDefault: true },
    },
  });

  it('PATCH saves custom layout; GET reads it back unchanged', async () => {
    const patchReq = new NextRequest(`${LOOPBACK}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [CHARACTER_DETAIL_SETTINGS_KEY]: customLayout }),
    });
    const patchRes = await settingsPATCH(patchReq);
    expect(patchRes.status).toBe(200);

    const getReq = new NextRequest(`${LOOPBACK}/api/settings`, { method: 'GET' });
    const getRes = await settingsGET(getReq);
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as Record<string, unknown>;
    const readBack = parseCharacterDetailLayoutV1(
      typeof body[CHARACTER_DETAIL_SETTINGS_KEY] === 'string'
        ? body[CHARACTER_DETAIL_SETTINGS_KEY] as string
        : JSON.stringify(body[CHARACTER_DETAIL_SETTINGS_KEY]),
    );
    expect(readBack.order).toEqual(customLayout.order);
    expect(readBack.sections[CHARACTER_SECTION_IDS[0]].visible).toBe(false);
    expect(readBack.sections[CHARACTER_SECTION_IDS[2]].collapsedByDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Source-pin: AUD-UX-044 regression guard — collapsedByDefault, not collapsed
// ---------------------------------------------------------------------------
describe('AUD-UX-044 source-pin — DetailReorderLayout uses collapsedByDefault', () => {
  const SOURCE = readFileSync(
    join(__dirname, '..', 'src/components/DetailReorderLayout.tsx'),
    'utf8',
  );

  it('defaultSectionLayoutV1 declares collapsedByDefault (not collapsed) in the sections Record type', () => {
    expect(SOURCE).toMatch(/collapsedByDefault\?:\s*boolean/);
  });

  it('does not contain a bare collapsed? field declaration (old drift)', () => {
    const withoutComments = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(withoutComments).not.toMatch(/\bcollapsed\?:\s*boolean/);
  });

  it('toggleCollapsed writes collapsedByDefault key', () => {
    expect(SOURCE).toMatch(/collapsedByDefault:\s*!\(prev\.sections\[id\]\?\.collapsedByDefault/);
  });
});

// ---------------------------------------------------------------------------
// 6. createSectionLayoutModule — SETTINGS_KEY shape contract
// ---------------------------------------------------------------------------
describe('createSectionLayoutModule — SETTINGS_KEY', () => {
  it('key follows <scope>_section_layout_v1 pattern', () => {
    const mod = createSectionLayoutModule({
      sectionIds: ['a', 'b'] as const,
      scope: 'test_scope',
      eventName: 'test:event',
    });
    expect(mod.SETTINGS_KEY).toBe('test_scope_section_layout_v1');
  });
});
