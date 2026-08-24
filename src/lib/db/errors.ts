/** Stable database failure codes exposed without driver-specific details. */
export type DatabaseErrorCode =
  | 'db_unique_conflict'
  | 'db_reference_conflict'
  | 'db_retryable_conflict'
  | 'db_timeout'
  | 'db_unavailable'
  | 'db_internal';

/** Sanitized HTTP-facing classification for one PostgreSQL failure. */
export interface DatabaseErrorDescriptor {
  /** Stable code suitable for localized client mapping. */
  code: DatabaseErrorCode;
  /** HTTP status matching the retry/conflict semantics. */
  status: 409 | 500 | 503;
  /** Non-sensitive fallback for clients without a localized code mapping. */
  message: string;
}

const RETRYABLE_CONFLICTS = new Set(['40001', '40P01']);
const TIMEOUT_ERRORS = new Set(['55P03', '57014']);
const UNAVAILABLE_SQLSTATES = new Set(['57P01', '57P02', '57P03']);
const UNAVAILABLE_SYSTEM_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT']);

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = error.code;
  return typeof code === 'string' && code.length > 0 ? code.toUpperCase() : null;
}

/**
 * Classify PostgreSQL SQLSTATE and connection errors without inspecting or
 * returning driver messages, SQL text, relation names, or constraint names.
 *
 * @param error Value thrown by a database operation.
 * @returns A stable descriptor for recognized PostgreSQL errors, otherwise null.
 */
export function normalizeDatabaseError(error: unknown): DatabaseErrorDescriptor | null {
  const code = errorCode(error);
  if (!code) return null;
  if (code === '23505') {
    return { code: 'db_unique_conflict', status: 409, message: 'database conflict' };
  }
  if (code === '23503') {
    return { code: 'db_reference_conflict', status: 409, message: 'related record conflict' };
  }
  if (RETRYABLE_CONFLICTS.has(code)) {
    return { code: 'db_retryable_conflict', status: 409, message: 'database operation must be retried' };
  }
  if (TIMEOUT_ERRORS.has(code)) {
    return { code: 'db_timeout', status: 503, message: 'database request timed out' };
  }
  if (code.startsWith('08') || UNAVAILABLE_SQLSTATES.has(code) || UNAVAILABLE_SYSTEM_CODES.has(code)) {
    return { code: 'db_unavailable', status: 503, message: 'database unavailable' };
  }
  if (/^[0-9A-Z]{5}$/.test(code)) {
    return { code: 'db_internal', status: 500, message: 'internal error' };
  }
  return null;
}
