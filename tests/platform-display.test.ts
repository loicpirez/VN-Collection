/**
 * Pin the platform-display priority chain.
 *
 * Manual QA flagged a regression where every owned-edition surface
 * derived its per-edition platform string independently, allowing
 * drift: the shelf popover, the my-editions section, and the
 * draggable slot tiles each rendered a different value for the
 * same edition. `derivePlatformDisplay` is the single source of
 * truth; these tests pin its contract so the surfaces stay
 * uniform when refactored.
 *
 * Synthetic ids only — no real release / VN references.
 */
import { describe, expect, it } from 'vitest';
import { derivePlatformDisplay } from '@/lib/platform-display';

describe('derivePlatformDisplay', () => {
  it('owned platform set wins over everything else (case C)', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: 'swi',
      releasePlatforms: [],
      releaseId: 'r999001',
    });
    expect(state).toEqual({ kind: 'owned', platform: 'swi' });
  });

  it('owned platform still wins when the release is multi-platform', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: 'ps4',
      releasePlatforms: ['win', 'ps4', 'psv', 'swi'],
      releaseId: 'r999002',
    });
    expect(state).toEqual({ kind: 'owned', platform: 'ps4' });
  });

  it('single-platform release with no pin → release-single', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: null,
      releasePlatforms: ['win'],
      releaseId: 'r999003',
    });
    expect(state).toEqual({ kind: 'release-single', platform: 'win' });
  });

  it('multi-platform release with no pin → choose', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: null,
      releasePlatforms: ['win', 'ps4', 'swi'],
      releaseId: 'r999004',
    });
    expect(state).toEqual({
      kind: 'choose',
      releasePlatforms: ['win', 'ps4', 'swi'],
    });
  });

  it('empty release platforms on a real release → metadata-missing (refresh allowed)', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: null,
      releasePlatforms: [],
      releaseId: 'r999005',
    });
    expect(state).toEqual({ kind: 'metadata-missing', canRefresh: true });
  });

  it('synthetic edition with no platforms → unknown (no refresh)', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: null,
      releasePlatforms: [],
      releaseId: 'synthetic:v999006',
    });
    expect(state).toEqual({ kind: 'unknown' });
  });

  it('empty-string owned platform is treated as unset', () => {
    const state = derivePlatformDisplay({
      ownedPlatform: '   ',
      releasePlatforms: ['win'],
      releaseId: 'r999007',
    });
    expect(state).toEqual({ kind: 'release-single', platform: 'win' });
  });
});
