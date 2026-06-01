import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('VN source-preference lifecycle', () => {
  it('rehydrates optimistic selectors from canonical props', () => {
    const switcher = source('src/components/SourceSwitcher.tsx');
    const field = source('src/components/FieldCompare.tsx');
    const brand = source('src/components/BrandCompare.tsx');
    const playtime = source('src/components/PlaytimeCompare.tsx');

    for (const body of [switcher, field, brand, playtime]) {
      expect(body).toContain('setOptimistic(current)');
      expect(body).toContain('identityRef.current = null');
    }
    expect(switcher).toContain('const identity = `${vnId}|${field}`');
    expect(field).toContain('const identity = `${vnId}|${field}`');
    expect(field).toContain('setCompareOpen(false)');
    expect(brand).toContain('setCompareOpen(false)');
    expect(playtime).toContain('setCompareOpen(false)');
  });

  it('rejects stale source-preference mutation completion work', () => {
    const keyed = [
      source('src/components/SourceSwitcher.tsx'),
      source('src/components/FieldCompare.tsx'),
    ];
    const vnScoped = [
      source('src/components/BrandCompare.tsx'),
      source('src/components/PlaytimeCompare.tsx'),
    ];

    for (const body of keyed) {
      expect(body).toContain('identityRef.current !== ownerIdentity');
    }
    for (const body of vnScoped) {
      expect(body).toContain('identityRef.current !== ownerVnId');
    }
  });

  it('aborts obsolete writes and locks rapid source preference changes', () => {
    for (const path of [
      'src/components/SourceSwitcher.tsx',
      'src/components/FieldCompare.tsx',
      'src/components/BrandCompare.tsx',
      'src/components/PlaytimeCompare.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
      expect(body, path).toContain('const mutationInFlightRef = useRef(false)');
      expect(body, path).toContain('mutationAbortRef.current?.abort()');
      expect(body, path).toContain('signal: controller.signal');
      expect(body, path).toContain('mutationAbortRef.current !== controller');
      expect(body, path).toContain('controller.signal.aborted');
      expect(body, path).toContain('const previous = optimistic');
      expect(body, path).toContain('setOptimistic(previous)');
    }
  });

  it('uses ASCII shared metadata separators and missing-value tokens', () => {
    const field = source('src/components/FieldCompare.tsx');
    const brand = source('src/components/BrandCompare.tsx');
    const playtime = source('src/components/PlaytimeCompare.tsx');

    expect(field).toContain('{label} / {t.compare.compareLabel}');
    expect(field).toContain('<p className="text-[11px] italic text-muted/70">-</p>');
    expect(brand).toContain('{label} / {t.compare.compareLabel}');
    expect(brand).toContain('<p className="text-[11px] italic text-muted/70">-</p>');
    expect(playtime).toContain("formatMinutes(min, locale, t.year, { fallback: '-', emptyValue: 'strict_positive' })");
  });
});
