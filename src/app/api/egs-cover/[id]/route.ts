import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchEgsGame } from '@/lib/erogamescape';
import { isAllowedHttpTarget as isAllowedTarget } from '@/lib/url-allowlist';

/**
 * Cover resolver for EGS games. EGS records external-shop ids on each game
 * (DMM, Suruga-ya, DLsite, gyutto, banner_url) but stores no cover of its
 * own beyond the `image.php` redirector — which 404s a lot for older or
 * not-yet-released entries.
 *
 * Resolution chain (first hit wins):
 *   1. banner_url published by EGS itself (curated, trusted — no probe).
 *   2. VNDB cover, when this EGS row has a linked VNDB id and that VN's
 *      image_url is mirrored locally. Best quality and most reliable.
 *   3. EGS `image.php?game=<id>` — probed because it 404s often.
 *   4. First available shop URL (Suruga-ya / DMM / DLsite / Gyutto). The
 *      shop CDNs sit behind Cloudflare and refuse server-side probes, so
 *      we trust the URL and let the user's browser be the final arbiter
 *      (SafeImage's onError handles the rare miss).
 *
 * Hits get a 7-day cache. Misses get only 1h so a freshly-published
 * cover surfaces within an hour of being added on EGS or VNDB — the
 * previous 24h negative TTL kept anticipated entries blank for a full
 * day after their banner first appeared.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EGS_BASE = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki';
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 3500;

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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    });
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    return ct.startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface RawRow {
  vn_id?: string | null;
  banner_url?: string | null;
  surugaya_1?: string | null;
  dmm?: string | null;
  dlsite_id?: string | null;
  gyutto_id?: string | null;
}

function readLocalRaw(egsId: number): RawRow {
  const row = db
    .prepare('SELECT vn_id, raw_json FROM egs_game WHERE egs_id = ? LIMIT 1')
    .get(egsId) as { vn_id: string | null; raw_json: string | null } | undefined;
  if (!row) return {};
  const out: RawRow = { vn_id: row.vn_id };
  if (row.raw_json) {
    try {
      const parsed = JSON.parse(row.raw_json) as Record<string, string | null>;
      out.banner_url = parsed.banner_url ?? null;
      out.surugaya_1 = parsed.surugaya_1 ?? null;
      out.dmm = parsed.dmm ?? null;
      out.dlsite_id = parsed.dlsite_id ?? null;
      out.gyutto_id = parsed.gyutto_id ?? null;
    } catch {
      // stale snapshot — fall through with vn_id only
    }
  }
  return out;
}

async function readRawWithFallback(egsId: number): Promise<RawRow> {
  const local = readLocalRaw(egsId);
  if (local.banner_url || local.surugaya_1 || local.dmm || local.dlsite_id || local.gyutto_id) {
    return local;
  }
  try {
    const game = await fetchEgsGame(egsId);
    const raw = (game?.raw ?? {}) as Record<string, string | null>;
    return {
      vn_id: local.vn_id ?? (typeof raw.vndb_id === 'string' ? raw.vndb_id : null),
      banner_url: raw.banner_url ?? null,
      surugaya_1: raw.surugaya_1 ?? null,
      dmm: raw.dmm ?? null,
      dlsite_id: raw.dlsite_id ?? null,
      gyutto_id: raw.gyutto_id ?? null,
    };
  } catch {
    return local;
  }
}

function vndbCoverFor(vnId: string | null | undefined, origin: string): string | null {
  if (!vnId || !/^v\d+$/i.test(vnId)) return null;
  const row = db
    .prepare('SELECT image_url, local_image FROM vn WHERE id = ?')
    .get(vnId) as { image_url: string | null; local_image: string | null } | undefined;
  if (!row) return null;
  // NextResponse.redirect demands an absolute URL — pin the local-file
  // path to the request's own origin so the resolver can be called from
  // any deployment (localhost, LAN, prod).
  if (row.local_image) return `${origin}/api/files/${row.local_image}`;
  return row.image_url ?? null;
}

function shopUrl(raw: RawRow): string | null {
  const surugaya = (raw.surugaya_1 ?? '').trim();
  if (/^\d+$/.test(surugaya) && surugaya !== '0') {
    return `https://www.suruga-ya.jp/database/pics/game/${surugaya}.jpg`;
  }
  const dmm = (raw.dmm ?? '').trim();
  if (/^[\w-]+$/.test(dmm)) {
    return `https://pics.dmm.co.jp/digital/pcgame/${dmm}/${dmm}pl.jpg`;
  }
  const dlsite = (raw.dlsite_id ?? '').trim().toUpperCase();
  if (/^[VR][JE]\d+$/.test(dlsite)) {
    const kind = dlsite.startsWith('R') ? 'doujin' : 'professional';
    return `https://img.dlsite.jp/modpub/images2/work/${kind}/${dlsite}/${dlsite}_img_main.jpg`;
  }
  const gyutto = (raw.gyutto_id ?? '').trim();
  if (/^\d+$/.test(gyutto)) {
    return `https://gyutto.com/i/item${gyutto}/package.jpg`;
  }
  return null;
}

/**
 * Stream the resolved image content back to the caller instead of
 * 302-redirecting. Shop CDNs (Suruga-ya, DMM, DLsite, Gyutto) live
 * behind Cloudflare and Referer-based bot mitigations that can refuse
 * cross-origin <img> loads from localhost, and the browser may also
 * mixed-content-block http://-only fallbacks when this app runs over
 * https. Proxying through the Node server sidesteps both classes of
 * failure — the browser only ever talks to /api/egs-cover/<id>, gets
 * the bytes back with a clean Content-Type, and renders.
 *
 * Local /api/files/<path> hits stay on the same origin so we 302 those
 * directly; only the cross-origin paths fetch + pipe.
 */
