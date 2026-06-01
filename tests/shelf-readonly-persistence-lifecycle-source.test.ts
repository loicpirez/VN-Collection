import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CONTROLS = readFileSync('src/components/ShelfReadOnlyControls.tsx', 'utf8');

describe('read-only shelf display persistence lifecycle', () => {
  it('serializes settings writes and cancels obsolete generations', () => {
    expect(CONTROLS).toContain('const mountedRef = useRef(true)');
    expect(CONTROLS).toContain('const persistenceGenerationRef = useRef(0)');
    expect(CONTROLS).toContain('const latestSaveIdRef = useRef(0)');
    expect(CONTROLS).toContain('const saveAbortRef = useRef<AbortController | null>(null)');
    expect(CONTROLS).toContain('const saveQueueRef = useRef<Promise<void>>(Promise.resolve())');
    expect(CONTROLS).toContain('saveAbortRef.current?.abort()');
    expect(CONTROLS).toContain('saveQueueRef.current = task.catch(() => undefined)');
    expect(CONTROLS).toContain('signal: controller.signal');
  });

  it('tracks a confirmed snapshot and rolls back only the latest failed intent', () => {
    expect(CONTROLS).toContain('const confirmedOverridesRef = useRef(overrides)');
    expect(CONTROLS).toContain('confirmedOverridesRef.current = nextOverrides');
    expect(CONTROLS).toContain('if (latestSaveIdRef.current === saveId)');
    expect(CONTROLS).toContain('const confirmed = confirmedOverridesRef.current');
    expect(CONTROLS).toContain('applyOverrides(confirmed, confirmed.global)');
    expect(CONTROLS).toContain('if (!response.ok) throw new Error(await readApiError(response, t.common.error))');
  });

  it('routes reset through the serialized persistence helper', () => {
    expect(CONTROLS).toContain('queuePersist(');
    expect(CONTROLS).not.toContain("void fetch('/api/settings'");
    expect(CONTROLS).not.toContain('suffix="×"');
    expect(CONTROLS).toContain('suffix="x"');
  });
});
