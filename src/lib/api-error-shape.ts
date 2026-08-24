/** Canonical machine-readable error payload emitted by API routes. */
export interface ApiErrorBody {
  /** Discriminator that prevents an error payload from being confused with a success body. */
  ok: false;
  /** Sanitized human-readable fallback message. */
  error: string;
  /** Stable machine-readable reason. */
  code: string;
  /** Stable route or operation context. */
  context: string;
  /** Optional safe detail intended for user-visible diagnostics. */
  detail?: string;
}

/** Normalized result accepted from canonical and legacy API error payloads. */
export interface DecodedApiErrorBody {
  ok: false;
  error: string;
  code: string | null;
  context: string | null;
  detail: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Build the canonical API error payload used by new and migrated routes.
 *
 * @param error Sanitized user-facing fallback message.
 * @param code Stable machine-readable reason.
 * @param context Stable route or operation context.
 * @param detail Optional safe diagnostic detail.
 * @returns A discriminated API error body.
 */
export function apiErrorBody(error: string, code: string, context: string, detail?: string): ApiErrorBody {
  return {
    ok: false,
    error,
    code,
    context,
    ...(detail !== undefined ? { detail } : {}),
  };
}

/**
 * Decode a canonical API error or a legacy `{ error, code? }` payload.
 * Legacy compatibility lets routes migrate independently without weakening the
 * client contract. A present `ok` discriminator must be exactly `false`.
 *
 * @param value Untrusted JSON value.
 * @returns The normalized error payload, or `null` when the shape is invalid.
 */
export function decodeApiErrorBody(value: unknown): DecodedApiErrorBody | null {
  if (!isRecord(value)) return null;
  if (value.ok !== undefined && value.ok !== false) return null;
  const error = optionalNonEmptyString(value.error);
  if (!error) return null;
  return {
    ok: false,
    error,
    code: optionalNonEmptyString(value.code),
    context: optionalNonEmptyString(value.context),
    detail: optionalNonEmptyString(value.detail),
  };
}
