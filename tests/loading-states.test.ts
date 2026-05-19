/**
 * R5-178 pin: every route the row cites ships a `loading.tsx`
 * that renders a non-blank skeleton (Skeleton primitive or
 * `animate-pulse` shimmer) so the user never sees a flash of
 * empty content while the server component is fetching.
 *
 * R5-175 / R5-176 / R5-177 (tab/filter/empty/error coverage)
 * are intentionally NOT pinned here — those rows' "empty/error"
 * branches require Playwright fixtures that force the API to
 * return empty / error responses, beyond what a file-existence
 * sweep can prove. Those rows remain TODO until the runtime
 * fixture lands.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const ROUTES = [
  // R5-178 explicitly cited list.
  { row: 'R5-178 /recommendations', file: 'src/app/recommendations/loading.tsx' },
  { row: 'R5-178 /upcoming', file: 'src/app/upcoming/loading.tsx' },
  { row: 'R5-178 /egs', file: 'src/app/egs/loading.tsx' },
  { row: 'R5-178 /schema', file: 'src/app/schema/loading.tsx' },
  { row: 'R5-178 /activity', file: 'src/app/activity/loading.tsx' },
  { row: 'R5-178 /dumped', file: 'src/app/dumped/loading.tsx' },
  { row: 'R5-178 /shelf', file: 'src/app/shelf/loading.tsx' },
  { row: 'R5-178 /search', file: 'src/app/search/loading.tsx' },
];

const SKELETON_IMPORT = /from\s+['"]@\/components\/Skeleton['"]/;
const ANIMATE_PULSE = /\banimate-pulse\b/;
const SKELETON_USE =
  /<\s*Skeleton(?:Block|Rows|CardGrid|Card|Text|Avatar)\b|className="[^"]*animate-pulse/;

describe('R5-178 — every cited route has a non-blank loading.tsx', () => {
  for (const { row, file } of ROUTES) {
    it(`${row} — ${file} exists`, () => {
      expect(existsSync(join(ROOT, file)), `${file} must exist`).toBe(true);
    });

    it(`${row} — ${file} renders a real skeleton (not just blank)`, () => {
      const src = readFileSync(join(ROOT, file), 'utf8');
      const usesShared = SKELETON_IMPORT.test(src);
      const usesPulse = ANIMATE_PULSE.test(src);
      const rendersSkeleton = SKELETON_USE.test(src);
      expect(
        usesShared || usesPulse || rendersSkeleton,
        `${file} must render a real skeleton (Skeleton* primitive or animate-pulse)`,
      ).toBe(true);
    });
  }
});
