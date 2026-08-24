import { fetchAuthenticatedWishlist } from '@/lib/vndb';

const SUCCESS_TTL_MS = 30_000;
const UNAVAILABLE_TTL_MS = 5_000;

interface WishlistCacheEntry {
  ids: Set<string> | null;
  expiresAt: number;
}

let cachedEntry: WishlistCacheEntry | null = null;
let inFlight: Promise<Set<string> | null> | null = null;
let cacheGeneration = 0;

async function loadWishlistIds(): Promise<Set<string> | null> {
  try {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) return null;
    return new Set(result.map((entry) => entry.id));
  } catch {
    return null;
  }
}

/**
 * Return the authenticated VNDB wishlist id set through a short process cache.
 * Concurrent callers share one upstream request, while unavailable results use
 * a shorter TTL so authentication or upstream recovery is observed quickly.
 *
 * @returns Wishlist VN ids, or null when enrichment is unavailable.
 */
export async function getCachedVndbWishlistIds(): Promise<Set<string> | null> {
  const now = Date.now();
  if (cachedEntry && cachedEntry.expiresAt > now) return cachedEntry.ids;
  if (inFlight) return inFlight;

  const requestGeneration = cacheGeneration;
  const request = loadWishlistIds()
    .then((ids) => {
      if (requestGeneration === cacheGeneration) {
        cachedEntry = {
          ids,
          expiresAt: Date.now() + (ids === null ? UNAVAILABLE_TTL_MS : SUCCESS_TTL_MS),
        };
      }
      return ids;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

/**
 * Invalidate cached VNDB wishlist data after a successful list mutation.
 * An already-running read is allowed to settle but cannot be reused after the
 * invalidation generation because the cache entry is cleared again on settle.
 *
 * @returns Nothing.
 */
export function invalidateVndbWishlistCache(): void {
  cacheGeneration += 1;
  cachedEntry = null;
  inFlight = null;
}
