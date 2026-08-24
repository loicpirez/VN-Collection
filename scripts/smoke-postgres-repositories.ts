import type { QueryResultRow } from 'pg';
import { getAliceNetRepository } from '../src/lib/db/repositories/alicenet';
import { getAppJobLockRepository } from '../src/lib/db/repositories/app-job-lock';
import { getAppSettingRepository } from '../src/lib/db/repositories/app-setting';
import { getStockRepository } from '../src/lib/db/repositories/stock';
import { getStockQueueRepository } from '../src/lib/db/repositories/stock-queue';
import { getVnReadRepository } from '../src/lib/db/repositories/vn-read';
import { getVnWriteRepository } from '../src/lib/db/repositories/vn-write';
import { closePostgresPool, postgresQuery } from '../src/lib/db/postgres';
import { readDatabaseConfig } from '../src/lib/db/postgres-config';

const SYNTHETIC_VN_ID = 'v99999999';
const SYNTHETIC_SETTING = 'postgres_repository_smoke';
const SYNTHETIC_LOCK = 'postgres-repository-smoke';
const SYNTHETIC_OWNER = 'smoke-owner';
const SYNTHETIC_BATCH_ID = 'stock-batch:postgres-smoke';
const SYNTHETIC_TITLE_QUERY = 'postgres-smoke-title-query';

interface CountRow extends QueryResultRow {
  staff: number;
  va: number;
  tags: number;
  developers: number;
  languages: number;
  platforms: number;
}

