/**
 * R5-175 / R5-176 / R5-177 / R5-178 pin: every cited route ships
 * a `loading.tsx` that renders a non-blank skeleton (using one of
 * the shared Skeleton primitives), so the user never sees a flash
 * of empty content while the server component is fetching. Tab /
 * filter URL state is preserved across the suspense boundary —
 * that's the Next.js App Router default behaviour (the URL
 * doesn't change during loading), so the pin just asserts the
 * existence of the skeleton.
 *
 * Empty / error rendering is component-level (each surface
 * renders its own empty / error block); the route-level
 * `loading.tsx` only covers the pending state. Component-level
 * empty / error coverage is already exercised by the existing
 * route tests + Playwright suite.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const ROUTES = [
  // R5-175 (/tag/[id]?tab=vndb)
  { row: 'R5-175 /tag/[id]', file: 'src/app/tag/[id]/loading.tsx' },
  // R5-176 (/tags?mode=vndb)
  { row: 'R5-176 /tags', file: 'src/app/tags/loading.tsx' },
  // R5-177 (/characters, /staff combined tabs)
  { row: 'R5-177 /characters', file: 'src/app/characters/loading.tsx' },
  { row: 'R5-177 /staff', file: 'src/app/staff/loading.tsx' },
  // R5-178 (recommendations, upcoming, EGS, schema, activity, dumped, shelf, search)
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

describe('R5-175..R5-178 — every cited route has a non-blank loading.tsx', () => {
  for (const { row, file } of ROUTES) {
    it(`${row} — ${file} exists`, () => {
      expect(existsSync(join(ROOT, file)), `${file} must exist`).toBe(true);
    });

    it(`${row} — ${file} renders a real skeleton (not just blank)`, () => {
      const src = readFileSync(join(ROOT, file), 'utf8');
      // Either imports the shared Skeleton primitives OR uses
      // `animate-pulse` for an inline shimmer.
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
