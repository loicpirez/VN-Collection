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

describe('home library request shape', () => {
  it('coalesces identical in-flight collection requests across split sections', () => {
    const body = source('src/components/LibraryClient.tsx');
    expect(body).toContain('const pendingCollectionRequests = new Map<string, PendingCollectionRequest>()');
    expect(body).toContain('function requestCollection(url: string, fallbackError: string)');
    expect(body).toContain('activeRequest.consumers += 1');
    expect(body).toContain('activeRequest.controller.abort()');
    expect(body).toContain('const request = requestCollection(`/api/collection?${params}`, t.common.error)');
    expect(body).not.toContain("fetch(`/api/collection?${params}`, { signal: ctrl.signal, cache: 'no-store' })");
  });
});

describe('collection pagination request shape', () => {
  it('bounds public collection pages and drains full-collection workflows through the shared helper', () => {
    const route = source('src/app/api/collection/route.ts');
    const helper = source('src/lib/collection-api-client.ts');
    expect(route).toContain('const DEFAULT_COLLECTION_PAGE_SIZE = 240');
    expect(route).toContain('const MAX_COLLECTION_PAGE_SIZE = 500');
    expect(route).toContain('limit: pageSize + 1');
    expect(route).toContain('offset: (page - 1) * pageSize');
    expect(helper).toContain('const FULL_COLLECTION_PAGE_SIZE = 500');
    expect(helper).toContain("pageParams.set('page', String(page))");
    expect(helper).toContain("pageParams.set('limit', String(FULL_COLLECTION_PAGE_SIZE))");
    for (const path of [
      'src/components/BulkDownloadButton.tsx',
      'src/components/CompareWithButton.tsx',
      'src/components/SelectiveFullDownload.tsx',
    ]) {
      expect(source(path)).toContain('fetchAllCollectionItems');
    }
  });
});

describe('collection producer sorting query shape', () => {
  it('joins pre-aggregated developer and publisher names instead of scalar subqueries', () => {
    const body = source('src/lib/db.ts');
    const listCollectionBody = body.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    expect(listCollectionBody).toContain("producer: 'developer_sort.name'");
    expect(listCollectionBody).toContain("publisher: 'publisher_sort.name'");
    expect(listCollectionBody).toContain('SELECT di.vn_id, MIN(p.name) AS name');
    expect(listCollectionBody).toContain('GROUP BY di.vn_id');
    expect(listCollectionBody).toContain('SELECT pi.vn_id, MIN(p.name) AS name');
    expect(listCollectionBody).toContain('GROUP BY pi.vn_id');
    expect(listCollectionBody).not.toContain(
      '(SELECT MIN(p.name) FROM vn_developer_index di LEFT JOIN producer p',
    );
    expect(listCollectionBody).not.toContain(
      '(SELECT MIN(p.name) FROM vn_publisher_index pi LEFT JOIN producer p',
    );
  });
});

describe('collection enrichment query shape', () => {
  it.each([
    'listPlacesForVnsMany',
    'listAspectKeysForVns',
  ])('%s chunks ids before constructing placeholders', (functionName) => {
    const body = source('src/lib/db.ts');
    const fn = body.split(`function ${functionName}`)[1]?.split('\nfunction ')[0] ?? '';
    expect(fn).toContain('const chunkSize = 500');
    expect(fn).toContain('index += chunkSize');
    expect(fn).toContain('vnIds.slice(index, index + chunkSize)');
    expect(fn).toContain('.all(...chunk)');
    expect(fn).not.toContain('.all(...vnIds)');
  });
});
