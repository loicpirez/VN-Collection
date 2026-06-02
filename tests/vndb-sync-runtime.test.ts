/**
 * Runtime coverage for `src/lib/vndb-sync.ts`.
 *
 * `pushStatusToVndb` is exercised through the real `throttledFetch` with the
 * single network primitive (`providerFetch`) mocked, asserting the
 * set/unset/delete label mapping and the non-VNDB-id guard.
 *
 * `pullStatusesFromVndb` is exercised with `getAuthInfo` + `fetchUlistByLabel`
 * mocked (so the test feeds synthetic ulist label payloads without standing
 * up five paginated HTTP responses), against real per-worker SQLite seeded
 * via the genuine db helpers. Status precedence, the in-collection diff, the
 * skip-not-in-collection branch, and the no-token branch are all covered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerFetchMock, getAuthInfoMock, fetchUlistByLabelMock } = vi.hoisted(() => ({
  providerFetchMock: vi.fn(),
  getAuthInfoMock: vi.fn(),
  fetchUlistByLabelMock: vi.fn(),
}));

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getAuthInfo: getAuthInfoMock, fetchUlistByLabel: fetchUlistByLabelMock };
});

import { pullStatusesFromVndb, pushStatusToVndb, VNDB_LABELS } from '@/lib/vndb-sync';
import { addToCollection, getCollectionItem, upsertVn } from '@/lib/db';

const FAKE_TOKEN = 'fake-test-token-not-a-real-vndb-credential';

/** Minimal valid ulist entry as `fetchUlistByLabel` would return it. */
function ulistEntry(id: string, labelIds: number[]) {
  return {
    id,
    added: 1,
    voted: null,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: labelIds.map((l) => ({ id: l, label: `label-${l}` })),
    vn: {
      id,
      title: `vn-${id}`,
      alttitle: null,
      released: '2024-01-01',
      rating: 70,
      votecount: 100,
      length_minutes: 600,
      languages: ['ja'],
      platforms: ['win'],
      image: null,
      developers: [],
    },
  };
}

/**
 * Build the per-label responder. `byLabel` maps a VNDB label id to the
 * entries returned for that single-page query; everything else returns an
 * empty, non-paginated page.
 */
function respondWithLabels(byLabel: Record<number, ReturnType<typeof ulistEntry>[]>): void {
  fetchUlistByLabelMock.mockImplementation(async (_userId: string, labelId: number) => ({
    results: byLabel[labelId] ?? [],
    more: false,
  }));
}

beforeEach(() => {
  providerFetchMock.mockReset();
  getAuthInfoMock.mockReset();
  fetchUlistByLabelMock.mockReset();
});

afterEach(() => {
  providerFetchMock.mockReset();
});

