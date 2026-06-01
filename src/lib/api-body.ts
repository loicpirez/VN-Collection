import 'server-only';
import type { NextRequest } from 'next/server';
import { readBodyWithLimit } from './read-limited-body';

const MAX_JSON_BODY_BYTES = 1024 * 1024;

/**
 * R5-148 — consistent request body parsing.
 *
 * Every `/api/*` POST/PATCH/PUT route used to do one of:
 *
 *   const body = (await req.json().catch(() => ({}))) as { name?: string };
 *   const body = (await req.json()) as ExportPayload;
 *
 * Both shapes have edge-case gaps:
 *   - `.catch(() => ({}))` substitutes `{}` only on parse failure.
 *     If the client sends a literal `null` body, `req.json()`
 *     resolves successfully to `null`, and reading `body.name` on
 *     `null` throws.
 *   - The bare `await req.json()` form throws on a missing /
 *     malformed body, which most callers don't want to crash on
 *     (they want a 400 with an explanation).
 *
 * `readJsonObject(req)` normalises both into a plain `Record<string,
 * unknown>` (empty object if the body is missing / oversized / `null`
 * / not an object) so the caller can safely narrow each field with
 * `typeof` checks before using it.
 */
export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    const body = await readBodyWithLimit(req, MAX_JSON_BODY_BYTES);
    parsed = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}