interface VnRow extends QueryResultRow {
  title: string;
  developers: string;
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function cleanupSyntheticVn(): Promise<void> {
  await postgresQuery('DELETE FROM stock_batch_job WHERE id = $1', [SYNTHETIC_BATCH_ID]);
  await postgresQuery('DELETE FROM vn_title_resolve_cache WHERE query = $1', [SYNTHETIC_TITLE_QUERY]);
  await postgresQuery('DELETE FROM vn_stock_source WHERE vn_id = $1', [SYNTHETIC_VN_ID]);
  await postgresQuery('DELETE FROM vn_stock_alias WHERE vn_id = $1', [SYNTHETIC_VN_ID]);
  await postgresQuery('DELETE FROM vn_stock_offer WHERE vn_id = $1', [SYNTHETIC_VN_ID]);
  await postgresQuery('DELETE FROM vn_stock_provider_status WHERE vn_id = $1', [SYNTHETIC_VN_ID]);
  await postgresQuery('DELETE FROM reading_queue WHERE vn_id = $1', [SYNTHETIC_VN_ID]);
  await postgresQuery('DELETE FROM collection WHERE vn_id = $1', [SYNTHETIC_VN_ID]);
  for (const table of [
    'vn_staff_credit',
    'vn_va_credit',
    'vn_tag_index',
    'vn_developer_index',
    'vn_language_index',
    'vn_platform_index',
  ]) {
    await postgresQuery(`DELETE FROM ${table} WHERE vn_id = $1`, [SYNTHETIC_VN_ID]);
  }
  await postgresQuery('DELETE FROM vn WHERE id = $1', [SYNTHETIC_VN_ID]);
}

async function main(): Promise<void> {
  if (readDatabaseConfig().backend !== 'postgres') {
    throw new Error('db:postgres:smoke requires DATABASE_BACKEND=postgres');
  }
  const locks = getAppJobLockRepository();
  const settings = getAppSettingRepository();
  let lockAcquired = false;
  try {
    await cleanupSyntheticVn();
    await settings.set(SYNTHETIC_SETTING, null);
    await locks.release(SYNTHETIC_LOCK, SYNTHETIC_OWNER);

    const now = Date.now();
    lockAcquired = await locks.acquire(SYNTHETIC_LOCK, SYNTHETIC_OWNER, now, 10_000);
    assertCondition(lockAcquired, 'failed to acquire PostgreSQL smoke lock');
    assertCondition(await locks.renew(SYNTHETIC_LOCK, SYNTHETIC_OWNER, now + 1, 10_000), 'failed to renew PostgreSQL smoke lock');

    await settings.set(SYNTHETIC_SETTING, 'verified');
    assertCondition(await settings.get(SYNTHETIC_SETTING) === 'verified', 'PostgreSQL setting round-trip failed');

    const aliceNet = getAliceNetRepository();
    const stats = await aliceNet.countStock();
    const page = await aliceNet.queryPage({
      limit: 5,
      offset: 0,
      filter: 'all',
      sort: 'price_asc',
      group: 'producer',
      search: '',
      producer: '',
      yearMin: null,
      yearMax: null,
      priceMin: null,
      priceMax: null,
      wishlistIds: [],
    });
    assertCondition(page.total === stats.total, 'AliceNet total differs between page and statistics');
    assertCondition(page.items.length === Math.min(5, stats.total), 'AliceNet bounded page length is incorrect');

    const vnWriter = getVnWriteRepository();
    const staff = { id: 's99999999', aid: 1, eid: 1, role: 'scenario', name: 'Smoke Staff' };
    const voice = {
      staff: { id: 's99999998', aid: 1, name: 'Smoke Voice' },
      character: { id: 'c99999999', name: 'Smoke Character' },
      note: null,
    };
    await vnWriter.upsert({
      id: SYNTHETIC_VN_ID,
      title: 'PostgreSQL smoke',
      developers: [{ id: 'p99999999', name: 'Smoke Developer' }],
      tags: [
        { id: 'g99999999', name: 'Smoke Tag', rating: 2, spoiler: 0 },
        { id: 'g99999999', name: 'Smoke Tag', rating: 2, spoiler: 0 },
      ],
      languages: ['ja', 'ja'],
      platforms: ['win', 'win'],
      staff: [staff, staff],
      va: [voice, voice],
    });
    const counts = (await postgresQuery<CountRow>(`
      SELECT
        (SELECT COUNT(*) FROM vn_staff_credit WHERE vn_id = $1) AS staff,
        (SELECT COUNT(*) FROM vn_va_credit WHERE vn_id = $1) AS va,
        (SELECT COUNT(*) FROM vn_tag_index WHERE vn_id = $1) AS tags,
        (SELECT COUNT(*) FROM vn_developer_index WHERE vn_id = $1) AS developers,
        (SELECT COUNT(*) FROM vn_language_index WHERE vn_id = $1) AS languages,
        (SELECT COUNT(*) FROM vn_platform_index WHERE vn_id = $1) AS platforms
    `, [SYNTHETIC_VN_ID])).rows[0];
    assertCondition(Boolean(counts && Object.values(counts).every((count) => count === 1)), 'VN writer did not deduplicate materialized rows');

    await vnWriter.upsert({ id: SYNTHETIC_VN_ID, title: 'PostgreSQL smoke updated', developers: [] });
    const vnRow = (await postgresQuery<VnRow>('SELECT title, developers FROM vn WHERE id = $1', [SYNTHETIC_VN_ID])).rows[0];
    const developerCount = (await postgresQuery<{ count: number } & QueryResultRow>(
      'SELECT COUNT(*) AS count FROM vn_developer_index WHERE vn_id = $1',
      [SYNTHETIC_VN_ID],
    )).rows[0]?.count;
    assertCondition(vnRow?.title === 'PostgreSQL smoke updated', 'VN writer did not update the canonical row');
    assertCondition(vnRow?.developers.includes('p99999999') === true && developerCount === 1, 'empty developer payload erased preserved developer data');

    const vnContext = await getVnReadRepository().getStockContext(SYNTHETIC_VN_ID);
    assertCondition(vnContext?.title === 'PostgreSQL smoke updated', 'stock VN reader did not return the canonical row');
    const localTitle = await getVnReadRepository().findTitleMatch('PostgreSQL smoke');
    assertCondition(localTitle?.vnId === SYNTHETIC_VN_ID, 'stock VN title lookup did not find the synthetic row');

    const stock = getStockRepository();
    await stock.replaceProviderSnapshot(SYNTHETIC_VN_ID, 'sofmap', [{
      vn_id: SYNTHETIC_VN_ID,
      provider: 'sofmap',
      provider_offer_id: 'postgres-smoke-offer',
      source: 'direct',
      title: 'PostgreSQL smoke offer',
      url: 'https://example.test/postgres-smoke-offer',
      price: 4200,
      currency: 'JPY',
      availability: 'in_stock',
      availability_label: 'In stock',
      condition: 'used',
      edition_label: null,
      location_label: 'Smoke branch',
      location_branch: 'Smoke branch',
      source_release_id: null,
      jan: null,
      fetched_at: now,
      error: null,
      content_kind: 'game_package',
      platform: 'win',
      edition_kind: 'standard',
      series_relation: 'exact_game',
      match_confidence: 'high',
      match_score: 100,
      match_warnings_json: '[]',
      marketplace_price: null,
      marketplace_count: null,
      list_price: null,
      category: null,
      store_code: null,
      product_id: null,
      page_kind: 'detail',
    }], { status: 'ok', message: null, fetched_at: now, offer_count: 1 });
    await stock.upsertAlias(SYNTHETIC_VN_ID, 'Postgres smoke alias');
    const source = await stock.upsertSource({
      vn_id: SYNTHETIC_VN_ID,
      provider: 'sofmap',
      url: 'https://example.test/postgres-smoke-source',
    });
    await stock.setCachedTitleResolution(SYNTHETIC_TITLE_QUERY, SYNTHETIC_VN_ID, 'PostgreSQL smoke updated');
    const [offers, statuses, aliases, sources, cachedTitle] = await Promise.all([
      stock.listOffers(SYNTHETIC_VN_ID),
      stock.listProviderStatuses(SYNTHETIC_VN_ID),
      stock.listAliases(SYNTHETIC_VN_ID),
      stock.listSources(SYNTHETIC_VN_ID),
      stock.getCachedTitleResolution(SYNTHETIC_TITLE_QUERY),
    ]);
    assertCondition(offers.length === 1 && offers[0]?.price === 4200, 'stock offer round-trip failed');
    assertCondition(statuses.length === 1 && statuses[0]?.status === 'ok', 'stock status round-trip failed');
    assertCondition(aliases.some((row) => row.alias_term === 'Postgres smoke alias'), 'stock alias round-trip failed');
    assertCondition(sources.some((row) => row.id === source.id), 'stock source round-trip failed');
    assertCondition(cachedTitle?.vnId === SYNTHETIC_VN_ID, 'stock title cache round-trip failed');

    await postgresQuery(`INSERT INTO collection (vn_id, status, added_at, updated_at)
      VALUES ($1, 'planning', $2, $2)`, [SYNTHETIC_VN_ID, now]);
    await postgresQuery('INSERT INTO reading_queue (vn_id, position, added_at) VALUES ($1, 0, $2)', [SYNTHETIC_VN_ID, now]);
    const queue = getStockQueueRepository();
    const [collectionPage, readingPage, recentPage] = await Promise.all([
      queue.list('collection', 500, 0),
      queue.list('reading_queue', 500, 0),
      queue.list('recent_stock', 500, 0),
    ]);
    assertCondition(collectionPage.entries.some((entry) => entry.vn_id === SYNTHETIC_VN_ID), 'collection stock queue omitted the synthetic VN');
    assertCondition(readingPage.entries.some((entry) => entry.vn_id === SYNTHETIC_VN_ID), 'reading stock queue omitted the synthetic VN');
    assertCondition(recentPage.entries.some((entry) => entry.vn_id === SYNTHETIC_VN_ID), 'recent stock queue omitted the synthetic VN');

    await postgresQuery(`INSERT INTO stock_batch_job (
      id, label, label_code, label_params_json, total, done, current_item, current_item_code,
      current_item_params_json, errors_json, started_at, finished_at, cancelled, interrupted
    ) VALUES ($1, $2, 'stock_refresh', $3, 1, 1, NULL, NULL, NULL, '[]', $4, $4, 0, 0)`, [
      SYNTHETIC_BATCH_ID,
      'PostgreSQL smoke batch',
      JSON.stringify({ count: 1 }),
      now,
    ]);
    const durableJob = (await postgresQuery<{ done: number; finished_at: number | null } & QueryResultRow>(
      'SELECT done, finished_at FROM stock_batch_job WHERE id = $1',
      [SYNTHETIC_BATCH_ID],
    )).rows[0];
    assertCondition(durableJob?.done === 1 && durableJob.finished_at === now, 'durable stock batch schema round-trip failed');

    process.stdout.write(`${JSON.stringify({
      ok: true,
      lock: true,
      setting: true,
      aliceNet: { total: stats.total, pageItems: page.items.length, producers: page.producers.length },
      vnWriter: counts,
      stock: { offers: offers.length, statuses: statuses.length, aliases: aliases.length, sources: sources.length },
      queues: { collection: collectionPage.total, reading: readingPage.total, recent: recentPage.total },
      durableJob: true,
    }, null, 2)}\n`);
  } finally {
    await cleanupSyntheticVn();
    await settings.set(SYNTHETIC_SETTING, null);
    if (lockAcquired) await locks.release(SYNTHETIC_LOCK, SYNTHETIC_OWNER);
    await closePostgresPool();
  }
}

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
