import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('mapping picker request cancellation', () => {
  it.each([
    'src/components/LinkToVndbButton.tsx',
    'src/components/MapVnToEgsButton.tsx',
    'src/components/MapEgsToVndbButton.tsx',
  ])('%s aborts active searches when its persistent modal closes', (path) => {
    const body = source(path);
    expect(body).toContain('if (open) return;');
    expect(body).toContain('searchAbortRef.current?.abort();');
    expect(body).toContain('searchAbortRef.current = null;');
    expect(body).toContain('setSearching(false);');
  });

  it('aborts stale AliceNet Kobe remap searches before applying results', () => {
    const body = source('src/components/kobe/KobeLinkDialog.tsx');
    expect(body).toContain('searchAbortRef.current?.abort();');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('controller.signal.aborted || !mountedRef.current || itemCodeRef.current !== owner || searchAbortRef.current !== controller');
    expect(body).toContain('searchAbortRef.current === controller');
  });
});
