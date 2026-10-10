import { createHash } from 'node:crypto';
import { putCacheRow, setAppSetting } from '@/lib/db';
import { buildCacheKey } from '@/lib/vndb-cache';
import { getCachedWishlistRequestKeys } from '@/lib/vndb';

/**
 * Seed a synthetic account identity and return its real wishlist request keys.
 * @param account Distinct synthetic account number used by isolated fixtures.
 * @returns Exact persisted keys derived by the production cache reader.
 */
export async function seedRecommendationWishlistAccount(account = 998888): Promise<string[]> {
  const token = `synthetic-recommendation-account-${account}`;
  setAppSetting('vndb_token', token);
  const digest = createHash('sha256').update(`Token ${token}`).digest('hex');
  putCacheRow({
    cache_key: buildCacheKey('GET', `GET /authinfo:auth:${digest}`),
    body: JSON.stringify({ id: `u${account}`, username: 'Synthetic account', permissions: ['listread'] }),
    etag: null,
    last_modified: null,
    fetched_at: 1,
    expires_at: 2,
  });
  return getCachedWishlistRequestKeys();
}
