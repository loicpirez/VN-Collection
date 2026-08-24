import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(process.cwd(), 'src', 'app');

function collectPageDirectories(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const pages = entries.some((entry) => entry.isFile() && entry.name === 'page.tsx')
    ? [directory]
    : [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    pages.push(...collectPageDirectories(join(directory, entry.name)));
  }
  return pages;
}

describe('App Router loading contract', () => {
  it('keeps an animated skeleton boundary beside every page', () => {
    const pageDirectories = collectPageDirectories(APP_ROOT);
    expect(pageDirectories.length).toBeGreaterThan(0);

    const missing = pageDirectories
      .filter((directory) => !existsSync(join(directory, 'loading.tsx')))
      .map((directory) => relative(APP_ROOT, directory) || '/');
    expect(missing).toEqual([]);

    const rawLoaders = pageDirectories
      .map((directory) => ({
        route: relative(APP_ROOT, directory) || '/',
        source: readFileSync(join(directory, 'loading.tsx'), 'utf8'),
      }))
      .filter(({ source }) => !/Skeleton|animate-pulse/.test(source))
      .map(({ route }) => route);
    expect(rawLoaders).toEqual([]);
  });
});
