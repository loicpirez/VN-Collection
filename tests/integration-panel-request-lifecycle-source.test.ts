import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('VN integration panel request ownership', () => {
  it.each([
    'src/components/VndbStatusPanel.tsx',
    'src/components/EgsPanel.tsx',
  ])('%s aborts obsolete status reads and owns cleanup', (path) => {
    const body = source(path);
    expect(body).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('loadAbortRef.current?.abort()');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('loadAbortRef.current !== controller');
  });

  it('only announces EGS refresh success after a successful read', () => {
    const body = source('src/components/EgsPanel.tsx');
    expect(body).toContain('const refreshed = await load(true)');
    expect(body).toContain('if (!refreshed || !ownsPanel(ownerVnId)) return');
    expect(body.indexOf('if (!refreshed || !ownsPanel(ownerVnId)) return')).toBeLessThan(body.indexOf('toast.success(t.toast.saved)'));
  });

  it('aborts stale EGS picker searches before applying candidates', () => {
    const body = source('src/components/EgsPanel.tsx');
    expect(body).toContain('const searchAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('searchAbortRef.current?.abort()');
    expect(body).toContain('searchAbortRef.current !== controller');
    expect(body).toContain('searchAbortRef.current = null');
  });
});
