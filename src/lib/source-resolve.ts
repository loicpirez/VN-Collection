/**
 * Resolve a per-field value between VNDB and ErogameScape.
 *
 * Rules:
 *   - Explicit preference (`'vndb' | 'egs'`) wins when that side has a value.
 *   - When the preferred side is empty (null / undefined / empty string / empty array),
 *     fall back to the OTHER side so the user never loses data.
 *   - `'auto'` (or unset) defaults to VNDB-first with the same EGS fallback.
 *
 * The function is symmetric, so passing the same args with the prefs swapped
 * yields the other side. Used for description, image, brand, etc.
 */

export type SourceChoice = 'auto' | 'vndb' | 'egs';

export interface ResolvedField<T> {
  value: T | null;
  /** Which side actually supplied the value. `null` when both were empty. */
  used: 'vndb' | 'egs' | null;
  /** True when the active source had no value and we fell back to the other side. */
  fellBack: boolean;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function resolveField<T>(
  vndb: T | null | undefined,
  egs: T | null | undefined,
  pref: SourceChoice = 'auto',
): ResolvedField<T> {
  const vndbHas = !isEmpty(vndb);
  const egsHas = !isEmpty(egs);
  const want: 'vndb' | 'egs' = pref === 'egs' ? 'egs' : 'vndb';
  if (want === 'vndb') {
    if (vndbHas) return { value: vndb as T, used: 'vndb', fellBack: false };
    if (egsHas) return { value: egs as T, used: 'egs', fellBack: true };
  } else {
    if (egsHas) return { value: egs as T, used: 'egs', fellBack: false };
    if (vndbHas) return { value: vndb as T, used: 'vndb', fellBack: true };
  }
  return { value: null, used: null, fellBack: false };
}
