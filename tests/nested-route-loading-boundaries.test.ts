import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src', 'app');
const NESTED_INDEX_ROUTES = ['lists', 'places', 'series', 'staff'] as const;

describe('nested index and detail route boundaries', () => {
  it.each(NESTED_INDEX_ROUTES)('%s keeps index boundaries out of the detail segment ancestry', (route) => {
    const routeRoot = join(ROOT, route);
    const indexGroup = join(routeRoot, '(index)');
    const detailRoute = join(routeRoot, '[id]');

    expect(existsSync(join(indexGroup, 'page.tsx'))).toBe(true);
    expect(existsSync(join(indexGroup, 'loading.tsx'))).toBe(true);
    expect(existsSync(join(indexGroup, 'error.tsx'))).toBe(true);
    expect(existsSync(join(routeRoot, 'page.tsx'))).toBe(false);
    expect(existsSync(join(routeRoot, 'loading.tsx'))).toBe(false);
    expect(existsSync(join(routeRoot, 'error.tsx'))).toBe(false);
    expect(existsSync(join(detailRoute, 'page.tsx'))).toBe(true);
    expect(existsSync(join(detailRoute, 'loading.tsx'))).toBe(true);
    expect(existsSync(join(detailRoute, 'error.tsx'))).toBe(true);
  });
});
