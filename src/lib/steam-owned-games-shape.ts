import { asJsonRecord } from './json-shape';
import type { SteamPlaytime } from './steam';

/**
 * Decode Steam GetOwnedGames output into the internal playtime list.
 *
 * @param value Parsed Steam WebAPI payload.
 * @returns Normalized owned games, or `null` when a present envelope is malformed.
 */
export function decodeSteamOwnedGamesResponse(value: unknown): SteamPlaytime[] | null {
  const root = asJsonRecord(value);
  if (!root) return null;
  if (root.response === undefined) return [];
  const response = asJsonRecord(root.response);
  if (!response) return null;
  if (response.games === undefined) return [];
  if (!Array.isArray(response.games)) return null;
  return response.games.flatMap((game) => {
    const row = asJsonRecord(game);
    return row &&
      typeof row.appid === 'number' &&
      Number.isSafeInteger(row.appid) &&
      row.appid > 0 &&
      typeof row.name === 'string' &&
      typeof row.playtime_forever === 'number' &&
      Number.isSafeInteger(row.playtime_forever) &&
      row.playtime_forever >= 0
      ? [{ appid: row.appid, name: row.name, minutes: row.playtime_forever }]
      : [];
  });
}
