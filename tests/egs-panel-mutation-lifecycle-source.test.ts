import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PANEL = readFileSync('src/components/EgsPanel.tsx', 'utf8');

describe('EGS panel mutation lifecycle', () => {
  it('serializes refresh and unlink operations across VN replacement', () => {
    expect(PANEL).toContain('const operationInFlightRef = useRef(false)');
    expect(PANEL).toContain('if (operationInFlightRef.current) return');
    expect(PANEL).toContain('if (!ok || !ownsPanel(ownerVnId) || mutationAbortRef.current !== controller || controller.signal.aborted) return');
    expect(PANEL).toContain('operationInFlightRef.current = false');
    expect(PANEL.indexOf('operationInFlightRef.current = true')).toBeLessThan(PANEL.indexOf('const ok = await confirm({ message: t.egs.unlinkConfirm'));
  });

  it('owns and aborts unlink requests', () => {
    expect(PANEL).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(PANEL).toContain('mutationAbortRef.current?.abort()');
    expect(PANEL).toContain('signal: controller.signal');
    expect(PANEL).toContain('mutationAbortRef.current !== controller');
  });

  it('owns picker links and aborts them when the modal unmounts', () => {
    expect(PANEL).toContain('const linkAbortRef = useRef<AbortController | null>(null)');
    expect(PANEL).toContain('if (linkInFlightRef.current) return');
    expect(PANEL).toContain('linkAbortRef.current?.abort()');
    expect(PANEL).toContain('controller.signal.aborted || !mountedRef.current || linkAbortRef.current !== controller');
  });

  it('uses a plain text missing-value fallback', () => {
    expect(PANEL).not.toContain("'—'");
  });

  it('hides touched decorative integration glyphs', () => {
    expect(PANEL).toContain('<ExternalLink className="h-3 w-3" aria-hidden />');
    expect(PANEL).toContain('icon={<Star className="h-3 w-3" aria-hidden />}');
    expect(PANEL).toContain('<X className="h-4 w-4" aria-hidden />');
  });
});
