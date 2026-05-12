import 'server-only';
import { getAppSetting } from './db';

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
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${cfg.apiKey}&steamid=${cfg.steamId}&include_appinfo=1&format=json`;
  const res = await fetch(url, { cache: 'no-store' });
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

import { db } from './db';

/**
 * Build the list of `vn ↔ steam appid` matches by scanning extlinks JSON
 * on the vn table. VNDB extlink names for Steam are stable: `steam`.
 *
 * Returns one suggestion per matched VN with the Steam playtime, the
 * current local playtime, and the delta the user would apply. Skips
 * matches where steam < current (we never reduce — locally-logged time
 * may include Steam-less sessions).
 */
export function computeSteamSuggestions(steamGames: SteamPlaytime[]): SteamSuggestion[] {
  const byAppid = new Map(steamGames.map((g) => [g.appid, g]));
  const rows = db
    .prepare(`
      SELECT v.id AS vn_id, v.title AS vn_title, v.extlinks AS extlinks,
             c.playtime_minutes AS current
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE v.extlinks IS NOT NULL
    `)
    .all() as Array<{ vn_id: string; vn_title: string; extlinks: string | null; current: number | null }>;
  const out: SteamSuggestion[] = [];
  for (const r of rows) {
    if (!r.extlinks) continue;
    let parsed: { url: string; name: string }[];
    try { parsed = JSON.parse(r.extlinks); } catch { continue; }
    const steamLink = parsed.find((l) => l && l.name === 'steam');
    if (!steamLink) continue;
    const m = /\/app\/(\d+)/.exec(steamLink.url);
    if (!m) continue;
    const appid = Number(m[1]);
    const game = byAppid.get(appid);
    if (!game) continue;
    const current = r.current ?? 0;
    const delta = game.minutes - current;
    if (delta <= 0) continue;
    out.push({
      vn_id: r.vn_id,
      vn_title: r.vn_title,
      steam_appid: appid,
      steam_name: game.name,
      current_minutes: current,
      steam_minutes: game.minutes,
      delta,
    });
  }
  return out.sort((a, b) => b.delta - a.delta);
}
