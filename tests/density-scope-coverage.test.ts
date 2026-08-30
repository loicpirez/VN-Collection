/**
 * R6-163 source-pin: every page that mounts <DensityScopeProvider>
 * must also mount the <CardDensitySlider> affordance so users can
 * actually adjust card density on that page. The slider writes to a
 * scope-keyed value that the provider reads — without the slider the
 * provider has nothing to do.
 *
 * The check is static: parse each page file, locate the provider, and
 * assert the slider is present somewhere in the file OR in a directly
 * referenced sibling client component.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const ALL_TSX = walk(ROOT);
const FILE_TEXT = new Map<string, string>();
for (const f of ALL_TSX) FILE_TEXT.set(f, readFileSync(f, 'utf8'));

const DENSITY_SCOPED_FILES = ALL_TSX.filter((f) => {
  const text = FILE_TEXT.get(f) ?? '';
  return /<DensityScopeProvider\b/.test(text) && !/densityScope\?: DensityScope/.test(text);
});

const EXPECTED_LOADING_SCOPES = [
  'app/character/[id]/loading.tsx:characterWorks',
  'app/characters/loading.tsx:characterWorks',
  'app/dumped/loading.tsx:dumped',
  'app/lists/[id]/loading.tsx:lists',
  'components/HomePageSkeleton.tsx:library',
  'app/places/[id]/loading.tsx:places',
  'app/places/(index)/loading.tsx:places',
  'app/producer/[id]/loading.tsx:producerWorks',
  'app/recommendations/loading.tsx:recommendations',
  'app/seiyuu/loading.tsx:staffWorks',
  'components/SearchPageSkeleton.tsx:search',
  'app/series/[id]/loading.tsx:seriesWorks',
  'app/shelf/loading.tsx:shelf',
  'app/similar/loading.tsx:vnSimilar',
  'app/staff/[id]/loading.tsx:staffWorks',
  'app/staff/(index)/loading.tsx:staffWorks',
  'app/tag/[id]/loading.tsx:tagPage',
  'app/top-ranked/loading.tsx:topRanked',
  'app/trait/[id]/loading.tsx:characterWorks',
  'app/traits/loading.tsx:traitsList',
  'app/wishlist/loading.tsx:wishlist',
  'components/EgsPageSkeleton.tsx:egs',
  'components/UpcomingSkeleton.tsx:upcoming',
] as const;

function resolveLocalImport(fromFile: string, spec: string): string | null {
  // Resolve only relative imports for the coverage check; alias imports
  // (`@/...`) are tracked indirectly via filename matching below.
  if (spec.startsWith('.')) {
    const base = resolve(dirname(fromFile), spec);
    for (const ext of ['.tsx', '.ts']) {
      const candidate = base + ext;
      if (FILE_TEXT.has(candidate)) return candidate;
    }
    return null;
  }
  if (spec.startsWith('@/')) {
    const base = join(ROOT, spec.slice(2));
    for (const ext of ['.tsx', '.ts']) {
      const candidate = base + ext;
      if (FILE_TEXT.has(candidate)) return candidate;
    }
  }
  return null;
}

function transitiveSliderPresent(file: string, depth = 0): boolean {
  if (depth > 2) return false;
  const text = FILE_TEXT.get(file) ?? '';
  if (/CardDensitySlider/.test(text)) return true;
  // Follow imports one level deep into local sibling components.
  const importMatcher = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(importMatcher)) {
    const spec = m[1] ?? '';
    const resolved = resolveLocalImport(file, spec);
    if (!resolved) continue;
    if (resolved === file) continue;
    if (transitiveSliderPresent(resolved, depth + 1)) return true;
  }
  return false;
}

describe('density-scope coverage — every page using DensityScopeProvider also offers the slider', () => {
  it('finds the expected density-scoped surfaces', () => {
    expect(DENSITY_SCOPED_FILES.length).toBeGreaterThanOrEqual(15);
  });

  it('every density-scoped page (directly or via an imported child) mounts <CardDensitySlider>', () => {
    const offenders: string[] = [];
    for (const f of DENSITY_SCOPED_FILES) {
      if (!transitiveSliderPresent(f)) {
        offenders.push(f.replace(ROOT + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every density-scoped surface uses the --card-density-px variable somewhere (directly or transitively)', () => {
    function transitiveVariableUse(file: string, depth = 0): boolean {
      if (depth > 2) return false;
      const text = FILE_TEXT.get(file) ?? '';
      if (/--card-density-px/.test(text)) return true;
      const importMatcher = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
      for (const m of text.matchAll(importMatcher)) {
        const spec = m[1] ?? '';
        const resolved = resolveLocalImport(file, spec);
        if (!resolved) continue;
        if (resolved === file) continue;
        if (transitiveVariableUse(resolved, depth + 1)) return true;
      }
      return false;
    }
    const offenders: string[] = [];
    for (const f of DENSITY_SCOPED_FILES) {
      // Pages that render VnCard delegate grid sizing to the cards
      // themselves; VnCard already responds to the variable through its
      // own internal styling. So a page that imports VnCard implicitly
      // covers the variable.
      const text = FILE_TEXT.get(f) ?? '';
      if (/\bVnCard\b/.test(text)) continue;
      if (!transitiveVariableUse(f)) {
        offenders.push(basename(f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every route placeholder on the exact density scope of its resolved surface', () => {
    const declared: string[] = [];
    for (const [file, source] of FILE_TEXT) {
      for (const match of source.matchAll(/densityScope="([^"]+)"/g)) {
        declared.push(`${file.replace(`${ROOT}/`, '')}:${match[1]}`);
      }
    }
    expect(declared.sort()).toEqual([...EXPECTED_LOADING_SCOPES].sort());
  });
});
