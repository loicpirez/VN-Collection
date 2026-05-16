import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addToCollection,
  getCollectionItem,
  isInCollection,
  removeFromCollection,
  upsertVn,
} from '@/lib/db';
import { addToVndbWishlist, removeFromVndbWishlist } from '@/lib/vndb';

/**
 * Regression test for the dangerous data-loss bug where CoverQuickActions
 * conflated "local status === 'planning'" with "VNDB wishlist" and called
 * DELETE /api/collection/[id] to clear the wishlist — silently wiping
 * owned editions, notes, rating, and every other field of the local
 * collection row.
 *
 * The guarantee being tested:
 *   - Adding / removing a VN from the VNDB wishlist (label 5) must not
 *     touch the local SQLite `collection` table.
 *   - The two states are fully independent: a VN may sit in the local
 *     collection, on the VNDB wishlist, both, or neither.
 */

// Capture every outbound fetch so we can assert what the VNDB calls look
// like.
type FetchCall = { url: string; init?: RequestInit };
const fetchLog: FetchCall[] = [];

// Save & override any pre-existing VNDB_TOKEN so we never accidentally use the
// developer's real token in tests, and never make a real outbound call. Even
// if the env was set, the global fetch stub below short-circuits every
// request to a synthetic 200 response — so no token, real or fake, ever
// leaves the test process.
const ORIGINAL_TOKEN = process.env.VNDB_TOKEN;
const FAKE_TEST_TOKEN = 'fake-test-token-not-a-real-vndb-credential';

beforeAll(() => {
  process.env.VNDB_TOKEN = FAKE_TEST_TOKEN;

  // throttledFetch (lib/vndb-throttle.ts) calls the global `fetch`. Stub it
  // so the test process can NEVER reach api.vndb.org — any real network
  // attempt fails the assertion loudly instead of silently leaking the
  // (fake or real) auth header.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchLog.push({ url, init });
    if (!url.startsWith('https://api.vndb.org/kana/ulist/')) {
      throw new Error(`unexpected outbound URL in test: ${url}`);
    }
    return new Response('', { status: 200 });
  });
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.VNDB_TOKEN;
  else process.env.VNDB_TOKEN = ORIGINAL_TOKEN;
  vi.unstubAllGlobals();
});

afterEach(() => {
  fetchLog.length = 0;
});

beforeEach(() => {
  // Reset the local rows between tests; we do NOT touch app_setting so the
  // token survives.
  if (isInCollection('v100')) removeFromCollection('v100');
});

function seedVn(): void {
  upsertVn({
    id: 'v100',
    title: 'Test Wishlist VN',
    alttitle: 'テスト',
    released: '2024-01-01',
    languages: ['en'],
    platforms: ['win'],
    image: { url: 'https://example.invalid/v100.jpg' },
  });
  addToCollection('v100', {
    status: 'completed',
    user_rating: 85,
    notes: 'Best ever — keep this row alive.',
    favorite: true,
    location: 'jp',
    edition_label: 'Limited edition',
  });
}

describe('VNDB wishlist routes do not touch local collection', () => {
  it('removeFromVndbWishlist leaves a fully-populated local collection row intact', async () => {
    seedVn();
    expect(isInCollection('v100')).toBe(true);

    const result = await removeFromVndbWishlist('v100');
    expect(result).toEqual({ ok: true });

    // VNDB was called with the right shape.
    const ulistCall = fetchLog.find((c) => c.url.includes('/ulist/v100'));
    expect(ulistCall).toBeDefined();
    expect(ulistCall?.init?.method).toBe('PATCH');
    expect(JSON.parse(String(ulistCall?.init?.body))).toEqual({ labels_unset: [5] });

    // Critical: the local collection row is preserved with EVERY field
    // intact. A regression would either (a) delete the row entirely or
    // (b) clear individual fields like status / notes.
    expect(isInCollection('v100')).toBe(true);
    const item = getCollectionItem('v100');
    expect(item).not.toBeNull();
    expect(item?.status).toBe('completed');
    expect(item?.user_rating).toBe(85);
    expect(item?.notes).toBe('Best ever — keep this row alive.');
    expect(item?.favorite).toBe(true);
    expect(item?.location).toBe('jp');
    expect(item?.edition_label).toBe('Limited edition');
  });

  it('addToVndbWishlist leaves a fully-populated local collection row intact', async () => {
    seedVn();
    expect(isInCollection('v100')).toBe(true);

    const result = await addToVndbWishlist('v100');
    expect(result).toEqual({ ok: true });

    const ulistCall = fetchLog.find((c) => c.url.includes('/ulist/v100'));
    expect(ulistCall).toBeDefined();
    expect(ulistCall?.init?.method).toBe('PATCH');
    expect(JSON.parse(String(ulistCall?.init?.body))).toEqual({ labels_set: [5] });

    // Local collection row is unchanged.
    expect(isInCollection('v100')).toBe(true);
    const item = getCollectionItem('v100');
    expect(item?.status).toBe('completed');
    expect(item?.user_rating).toBe(85);
    expect(item?.notes).toBe('Best ever — keep this row alive.');
  });

  it('wishlist add followed by wishlist remove never touches the collection row', async () => {
    seedVn();
    await addToVndbWishlist('v100');
    await removeFromVndbWishlist('v100');

    expect(isInCollection('v100')).toBe(true);
    const item = getCollectionItem('v100');
    expect(item?.status).toBe('completed');
    expect(item?.user_rating).toBe(85);
    expect(item?.notes).toBe('Best ever — keep this row alive.');
  });

  it('wishlist mutation works even when the VN is not in the local collection', async () => {
    upsertVn({ id: 'v200', title: 'Not yet collected', languages: ['en'] });
    expect(isInCollection('v200')).toBe(false);

    const addResult = await addToVndbWishlist('v200');
    expect(addResult).toEqual({ ok: true });
    // Wishlist add must NOT auto-create a collection row.
    expect(isInCollection('v200')).toBe(false);

    const delResult = await removeFromVndbWishlist('v200');
    expect(delResult).toEqual({ ok: true });
    expect(isInCollection('v200')).toBe(false);
  });

  it('rejects invalid VN ids before hitting VNDB', async () => {
    await expect(addToVndbWishlist('not-a-vn-id')).rejects.toThrow(/invalid vn id/);
    await expect(removeFromVndbWishlist('egs_42')).rejects.toThrow(/invalid vn id/);
    // No VNDB calls were attempted.
    expect(fetchLog.length).toBe(0);
  });
});
