import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('successful client response hardening', () => {
  it('decodes created series rows before appending state', () => {
    const source = readFileSync('src/components/SeriesManager.tsx', 'utf8');
    expect(source).toContain('decodeCreatedSeriesRow(await res.json())');
    expect(source).not.toContain('data.series');
  });

  it('checks optional place hydration status before decoding', () => {
    for (const path of [
      'src/components/EditForm.tsx',
      'src/components/OwnedEditionsSection.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain("fetch('/api/places'");
      expect(source).toContain('readApiError(r, t.common.error)');
      expect(source).toContain('decodeKnownPlacesResponse');
    }
  });

  it('decodes full EGS snapshots before reading raw columns', () => {
    const source = readFileSync('src/components/EgsRichDetails.tsx', 'utf8');
    expect(source).toContain('decodeVnEgsGameSnapshot(await r.json())');
    expect(source).not.toContain('EgsExtra');
  });
});