describe('pushStatusToVndb', () => {
  it('rejects a non-VNDB id without any fetch', async () => {
    const r = await pushStatusToVndb('egs_5', 'completed', FAKE_TOKEN);
    expect(r).toEqual({ ok: false, message: 'not a vndb id' });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('PATCHes labels_set + labels_unset for a concrete status', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const r = await pushStatusToVndb('v90001', 'completed', FAKE_TOKEN);
    expect(r).toEqual({ ok: true, status: 200 });
    const init = providerFetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(String(init.body));
    // 'completed' maps to label 2; every other label is unset.
    expect(body.labels_set).toEqual([VNDB_LABELS.completed]);
    expect(body.labels_unset).toEqual(expect.arrayContaining([1, 3, 4, 5]));
    expect(body.labels_unset).not.toContain(VNDB_LABELS.completed);
  });

  it('DELETEs the ulist entry when the status is cleared', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const r = await pushStatusToVndb('v90002', null, FAKE_TOKEN);
    expect(r).toEqual({ ok: true, status: 200 });
    expect((providerFetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('surfaces ok=false when VNDB rejects the write (e.g. 403)', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const r = await pushStatusToVndb('v90003', 'playing', FAKE_TOKEN);
    expect(r).toEqual({ ok: false, status: 403 });
  });
});

describe('pullStatusesFromVndb', () => {
  it('returns a needsAuth result when no token is configured', async () => {
    getAuthInfoMock.mockResolvedValueOnce(null);
    const r = await pullStatusesFromVndb();
    expect(r.ok).toBe(false);
    expect(r.needsAuth).toBe(true);
    expect(r.scanned).toBe(0);
    expect(fetchUlistByLabelMock).not.toHaveBeenCalled();
  });

  it('updates an in-collection VN whose remote status differs', async () => {
    getAuthInfoMock.mockResolvedValue({ id: 'u9001', username: 'tester', permissions: ['listread'] });
    // Local VN currently 'planning'; VNDB has it under the Playing label (1).
    upsertVn({ id: 'v90100', title: 'vn-v90100', languages: ['ja'] });
    addToCollection('v90100', { status: 'planning' });
    respondWithLabels({ [VNDB_LABELS.playing]: [ulistEntry('v90100', [VNDB_LABELS.playing])] });

    const r = await pullStatusesFromVndb();
    expect(r.ok).toBe(true);
    expect(r.updated).toBe(1);
    expect(r.changes).toEqual([
      { vn_id: 'v90100', title: 'vn-v90100', from: 'planning', to: 'playing' },
    ]);
    expect(getCollectionItem('v90100')?.status).toBe('playing');
  });

  it('leaves an already-aligned VN unchanged', async () => {
    getAuthInfoMock.mockResolvedValue({ id: 'u9001', username: 'tester', permissions: ['listread'] });
    upsertVn({ id: 'v90101', title: 'vn-v90101', languages: ['ja'] });
    addToCollection('v90101', { status: 'completed' });
    respondWithLabels({ [VNDB_LABELS.completed]: [ulistEntry('v90101', [VNDB_LABELS.completed])] });

    const r = await pullStatusesFromVndb();
    expect(r.unchanged).toBe(1);
    expect(r.updated).toBe(0);
    expect(getCollectionItem('v90101')?.status).toBe('completed');
  });

  it('skips a VN that is on VNDB but not in the local collection and samples it as unmatched', async () => {
    getAuthInfoMock.mockResolvedValue({ id: 'u9001', username: 'tester', permissions: ['listread'] });
    respondWithLabels({ [VNDB_LABELS.dropped]: [ulistEntry('v90200', [VNDB_LABELS.dropped])] });

    const r = await pullStatusesFromVndb();
    expect(r.updated).toBe(0);
    expect(r.skippedNotInCollection).toBe(1);
    expect(r.unmatched).toEqual([{ vn_id: 'v90200', status: 'dropped' }]);
  });

  it('resolves the strongest status when a VN carries several labels', async () => {
    getAuthInfoMock.mockResolvedValue({ id: 'u9001', username: 'tester', permissions: ['listread'] });
    upsertVn({ id: 'v90300', title: 'vn-v90300', languages: ['ja'] });
    addToCollection('v90300', { status: 'planning' });
    // The same VN comes back under both Playing (1) and Finished (2). The
    // precedence rule must collapse that to 'completed'.
    const entry = ulistEntry('v90300', [VNDB_LABELS.playing, VNDB_LABELS.completed]);
    respondWithLabels({
      [VNDB_LABELS.playing]: [entry],
      [VNDB_LABELS.completed]: [entry],
    });

    const r = await pullStatusesFromVndb();
    expect(getCollectionItem('v90300')?.status).toBe('completed');
    expect(r.changes[0]).toMatchObject({ vn_id: 'v90300', to: 'completed' });
  });

  it('counts a VN with no status-bearing label as skipped', async () => {
    getAuthInfoMock.mockResolvedValue({ id: 'u9001', username: 'tester', permissions: ['listread'] });
    upsertVn({ id: 'v90400', title: 'vn-v90400', languages: ['ja'] });
    addToCollection('v90400', { status: 'planning' });
    // Label 99 has no local-status mapping → pickStatusFromLabels returns null.
    respondWithLabels({ [VNDB_LABELS.playing]: [ulistEntry('v90400', [99])] });

    const r = await pullStatusesFromVndb();
    expect(r.updated).toBe(0);
    expect(r.skippedNotInCollection).toBe(1);
  });
});
