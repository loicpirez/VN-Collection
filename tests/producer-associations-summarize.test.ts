/**
 * Coverage for src/lib/producer-associations.ts:
 *   - fetchProducerAssociations(producerId)
 *   - invalidateProducerAssociations(producerId)
 *
 * The function paginates two VNDB POST queries through the real
 * `cachedFetch` (developer credits on `/vn`, publisher credits on
 * `/release`), splits VNs by role, dedupes self-published VNs onto the
 * developer side, harvests the producer name from either role, and
 * flags `upstreamFailed` / `stale`.
 *
 * Hermetic: the only upstream surface (`throttledFetch`) is mocked so no
 * network call is made. Ownership is seeded into the real `collection`
 * table. Synthetic ids only (p90xxx / v90xxx / r90xxx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const throttledFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vndb-throttle', () => ({
  throttledFetch: throttledFetchMock,
}));

import { db } from '@/lib/db';
import {
  fetchProducerAssociations,
  invalidateProducerAssociations,
} from '@/lib/producer-associations';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function devVn(id: string, title = 'Dev VN') {
  return { id, title, image: null };
}

function releasePage(rid: string, vnIds: string[], pid: string, publisher: boolean, name: string | null): Response {
  return jsonResponse({
    results: [
      {
        id: rid,
        vns: vnIds.map((id) => ({ id, title: 'Pub VN', image: null })),
        producers: [
          {
            id: pid,
            developer: !publisher,
            publisher,
            ...(name !== null ? { name } : {}),
          },
        ],
      },
    ],
    more: false,
  });
}

/** Route the mocked upstream by VNDB path: `/vn` vs `/release`. */
function routeBy(handlers: { vn?: () => Response | Error; release?: () => Response | Error }) {
  throttledFetchMock.mockImplementation((url: string) => {
    const isRelease = url.includes('/release');
    const h = isRelease ? handlers.release : handlers.vn;
    if (!h) return Promise.resolve(jsonResponse({ results: [], more: false }));
    const out = h();
    return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
  });
}

function seedOwned(vnId: string): void {
  db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES (?, 'Owned', ?) ON CONFLICT(id) DO NOTHING`)
    .run(vnId, Date.now());
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at, playtime_minutes)
    VALUES (?, 'finished', ?, ?, 0)
    ON CONFLICT(vn_id) DO NOTHING
  `).run(vnId, Date.now(), Date.now());
}

beforeEach(() => {
  throttledFetchMock.mockReset();
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'POST /vn:producer:%'`).run();
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'POST /release:producer:%'`).run();
});

afterEach(() => {
  db.prepare('DELETE FROM collection').run();
  db.prepare(`DELETE FROM vn WHERE id LIKE 'v90%'`).run();
});

