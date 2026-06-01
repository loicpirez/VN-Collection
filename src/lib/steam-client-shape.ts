import { asJsonRecord } from './json-shape';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_STEAM_ROWS = 10_000;

/** Playtime update proposed by Steam synchronization. */
export interface SteamSuggestion {
  vn_id: string;
  vn_title: string;
  steam_appid: number;
  steam_name: string;
  current_minutes: number;
  steam_minutes: number;
  delta: number;
}

/** Persisted local mapping between one VN and one Steam app. */
export interface SteamLink {
  vn_id: string;
  appid: number;
  steam_name: string;
  source: 'auto' | 'manual';
  last_synced_minutes: number | null;
  created_at: number;
  updated_at: number;
}

/** Owned Steam game without a local VN mapping. */
export interface UnlinkedSteamGame {
  appid: number;
  name: string;
  minutes: number;
}

/** Steam preview result, including structured upstream failures. */
export type SteamSyncPreview =
  | { ok: true; suggestions: SteamSuggestion[] }
  | { ok: false; error: string; code: string | null };

/** Steam library result, including structured upstream failures. */
export type SteamLibraryResult =
  | { ok: true; games: UnlinkedSteamGame[] }
  | { ok: false; error: string };

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function decodeArray<T>(value: unknown, decode: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_STEAM_ROWS) return null;
  const rows: T[] = [];
  for (const row of value) {
    const decoded = decode(row);
    if (!decoded) return null;
    rows.push(decoded);
  }
  return rows;
}

function decodeSuggestion(value: unknown): SteamSuggestion | null {
  const row = asJsonRecord(value);
  return row &&
    typeof row.vn_id === 'string' &&
    isValidVnId(row.vn_id) &&
    typeof row.vn_title === 'string' &&
    isPositiveInteger(row.steam_appid) &&
    typeof row.steam_name === 'string' &&
    isNonNegativeInteger(row.current_minutes) &&
    isNonNegativeInteger(row.steam_minutes) &&
    isPositiveInteger(row.delta)
    ? {
        vn_id: normalizeVnId(row.vn_id),
        vn_title: row.vn_title,
        steam_appid: row.steam_appid,
        steam_name: row.steam_name,
        current_minutes: row.current_minutes,
        steam_minutes: row.steam_minutes,
        delta: row.delta,
      }
    : null;
}

function decodeLink(value: unknown): SteamLink | null {
  const row = asJsonRecord(value);
  return row &&
    typeof row.vn_id === 'string' &&
    isValidVnId(row.vn_id) &&
    isPositiveInteger(row.appid) &&
    typeof row.steam_name === 'string' &&
    (row.source === 'auto' || row.source === 'manual') &&
    isNullableNonNegativeInteger(row.last_synced_minutes) &&
    isNonNegativeInteger(row.created_at) &&
    isNonNegativeInteger(row.updated_at)
    ? {
        vn_id: normalizeVnId(row.vn_id),
        appid: row.appid,
        steam_name: row.steam_name,
        source: row.source,
        last_synced_minutes: row.last_synced_minutes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    : null;
}

function decodeGame(value: unknown): UnlinkedSteamGame | null {
  const row = asJsonRecord(value);
  return row && isPositiveInteger(row.appid) && typeof row.name === 'string' && isNonNegativeInteger(row.minutes)
    ? { appid: row.appid, name: row.name, minutes: row.minutes }
    : null;
}

/**
 * Decode the Steam synchronization preview.
 *
 * @param value Parsed local API payload.
 * @returns Safe preview or structured failure, or `null` for malformed input.
 */
export function decodeSteamSyncPreview(value: unknown): SteamSyncPreview | null {
  const row = asJsonRecord(value);
  if (!row || typeof row.ok !== 'boolean') return null;
  if (!row.ok) {
    return typeof row.error === 'string' && (row.code === undefined || typeof row.code === 'string')
      ? { ok: false, error: row.error, code: row.code ?? null }
      : null;
  }
  const suggestions = decodeArray(row.suggestions, decodeSuggestion);
  return suggestions ? { ok: true, suggestions } : null;
}

/**
 * Decode the unlinked Steam-library response.
 *
 * @param value Parsed local API payload.
 * @returns Safe library result, or `null` for malformed input.
 */
export function decodeSteamLibraryResult(value: unknown): SteamLibraryResult | null {
  const row = asJsonRecord(value);
  if (!row || typeof row.ok !== 'boolean') return null;
  if (!row.ok) return typeof row.error === 'string' ? { ok: false, error: row.error } : null;
  const games = decodeArray(row.games, decodeGame);
  return games ? { ok: true, games } : null;
}

/**
 * Decode persisted Steam links.
 *
 * @param value Parsed local API payload.
 * @returns Safe links, or `null` for malformed input.
 */
export function decodeSteamLinks(value: unknown): SteamLink[] | null {
  return decodeArray(asJsonRecord(value)?.links, decodeLink);
}

/**
 * Decode the applied Steam-playtime update count.
 *
 * @param value Parsed local API payload.
 * @returns Applied count, or `null` for malformed input.
 */
export function decodeSteamAppliedCount(value: unknown): number | null {
  const applied = asJsonRecord(value)?.applied;
  return isNonNegativeInteger(applied) ? applied : null;
}
