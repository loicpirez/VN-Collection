/**
 * Pure URL-param helpers for the recommendations `?seed=` slot.
 *
 * Kept separate from the React component so the URL transition logic
 * can be unit-tested without spinning up React or jsdom. The picker
 * component (`VnSeedPicker.tsx`) imports both helpers and pipes the
 * output straight into `router.replace(...)`.
 *
 * Conventions:
 *   - `setSeed(current, vnId)` writes/overwrites `seed=<vnId>` and
 *     preserves every OTHER param in the order it already had.
 *   - `clearSeed(current)` strips the `seed` param entirely; every
 *     other param survives untouched.
 *   - Both helpers return a fresh `URLSearchParams` instance; callers
 *     can `.toString()` it for a navigation URL.
 *   - Invalid VN ids (anything not matching `v\d+` or `egs_\d+`) are
 *     rejected by `setSeed` — the caller gets back the unmodified
 *     params, so a tampered autocomplete row can't poison the URL.
 */

const SEED_PATTERN = /^(v\d+|egs_\d+)$/i;

export function isValidSeedVnId(value: string | null | undefined): boolean {
  if (!value) return false;
  return SEED_PATTERN.test(value);
}

/**
 * Return a fresh `URLSearchParams` derived from `current` with the
 * `seed` slot set to `vnId`. Invalid ids are a no-op (returns a clone
 * of `current`) so the caller's `router.replace` never lands on a
 * URL that the server would reject as `seed=garbage`.
 */
export function setSeed(
  current: URLSearchParams | string | null | undefined,
  vnId: string,
): URLSearchParams {
  const next = cloneParams(current);
  if (!isValidSeedVnId(vnId)) return next;
  next.set('seed', vnId.toLowerCase());
  return next;
}

/**
 * Return a fresh `URLSearchParams` with the `seed` slot removed.
 * Every other param survives. Safe to call when no seed is set —
 * the helper just returns an unchanged clone.
 */
export function clearSeed(
  current: URLSearchParams | string | null | undefined,
): URLSearchParams {
  const next = cloneParams(current);
  next.delete('seed');
  return next;
}

function cloneParams(
  source: URLSearchParams | string | null | undefined,
): URLSearchParams {
  if (source == null) return new URLSearchParams();
  if (typeof source === 'string') return new URLSearchParams(source);
  // `URLSearchParams` is iterable, copy entries to keep a stable order.
  const out = new URLSearchParams();
  source.forEach((value, key) => {
    out.append(key, value);
  });
  return out;
}
