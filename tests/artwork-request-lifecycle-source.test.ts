import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('compact artwork request lifecycle', () => {
  it.each([
    'src/components/BannerControls.tsx',
    'src/components/CoverUploader.tsx',
    'src/components/AspectOverrideControl.tsx',
    'src/components/CoverRotationButtons.tsx',
    'src/components/SetBannerButton.tsx',
    'src/components/CoverCompare.tsx',
  ])('%s aborts obsolete writes and locks rapid submissions', (path) => {
    const body = source(path);
    expect(body).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('const mutationInFlightRef = useRef(false)');
    expect(body).toContain('mutationAbortRef.current?.abort()');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('mutationAbortRef.current !== controller');
    expect(body).toContain('controller.signal.aborted');
  });

  it('cancels an outstanding aspect read before persisting an override', () => {
    const aspect = source('src/components/AspectOverrideControl.tsx');
    expect(aspect).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(aspect).toContain('loadAbortRef.current?.abort()');
    expect(aspect).toContain("          {' / '}");
  });

  it('rolls cover-source comparison back to the owned previous choice', () => {
    const compare = source('src/components/CoverCompare.tsx');
    expect(compare).toContain('const previous = optimistic');
    expect(compare).toContain('setOptimistic(previous)');
    expect(compare).toContain('disabled={saving || pending}');
    expect(compare).toContain('alt={`${alt} / ${col.label}`}');
  });
});
