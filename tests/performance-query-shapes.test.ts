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
  it('loads the reading queue through one bounded repository query', () => {
    const component = source('src/components/ReadingQueueStrip.tsx');
    const repository = source('src/lib/db/repositories/home-feed.ts');
    expect(component).toContain('getHomeFeedRepository().listReadingQueueVns()');
    expect(repository).toContain('LIMIT 1000');
    expect(repository).not.toContain('WHERE v.id IN (${placeholders})');
  });

  it('loads list cards through a repository and binds SQLite VN ids as one JSON value', () => {
    const page = source('src/app/lists/[id]/page.tsx');
    const legacy = source('src/lib/db.ts');
    const listCollectionBody = legacy.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    expect(page).toContain('collectionRepository.listCards({ vnIds: items.map((item) => item.vn_id) })');
    expect(listCollectionBody).toContain("v.id IN (SELECT value FROM json_each(?))");
    expect(listCollectionBody).toContain('params.push(JSON.stringify(vnIds))');
    expect(listCollectionBody).not.toContain('params.push(...vnIds)');
  });
});

describe('home library request shape', () => {
  it('coalesces identical in-flight collection requests across split sections', () => {
    const body = source('src/components/LibraryClient.tsx');
    expect(body).toContain('const pendingCollectionRequests = new Map<string, PendingCollectionRequest>()');
    expect(body).toContain('function requestCollection(url: string, fallbackError: string, serverError: string)');
    expect(body).toContain('activeRequest.consumers += 1');
    expect(body).toContain('activeRequest.controller.abort()');
    expect(body).toContain('const request = requestCollection(`/api/collection?${params}`, t.library.collectionInvalid, t.library.collectionUnavailable)');
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

describe('collection-scale placeholder lists', () => {
  it('chunks brand-overlap staff cache hydration', () => {
    const body = source('src/lib/db/repositories/discovery.ts');
    expect(body).toContain('cacheKeys.slice(index, index + DISCOVERY_CHUNK_SIZE)');
    expect(body).toContain('.all(...chunk)');
    expect(body).not.toContain('.all(...cacheKeys)');
  });

  it('chunks upcoming cover and collection-membership lookups', () => {
    const page = source('src/app/upcoming/page.tsx');
    const legacy = source('src/lib/db.ts');
    const membership = legacy.split('export function isInCollectionMany')[1]?.split('\nexport ')[0] ?? '';
    expect(page).toContain('const ANTICIPATED_PAGE_SIZE = 50');
    expect(page).toContain('fetchVnCovers(vndbIds)');
    expect(page).toContain('getCollectionCoreRepository().containsMany(ids)');
    expect(membership).toContain('const CHUNK = 500');
    expect(membership).toContain('vnIds.slice(i, i + CHUNK)');
    expect(membership).not.toContain('.all(...vnIds)');
  });

  it('chunks Steam suggestion metadata lookups', () => {
    const caller = source('src/lib/steam.ts');
    const repository = source('src/lib/db/repositories/steam.ts');
    expect(caller).toContain('steamRepository.listSuggestionRows(ids)');
    expect(repository).toContain('vnIds.slice(offset, offset + 500)');
    expect(repository).toContain('.all(...chunk)');
    expect(repository).toContain('c.vn_id = ANY($1::text[])');
    expect(repository).not.toContain('.all(...vnIds)');
  });

  it.each([
    'getCharacterImages',
    'materializeReleaseMetaForCollectionVns',
    'materializeAspectForCollectionVns',
    'batchGetVnTitles',
    'batchGetProducerNames',
    'batchGetStaffNames',
    'batchGetCharNames',
    'upsertAliceNetStock',
  ])('%s chunks collection-sized SQLite placeholder lists', (functionName) => {
    const body = source('src/lib/db.ts');
    const fn = body.split(`export function ${functionName}`)[1]?.split('\nexport function ')[0] ?? '';
    expect(fn).toContain('const CHUNK = 500');
    expect(fn).toContain('.slice(i, i + CHUNK)');
    expect(fn).not.toContain('.all(...ids)');
    expect(fn).not.toContain('.all(...vnIds)');
    expect(fn).not.toContain('.all(...charIds)');
    expect(fn).not.toContain('.run(...vnIds)');
    expect(fn).not.toContain('.run(...toDelete)');
  });

  it('caps sibling alias sets before constructing repeated placeholders', () => {
    const body = source('src/lib/db.ts');
    expect(body.match(/const nameList = Array\.from\(names\)\.slice\(0, 200\);/g)).toHaveLength(2);
    expect(body).not.toContain('Array.from(names).map(() =>');
  });

  it('hydrates collection trait cache rows through one chunked batch helper', () => {
    const dbBody = source('src/lib/db.ts');
    const cacheBody = source('src/lib/vndb-cache.ts');
    const repository = source('src/lib/db/repositories/cache.ts');
    const routeBody = source('src/app/api/collection/traits/route.ts');
    const helper = dbBody.split('export function getCacheRows')[1]?.split('/** Insert or replace one cache row. */')[0] ?? '';
    expect(helper).toContain('const CHUNK = 500');
    expect(helper).toContain('keys.slice(i, i + CHUNK)');
    expect(helper).toContain('.all(...chunk)');
    expect(cacheBody).toContain('getCacheRepository().getMany(keys)');
    expect(repository).toContain("return (await import('@/lib/db')).getCacheRows(keys)");
    expect(repository).toContain('cache_key = ANY($1::text[])');
    expect(routeBody).toContain('readCachedCharactersForVns(vnIds)');
    expect(routeBody).not.toContain('readCachedCharactersForVn(vnId)');
  });
});
