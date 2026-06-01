import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TOGGLE = readFileSync('src/components/ReleaseOwnedToggle.tsx', 'utf8');
const POPOVER = readFileSync('src/components/EditionInfoPopover.tsx', 'utf8');

describe('shelf inventory action lifecycle', () => {
  it('locks and aborts the release-owned two-step toggle', () => {
    expect(TOGGLE).toContain('if (mutationInFlightRef.current) return');
    expect(TOGGLE).toContain('mutationAbortRef.current?.abort()');
    expect(TOGGLE).toContain('signal: controller.signal');
    expect(TOGGLE).toContain('if (!ownsMutation(ownerIdentity, controller)) return');
  });

  it('owns popover release-metadata refresh across tile replacement', () => {
    expect(POPOVER).toContain('const refreshAbortRef = useRef<AbortController | null>(null)');
    expect(POPOVER).toContain('if (refreshInFlightRef.current) return');
    expect(POPOVER).toContain('refreshAbortRef.current?.abort()');
    expect(POPOVER).toContain("{ method: 'POST', signal: controller.signal }");
    expect(POPOVER).toContain('identityRef.current !== ownerIdentity');
  });

  it('keeps shelf inventory secondary actions touch-safe on narrow screens', () => {
    expect(TOGGLE).toContain('min-h-[44px] min-w-[44px]');
    expect(POPOVER).toContain('inline-flex min-h-[44px] items-center gap-1 rounded border');
    expect(POPOVER).toContain('sm:min-h-0');
  });

  it('uses plain separators in shared popover metadata', () => {
    expect(POPOVER).not.toContain("join(' · ')");
    expect(POPOVER).toContain("join(' / ')");
  });
});
