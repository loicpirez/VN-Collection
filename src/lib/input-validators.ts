/**
 * Successful validation carrying the normalized value.
 */
export interface ValidationOk<T> {
  ok: true;
  value: T;
}

/**
 * Failed validation carrying a client-facing 400 message. The message is
 * static and field-scoped so a route can forward it verbatim without
 * leaking input back to the caller.
 */
export interface ValidationErr {
  ok: false;
  error: string;
}

/**
 * Discriminated result returned by every validator in this module.
 */
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

function ok<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

function err(error: string): ValidationErr {
  return { ok: false, error };
}

/**
 * Upper bound for a UTC-ms timestamp accepted by `validateIsoDate`:
 * one year past the current instant. Mirrors the `logged_at` ceiling in
 * `api/collection/[id]/game-log/route.ts` so a far-future timestamp is
 * rejected rather than persisted.
 */
const FUTURE_MS_WINDOW = 365 * 86_400_000;

/**
 * Validate a free-text string. Rejects non-strings, trims surrounding
 * whitespace (matching the route convention of trimming before length
 * checks), then enforces the byte/length bounds against the trimmed
 * value. `allowEmpty` defaults to `false`, so a string that is empty
 * after trimming is rejected unless explicitly allowed. `min` defaults
 * to `1` when `allowEmpty` is false and `0` when it is true.
 */
export function validateText(
  value: unknown,
  opts: { field: string; max: number; min?: number; allowEmpty?: boolean },
): ValidationResult<string> {
  if (typeof value !== 'string') return err(`${opts.field} must be a string`);
  const trimmed = value.trim();
  const allowEmpty = opts.allowEmpty ?? false;
  const min = opts.min ?? (allowEmpty ? 0 : 1);
  if (trimmed.length === 0) {
    if (allowEmpty) return ok('');
    return err(`${opts.field} is required`);
  }
  if (trimmed.length < min) return err(`${opts.field} too short (min ${min})`);
  if (trimmed.length > opts.max) return err(`${opts.field} too long (max ${opts.max})`);
  return ok(trimmed);
}

/**
 * Validate a timestamp expressed EITHER as a UTC-ms integer
 * (`Date.now()`-style, the canonical form the app persists for
 * `logged_at`) OR an ISO-8601 date/datetime string, and normalize to a
 * UTC-ms integer. Rejects values <= 0, anything more than a year in the
 * future, non-finite numbers, and strings that do not round-trip through
 * `Date`.
 */
export function validateIsoDate(value: unknown): ValidationResult<number> {
  let ms: number;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return err('logged_at must be a finite timestamp');
    if (!Number.isInteger(value)) return err('logged_at must be an integer timestamp');
    ms = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return err('logged_at is required');
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return err('logged_at must be an ISO-8601 date');
    ms = parsed;
  } else {
    return err('logged_at must be a number or ISO-8601 string');
  }
  if (ms <= 0) return err('logged_at must be after the Unix epoch');
  if (ms > Date.now() + FUTURE_MS_WINDOW) return err('logged_at is too far in the future');
  return ok(ms);
}

/**
 * Validate a bounded safe integer. Rejects non-numbers, non-integers,
 * values outside `[min, max]`, and integers beyond
 * `Number.MAX_SAFE_INTEGER` (where integer precision is lost).
 */
export function validateSafeInt(
  value: unknown,
  opts: { field: string; min: number; max: number },
): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return err(`${opts.field} must be an integer`);
  }
  if (!Number.isSafeInteger(value)) return err(`${opts.field} is out of safe integer range`);
  if (value < opts.min || value > opts.max) {
    return err(`${opts.field} must be between ${opts.min} and ${opts.max}`);
  }
  return ok(value);
}

/**
 * Documented shapes accepted by `validateTokenShape`:
 *
 *   - `steam_api_key` — 32 hexadecimal characters, as issued at
 *     https://steamcommunity.com/dev/apikey.
 *   - `steam_id` — a 17-digit steamID64.
 *   - `vndb_token` — an opaque token up to 200 chars with no embedded
 *     whitespace or double-quote, matching the shape accepted by the
 *     settings PATCH route.
 */
export type TokenKind = 'steam_api_key' | 'steam_id' | 'vndb_token';

const STEAM_API_KEY = /^[0-9a-fA-F]{32}$/;
const STEAM_ID64 = /^\d{17}$/;
const VNDB_TOKEN_FORBIDDEN = /[\s"]/;

/**
 * Validate a credential against its documented shape and return the
 * normalized (trimmed) value. Steam API key must be 32 hex chars; steam
 * id must be a 17-digit steamID64; vndb token must be a non-empty string
 * up to 200 chars containing no whitespace or double-quote.
 */
export function validateTokenShape(value: unknown, kind: TokenKind): ValidationResult<string> {
  if (typeof value !== 'string') return err(`${kind} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return err(`${kind} is required`);
  switch (kind) {
    case 'steam_api_key':
      return STEAM_API_KEY.test(trimmed)
        ? ok(trimmed)
        : err('steam_api_key must be 32 hexadecimal characters');
    case 'steam_id':
      return STEAM_ID64.test(trimmed)
        ? ok(trimmed)
        : err('steam_id must be a 17-digit steamID64');
    case 'vndb_token':
      if (trimmed.length > 200 || VNDB_TOKEN_FORBIDDEN.test(trimmed)) {
        return err('vndb_token must be at most 200 chars with no whitespace');
      }
      return ok(trimmed);
  }
}
