import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SELECTIVE = readFileSync('src/components/SelectiveFullDownload.tsx', 'utf8');

describe('selective-download lifecycle', () => {
  it('owns paginated collection reads and aborts them on teardown', () => {
    expect(SELECTIVE).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(SELECTIVE).toContain('loadAbortRef.current?.abort()');
    expect(SELECTIVE).toContain('{ signal: controller.signal }');
    expect(SELECTIVE).toContain('loadAbortRef.current !== controller');
  });

  it('locks and aborts submission work', () => {
    expect(SELECTIVE).toContain('const submitAbortRef = useRef<AbortController | null>(null)');
    expect(SELECTIVE).toContain('const submitInFlightRef = useRef(false)');
    expect(SELECTIVE).toContain('picked.size === 0 || submitInFlightRef.current');
    expect(SELECTIVE).toContain('submitAbortRef.current !== controller');
  });

  it('resets selection when the scoped picker inputs change', () => {
    expect(SELECTIVE).toContain('const defaultSelectedKey = useMemo(');
    expect(SELECTIVE).toContain('setPicked(new Set(defaultSelected ?? []))');
    expect(SELECTIVE).toContain("setFilter('')");
  });
});
