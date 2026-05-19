/**
 * R5-210 — pins the `/api/settings` round-trip for
 * `vn_detail_section_layout_v1` and the integrity contract
 * between the page-level editor (`VnDetailLayout`) and the
 * Settings modal panel (`VnLayoutPanel`).
 *
 * Contract:
 *   - PATCH + GET round-trips the layout shape.
 *   - PATCH null resets to canonical defaults.
 *   - Both the page editor and the settings panel import
 *     `VN_SECTION_IDS` from the same source module
 *     (`src/lib/vn-detail-layout.ts`) — they cannot drift.
 *   - The localised "restore" copy fits in a single short
 *     paragraph (concise copy requirement).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GET, PATCH } from '@/app/api/settings/route';
import { setAppSetting } from '@/lib/db';
import {
  VN_SECTION_IDS,
  defaultVnDetailLayoutV1,
  type VnDetailLayoutV1,
} from '@/lib/vn-detail-layout';
import { dictionaries } from '@/lib/i18n/dictionaries';

function buildGet(): Request {
  return new Request('http://localhost/api/settings');
}

function buildPatch(body: unknown): Request {
  return new Request('http://localhost/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getLayout(): Promise<VnDetailLayoutV1> {
  const res = await GET(buildGet());
  const body = (await res.json()) as { vn_detail_section_layout_v1: VnDetailLayoutV1 };
  return body.vn_detail_section_layout_v1;
}

beforeEach(() => {
  setAppSetting('vn_detail_section_layout_v1', null);
});

describe('R5-210 — /api/settings round-trip for VN layout', () => {
  it('GET returns the canonical defaults when unset', async () => {
    const out = await getLayout();
    expect(out).toEqual(defaultVnDetailLayoutV1());
  });

  it('PATCH + GET round-trips a layout with the notes section hidden', async () => {
    const hidden: VnDetailLayoutV1 = {
      order: [...VN_SECTION_IDS],
      sections: Object.fromEntries(
        VN_SECTION_IDS.map((id) => [
          id,
          id === 'notes'
            ? { visible: false, collapsedByDefault: false }
            : { visible: true, collapsedByDefault: false },
        ]),
      ) as VnDetailLayoutV1['sections'],
    };
    const res = await PATCH(buildPatch({ vn_detail_section_layout_v1: hidden }) as never);
    expect(res.status).toBe(200);
    const out = await getLayout();
    expect(out.sections.notes).toEqual({ visible: false, collapsedByDefault: false });
    expect(out.sections.releases).toEqual({ visible: true, collapsedByDefault: false });
  });

  it('PATCH null resets the layout to the canonical defaults', async () => {
    await PATCH(
      buildPatch({
        vn_detail_section_layout_v1: {
          order: [...VN_SECTION_IDS],
          sections: Object.fromEntries(
            VN_SECTION_IDS.map((id) => [id, { visible: false, collapsedByDefault: true }]),
          ) as VnDetailLayoutV1['sections'],
        },
      }) as never,
    );
    let after = await getLayout();
    expect(after.sections.notes.visible).toBe(false);

    await PATCH(buildPatch({ vn_detail_section_layout_v1: null }) as never);
    after = await getLayout();
    expect(after).toEqual(defaultVnDetailLayoutV1());
  });

  it('PATCH rejects layouts whose `order` contains non-string ids by silently dropping them (no 400)', async () => {
    // Validation lives in `validateVnDetailLayoutV1` — bad ids are
    // dropped, the layout still saves successfully. Verifies that
    // an older/corrupted config never blanks the page.
    const res = await PATCH(
      buildPatch({
        vn_detail_section_layout_v1: { order: [42, null, 'notes', 'totally-fake'], sections: {} },
      }) as never,
    );
    expect(res.status).toBe(200);
    const out = await getLayout();
    expect(out.order[0]).toBe('notes');
    expect(out.order).toContain('releases');
    expect(out.order).toHaveLength(VN_SECTION_IDS.length);
  });
});

describe('R5-210 — page editor and settings panel agree on VN_SECTION_IDS', () => {
  const ROOT = join(__dirname, '..');
  const EDITOR_SRC = readFileSync(join(ROOT, 'src/components/VnDetailLayout.tsx'), 'utf8');
  const PANEL_SRC = readFileSync(join(ROOT, 'src/components/SettingsButton.tsx'), 'utf8');

  it('both surfaces import VN_SECTION_IDS from `@/lib/vn-detail-layout`', () => {
    expect(EDITOR_SRC).toMatch(/from\s+['"]@\/lib\/vn-detail-layout['"]/);
    expect(EDITOR_SRC).toMatch(/VN_SECTION_IDS/);
    expect(PANEL_SRC).toMatch(/from\s+['"]@\/lib\/vn-detail-layout['"]/);
    expect(PANEL_SRC).toMatch(/VN_SECTION_IDS/);
  });

  it('VN_SECTION_IDS is the single source of truth (one declaration, exported)', () => {
    const layoutSrc = readFileSync(join(ROOT, 'src/lib/vn-detail-layout.ts'), 'utf8');
    const decls = layoutSrc.match(/^export const VN_SECTION_IDS\b/gm) ?? [];
    expect(decls.length).toBe(1);
  });
});

describe('R5-210 — restore copy is concise (single short paragraph)', () => {
  for (const locale of ['fr', 'en', 'ja'] as const) {
    it(`${locale} vnLayout.restoreTitle is short (<60 chars)`, () => {
      const title = dictionaries[locale].vnLayout.restoreTitle as string;
      expect(title.length).toBeLessThan(60);
    });
    it(`${locale} vnLayout.restoreDesc is a short paragraph (<200 chars)`, () => {
      const desc = dictionaries[locale].vnLayout.restoreDesc as string;
      expect(desc.length).toBeLessThan(200);
    });
  }
});
