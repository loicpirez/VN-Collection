/**
 * R5-149 pin: dead exports / dead files are gone.
 *
 *   - `src/lib/loading-state.ts` — exported `LoadingState`,
 *     `INITIAL_LOADING_STATE`, `pickLoadingView`, but no
 *     production caller imported any of them. Removed.
 *   - `tests/loading-state-helpers.test.ts` — only consumer of
 *     the module. Removed alongside.
 *   - `src/components/cardData.ts:toCardDataLite` — exported but
 *     never imported. `toCardData` stays (heavily used).
 *   - `src/lib/download-status.ts:activeJobs` — exported but
 *     never imported.
 *   - `src/components/DetailSectionFrame.tsx` — entire 400-line
 *     file unused. Removed.
 *
 * Pinning via existsSync + grep ensures a re-introduction would
 * fail CI.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('R5-149 — dead exports / files removed', () => {
  it('src/lib/loading-state.ts is removed', () => {
    expect(existsSync(join(ROOT, 'src/lib/loading-state.ts'))).toBe(false);
  });

  it('tests/loading-state-helpers.test.ts is removed', () => {
    expect(existsSync(join(ROOT, 'tests/loading-state-helpers.test.ts'))).toBe(false);
  });

  it('src/components/DetailSectionFrame.tsx is removed', () => {
    expect(existsSync(join(ROOT, 'src/components/DetailSectionFrame.tsx'))).toBe(false);
  });

  it('cardData.ts no longer exports toCardDataLite', () => {
    const src = readFileSync(join(ROOT, 'src/components/cardData.ts'), 'utf8');
    expect(src).not.toMatch(/export\s+function\s+toCardDataLite\b/);
  });

  it('download-status.ts no longer exports activeJobs', () => {
    const src = readFileSync(join(ROOT, 'src/lib/download-status.ts'), 'utf8');
    expect(src).not.toMatch(/export\s+function\s+activeJobs\b/);
  });
});
