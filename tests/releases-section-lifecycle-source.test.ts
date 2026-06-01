import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('src/components/ReleasesSection.tsx', 'utf8');

describe('release section lifecycle', () => {
  it('reseeds loaded release rows when the VN identity changes', () => {
    expect(SOURCE).toContain('setReleases(null)');
    expect(SOURCE).toContain("}, [vnId, t.common.error]);");
    expect(SOURCE).not.toContain('if (releases !== null) return');
  });

  it('owns edition-toggle writes and aborts them on identity replacement', () => {
    expect(SOURCE).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(SOURCE).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(SOURCE).toContain('mutationAbortRef.current?.abort()');
    expect(SOURCE).toContain('mutationAbortRef.current !== controller');
    expect(SOURCE).toContain('identityRef.current !== ownerVnId');
    expect(SOURCE).toContain("method: 'DELETE', signal: controller.signal");
    expect(SOURCE).toContain("body: JSON.stringify({ release_id: releaseId }), signal: controller.signal");
    expect(SOURCE).toContain('pending={pendingId !== null}');
  });

  it('uses hidden decorative icons and ASCII presentation separators', () => {
    expect(SOURCE).toContain('<Info className="h-3 w-3" aria-hidden />');
    expect(SOURCE).toContain('<Mic2 className="h-3 w-3" aria-hidden />');
    expect(SOURCE).toContain('<Shield className="h-3 w-3" aria-hidden />');
    expect(SOURCE).toContain('<Package className="h-3 w-3" aria-hidden />');
    expect(SOURCE).toContain('<ExternalLink className="h-3 w-3" aria-hidden />');
    expect(SOURCE).not.toContain('×');
    expect(SOURCE).not.toContain('·');
  });
});
