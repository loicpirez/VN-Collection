import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('responsive page header layout', () => {
  it.each([
    'src/app/top-ranked/page.tsx',
    'src/app/upcoming/page.tsx',
    'src/app/shelf/page.tsx',
  ])('keeps wide toolbars below identity content before the large breakpoint in %s', (path) => {
    const content = source(path);
    expect(content).toContain('grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start');
    expect(content).toContain('flex min-w-0 flex-wrap items-center gap-2 lg:justify-end');
  });

  it.each([
    'src/components/TagsBrowser.tsx',
    'src/components/TraitsBrowser.tsx',
  ])('keeps refresh controls out of the identity row before the large breakpoint in %s', (path) => {
    const content = source(path);
    expect(content).toContain('mb-6 flex flex-col gap-3 lg:flex-row lg:items-start');
    expect(content).toContain('flex min-w-0 flex-1 items-start gap-3');
    expect(content).toContain('flex min-w-0 flex-wrap items-center gap-2 lg:justify-end');
  });

  it.each([
    'src/components/TopRankedSkeleton.tsx',
    'src/components/UpcomingSkeleton.tsx',
    'src/app/shelf/loading.tsx',
  ])('matches the responsive identity and toolbar columns in %s', (path) => {
    expect(source(path)).toContain('grid gap-4');
    expect(source(path)).toContain('lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start');
  });

  it.each([
    'src/app/tags/loading.tsx',
    'src/app/traits/loading.tsx',
  ])('matches the stacked identity header in %s', (path) => {
    expect(source(path)).toContain('mb-6 flex flex-col gap-3 lg:flex-row lg:items-start');
  });
});
