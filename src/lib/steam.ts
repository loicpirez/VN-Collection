import 'server-only';
import { getAppSetting } from './db';
import { isAllowedHttpTarget } from './url-allowlist';

/**
 * Steam playtime sync — scaffolded. The runtime hits the public WebAPI
 * GetOwnedGames endpoint with the user's stored Steam API key + 64-bit
 * SteamID and returns a map appid → minutes played.
 *
 * The matching VN → Steam appid resolution lives client-side: the user
 * confirms each suggestion before its playtime is merged into the local
 * collection row, so a wrong match never silently overwrites manually-
 * tracked time.
 *
 * Settings keys (stored in app_setting):
 *   - steam_api_key   — issued at https://steamcommunity.com/dev/apikey
 *   - steam_id        — 64-bit SteamID of the user
 */
export interface SteamPlaytime {
  appid: number;
  name: string;
  /** Total minutes played, ever. Steam's `playtime_forever` is in minutes. */
  minutes: number;
}

export interface SteamConfig {
  apiKey: string | null;
  steamId: string | null;
}

export function readSteamConfig(): SteamConfig {
  return {
    apiKey: getAppSetting('steam_api_key'),
    steamId: getAppSetting('steam_id'),
  };
}

export async function fetchOwnedGames(): Promise<SteamPlaytime[]> {
  const cfg = readSteamConfig();
  if (!cfg.apiKey || !cfg.steamId) {
    throw new Error('Steam not configured — set steam_api_key and steam_id in app settings');
  }
  // Steam's Web API requires the key as a URL query parameter (no
  // Authorization header support). We build the URL in a local
  // string and NEVER include it in thrown errors or logs — only the
  // status code surfaces. The fetch agent itself is presumed
  // trusted; downstream consumers see appid + minutes only.
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(cfg.apiKey)}&steamid=${encodeURIComponent(cfg.steamId)}&include_appinfo=1&format=json`;
  if (!isAllowedHttpTarget(url)) {
    throw new Error('Steam fetch blocked: host not on SSRF allowlist');
  }
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    // Strip the URL from network-level errors so the key never lands
    // in a stack trace.
    throw new Error(`Steam fetch failed: ${(e as Error).message.replace(/key=[^&\s]+/g, 'key=***')}`);
  }
  if (!res.ok) throw new Error(`Steam HTTP ${res.status}`);
  const data = (await res.json()) as {
    response?: { games?: { appid: number; name: string; playtime_forever: number }[] };
  };
  return (data.response?.games ?? []).map((g) => ({
    appid: g.appid,
    name: g.name,
    minutes: g.playtime_forever,
  }));
}

/**
 * For each VN in the collection that has a Steam extlink, lookup the
 * corresponding Steam appid in the owned-games list and return the
 * deltas to be applied. The merge itself is *not* automatic — caller
 * confirms.
 */
export interface SteamSuggestion {
  vn_id: string;
  vn_title: string;
  steam_appid: number;
  steam_name: string;
  current_minutes: number;
  steam_minutes: number;
  delta: number;
}

import { db, getSteamLinkForVn, listSteamLinks, markSteamSynced, setSteamLink } from './db';
import { cachedFetch, TTL } from './vndb-cache';

const VNDB_API = 'https://api.vndb.org/kana';

/**
 * VNDB's VN.extlinks aggregator does *not* include Steam — those links
 * live only on the release-level extlinks. To match a Steam appid back to
 * a local VN we therefore need to ask VNDB:
 *
 *   "For my collection's VN ids, which releases carry a Steam extlink?"
 *
 * That's a single (batched) /release call rather than N per-VN fetches.
 * VNDB caps "or" predicates around 1000, so we chunk by 80 VN ids to
 * stay well under and keep responses small.
 *
 * The resolved (vn → appid, name) pairs are upserted into the local
 * `steam_link` table with `source='auto'`; manual links are preserved.
 */
async function fetchSteamLinksForCollection(): Promise<Map<string, { appid: number; name: string }>> {
  const ids = (db.prepare(`SELECT vn_id FROM collection WHERE vn_id LIKE 'v%'`).all() as { vn_id: string }[]).map((r) => r.vn_id);
  if (ids.length === 0) return new Map();
  const linksByVn = new Map<string, { appid: number; name: string }>();
  const batchSize = 80;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const vnFilter = batch.length === 1
      ? ['vn', '=', ['id', '=', batch[0]]]
      : ['or', ...batch.map((id) => ['vn', '=', ['id', '=', id]])];
    const body = {
      filters: ['and', ['extlink', '=', 'steam'], vnFilter],
      fields: 'title, extlinks{url,name,id}, vns{id}',
      results: 100,
    };
    const r = await cachedFetch<{ results: { title: string; extlinks: { url: string; name: string; id?: string | number }[]; vns: { id: string }[] }[] }>(
      `${VNDB_API}/release`,
      {
        __pathTag: 'POST /release:steam',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ttlMs: TTL.releases },
    );
    for (const rel of r.data.results) {
      const steamLink = rel.extlinks.find((l) => l.name === 'steam');
      if (!steamLink) continue;
      let appid: number | null = null;
      if (typeof steamLink.id === 'number') appid = steamLink.id;
      else if (typeof steamLink.id === 'string' && /^\d+$/.test(steamLink.id)) appid = Number(steamLink.id);
      else {
        const m = /\/app\/(\d+)/.exec(steamLink.url);
        if (m) appid = Number(m[1]);
      }
      if (!appid) continue;
      for (const v of rel.vns ?? []) {
        // Keep the first appid we find per VN. A VN with multiple Steam
        // releases (e.g. dual-language) gets matched to the first hit;
        // that's acceptable since playtime aggregates across releases on
        // the same Steam account anyway.
        if (!linksByVn.has(v.id)) linksByVn.set(v.id, { appid, name: rel.title });
      }
    }
  }
  // Persist as auto-source links (setSteamLink preserves any manual link).
  for (const [vnId, { appid, name }] of linksByVn) {
    setSteamLink({ vnId, appid, steamName: name, source: 'auto' });
  }
  return linksByVn;
}

/**
 * Build the list of `vn ↔ steam appid` matches by joining the user's
 * Steam library against VNDB's release extlinks for the collection.
 *
 * Returns one suggestion per matched VN with the Steam playtime, the
 * current local playtime, and the delta the user would apply. Skips
 * matches where steam < current (we never reduce — locally-logged time
 * may include Steam-less sessions).
 */
export async function computeSteamSuggestions(steamGames: SteamPlaytime[]): Promise<SteamSuggestion[]> {
  const byAppid = new Map(steamGames.map((g) => [g.appid, g]));

  // Run the auto-detection pass so any new Steam links land in the DB.
  // Failures are non-fatal — we still surface manual links below.
  try { await fetchSteamLinksForCollection(); } catch { /* VNDB may be slow */ }

  // Read every persisted link (auto + manual) — the source of truth.
  const links = listSteamLinks();
  if (links.length === 0) return [];

  // Pull title + current playtime for every linked VN in one query.
  const ids = links.map((l) => l.vn_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT v.id AS vn_id, v.title AS vn_title, c.playtime_minutes AS current
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.vn_id IN (${placeholders})
    `)
    .all(...ids) as Array<{ vn_id: string; vn_title: string; current: number | null }>;
  const titles = new Map(rows.map((r) => [r.vn_id, { title: r.vn_title, current: r.current ?? 0 }]));

  const out: SteamSuggestion[] = [];
  for (const link of links) {
    const meta = titles.get(link.vn_id);
    if (!meta) continue;
    const game = byAppid.get(link.appid);
    if (!game) continue;
    const delta = game.minutes - meta.current;
    if (delta <= 0) continue;
    out.push({
      vn_id: link.vn_id,
      vn_title: meta.title,
      steam_appid: link.appid,
      steam_name: game.name,
      current_minutes: meta.current,
      steam_minutes: game.minutes,
      delta,
    });
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/**
 * Return every Steam game NOT already linked to a VN. The /steam UI uses
 * this to surface a search/assign affordance per game so the user can map
 * Steam-only titles (no VNDB Steam release) to their local VN.
 */
export interface UnlinkedSteamGame {
  appid: number;
  name: string;
  minutes: number;
}

export function listUnlinkedSteamGames(steamGames: SteamPlaytime[]): UnlinkedSteamGame[] {
  const linked = new Set(listSteamLinks().map((l) => l.appid));
  return steamGames
    .filter((g) => !linked.has(g.appid))
    .filter((g) => g.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .map((g) => ({ appid: g.appid, name: g.name, minutes: g.minutes }));
}

/**
 * Search the user's collection by title (case-insensitive substring).
 * Used by the /steam page to look up a candidate VN for a manual assign.
 */
export function searchCollectionByTitle(query: string, limit = 12): Array<{ id: string; title: string; alttitle: string | null }> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];
  const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  return db
    .prepare(`
      SELECT v.id, v.title, v.alttitle
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE v.title LIKE ? ESCAPE '\\' OR v.alttitle LIKE ? ESCAPE '\\'
      ORDER BY v.title COLLATE NOCASE
      LIMIT ?
    `)
    .all(like, like, limit) as Array<{ id: string; title: string; alttitle: string | null }>;
}

/** Used by the apply step to record the sync. */
export function recordSync(vnId: string, minutes: number): void {
  markSteamSynced(vnId, minutes);
}

/** Re-export for the API route. */
export { getSteamLinkForVn };
