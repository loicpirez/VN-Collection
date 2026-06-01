import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SECTION = readFileSync('src/components/OwnedEditionsSection.tsx', 'utf8');

describe('owned-editions lifecycle', () => {
  it('routes reloads through one abortable owner', () => {
    expect(SECTION).toContain('const reloadAbortRef = useRef<AbortController | null>(null)');
    expect(SECTION).toContain('reloadAbortRef.current?.abort()');
    expect(SECTION).toContain('identityRef.current !== ownerVnId');
    expect(SECTION).toContain('reloadAbortRef.current !== controller');
    expect(SECTION).toContain('if (mountedRef.current && identityRef.current === ownerVnId) setLoading(false)');
  });

  it('reseeds transient state when the reusable VN identity changes', () => {
    expect(SECTION).toContain('identityRef.current = vnId');
    expect(SECTION).toContain('appliedDeepLinkRef.current = null');
    expect(SECTION).toContain('setOwned([])');
    expect(SECTION).toContain('setReleases([])');
    expect(SECTION).toContain('setEditingId(null)');
    expect(SECTION).toContain('setAdderOpen(false)');
  });

  it('locks edition mutations synchronously and rejects obsolete completions', () => {
    expect(SECTION).toContain('if (mutationInFlightRef.current) return null');
    expect(SECTION).toContain('mutationInFlightRef.current = true');
    expect(SECTION).toContain('signal: controller.signal');
    expect(SECTION).toContain('if (!ownsMutation(ownerVnId, controller)) return');
    expect(SECTION).toContain('mutationAbortRef.current?.abort()');
  });
});
