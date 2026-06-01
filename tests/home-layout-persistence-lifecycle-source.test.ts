import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SECTION = readFileSync('src/components/HomeSectionMenu.tsx', 'utf8');
const EDITOR = readFileSync('src/components/HomeLayoutEditorTrigger.tsx', 'utf8');

describe('home layout persistence lifecycle', () => {
  it('tracks live rollback state and consumes reset broadcasts', () => {
    expect(SECTION).toContain('const stateRef = useRef(state)');
    expect(SECTION).toContain('if (detail.reset)');
    expect(SECTION).toContain('stateRef.current = next');
    expect(SECTION).toContain('const prev = stateRef.current');
    expect(SECTION).toContain('stateRef.current = prev');
  });

  it('serializes section writes and rejects obsolete completions', () => {
    expect(SECTION).toContain('const inFlightRef = useRef(false)');
    expect(SECTION).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(SECTION).toContain('if (inFlightRef.current) return');
    expect(SECTION).toContain('mutationAbortRef.current?.abort()');
    expect(SECTION).toContain('mutationAbortRef.current !== controller');
    expect(SECTION).toContain('signal: controller.signal');
  });

  it('serializes editor writes and suppresses teardown completion work', () => {
    expect(EDITOR).toContain('const mountedRef = useRef(true)');
    expect(EDITOR).toContain('const inFlightRef = useRef(false)');
    expect(EDITOR).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(EDITOR).toContain('if (inFlightRef.current) return');
    expect(EDITOR).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(EDITOR).toContain('signal: controller.signal');
    expect(EDITOR).toContain('setOrder(layout.order)');
    expect(EDITOR).toContain('setSections(layout.sections)');
  });
});
