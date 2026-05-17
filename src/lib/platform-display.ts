/**
 * Shared platform-display derivation for every owned-edition surface.
 *
 * Every shelf / pool / popover surface that renders a per-edition
 * platform string must funnel through `derivePlatformDisplay` so the
 * priority chain stays uniform. Manual QA flagged surfaces that
 * silently widened to the VN-aggregate platform list ("WIN · PS4 ·
 * PSV · SWI") for a single-SKU owned edition; this helper guarantees
 * we never do that again.
 *
 * Priority (highest first):
 *   1. `ownedPlatform` set — user-pinned physical SKU wins.
 *   2. release has exactly one platform — auto-derived, no ambiguity.
 *   3. release has >1 platforms with no pin — user must choose.
 *   4. release_meta_cache empty:
 *      - release_id startsWith 'synthetic:' → nothing to refresh.
 *      - otherwise → offer the "Refresh releases" action.
 *
 * Falling back to `vn_platforms` (VN-aggregate) is INTENTIONALLY not
 * an option here. The VN-aggregate is the union across every release
 * and is what the user reported as misleading.
 */

export interface PlatformDisplayInput {
  /** Per-edition pin (lowercase VNDB code) or null when unset. */
  ownedPlatform: string | null;
  /** Release-level platforms list, from release_meta_cache. */
  releasePlatforms: string[];
  /** release_id, used to detect synthetic editions. */
  releaseId: string;
}

export type PlatformDisplayState =
  /** Case C — user pinned this SKU. */
  | { kind: 'owned'; platform: string }
  /** Implicit case — the release itself is single-platform. */
  | { kind: 'release-single'; platform: string }
  /** Case B — multi-platform release, no pin yet. */
  | { kind: 'choose'; releasePlatforms: string[] }
  /** Case A — release metadata not yet materialized; refresh is offered for real releases. */
  | { kind: 'metadata-missing'; canRefresh: boolean }
  /** Synthetic edition with no platform info and no remote to refresh. */
  | { kind: 'unknown' };

export function derivePlatformDisplay(
  input: PlatformDisplayInput,
): PlatformDisplayState {
  const { ownedPlatform, releasePlatforms, releaseId } = input;
  if (ownedPlatform && ownedPlatform.trim().length > 0) {
    return { kind: 'owned', platform: ownedPlatform };
  }
  if (releasePlatforms.length === 1) {
    return { kind: 'release-single', platform: releasePlatforms[0] };
  }
  if (releasePlatforms.length > 1) {
    return { kind: 'choose', releasePlatforms };
  }
  // releasePlatforms.length === 0 — distinguish synthetic from missing.
  const isSynthetic = releaseId.startsWith('synthetic:');
  if (isSynthetic) {
    return { kind: 'unknown' };
  }
  return { kind: 'metadata-missing', canRefresh: true };
}
