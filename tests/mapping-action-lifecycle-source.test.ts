import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('mapping action lifecycle', () => {
  it.each([
    'src/components/MapEgsToVndbButton.tsx',
    'src/components/MapVnToEgsButton.tsx',
  ])('%s reseeds reusable picker state and owns hydration and pin completion', (path) => {
    const body = source(path);
    expect(body).toContain('const identityRef = useRef<string | null>(identity)');
    expect(body).toContain('const hydrationAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('const mutationRef = useRef(false)');
    expect(body).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('hydrationAbortRef.current !== ac');
    expect(body).toContain('if (mutationRef.current) return');
    expect(body).toContain('mutationAbortRef.current?.abort()');
    expect(body).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('setOpen(false)');
    expect(body).toContain('setSearching(false)');
  });

  it('binds synthetic VN promotion from confirmation through navigation', () => {
    const body = source('src/components/LinkToVndbButton.tsx');
    expect(body).toContain('const identityRef = useRef<string | null>(identity)');
    expect(body).toContain('const mutationRef = useRef(false)');
    expect(body).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('if (mutationRef.current) return');
    expect(body).toContain('mutationAbortRef.current?.abort()');
    expect(body).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('setQuery(seedQuery)');
    expect(body).toContain('setLinkingId(null)');
  });

  it('uses ASCII mapping metadata and hides touched decorative glyphs', () => {
    const vnToEgs = source('src/components/MapVnToEgsButton.tsx');
    const egsToVndb = source('src/components/MapEgsToVndbButton.tsx');
    const promote = source('src/components/LinkToVndbButton.tsx');
    expect(vnToEgs).toContain('title={`VN / ${vnId} / ${seedQuery}`}');
    expect(egsToVndb).toContain('title={`EGS / #${egsId} / ${gamename}`}');
    expect(vnToEgs).toContain('<X className="h-4 w-4" aria-hidden />');
    expect(egsToVndb).toContain('<X className="h-4 w-4" aria-hidden />');
    expect(promote).toContain('<X className="h-4 w-4" aria-hidden />');
  });
});
