import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SEARCH = readFileSync('src/components/SearchClient.tsx', 'utf8');

describe('search URL and request lifecycle', () => {
  it('distinguishes component-owned URL writes from external history changes', () => {
    expect(SEARCH).toContain('const ownedUrlKeysRef = useRef(new Set<string>())');
    expect(SEARCH).toContain('ownedUrlKeysRef.current.add(qs)');
    expect(SEARCH).toContain('if (ownedUrlKeysRef.current.delete(urlKey)) return');
    expect(SEARCH).toContain('ownedUrlKeysRef.current.clear()');
  });

  it('rehydrates visible controls from an external URL snapshot', () => {
    expect(SEARCH).toContain('const nextAdv = readAdvFromUrl(sp)');
    expect(SEARCH).toContain('const nextSource = readSourceFromUrl(sp)');
    expect(SEARCH).toContain('setQ(nextQ)');
    expect(SEARCH).toContain('setAdv(nextAdv)');
    expect(SEARCH).toContain('setSource(nextSource)');
    expect(SEARCH).toContain('pendingUrlAdvancedRunRef.current = nextSource === \'vndb\' && hasAdvanced');
  });

  it('owns advanced searches with one abort controller', () => {
    expect(SEARCH).toContain('const advancedAbortRef = useRef<AbortController | null>(null)');
    expect(SEARCH).toContain('advancedAbortRef.current?.abort()');
    expect(SEARCH).toContain('signal: controller.signal');
    expect(SEARCH).toContain('advancedAbortRef.current !== controller');
    expect(SEARCH).toContain('useEffect(() => () => advancedAbortRef.current?.abort(), [])');
  });
});
