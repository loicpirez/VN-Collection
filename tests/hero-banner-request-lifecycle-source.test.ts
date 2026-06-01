import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERO = readFileSync('src/components/HeroBanner.tsx', 'utf8');

function countOccurrences(needle: string): number {
  return HERO.split(needle).length - 1;
}

describe('hero banner request lifecycle', () => {
  it('owns and aborts banner writes across identity replacement and teardown', () => {
    expect(HERO).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(HERO).toContain('const mutationInFlightRef = useRef(false)');
    expect(HERO).toContain('mutationAbortRef.current?.abort()');
    expect(HERO).toContain('mutationAbortRef.current !== controller');
    expect(HERO).toContain('controller.signal.aborted');
  });

  it('serializes rotation, focal-position save, and focal-position reset', () => {
    expect(countOccurrences('const controller = beginMutation();')).toBe(3);
    expect(countOccurrences('signal: controller.signal')).toBe(3);
    expect(countOccurrences('if (!ownsMutation(ownerVnId, controller)) return')).toBe(6);
  });
});
