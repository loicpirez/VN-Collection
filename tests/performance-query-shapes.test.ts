import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(__dirname, '..', path), 'utf8');
}

describe('place registry query shape', () => {
  it('pre-aggregates in-stock VN counts and keeps location lookup indexes', () => {
    const body = source('src/lib/db.ts');
    const listPlacesBody = body.split('export function listPlaces()')[1]?.split('export function getPlace')[0] ?? '';
    expect(listPlacesBody).toContain('WITH stock_by_place AS');
    expect(listPlacesBody).toContain('LEFT JOIN stock_by_place sbp ON sbp.place_id = p.id');
    expect(listPlacesBody).not.toContain('SELECT COUNT(DISTINCT vso.vn_id)');
    expect(body).toContain('CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_location_branch');
    expect(body).toContain('CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_location_label');
  });
});

describe('bounded VN card lookup queries', () => {
  it.each([
    'src/components/ReadingQueueStrip.tsx',
    'src/app/lists/[id]/page.tsx',
  ])('%s chunks VN ids before constructing placeholders', (path) => {
    const body = source(path);
    expect(body).toContain('const VN_QUERY_CHUNK = 500');
    expect(body).toContain('index += VN_QUERY_CHUNK');
    expect(body).toContain('ids.slice(index, index + VN_QUERY_CHUNK)');
    expect(body).toContain('.all(...chunk)');
    expect(body).not.toContain('.all(...ids)');
  });
});
