import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CARD = readFileSync('src/components/PlaceCard.tsx', 'utf8');
const DETAIL = readFileSync('src/components/PlaceDetailClient.tsx', 'utf8');

describe('place action lifecycle', () => {
  it('binds card deletion to the rendered place identity', () => {
    expect(CARD).toContain('const placeIdentityRef = useRef<number | null>(place.id)');
    expect(CARD).toContain('const deleteInFlightRef = useRef(false)');
    expect(CARD).toContain('const deleteAbortRef = useRef<AbortController | null>(null)');
    expect(CARD).toContain('if (deleteInFlightRef.current) return');
    expect(CARD).toContain('deleteAbortRef.current?.abort()');
    expect(CARD).toContain('signal: controller.signal');
    expect(CARD).toContain('placeIdentityRef.current !== ownerId');
    expect(CARD).toContain('placeIdentityRef.current === ownerId');
  });

  it('resets detail actions and rejects stale place completion work', () => {
    expect(DETAIL).toContain('setShowEdit(false)');
    expect(DETAIL).toContain('setShowAssign(false)');
    expect(DETAIL).toContain('const deleteInFlightRef = useRef(false)');
    expect(DETAIL).toContain('const deleteAbortRef = useRef<AbortController | null>(null)');
    expect(DETAIL).toContain('deleteAbortRef.current?.abort()');
    expect(DETAIL).toContain('signal: controller.signal');
    expect(DETAIL).toContain('deleteAbortRef.current !== controller || controller.signal.aborted');
    expect(DETAIL).toContain('if (placeIdentityRef.current !== place.id) return');
  });
});
