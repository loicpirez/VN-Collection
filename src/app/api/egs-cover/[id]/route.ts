import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchEgsGame } from '@/lib/erogamescape';

/**
 * Cover resolver for EGS games. EGS records external-shop ids on each game
 * (DMM, Suruga-ya, DLsite, gyutto, banner_url) but stores no cover of its own
 * beyond the `image.php` redirector — which 404s a lot for older entries.
 *
 * One canonical URL per site (no guessing variants). Order: curated banner_url
 * → EGS redirector → external shops. EGS's `image.php` is the only candidate
 * we can probe reliably; the shop CDNs (Suruga-ya, DMM, …) sit behind
 * Cloudflare bot protection and refuse server-side probes, but the user's
 * browser can load them via the standard <img> path. So we probe what we can,
 * and for sources we can't probe we trust the URL and let the browser be the
 * final arbiter (SafeImage's onError handles the rare miss).
 *
 * The resolved URL is cached in `vndb_cache` (7-day TTL) keyed by EGS id, so
 * a successful resolve runs at most once per game per week.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EGS_BASE = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki';
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const NEGATIVE_TTL_MS = 24 * 3600 * 1000;
const PROBE_TIMEOUT_MS = 4000;

interface CacheRow {
  body: string;
  expires_at: number;
}

function readCached(key: string): string | null | undefined {
  const row = db
    .prepare('SELECT body, expires_at FROM vndb_cache WHERE cache_key = ?')
    .get(key) as CacheRow | undefined;
  if (!row || row.expires_at < Date.now()) return undefined;
  try {
    const parsed = JSON.parse(row.body) as { url: string | null };
    return parsed.url;
  } catch {
    return undefined;
  }
}

function writeCached(key: string, url: string | null, ttl: number): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key, JSON.stringify({ url }), now, now + ttl);
}

/** Returns true only when the URL resolves to a real image (not an error page). */
async function probeImage(url: string): Promise<boolean> {
  for (const method of ['HEAD', 'GET'] as const) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: 'follow',
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : {},
      });
      if (!res.ok) {
        if (method === 'GET') return false;
        continue;
      }
      const ct = (res.headers.get('content-type') ?? '').toLowerCase();
      if (ct.startsWith('image/')) return true;
      if (method === 'GET') return false;
    } catch {
      if (method === 'GET') return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/**
 * One method per shop. Each returns the canonical cover URL the shop publishes
 * (or null if it doesn't know the game). `probe` says whether the URL can be
 * verified server-side — set false for sites that refuse non-browser clients.
 */
interface CoverSource {
  name: string;
  probe: boolean;
  resolve(raw: Record<string, string | null>, egsId: number): string | null;
}

const SOURCES: CoverSource[] = [
  {
    name: 'banner',
    probe: true,
    resolve(raw) {
      const url = typeof raw.banner_url === 'string' ? raw.banner_url.trim() : '';
      return /^https?:\/\//i.test(url) ? url : null;
    },
  },
  {
    name: 'egs',
    probe: true,
    resolve(_raw, egsId) {
      return `${EGS_BASE}/image.php?game=${egsId}`;
    },
  },
  {
    name: 'surugaya',
    probe: false,
    resolve(raw) {
      const id = typeof raw.surugaya_1 === 'string' ? raw.surugaya_1.trim() : '';
      if (!id || !/^\d+$/.test(id) || id === '0') return null;
      return `https://www.suruga-ya.jp/database/pics/game/${id}.jpg`;
    },
  },
  {
    name: 'dmm',
    probe: false,
    resolve(raw) {
      const id = typeof raw.dmm === 'string' ? raw.dmm.trim() : '';
      if (!id || !/^[\w-]+$/.test(id)) return null;
      return `https://pics.dmm.co.jp/digital/pcgame/${id}/${id}pl.jpg`;
    },
  },
  {
    name: 'dlsite',
    probe: false,
    resolve(raw) {
      const id = typeof raw.dlsite_id === 'string' ? raw.dlsite_id.trim().toUpperCase() : '';
      if (!id || !/^[VR][JE]\d+$/.test(id)) return null;
      return `https://img.dlsite.jp/modpub/images2/work/${id.startsWith('R') ? 'doujin' : 'professional'}/${id}/${id}_img_main.jpg`;
    },
  },
  {
    name: 'gyutto',
    probe: false,
    resolve(raw) {
      const id = typeof raw.gyutto_id === 'string' ? raw.gyutto_id.trim() : '';
      if (!id || !/^\d+$/.test(id)) return null;
      return `https://gyutto.com/i/item${id}/package.jpg`;
    },
  },
];

function loadRawRow(egsId: number): Record<string, string | null> {
  const row = db
    .prepare('SELECT raw_json FROM egs_game WHERE egs_id = ? LIMIT 1')
    .get(egsId) as { raw_json: string | null } | undefined;
  if (!row?.raw_json) return {};
  try {
    const parsed = JSON.parse(row.raw_json) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string | null>;
  } catch {
    // ignore — stale snapshot
  }
  return {};
}

/**
 * Anticipated entries and other "not in my collection" EGS rows are not
 * present in `egs_game.raw_json` (that table is keyed off the user's
 * collection). When the local read comes up empty, hit EGS once via
 * `fetchEgsGame` — that helper caches the raw row in `vndb_cache` and
 * returns the full gamelist record, from which we extract the shop ids
 * (banner_url, surugaya_1, dmm, dlsite_id, gyutto_id) the resolver
 * needs. Result is then memoized at the egs-cover level too.
 */
async function loadRawRowWithFallback(egsId: number): Promise<Record<string, string | null>> {
  const cached = loadRawRow(egsId);
  if (Object.keys(cached).length > 0) return cached;
  try {
    const game = await fetchEgsGame(egsId);
    const raw = (game?.raw ?? null) as Record<string, string | null> | null;
    return raw ?? {};
  } catch {
    return {};
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const egsId = Number(id);
  if (!Number.isInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const cacheKey = `egs:cover-resolved:${egsId}`;
  const cached = readCached(cacheKey);
  if (cached === null) return new NextResponse(null, { status: 404 });
  if (typeof cached === 'string' && cached.length > 0) {
    return NextResponse.redirect(cached, 302);
  }

  const raw = await loadRawRowWithFallback(egsId);
  let fallback: string | null = null;
  for (const source of SOURCES) {
    const candidate = source.resolve(raw, egsId);
    if (!candidate) continue;
    if (source.probe) {
      if (await probeImage(candidate)) {
        writeCached(cacheKey, candidate, CACHE_TTL_MS);
        return NextResponse.redirect(candidate, 302);
      }
    } else if (fallback === null) {
      fallback = candidate;
    }
  }

  if (fallback) {
    writeCached(cacheKey, fallback, CACHE_TTL_MS);
    return NextResponse.redirect(fallback, 302);
  }

  writeCached(cacheKey, null, NEGATIVE_TTL_MS);
  return new NextResponse(null, { status: 404 });
}
