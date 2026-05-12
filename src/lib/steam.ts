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
}
