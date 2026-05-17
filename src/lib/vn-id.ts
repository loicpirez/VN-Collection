import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Canonical VN identifier shape. Accepts:
 *   - VNDB ids: `v\d+` (`v90017`, `v25634`)
 *   - Synthetic EGS-only ids: `egs_\d+` (`egs_12345`)
 *
 * Used by every `/api/*` dynamic route that takes a VN id, so a
 * garbage path component fails fast with a 400 before any DB lookup.
 */
export const VN_ID_RE = /^(v\d+|egs_\d+)$/i;

export function isValidVnId(id: string | null | undefined): id is string {
  return typeof id === 'string' && VN_ID_RE.test(id);
}

export function validateVnIdOr400(id: string | null | undefined): NextResponse | null {
  if (!isValidVnId(id)) {
    return NextResponse.json({ error: 'invalid vn id' }, { status: 400 });
  }
  return null;
}
