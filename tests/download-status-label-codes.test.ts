import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const productionProducers = [
  'src/lib/producer-full.ts',
  'src/lib/staff-full.ts',
  'src/lib/tag-full.ts',
  'src/lib/egs-sync.ts',
  'src/lib/trait-full.ts',
  'src/lib/relations-full.ts',
  'src/lib/scrape-tag-dag.ts',
  'src/lib/character-full.ts',
  'src/lib/vndb-sync.ts',
  'src/lib/scrape-character-instances.ts',
  'src/lib/scrape-producer-relations.ts',
  'src/lib/release-full.ts',
  'src/app/api/refresh/global/route.ts',
  'src/app/api/stock/batch/route.ts',
  'src/app/api/alicenet/run/route.ts',
] as const;

describe('download status label codes', () => {
  it('routes every production background-job label through a stable label spec', () => {
    for (const file of productionProducers) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      const startCalls = source.match(/startJob\([^;]+;/g) ?? [];
      expect(startCalls.length, file).toBeGreaterThan(0);
      for (const call of startCalls) expect(call, file).toContain('jobLabel(');
    }
  });

  it('translates codes in the client while retaining legacy label fallback', () => {
    const source = readFileSync(new URL('../src/components/DownloadStatusBar.tsx', import.meta.url), 'utf8');
    expect(source).toContain('t.downloadStatus.jobLabels');
    expect(source).toContain('t.downloadStatus.currentItems');
    expect(source).toContain('?? job.label');
  });
});
