import type { ValidationResult } from '@/lib/input-validators';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

/**
 * Validate and normalize the VN plus release identity used by shelf placement
 * routes.
 *
 * @param vnId Raw VN identifier.
 * @param releaseId Raw owned-release identifier.
 * @returns A lowercase VN and release identity accepted by persistence.
 */
export function parseOwnedReleaseIdentity(
  vnId: unknown,
  releaseId: unknown,
): ValidationResult<{ vnId: string; releaseId: string }> {
  if (typeof vnId !== 'string' || vnId.length === 0 || vnId.length > 64 || !isValidVnId(vnId)) {
    return { ok: false, error: 'invalid vn_id' };
  }
  if (typeof releaseId !== 'string' || releaseId.length === 0 || releaseId.length > 64) {
    return { ok: false, error: 'invalid release_id' };
  }
  const normalizedVnId = normalizeVnId(vnId);
  const normalizedReleaseId = releaseId.toLowerCase();
  if (!/^r\d+$/.test(normalizedReleaseId) && normalizedReleaseId !== `synthetic:${normalizedVnId}`) {
    return { ok: false, error: 'invalid release_id' };
  }
  return { ok: true, value: { vnId: normalizedVnId, releaseId: normalizedReleaseId } };
}
