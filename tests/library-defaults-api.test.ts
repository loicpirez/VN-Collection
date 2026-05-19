/**
 * R5-207 — pins the `/api/settings` default-library-view contract.
 *
 *   - GET defaults: `default_sort` falls back to `updated_at`,
 *     `default_order` to `desc`, `default_group` to `none` when the
 *     app_setting row is absent.
 *   - PATCH persists a valid value into `app_setting`.
 *   - PATCH rejects every value not in the allowlist with HTTP 400.
 *   - PATCH allowlist is the SAME shape `LibraryClient` reads, so
 *     the UI and API agree on which keys are real.
 *
 * The LibraryClient render gate (URL params override settings) is
 * proven by the live `scripts/r5-207-library-defaults.mjs` Playwright
 * spec; this file pins the API surface that the client reads.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GET, PATCH } from '@/app/api/settings/route';
import { setAppSetting } from '@/lib/db';

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

async function getJson(): Promise<Record<string, unknown>> {
  const res = await GET(buildGet());
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  setAppSetting('default_sort', null);
  setAppSetting('default_order', null);
  setAppSetting('default_group', null);
});

describe('R5-207 GET defaults — fall back to canonical values', () => {
  it('default_sort defaults to "updated_at" when unset', async () => {
    const body = await getJson();
    expect(body.default_sort).toBe('updated_at');
  });
  it('default_order defaults to "desc" when unset', async () => {
    const body = await getJson();
    expect(body.default_order).toBe('desc');
  });
  it('default_group defaults to "none" when unset', async () => {
    const body = await getJson();
    expect(body.default_group).toBe('none');
  });
});

describe('R5-207 PATCH — accepts every key the UI exposes', () => {
  const SORTS = [
    'updated_at', 'added_at', 'title', 'rating', 'user_rating',
    'playtime', 'length_minutes', 'egs_playtime', 'combined_playtime',
    'released', 'producer', 'publisher', 'egs_rating', 'combined_rating',
    'custom',
  ] as const;
  for (const sort of SORTS) {
    it(`accepts default_sort = "${sort}"`, async () => {
      const res = await PATCH(buildPatch({ default_sort: sort }) as never);
      expect(res.status).toBe(200);
      const body = await getJson();
      expect(body.default_sort).toBe(sort);
    });
  }

  for (const order of ['asc', 'desc'] as const) {
    it(`accepts default_order = "${order}"`, async () => {
      const res = await PATCH(buildPatch({ default_order: order }) as never);
      expect(res.status).toBe(200);
      const body = await getJson();
      expect(body.default_order).toBe(order);
    });
  }

  const GROUPS = ['none', 'status', 'producer', 'publisher', 'tag', 'series', 'aspect'] as const;
  for (const group of GROUPS) {
    it(`accepts default_group = "${group}"`, async () => {
      const res = await PATCH(buildPatch({ default_group: group }) as never);
      expect(res.status).toBe(200);
      const body = await getJson();
      expect(body.default_group).toBe(group);
    });
  }
});

describe('R5-207 PATCH — rejects values outside the allowlist', () => {
  it('rejects default_sort = "haxxor" with HTTP 400', async () => {
    const res = await PATCH(buildPatch({ default_sort: 'haxxor' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toMatch(/default_sort/);
  });
  it('rejects default_order = "sideways" with HTTP 400', async () => {
    const res = await PATCH(buildPatch({ default_order: 'sideways' }) as never);
    expect(res.status).toBe(400);
  });
  it('rejects default_group = "company" with HTTP 400', async () => {
    const res = await PATCH(buildPatch({ default_group: 'company' }) as never);
    expect(res.status).toBe(400);
  });
  it('rejects default_sort if it is not a string', async () => {
    const res = await PATCH(buildPatch({ default_sort: 42 }) as never);
    expect(res.status).toBe(400);
  });
  it('rejects an unknown setting key (defense-in-depth on SAFE_KEYS)', async () => {
    const res = await PATCH(buildPatch({ default_admin_panel: 'enabled' }) as never);
    expect(res.status).toBe(400);
  });
});

describe('R5-207 PATCH — persisted value survives a follow-up GET', () => {
  it('round-trip: PATCH then GET returns the same value', async () => {
    await PATCH(buildPatch({ default_sort: 'rating', default_order: 'asc', default_group: 'series' }) as never);
    const body = await getJson();
    expect(body.default_sort).toBe('rating');
    expect(body.default_order).toBe('asc');
    expect(body.default_group).toBe('series');
  });
});
