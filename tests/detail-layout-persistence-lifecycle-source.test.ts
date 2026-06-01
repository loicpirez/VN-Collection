import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');
const GENERIC = source('src/components/DetailReorderLayout.tsx');
const VN = source('src/components/VnDetailLayout.tsx');
const SERIES = source('src/components/SeriesDetailLayout.tsx');

describe('detail layout persistence lifecycle', () => {
  it.each([
    ['generic detail', GENERIC],
    ['VN detail', VN],
    ['series detail', SERIES],
  ])('%s serializes saves through an abortable owner', (_label, component) => {
    expect(component).toContain('const saveAbortRef = useRef<AbortController | null>(null)');
    expect(component).toContain('const saveInFlightRef = useRef(false)');
    expect(component).toContain('if (saveInFlightRef.current) return');
    expect(component).toContain('saveAbortRef.current?.abort()');
    expect(component).toContain('saveAbortRef.current = controller');
    expect(component).toContain('saveAbortRef.current !== controller');
    expect(component).toContain('controller.signal.aborted');
    expect(component).toContain('signal: controller.signal');
  });

  it('threads generic and series route identity into reusable layout hosts', () => {
    expect(GENERIC).toContain('identityKey: string');
    expect(GENERIC).toContain('const identityRef = useRef<string | null>(identityKey)');
    expect(source('src/app/character/[id]/page.tsx')).toContain('identityKey={id}');
    expect(source('src/app/staff/[id]/page.tsx')).toContain('identityKey={id}');
    expect(source('src/app/producer/[id]/page.tsx')).toContain('identityKey={id}');
    expect(SERIES).toContain('seriesId: number');
    expect(SERIES).toContain('const identityRef = useRef<number | null>(seriesId)');
    expect(source('src/app/series/[id]/page.tsx')).toContain('<SeriesDetailLayout seriesId={series.id}');
    expect(VN).toContain('const identityRef = useRef<string | null>(vnId)');
  });

  it.each([
    'src/components/HomeLayoutEditorTrigger.tsx',
    'src/components/DetailReorderLayout.tsx',
    'src/components/VnDetailLayout.tsx',
    'src/components/SeriesDetailLayout.tsx',
    'src/components/settings/LayoutSettingsTab.tsx',
  ])('%s uses the shared drag activation contract', (path) => {
    const component = source(path);
    expect(component).not.toContain('activationConstraint: { distance: 4 }');
    expect(component).not.toContain('activationConstraint: { delay: 200, tolerance: 6 }');
    expect(component).toContain('activationConstraint: { distance: 6 }');
    expect(component).toContain('activationConstraint: { delay: 150, tolerance: 5 }');
  });

  it.each([
    ['generic detail', GENERIC],
    ['VN detail', VN],
    ['series detail', SERIES],
  ])('%s blocks editing while a save owns the surface', (_label, component) => {
    expect(component).toContain('disabled={saving}');
    expect(component).toContain('disabled={disabled}');
  });
});