describe('fetchProducerAssociations', () => {
  it('short-circuits on a malformed producer id without any upstream call', async () => {
    const r = await fetchProducerAssociations('not-a-producer');
    expect(r).toEqual({
      name: null,
      developerVns: [],
      publisherVns: [],
      totalUnique: 0,
      ownedUnique: 0,
      fromCache: false,
      upstreamFailed: false,
      stale: false,
    });
    expect(throttledFetchMock).not.toHaveBeenCalled();
  });

  it('splits developer and publisher VNs, deduping self-published VNs onto the dev side', async () => {
    seedOwned('v90001');
    routeBy({
      vn: () => jsonResponse({ results: [devVn('v90001'), devVn('v90002')], more: false }),
      // v90001 is also published by the same producer (self-publish) → must
      // not appear in the publisher list. v90003 is publisher-only.
      release: () => releasePage('r90001', ['v90001', 'v90003'], 'p90017', true, 'Studio X'),
    });

    const r = await fetchProducerAssociations('p90017');
    expect(r.name).toBe('Studio X');
    expect(r.developerVns.map((v) => v.id).sort()).toEqual(['v90001', 'v90002']);
    expect(r.publisherVns.map((v) => v.id)).toEqual(['v90003']);
    expect(r.totalUnique).toBe(3);
    // Only the seeded v90001 is owned.
    expect(r.ownedUnique).toBe(1);
    expect(r.developerVns.find((v) => v.id === 'v90001')?.owned).toBe(true);
    expect(r.publisherVns[0].owned).toBe(false);
    expect(r.upstreamFailed).toBe(false);
    expect(r.stale).toBe(false);
  });

  it('harvests the producer name from a developer-only role when the publisher role omits it', async () => {
    routeBy({
      vn: () => jsonResponse({ results: [devVn('v90004')], more: false }),
      // publisher: false, but the role carries the name — must still be harvested.
      release: () => releasePage('r90002', ['v90005'], 'p90018', false, 'Doujin Circle'),
    });

    const r = await fetchProducerAssociations('p90018');
    expect(r.name).toBe('Doujin Circle');
    // Non-publisher release VNs are not added to the publisher list.
    expect(r.publisherVns).toEqual([]);
    expect(r.developerVns.map((v) => v.id)).toEqual(['v90004']);
  });

  it('reports upstreamFailed when BOTH paginated walks throw', async () => {
    routeBy({
      vn: () => new Error('vn offline'),
      release: () => new Error('release offline'),
    });

    const r = await fetchProducerAssociations('p90019');
    expect(r.upstreamFailed).toBe(true);
    expect(r.developerVns).toEqual([]);
    expect(r.publisherVns).toEqual([]);
    expect(r.totalUnique).toBe(0);
  });

  it('does not set upstreamFailed when only one of the two walks fails', async () => {
    routeBy({
      vn: () => jsonResponse({ results: [devVn('v90006')], more: false }),
      release: () => new Error('release offline'),
    });

    const r = await fetchProducerAssociations('p90020');
    expect(r.upstreamFailed).toBe(false);
    expect(r.developerVns.map((v) => v.id)).toEqual(['v90006']);
    expect(r.publisherVns).toEqual([]);
  });

  it('marks the result stale when a cached page is served after an upstream failure', async () => {
    // First run populates the cache for both queries.
    routeBy({
      vn: () => jsonResponse({ results: [devVn('v90007')], more: false }),
      release: () => releasePage('r90003', ['v90008'], 'p90021', true, 'Studio Y'),
    });
    await fetchProducerAssociations('p90021');

    // Expire the cached rows so the next run revalidates upstream, then make
    // upstream fail so cachedFetch serves the stale body.
    db.prepare(`UPDATE vndb_cache SET expires_at = 1 WHERE cache_key LIKE 'POST /vn:producer:p90021|%'`).run();
    db.prepare(`UPDATE vndb_cache SET expires_at = 1 WHERE cache_key LIKE 'POST /release:producer:p90021|%'`).run();
    routeBy({ vn: () => new Error('offline'), release: () => new Error('offline') });

    const r = await fetchProducerAssociations('p90021');
    expect(r.stale).toBe(true);
    expect(r.developerVns.map((v) => v.id)).toEqual(['v90007']);
    expect(r.publisherVns.map((v) => v.id)).toEqual(['v90008']);
    expect(r.upstreamFailed).toBe(false);
  });

  it('dedupes a VN published across two release rows and harvests the name once', async () => {
    routeBy({
      vn: () => jsonResponse({ results: [], more: false }),
      release: () =>
        jsonResponse({
          results: [
            {
              id: 'r90010',
              vns: [{ id: 'v90050', title: 'Pub VN', image: null }],
              producers: [{ id: 'p90023', developer: false, publisher: true, name: 'Studio Z' }],
            },
            {
              // Same VN again (another release of it) + the name repeated:
              // exercises both the pubMap dedupe and the "name already set" skip.
              id: 'r90011',
              vns: [{ id: 'v90050', title: 'Pub VN', image: null }],
              producers: [{ id: 'p90023', developer: false, publisher: true, name: 'Studio Z (alt)' }],
            },
          ],
          more: false,
        }),
    });

    const r = await fetchProducerAssociations('p90023');
    expect(r.name).toBe('Studio Z');
    expect(r.publisherVns.map((v) => v.id)).toEqual(['v90050']);
    expect(r.totalUnique).toBe(1);
  });

  it('walks multiple release pages until VNDB reports more=false', async () => {
    let releaseCalls = 0;
    throttledFetchMock.mockImplementation((url: string) => {
      if (url.includes('/release')) {
        releaseCalls += 1;
        if (releaseCalls === 1) {
          return Promise.resolve(
            jsonResponse({
              results: [
                {
                  id: 'r90020',
                  vns: [{ id: 'v90060', title: 'Pub VN', image: null }],
                  producers: [{ id: 'p90024', developer: false, publisher: true, name: 'Studio M' }],
                },
              ],
              more: true,
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 'r90021',
                vns: [{ id: 'v90061', title: 'Pub VN', image: null }],
                producers: [{ id: 'p90024', developer: false, publisher: true, name: 'Studio M' }],
              },
            ],
            more: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({ results: [], more: false }));
    });

    const r = await fetchProducerAssociations('p90024');
    expect(releaseCalls).toBe(2);
    expect(r.publisherVns.map((v) => v.id).sort()).toEqual(['v90060', 'v90061']);
  });

  it('ignores release rows whose producer block does not include the queried producer', async () => {
    routeBy({
      vn: () => jsonResponse({ results: [], more: false }),
      release: () =>
        jsonResponse({
          results: [
            {
              id: 'r90004',
              vns: [{ id: 'v90009', title: 'Pub VN', image: null }],
              producers: [{ id: 'p90099', developer: false, publisher: true, name: 'Other' }],
            },
          ],
          more: false,
        }),
    });

    const r = await fetchProducerAssociations('p90022');
    expect(r.name).toBeNull();
    expect(r.publisherVns).toEqual([]);
    expect(r.developerVns).toEqual([]);
  });
});

describe('invalidateProducerAssociations', () => {
  it('drops only the queried producer cache rows', async () => {
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES ('POST /vn:producer:p90030|POST|abc', '{}', NULL, NULL, ?, ?)
    `).run(Date.now(), Date.now() + 1000);
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES ('POST /release:producer:p90030|POST|abc', '{}', NULL, NULL, ?, ?)
    `).run(Date.now(), Date.now() + 1000);
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES ('POST /vn:producer:p90031|POST|abc', '{}', NULL, NULL, ?, ?)
    `).run(Date.now(), Date.now() + 1000);

    invalidateProducerAssociations('p90030');

    const survivors = db
      .prepare(`SELECT cache_key FROM vndb_cache WHERE cache_key LIKE 'POST /%producer:p9003%'`)
      .all() as { cache_key: string }[];
    expect(survivors.map((r) => r.cache_key)).toEqual(['POST /vn:producer:p90031|POST|abc']);
  });

  it('is a no-op on a malformed producer id', () => {
    expect(() => invalidateProducerAssociations('garbage')).not.toThrow();
  });
});
