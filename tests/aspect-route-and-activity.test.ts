/**
 * R5-200 / R5-201 — pins the HTTP surface of `/api/vn/[id]/aspect`
 * and the activity-recording behaviour on set / clear.
 *
 * Existing tests (`aspect-ratio.test.ts`, `aspect-filter-e2e.test.ts`,
 * `aspect-ratio-override.test.ts`) cover the helper functions + the
 * filter SQL. This file pins the route handlers + the audit-trail
 * side-effect that the row requires: "activity recorded; no
 * destructive DB write in tests" — and verifies the EN/FR/JA dict
 * parity for the filter/group labels.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { GET, PATCH, DELETE } from '@/app/api/vn/[id]/aspect/route';
import { setVnAspectOverride, getVnAspectOverride, listShelves } from '@/lib/db';
import { listUserActivity } from '@/lib/activity';
import { dictionaries } from '@/lib/i18n/dictionaries';

// Force schema bootstrap before opening the raw fixture connection.
listShelves();
const db = new Database(process.env.DB_PATH!);

function seedVn(id: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, id, Date.now());
}

function clearAll(): void {
  db.exec(`
    DELETE FROM vn_aspect_override;
    DELETE FROM owned_release_aspect_override;
    DELETE FROM user_activity;
    DELETE FROM vn;
  `);
}

function buildPatch(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/vn/${id}/aspect`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildGet(id: string): Request {
  return new Request(`http://localhost/api/vn/${id}/aspect`);
}

function buildDelete(id: string): Request {
  return new Request(`http://localhost/api/vn/${id}/aspect`, { method: 'DELETE' });
}

const SYNTHETIC_ID = 'v92001';

beforeEach(() => {
  clearAll();
  seedVn(SYNTHETIC_ID);
});

describe('R5-201 PATCH — sets override + records aspect.set activity', () => {
  it('persists the override + emits a single aspect.set activity row', async () => {
    const res = await PATCH(buildPatch(SYNTHETIC_ID, { aspect_key: '16:9' }) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { override: { aspect_key: string } | null; derived: string };
    expect(json.override?.aspect_key).toBe('16:9');
    expect(json.derived).toBe('16:9');
    expect(getVnAspectOverride(SYNTHETIC_ID)?.aspect_key).toBe('16:9');

    const events = listUserActivity({ kind: 'aspect.set', limit: 5 });
    expect(events.length).toBe(1);
    expect(events[0].entity).toBe('vn');
    expect(events[0].entity_id).toBe(SYNTHETIC_ID);
    expect(JSON.parse(events[0].payload ?? '{}')).toEqual({ aspect_key: '16:9' });
  });

  it('PATCH null clears the override + emits aspect.clear', async () => {
    setVnAspectOverride({ vnId: SYNTHETIC_ID, aspectKey: '4:3' });
    const res = await PATCH(buildPatch(SYNTHETIC_ID, { aspect_key: null }) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    expect(res.status).toBe(200);
    expect(getVnAspectOverride(SYNTHETIC_ID)).toBeNull();
    const events = listUserActivity({ kind: 'aspect.clear', limit: 5 });
    expect(events.length).toBe(1);
  });

  it('PATCH rejects an unsupported aspect_key with HTTP 400', async () => {
    // `'9:16'` is not in ASPECT_KEYS; the route returns 400 + a
    // canonical-list error message.
    const res = await PATCH(buildPatch(SYNTHETIC_ID, { aspect_key: '9:16' }) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/aspect_key/);
    expect(listUserActivity({ kind: 'aspect.set', limit: 5 })).toHaveLength(0);
    expect(listUserActivity({ kind: 'aspect.clear', limit: 5 })).toHaveLength(0);
  });

  it('PATCH rejects "unknown" (no UX path for it) with HTTP 400', async () => {
    const res = await PATCH(buildPatch(SYNTHETIC_ID, { aspect_key: 'unknown' }) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE clears + records aspect.clear (sugar for PATCH null)', async () => {
    setVnAspectOverride({ vnId: SYNTHETIC_ID, aspectKey: '16:9' });
    const res = await DELETE(buildDelete(SYNTHETIC_ID) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    expect(res.status).toBe(200);
    expect(getVnAspectOverride(SYNTHETIC_ID)).toBeNull();
    const events = listUserActivity({ kind: 'aspect.clear', limit: 5 });
    expect(events.length).toBe(1);
  });
});

describe('R5-200 GET — returns the derived + override pair', () => {
  it('returns null override + "unknown" derived for a fresh VN', async () => {
    const res = await GET(buildGet(SYNTHETIC_ID) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { override: unknown; derived: string };
    expect(body.override).toBeNull();
    expect(body.derived).toBe('unknown');
  });

  it('returns the override + matching derived when the override is set', async () => {
    setVnAspectOverride({ vnId: SYNTHETIC_ID, aspectKey: '16:10' });
    const res = await GET(buildGet(SYNTHETIC_ID) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    const body = (await res.json()) as { override: { aspect_key: string } | null; derived: string };
    expect(body.override?.aspect_key).toBe('16:10');
    expect(body.derived).toBe('16:10');
  });

  it('rejects an invalid VN id shape with HTTP 400', async () => {
    const res = await GET(buildGet('not-a-vn-id') as never, {
      params: Promise.resolve({ id: 'not-a-vn-id' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('R5-200 i18n — FR/EN/JA expose the aspect filter + group labels', () => {
  for (const locale of ['fr', 'en', 'ja'] as const) {
    it(`${locale} library.groupAspect label is present`, () => {
      expect((dictionaries[locale].library as { groupAspect: string }).groupAspect).toBeTruthy();
    });
    it(`${locale} aspect.keys covers every supported bucket`, () => {
      const keys = dictionaries[locale].aspect.keys as Record<string, string>;
      for (const k of ['4:3', '16:9', '16:10', 'other', 'unknown']) {
        expect(keys[k]).toBeTruthy();
      }
    });
    it(`${locale} aspect.label + overrideTitle copy is concise`, () => {
      const a = dictionaries[locale].aspect as Record<string, unknown>;
      expect(typeof a.label === 'string' && (a.label as string).length < 60).toBe(true);
      expect(typeof a.overrideTitle === 'string' && (a.overrideTitle as string).length < 60).toBe(true);
    });
  }
});

describe('R5-201 — activity is recorded with the audit-readable aspect_key field', () => {
  it('aspect.set payload carries the human-readable aspect_key (NOT masked)', async () => {
    await PATCH(buildPatch(SYNTHETIC_ID, { aspect_key: '16:9' }) as never, {
      params: Promise.resolve({ id: SYNTHETIC_ID }),
    });
    const events = listUserActivity({ kind: 'aspect.set', limit: 5 });
    const payload = JSON.parse(events[0].payload ?? '{}');
    // The sensitive-key masker (`maskActivityPayload`) used to greedily
    // mask any `*_key` field — the regression that prompted the
    // anchored allowlist explicitly preserves `aspect_key`.
    expect(payload.aspect_key).toBe('16:9');
    expect(payload.aspect_key).not.toBe('[masked]');
  });
});
