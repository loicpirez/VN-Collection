import 'server-only';
import { NextResponse } from 'next/server';
import {
  VN_ID_RE,
  VNDB_VN_ID_RE,
  isValidVnId,
  isVndbVnId,
  normalizeVnId,
} from './vn-id-shape';

// Re-export the pure validators so server callers can keep
// importing from `@/lib/vn-id` exactly as before. The actual
// implementations live in `./vn-id-shape` (no `'server-only'`),
// which is what client components import directly.
export { VN_ID_RE, VNDB_VN_ID_RE, isValidVnId, isVndbVnId, normalizeVnId };

/**
 * Server-only: build a 400 `NextResponse` when the id is invalid.
 * Uses `next/server`'s `NextResponse`, so it cannot be imported
 * from client components — `validateVnIdOr400` stays here and the
 * `'server-only'` guard at the top of the file blocks any
 * accidental client import.
 */
export function validateVnIdOr400(id: string | null | undefined): NextResponse | null {
  if (!isValidVnId(id)) {
    return NextResponse.json({ error: 'invalid vn id' }, { status: 400 });
  }
  return null;
}