/**
 * SSRF allowlist for the egs-cover proxy. Targets come from
 * potentially-attacker-influenced sources (EGS raw_json scraped
 * from the upstream HTML, banner URLs the user typed in). Without
 * a filter, the proxy would happily fetch http://169.254.169.254/...
 * (AWS metadata), http://localhost:5432/... (Postgres), or any
 * intranet service the host can reach.
 *
 * The allowed hosts cover the legitimate sources: VNDB image CDN,
 * VNDB Kana API, EGS image proxies (DLsite, DMM, Gyutto, suruga-ya,
 * etc.). Everything else is rejected.
 */
// Allowlist + gate live in `lib/url-allowlist` so banner / cover /
// downloadToBucket all share the same trusted-source set.

async function proxyImage(target: string, origin: string): Promise<Response> {
  if (target.startsWith(`${origin}/`) || target.startsWith('/')) {
    const absolute = target.startsWith('/') ? `${origin}${target}` : target;
    return NextResponse.redirect(absolute, 302);
  }
  if (!isAllowedTarget(target)) {
    // SSRF defense — never fetch arbitrary URLs server-side.
    return new NextResponse(null, { status: 403 });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const upstream = await fetch(target, {
      method: 'GET',
      signal: ctrl.signal,
      // `manual` would be safer (re-check each Location header), but
      // legitimate image CDNs use 302 to a same-origin variant; we
      // accept the small redirect-chain risk and rely on host
      // allowlist as the primary control.
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 vn-collection/1.0' },
    }).finally(() => clearTimeout(timer));
    if (!upstream.ok || !upstream.body) {
      return new NextResponse(null, { status: 404 });
    }
    const ct = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!ct.toLowerCase().startsWith('image/')) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const egsId = Number(id);
  if (!Number.isInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const origin = new URL(req.url).origin;

  const cacheKey = `egs:cover-resolved:${egsId}`;
  const cached = readCached(cacheKey);
  if (cached === null) return new NextResponse(null, { status: 404 });
  if (typeof cached === 'string' && cached.length > 0) {
    return proxyImage(cached, origin);
  }

  const raw = await readRawWithFallback(egsId);

  // 1) Curated EGS banner — trust it.
  const banner = (raw.banner_url ?? '').trim();
  if (/^https?:\/\//i.test(banner)) {
    writeCached(cacheKey, banner, CACHE_TTL_MS);
    return proxyImage(banner, origin);
  }

  // 2) VNDB cover via linked vn_id.
  const vndbUrl = vndbCoverFor(raw.vn_id, origin);
  if (vndbUrl) {
    writeCached(cacheKey, vndbUrl, CACHE_TTL_MS);
    return proxyImage(vndbUrl, origin);
  }

  // 3) EGS image.php — probe, since it 404s often.
  const egsUrl = `${EGS_BASE}/image.php?game=${egsId}`;
  if (await probeImage(egsUrl)) {
    writeCached(cacheKey, egsUrl, CACHE_TTL_MS);
    return proxyImage(egsUrl, origin);
  }

  // 4) First shop URL — proxy too, so Cloudflare / referer mitigations
  // don't break the browser fetch.
  const shop = shopUrl(raw);
  if (shop) {
    writeCached(cacheKey, shop, CACHE_TTL_MS);
    return proxyImage(shop, origin);
  }

  writeCached(cacheKey, null, NEGATIVE_TTL_MS);
  return new NextResponse(null, { status: 404 });
}
