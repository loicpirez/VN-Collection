import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PANEL = readFileSync('src/components/ErogePricePanel.tsx', 'utf8');

describe('Eroge Price panel lifecycle', () => {
  it('aborts candidate mutations when the reusable VN panel changes or unmounts', () => {
    expect(PANEL).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(PANEL).toContain('mutationAbortRef.current?.abort()');
    expect(PANEL).toContain('identityRef.current = vnId');
    expect(PANEL).toContain('mountedRef.current = false');
  });

  it('locks the shared candidate mutation channel synchronously', () => {
    expect(PANEL).toContain('if (mutationInFlightRef.current) return null');
    expect(PANEL).toContain('mutationInFlightRef.current = true');
    expect(PANEL).toContain('mutationAbortRef.current === controller');
    expect(PANEL).toContain('if (!ownsMutation(ownerVnId, controller)) return');
  });

  it('passes the mutation abort signal through pin, add, canonical reload, and remove requests', () => {
    expect(PANEL.match(/signal: controller\.signal/g)).toHaveLength(4);
  });

  it('keeps destructive candidate removal visible and touch-safe', () => {
    expect(PANEL).not.toContain('focus:flex group-hover:flex');
    expect(PANEL).toContain('min-h-[44px] min-w-[44px]');
    expect(PANEL).toContain('sm:min-h-0 sm:min-w-[28px]');
  });
});
