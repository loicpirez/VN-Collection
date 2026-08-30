import { describe, expect, it } from 'vitest';
import { buildNavigationRegistry, navigationHref } from '@/lib/navigation-registry';

describe('navigation registry', () => {
  it('builds the complete grouped route list with an exact library route', () => {
    const registry = buildNavigationRegistry(2031);
    expect(registry).toHaveLength(31);
    expect(registry[0]).toEqual({ id: 'library', group: 'primary', href: '/', exact: true });
    expect(registry.find((route) => route.id === 'year')?.href).toBe('/year?y=2031');
    expect(registry.find((route) => route.id === 'seiyuu')).toEqual({
      id: 'seiyuu',
      group: 'browse',
      href: '/seiyuu',
    });
    expect(new Set(registry.map((route) => route.group))).toEqual(new Set(['primary', 'discover', 'browse', 'insights']));
  });

  it('resolves static and calendar-year routes', () => {
    expect(navigationHref('stock', 2031)).toBe('/stock');
    expect(navigationHref('seiyuu', 2031)).toBe('/seiyuu');
    expect(navigationHref('year', 2031)).toBe('/year?y=2031');
  });
});
