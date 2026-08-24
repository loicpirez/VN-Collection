import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { Pool, type QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  applyPostgresMigrations,
  assertPostgresSchemaCurrent,
  listPostgresMigrations,
  type PostgresMigrationFile,
} from '@/lib/db/migrate';
import { closePostgresPool } from '@/lib/db/postgres';
import { createPostgresGeneratedIdRepository } from '@/lib/db/repositories/generated-id';
import { createPostgresTextSearchRepository } from '@/lib/db/repositories/text-search';
import { createPostgresVnReadRepository } from '@/lib/db/repositories/vn-read';
import { createPostgresBackupDownload, restorePostgresBackup } from '@/lib/db/backup';
import { createPostgresAppJobLockRepository } from '@/lib/db/repositories/app-job-lock';
import { acquireBackgroundJobLease } from '@/lib/background-job-lease';
import { createPostgresCompareRepository } from '@/lib/db/repositories/compare';
import type { PostgresParameter } from '@/lib/db/postgres';
import {
  registerCompareRepositoryContract,
  type CompareVoiceCreditFixture,
} from '../database-contract/compare.contract';
import { createPostgresPlaceRepository } from '@/lib/db/repositories/place';
import { ALICENET_BRANCH_LABEL } from '@/lib/stock-provider-constants';
import {
  PLACE_CONTRACT_IDS,
  registerPlaceRepositoryContract,
} from '../database-contract/place.contract';
import { createPostgresOwnedReleaseRepository } from '@/lib/db/repositories/owned-release';
import { createPostgresShelfRepository } from '@/lib/db/repositories/shelf';
import { createPostgresCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { createPostgresVnWriteRepository } from '@/lib/db/repositories/vn-write';
import { createPostgresVnIdentityRepository } from '@/lib/db/repositories/vn-identity';
import { createPostgresSteamRepository } from '@/lib/db/repositories/steam';
import { createPostgresStockRepository } from '@/lib/db/repositories/stock';
import { createPostgresStockQueueRepository } from '@/lib/db/repositories/stock-queue';
import { getStockProviderMaintenanceRepository } from '@/lib/db/repositories/stock-provider-maintenance';
import { createPostgresCollectionListRepository } from '@/lib/db/repositories/collection-list';
import { createPostgresSeriesRepository } from '@/lib/db/repositories/series';
import { createPostgresReadingQueueRepository } from '@/lib/db/repositories/reading-queue';
import { createPostgresUserListRepository } from '@/lib/db/repositories/user-list';
import { createPostgresPeopleRepository } from '@/lib/db/repositories/people';
import { createPostgresActivityRepository } from '@/lib/db/repositories/activity';
import { createPostgresVnDetailRepository } from '@/lib/db/repositories/vn-detail';
import { createPostgresDumpRepository } from '@/lib/db/repositories/dump';
import { createPostgresQuoteRepository } from '@/lib/db/repositories/quote';
import { createPostgresEgsOverviewRepository } from '@/lib/db/repositories/egs-overview';
import { createPostgresAnalyticsRepository } from '@/lib/db/repositories/analytics';
import { createPostgresProducerRepository } from '@/lib/db/repositories/producer';
import { createPostgresSavedFilterRepository } from '@/lib/db/repositories/saved-filter';
import { createPostgresVnRouteRepository } from '@/lib/db/repositories/vn-route';
import { createPostgresRecommendationReadRepository } from '@/lib/db/repositories/recommendation-read';
import { createPostgresMaintenanceRepository } from '@/lib/db/repositories/maintenance';
import { createPostgresEgsRepository } from '@/lib/db/repositories/egs';
import { createPostgresVnAssetRepository } from '@/lib/db/repositories/vn-assets';
import {
  registerShelfRepositoryContract,
  SHELF_CONTRACT_IDS,
} from '../database-contract/shelf.contract';
import {
  CORE_CONTRACT_IDS,
  registerCoreRepositoryContract,
} from '../database-contract/core.contract';
import {
  registerStockRepositoryContract,
  STOCK_CONTRACT_IDS,
} from '../database-contract/stock.contract';
import {
  COLLECTION_LIST_CONTRACT_IDS,
  registerCollectionListRepositoryContract,
} from '../database-contract/collection-list.contract';
import {
  registerSeriesRepositoryContract,
  SERIES_CONTRACT_IDS,
} from '../database-contract/series.contract';
import {
  READING_QUEUE_CONTRACT_IDS,
  registerReadingQueueRepositoryContract,
} from '../database-contract/reading-queue.contract';
import {
  registerUserListRepositoryContract,
  USER_LIST_CONTRACT_IDS,
} from '../database-contract/user-list.contract';
import {
  PEOPLE_CONTRACT_IDS,
  peopleContractCharacterProfile,
  registerPeopleRepositoryContract,
} from '../database-contract/people.contract';
import {
  ACTIVITY_CONTRACT_FIXTURE,
  registerActivityRepositoryContract,
} from '../database-contract/activity.contract';
import {
  registerVnDetailRepositoryContract,
  VN_DETAIL_CONTRACT_FIXTURE,
} from '../database-contract/vn-detail.contract';
import {
  DUMP_CONTRACT_IDS,
  registerDumpRepositoryContract,
} from '../database-contract/dump.contract';
import {
  QUOTE_CONTRACT_IDS,
  registerQuoteRepositoryContract,
} from '../database-contract/quote.contract';
import {
  registerVnAssetRepositoryContract,
  VN_ASSET_CONTRACT_IDS,
  type VnAssetContractSnapshot,
} from '../database-contract/vn-assets.contract';
import {
  EGS_OVERVIEW_CONTRACT_IDS,
  registerEgsOverviewRepositoryContract,
} from '../database-contract/egs-overview.contract';
import {
  ANALYTICS_CONTRACT_FIXTURE,
  registerAnalyticsRepositoryContract,
} from '../database-contract/analytics.contract';
import {
  PRODUCER_CONTRACT_FIXTURE,
  registerProducerRepositoryContract,
} from '../database-contract/producer.contract';
import {
  registerSavedFilterRepositoryContract,
  SAVED_FILTER_CONTRACT_PREFIX,
} from '../database-contract/saved-filter.contract';
import {
  registerVnRouteRepositoryContract,
  VN_ROUTE_CONTRACT_IDS,
  type VnRouteContractRows,
} from '../database-contract/vn-route.contract';
import {
  RECOMMENDATION_READ_CONTRACT_IDS,
  registerRecommendationReadRepositoryContract,
} from '../database-contract/recommendation-read.contract';
import {
  MAINTENANCE_CONTRACT_IDS,
  registerMaintenanceRepositoryContract,
} from '../database-contract/maintenance.contract';
import {
  EGS_CONTRACT_IDS,
  registerEgsRepositoryContract,
} from '../database-contract/egs.contract';

interface CountRow extends QueryResultRow {
  count: number;
}

interface SchemaRow extends QueryResultRow {
  schema: string;
}

const execFileAsync = promisify(execFile);

function requiredTestUrl(): string {
  const value = process.env.POSTGRES_TEST_URL;
  if (!value) throw new Error('POSTGRES_TEST_URL is required for the PostgreSQL integration suite');
  const parsed = new URL(value);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('POSTGRES_TEST_URL must use the postgres or postgresql protocol');
  }
  return value;
}

async function withIsolatedSchema(
  run: (pool: Pool, schema: string) => Promise<void>,
): Promise<void> {
  const url = requiredTestUrl();
  const schema = `vitest_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: url, max: 1, application_name: 'vndb-postgres-test-admin' });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: url,
    max: 3,
    options: `-c search_path=${schema}`,
    application_name: 'vndb-postgres-test',
  });
  try {
    await run(pool, schema);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}

describe('real PostgreSQL migration runtime', () => {
  it('applies the shipped baseline once inside an isolated schema', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      const migrations = await listPostgresMigrations();
      const versions = migrations.map((migration) => migration.version);
      await expect(applyPostgresMigrations(pool, migrations)).resolves.toEqual({
        applied: versions,
        skipped: [],
      });
      await expect(applyPostgresMigrations(pool, migrations)).resolves.toEqual({
        applied: [],
        skipped: versions,
      });
      await expect(assertPostgresSchemaCurrent(pool, migrations)).resolves.toBeUndefined();
      const activeSchema = await pool.query<SchemaRow>('SELECT current_schema() AS schema');
      const tables = await pool.query<CountRow>(`
        SELECT COUNT(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = current_schema()
      `);
      expect(activeSchema.rows[0]?.schema).toBe(schema);
      expect(tables.rows[0]?.count).toBe(55);
      const quarantineColumns = await pool.query<CountRow>(`
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'postgres_json_quarantine'
      `);
      expect(quarantineColumns.rows[0]?.count).toBe(7);
    });
  });

  it('serializes concurrent migration operators with the advisory lock', async () => {
    await withIsolatedSchema(async (firstPool) => {
      const url = requiredTestUrl();
      const schemaResult = await firstPool.query<SchemaRow>('SELECT current_schema() AS schema');
      const schema = schemaResult.rows[0]!.schema;
      const secondPool = new Pool({
        connectionString: url,
        max: 2,
        options: `-c search_path=${schema}`,
        application_name: 'vndb-postgres-concurrent-test',
      });
      try {
        const migrations = await listPostgresMigrations();
        const versions = migrations.map((migration) => migration.version);
        const results = await Promise.all([
          applyPostgresMigrations(firstPool, migrations),
          applyPostgresMigrations(secondPool, migrations),
        ]);
        expect(results.flatMap((result) => result.applied)).toEqual(versions);
        expect(results.flatMap((result) => result.skipped)).toEqual(versions);
      } finally {
        await secondPool.end();
      }
    });
  });

  it('enforces owner-safe expiring job leases across independent pools', async () => {
    await withIsolatedSchema(async (firstPool, schema) => {
      await applyPostgresMigrations(firstPool, await listPostgresMigrations());
      const secondPool = new Pool({
        connectionString: requiredTestUrl(),
        max: 3,
        options: `-c search_path=${schema}`,
        application_name: 'vndb-postgres-worker-two',
      });
      const firstLocks = createPostgresAppJobLockRepository(
        async (text, values) => firstPool.query(text, [...values]),
      );
      const secondLocks = createPostgresAppJobLockRepository(
        async (text, values) => secondPool.query(text, [...values]),
      );
      try {
        const sameSlot = await Promise.all([
          firstLocks.acquire('single-job', 'owner-a', 1_000, 500),
          secondLocks.acquire('single-job', 'owner-b', 1_000, 500),
          firstLocks.acquire('single-job', 'owner-c', 1_000, 500),
        ]);
        expect(sameSlot.filter(Boolean)).toHaveLength(1);
        const owner = await firstPool.query<{ owner: string } & QueryResultRow>(
          "SELECT owner FROM app_job_lock WHERE name = 'single-job'",
        );
        const winningOwner = owner.rows[0]!.owner;
        expect(await secondLocks.renew('single-job', 'not-owner', 1_100, 500)).toBe(false);
        expect(await firstLocks.renew('single-job', winningOwner, 1_100, 500)).toBe(true);
        expect(await secondLocks.acquire('single-job', 'next-owner', 1_599, 500)).toBe(false);
        expect(await secondLocks.acquire('single-job', 'next-owner', 1_600, 500)).toBe(true);
        expect(await firstLocks.release('single-job', winningOwner)).toBe(false);

        const leases = await Promise.all([
          acquireBackgroundJobLease('stock-batch-test', 2, 1_000, {
            repository: firstLocks,
            owner: 'slot-owner-a',
            now: () => 2_000,
          }),
          acquireBackgroundJobLease('stock-batch-test', 2, 1_000, {
            repository: secondLocks,
            owner: 'slot-owner-b',
            now: () => 2_000,
          }),
          acquireBackgroundJobLease('stock-batch-test', 2, 1_000, {
            repository: firstLocks,
            owner: 'slot-owner-c',
            now: () => 2_000,
          }),
        ]);
        expect(leases.filter((lease) => lease !== null)).toHaveLength(2);
        expect(new Set(leases.flatMap((lease) => lease ? [lease.name] : []))).toEqual(
          new Set(['stock-batch-test:1', 'stock-batch-test:2']),
        );
        await Promise.all(leases.flatMap((lease) => lease ? [lease.release()] : []));
        expect(await secondLocks.release('single-job', 'next-owner')).toBe(true);
      } finally {
        await secondPool.end();
      }
    });
  });

  it('keeps normalized Latin and Japanese title search deterministic', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, alttitle, fetched_at) VALUES
          ('v90001', 'Ｂｅｔａ GAME', '別名', 1),
          ('v90002', 'Alpha Game', '夜が来る！', 1),
          ('v90003', 'Literal %_ Game', NULL, 1)
      `);
      await pool.query(`
        INSERT INTO collection (vn_id, status, playtime_minutes, favorite, added_at, updated_at, notes, custom_description)
        VALUES ('v90002', 'completed', 0, 0, 1, 1, 'A memo! in notes', 'A needle in description')
      `);
      await pool.query(`
        INSERT INTO vn_quote (quote_id, vn_id, quote, score, fetched_at)
        VALUES ('q90001', 'v90002', 'A needle in quotation', 1, 1)
      `);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-search-parity-test';
      try {
        const repository = createPostgresVnReadRepository();
        await expect(repository.findTitleMatch('GAME')).resolves.toEqual({ vnId: 'v90002', title: 'Alpha Game' });
        await expect(repository.findTitleMatch('beta')).resolves.toEqual({ vnId: 'v90001', title: 'Ｂｅｔａ GAME' });
        await expect(repository.findTitleMatch('夜が来る!')).resolves.toEqual({ vnId: 'v90002', title: 'Alpha Game' });
        await expect(repository.findTitleMatch('%_')).resolves.toEqual({ vnId: 'v90003', title: 'Literal %_ Game' });

        const textSearch = createPostgresTextSearchRepository();
        await expect(textSearch.search('ＮＥＥＤＬＥ')).resolves.toEqual([
          { vn_id: 'v90002', title: 'Alpha Game', source: 'custom_description', snippet: 'A needle in description' },
          { vn_id: 'v90002', title: 'Alpha Game', source: 'quote', snippet: 'A needle in quotation' },
        ]);
        await expect(textSearch.search('ＭＥＭＯ！')).resolves.toEqual([
          { vn_id: 'v90002', title: 'Alpha Game', source: 'notes', snippet: 'A memo! in notes' },
        ]);

        await pool.query('SET enable_seqscan = off');
        const plan = await pool.query<{ plan: object } & QueryResultRow>(`
          EXPLAIN (FORMAT JSON)
          SELECT vn_id FROM collection
          WHERE app_search_normalize(notes) LIKE '%memo%'
        `);
        expect(JSON.stringify(plan.rows)).toContain('idx_collection_notes_search_trgm');
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  });

  it('rolls back every statement and marker from a failed migration', async () => {
    await withIsolatedSchema(async (pool) => {
      const broken: PostgresMigrationFile = {
        version: '0001_broken',
        path: '/integration/0001_broken.sql',
        body: `
          CREATE TABLE schema_migration (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL);
          CREATE TABLE should_rollback (id BIGINT PRIMARY KEY);
          SELECT * FROM relation_that_does_not_exist;
        `,
      };
      await expect(applyPostgresMigrations(pool, [broken])).rejects.toThrow('relation_that_does_not_exist');
      const relations = await pool.query<{ marker: string | null; partial: string | null } & QueryResultRow>(`
        SELECT
          to_regclass('schema_migration')::text AS marker,
          to_regclass('should_rollback')::text AS partial
      `);
      expect(relations.rows[0]).toEqual({ marker: null, partial: null });
    });
  });

  it('persists every generated-identifier domain through RETURNING', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      const migrations = await listPostgresMigrations();
      await applyPostgresMigrations(pool, migrations);
      await pool.query("INSERT INTO vn (id, title, fetched_at) VALUES ('v90001', 'Integration fixture', 1)");

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-generated-id-test';
      try {
        const repository = createPostgresGeneratedIdRepository();
        const activity = await repository.addManualActivity('v90001', 'Manual note', 100);
        const gameLog = await repository.addGameLogEntry('v90001', 'Session note', 200, 15);
        const route = await repository.createRoute('v90001', 'Route A');
        const shelf = await repository.createShelf({ name: 'Shelf A', cols: 10, rows: 5 });
        const placeId = await repository.createPlace({ name: 'Shop A', lat: 35.6, lng: 139.7 });
        const series = await repository.createSeries('Series A', 'Description');
        const savedFilter = await repository.createSavedFilter('Filter A', 'status=playing');
        const firstList = await repository.createUserList({ name: 'List Name' });
        const secondList = await repository.createUserList({ name: 'List Name' });

        for (const id of [activity.id, gameLog.id, route.id, shelf.id, placeId, series.id, savedFilter.id, firstList.id, secondList.id]) {
          expect(Number.isSafeInteger(id)).toBe(true);
          expect(id).toBeGreaterThan(0);
        }
        expect(route).toMatchObject({ order_index: 0, completed: false });
        expect(shelf).toMatchObject({ order_index: 0, cols: 10, rows: 5 });
        expect(savedFilter.position).toBe(1);
        expect([firstList.slug, secondList.slug]).toEqual(['list-name', 'list-name-2']);

        const counts = await pool.query<CountRow>(`
          SELECT (
            (SELECT COUNT(*) FROM vn_activity)
            + (SELECT COUNT(*) FROM vn_game_log)
            + (SELECT COUNT(*) FROM vn_route)
            + (SELECT COUNT(*) FROM shelf_unit)
            + (SELECT COUNT(*) FROM place_registry)
            + (SELECT COUNT(*) FROM series)
            + (SELECT COUNT(*) FROM saved_filter)
            + (SELECT COUNT(*) FROM user_list)
          )::int AS count
        `);
        expect(counts.rows[0]?.count).toBe(9);
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  });

  it('round-trips a logical backup through transactional staging', async () => {
    await withIsolatedSchema(async (pool) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES ('v90001', 'Backup fixture', 1);
        INSERT INTO collection (vn_id, status, playtime_minutes, favorite, added_at, updated_at)
        VALUES ('v90001', 'completed', 30, 1, 1, 1)
      `);

      const download = await createPostgresBackupDownload(pool);
      const bytes = new Uint8Array(await new Response(download.stream).arrayBuffer());
      await pool.query(`
        UPDATE vn SET title = 'Changed after backup' WHERE id = 'v90001';
        DELETE FROM collection WHERE vn_id = 'v90001';
        INSERT INTO vn (id, title, fetched_at) VALUES ('v90002', 'Extra row', 2)
      `);

      const summary = await restorePostgresBackup(new Response(bytes).body!, bytes.byteLength + 1, pool);
      expect(summary.tables.find((table) => table.name === 'vn')?.rows_replaced).toBe(1);
      const rows = await pool.query<{ id: string; title: string; status: string | null } & QueryResultRow>(`
        SELECT vn.id, vn.title, collection.status
        FROM vn LEFT JOIN collection ON collection.vn_id = vn.id
        ORDER BY vn.id
      `);
      expect(rows.rows).toEqual([{ id: 'v90001', title: 'Backup fixture', status: 'completed' }]);
    });
  });

  it('quarantines malformed SQLite JSON during the real migration CLI run', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const directory = await mkdtemp(join(tmpdir(), 'vndb-json-migration-'));
      const sqlitePath = join(directory, 'source.db');
      const source = new Database(sqlitePath);
      try {
        source.exec('CREATE TABLE vn (id TEXT PRIMARY KEY, title TEXT NOT NULL, developers TEXT, fetched_at INTEGER NOT NULL)');
        source.prepare('INSERT INTO vn (id, title, developers, fetched_at) VALUES (?, ?, ?, ?)').run('v90001', 'Valid', '[{"id":"p1"}]', 1);
        source.prepare('INSERT INTO vn (id, title, developers, fetched_at) VALUES (?, ?, ?, ?)').run('v90002', 'Malformed', '{bad', 1);
      } finally {
        source.close();
      }

      const migrationUrl = new URL(requiredTestUrl());
      migrationUrl.searchParams.set('options', `-c search_path=${schema}`);
      try {
        await execFileAsync(resolve(process.cwd(), 'node_modules/.bin/tsx'), [
          'scripts/migrate-sqlite-to-postgres.ts',
          '--sqlite', sqlitePath,
          '--postgres', migrationUrl.toString(),
          '--batch-size', '1',
        ], { cwd: process.cwd(), timeout: 30_000 });

        const rows = await pool.query<{ id: string; developers: string | null } & QueryResultRow>(
          'SELECT id, developers FROM vn ORDER BY id',
        );
        expect(rows.rows).toEqual([
          { id: 'v90001', developers: '[{"id":"p1"}]' },
          { id: 'v90002', developers: null },
        ]);
        const quarantine = await pool.query<{
          table_name: string;
          column_name: string;
          source_rowid: number;
          raw_kind: string;
          raw_value: string;
        } & QueryResultRow>(`
          SELECT table_name, column_name, source_rowid, raw_kind, raw_value
          FROM postgres_json_quarantine
        `);
        expect(quarantine.rows).toEqual([{
          table_name: 'vn',
          column_name: 'developers',
          source_rowid: 2,
          raw_kind: 'text',
          raw_value: '{bad',
        }]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
});

registerCompareRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const query = async <Row extends QueryResultRow>(
        text: string,
        values: readonly PostgresParameter[] = [],
      ): Promise<{ rows: Row[] }> => {
        const result = await pool.query<Row>(text, [...values]);
        return { rows: result.rows };
      };
      const seed = async (rows: readonly CompareVoiceCreditFixture[]): Promise<void> => {
        await pool.query(`
          INSERT INTO vn (id, title, fetched_at) VALUES
            ('v991001', 'Contract v991001', 1),
            ('v991002', 'Contract v991002', 1)
        `);
        for (const row of rows) {
          await pool.query(`
            INSERT INTO vn_va_credit (
              vn_id, sid, aid, c_id, c_name, va_name, va_original, note
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [row.vn_id, row.sid, row.aid, row.c_id, row.c_name, row.va_name, row.va_original, row.note]);
        }
      };
      await run(createPostgresCompareRepository(query), seed);
    });
  },
});

registerPlaceRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ('v991101', 'First contract VN', 1),
          ('v991102', 'Second contract VN', 1);
        INSERT INTO collection (vn_id, status, physical_location, added_at, updated_at)
          VALUES ('v991101', 'completed', '["Storage A"]', 1, 1);
        INSERT INTO collection_place_index (vn_id, place) VALUES ('v991101', 'Storage A');
        INSERT INTO place_registry (id, name, kind, created_at, updated_at) VALUES
          (991101, 'Alpha Shop', 'shop', 1, 1),
          (991102, 'Beta Shop', 'shop', 1, 1)
      `);
      await pool.query(`
        INSERT INTO place_provider_link (place_id, provider_label) VALUES
          ($1, 'Branch A'),
          ($1, $2),
          ($3, 'Branch B')
      `, [PLACE_CONTRACT_IDS.firstPlace, ALICENET_BRANCH_LABEL, PLACE_CONTRACT_IDS.secondPlace]);
      await pool.query(`
        INSERT INTO vn_stock_offer (
          vn_id, provider, provider_offer_id, source, title, url, price, currency,
          availability, location_branch, location_label, fetched_at, updated_at
        ) VALUES
          ('v991101', 'sofmap', 'offer-1', 'direct', 'First offer', 'https://example.test/one', 5000, 'JPY', 'in_stock', 'Branch A', 'Branch A', 100, 100),
          ('v991102', 'sofmap', 'offer-2', 'direct', 'Second offer', 'https://example.test/two', 7000, 'JPY', 'out_of_stock', 'Branch A', 'Branch A', 200, 200),
          ('v991102', 'surugaya', 'offer-3', 'direct', 'Unassigned offer', 'https://example.test/three', 6000, 'JPY', 'in_stock', 'Branch C', 'Branch C', 250, 250);
        INSERT INTO alicenet_stock (code, title, sale_price, vn_id, fetched_at, updated_at)
          VALUES ('991-991101-991', 'AliceNet contract', '3,000円', 'v991102', 300, 300)
      `);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-place-contract';
      try {
        await run(createPostgresPlaceRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerShelfRepositoryContract('PostgreSQL', {
  async withRepositories(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const firstImages = JSON.stringify([{
        release_id: SHELF_CONTRACT_IDS.firstRelease,
        release_title: 'First release',
        type: 'pkgfront',
        url: 'https://example.test/release-first.jpg',
        thumbnail: 'https://example.test/release-first-thumb.jpg',
      }]);
      await pool.query(`
        INSERT INTO vn (id, title, release_images, fetched_at) VALUES
          ($1, 'Alpha contract VN', $2, 1),
          ($3, 'Beta contract VN', '[]', 1),
          ($4, 'Gamma contract VN', '[]', 1)
      `, [
        SHELF_CONTRACT_IDS.firstVn,
        firstImages,
        SHELF_CONTRACT_IDS.secondVn,
        SHELF_CONTRACT_IDS.thirdVn,
      ]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
          ($1, 'completed', 1, 1),
          ($2, 'completed', 1, 1),
          ($3, 'completed', 1, 1)
      `, [
        SHELF_CONTRACT_IDS.firstVn,
        SHELF_CONTRACT_IDS.secondVn,
        SHELF_CONTRACT_IDS.thirdVn,
      ]);
      await pool.query(`
        INSERT INTO release_meta_cache (
          release_id, vn_id, title, platforms, languages, resolution,
          patch, freeware, official, has_ero, fetched_at
        ) VALUES
          ($1, $2, 'First release', '["win"]', '[{"lang":"ja"}]', '1920x1080', 0, 0, 1, 0, 1),
          ($3, $4, 'Second release', '["swi"]', '[{"lang":"en"}]', '1280x720', 0, 0, 1, 0, 1),
          ($5, $6, 'Third release', '["ps4"]', '[{"lang":"fr"}]', '1920x1080', 0, 0, 1, 0, 1)
      `, [
        SHELF_CONTRACT_IDS.firstRelease,
        SHELF_CONTRACT_IDS.firstVn,
        SHELF_CONTRACT_IDS.secondRelease,
        SHELF_CONTRACT_IDS.secondVn,
        SHELF_CONTRACT_IDS.thirdRelease,
        SHELF_CONTRACT_IDS.thirdVn,
      ]);
      await pool.query(`
        INSERT INTO shelf_unit (id, name, cols, rows, order_index, created_at, updated_at)
        VALUES
          ($1, 'Shelf Alpha', 2, 2, 0, 1, 1),
          ($2, 'Shelf Beta', 2, 2, 1, 1, 1)
      `, [SHELF_CONTRACT_IDS.firstShelf, SHELF_CONTRACT_IDS.secondShelf]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-shelf-contract';
      try {
        await run(
          createPostgresOwnedReleaseRepository(),
          createPostgresShelfRepository(),
        );
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerCoreRepositoryContract('PostgreSQL', {
  async withRepositories(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-core-contract';
      try {
        await run(
          createPostgresCollectionCoreRepository(),
          createPostgresVnReadRepository(),
          createPostgresVnWriteRepository(),
          createPostgresTextSearchRepository(),
          {
            async insertQuote(vnId, quote) {
              await pool.query(`
                INSERT INTO vn_quote (quote_id, vn_id, quote, score, fetched_at)
                VALUES ($1, $2, $3, 1, 1)
              `, [`quote-${vnId}`, vnId, quote]);
            },
            async tagIds(vnId) {
              const result = await pool.query<{ tag_id: string } & QueryResultRow>(`
                SELECT tag_id FROM vn_tag_index WHERE vn_id = $1 ORDER BY tag_id
              `, [vnId]);
              return result.rows.map((row) => row.tag_id);
            },
            async customOrders() {
              const result = await pool.query<{
                vn_id: string;
                custom_order: number;
              } & QueryResultRow>(`
                SELECT vn_id, custom_order
                FROM collection
                WHERE vn_id = ANY($1::text[])
                ORDER BY vn_id
              `, [[CORE_CONTRACT_IDS.firstVn, CORE_CONTRACT_IDS.secondVn]]);
              return Object.fromEntries(result.rows.map((row) => [row.vn_id, row.custom_order]));
            },
          },
        );
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerStockRepositoryContract('PostgreSQL', {
  async withRepositories(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'Stock Contract Alpha', 1),
          ($2, 'Stock Contract Beta', 1)
      `, [STOCK_CONTRACT_IDS.firstVn, STOCK_CONTRACT_IDS.secondVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
          ($1, 'completed', 10, 20),
          ($2, 'planning', 5, 10)
      `, [STOCK_CONTRACT_IDS.firstVn, STOCK_CONTRACT_IDS.secondVn]);
      await pool.query(`
        INSERT INTO reading_queue (vn_id, position, added_at) VALUES
          ($1, 2, 1),
          ($2, 1, 1)
      `, [STOCK_CONTRACT_IDS.firstVn, STOCK_CONTRACT_IDS.secondVn]);
      await pool.query(`
        INSERT INTO app_setting (key, value) VALUES
          ('stock_disabled_providers', '["sofmap","invalid"]'),
          ('stock_retry_without_proxy', '1')
      `);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-stock-contract';
      try {
        await run(
          createPostgresStockRepository(),
          createPostgresStockQueueRepository(),
          getStockProviderMaintenanceRepository(),
          {
            async insertCompletedBatch(providers, startedAt) {
              await pool.query(`
                INSERT INTO stock_batch_job (
                  id, label, total, done, providers_json, errors_json,
                  started_at, finished_at, cancelled, interrupted
                ) VALUES ($1, 'Contract batch', 2, 2, $2, '[]', $3, $4, 0, 0)
              `, [STOCK_CONTRACT_IDS.batch, JSON.stringify(providers), startedAt, startedAt + 10]);
            },
          },
        );
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerCollectionListRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = COLLECTION_LIST_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO producer (id, name, aliases, extlinks, fetched_at) VALUES
          ($1, 'Alpha Developer', '[]', '[]', 1),
          ($2, 'Beta Publisher', '[]', '[]', 1)
      `, [ids.producer, ids.publisher]);
      await pool.query(`
        INSERT INTO vn (
          id, title, alttitle, image_sexual, released, languages, platforms,
          length_minutes, rating, description, developers, publishers, tags,
          screenshots, relations, custom_cover, banner_image, fetched_at
        ) VALUES
          ($1, 'Alpha Collection Contract', 'Alpha Alternative', 0, '2020-01-01', '["en"]', '["win"]',
            600, 80, 'Alpha description', $4, '[]', $5, '[]', '[]', '/alpha-cover.jpg', NULL, 1),
          ($2, 'Beta Collection Contract', NULL, 2, '2022-02-02', '["en"]', '["win"]',
            300, 60, 'Beta description', '[]', $6, $7, '[]', $8, NULL, '/beta-banner.jpg', 1),
          ($3, 'Gamma Collection Contract', NULL, 0, '', '["en"]', '["win"]',
            60, 40, 'Gamma description', '[]', '[]', '[]', $9, '[]', NULL, NULL, 1)
      `, [
        ids.firstVn,
        ids.secondVn,
        ids.thirdVn,
        JSON.stringify([{ id: ids.producer, name: 'Alpha Developer' }]),
        JSON.stringify([{ id: ids.tag, name: 'Drama', rating: 2, spoiler: 0, category: 'cont' }]),
        JSON.stringify([{ id: ids.publisher, name: 'Beta Publisher' }]),
        JSON.stringify([{ id: ids.adultTag, name: 'nukige', rating: 3, spoiler: 0, category: 'ero' }]),
        JSON.stringify([{ id: 'v1', title: 'Original', relation: 'orig', relation_official: true }]),
        JSON.stringify([{ url: 'https://example.test/gamma.jpg', thumbnail: 'https://example.test/gamma-thumb.jpg', dims: [1280, 800] }]),
      ]);
      await pool.query(`
        INSERT INTO collection (
          vn_id, status, user_rating, playtime_minutes, notes, favorite,
          edition_type, physical_location, dumped, custom_order, added_at, updated_at
        ) VALUES
          ($1, 'completed', 90, 600, 'Personal note', 1, 'physical', '["Room A"]', 1, 2, 100, 300),
          ($2, 'planning', 70, 180, NULL, 0, 'digital', '[]', 0, 1, 90, 200),
          ($3, 'playing', NULL, 0, NULL, 0, 'none', '[]', 0, 0, 80, 100)
      `, [ids.firstVn, ids.secondVn, ids.thirdVn]);
      await Promise.all([
        pool.query(`INSERT INTO collection_place_index (vn_id, place) VALUES ($1, 'Room A')`, [ids.firstVn]),
        pool.query(`INSERT INTO vn_developer_index (vn_id, producer_id) VALUES ($1, $2)`, [ids.firstVn, ids.producer]),
        pool.query(`INSERT INTO vn_publisher_index (vn_id, producer_id) VALUES ($1, $2)`, [ids.secondVn, ids.publisher]),
        pool.query(`
          INSERT INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES
            ($1, $2, 'Drama', 0, 'cont'),
            ($3, $4, 'nukige', 0, 'ero')
        `, [ids.firstVn, ids.tag, ids.secondVn, ids.adultTag]),
        pool.query(`
          INSERT INTO egs_game (
            vn_id, egs_id, median, average, count, playtime_median_minutes,
            source, okazu, erogame, fetched_at
          ) VALUES ($1, 991501, 88, 86, 10, 720, 'manual', 0, 0, 1)
        `, [ids.firstVn]),
        pool.query(`INSERT INTO series (id, name, created_at, updated_at) VALUES ($1, 'Contract Series', 1, 1)`, [ids.series]),
        pool.query(`
          INSERT INTO user_list (id, name, slug, created_at, updated_at)
          VALUES ($1, 'Contract List', 'contract-list-991501', 1, 1)
        `, [ids.series]),
        pool.query(`INSERT INTO reading_queue (vn_id, position, added_at) VALUES ($1, 1, 1)`, [ids.secondVn]),
        pool.query(`
          INSERT INTO release_resolution_cache (
            release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at
          ) VALUES ('r991501', $1, 800, 600, '800x600', '4:3', 1)
        `, [ids.firstVn]),
        pool.query(`INSERT INTO vn_aspect_override (vn_id, aspect_key, updated_at) VALUES ($1, '16:9', 1)`, [ids.secondVn]),
        pool.query(`
          INSERT INTO release_meta_cache (
            release_id, vn_id, platforms, languages, resolution, fetched_at
          ) VALUES ('r991503', $1, '["win"]', '[]', '1280x800', 1)
        `, [ids.thirdVn]),
      ]);
      await Promise.all([
        pool.query(`INSERT INTO series_vn (series_id, vn_id, order_index) VALUES ($1, $2, 0)`, [ids.series, ids.firstVn]),
        pool.query(`INSERT INTO user_list_vn (list_id, vn_id, order_index, added_at) VALUES ($1, $2, 0, 1)`, [ids.series, ids.firstVn]),
      ]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-collection-list-contract';
      try {
        await run(createPostgresCollectionListRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerSeriesRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'Alpha Series VN', 1),
          ($2, 'Beta Series VN', 1)
      `, [SERIES_CONTRACT_IDS.firstVn, SERIES_CONTRACT_IDS.secondVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at)
        VALUES ($1, 'completed', 1, 1)
      `, [SERIES_CONTRACT_IDS.firstVn]);
      await pool.query(`
        INSERT INTO series (id, name, description, created_at, updated_at) VALUES
          ($1, 'Alpha Contract Series', NULL, 1, 1),
          ($2, 'Beta Contract Series', NULL, 1, 1)
      `, [SERIES_CONTRACT_IDS.firstSeries, SERIES_CONTRACT_IDS.secondSeries]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-series-contract';
      try {
        await run(createPostgresSeriesRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerReadingQueueRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'First queue contract', 1),
          ($2, 'Second queue contract', 1)
      `, [READING_QUEUE_CONTRACT_IDS.firstVn, READING_QUEUE_CONTRACT_IDS.secondVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-reading-queue-contract';
      try {
        await run(createPostgresReadingQueueRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerUserListRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO user_list (id, name, slug, description, color, icon, pinned, created_at, updated_at) VALUES
          ($1, 'Alpha List', 'alpha-list', NULL, NULL, NULL, 0, 1, 1),
          ($2, 'Beta List', 'beta-list', NULL, NULL, NULL, 0, 1, 2)
      `, [USER_LIST_CONTRACT_IDS.firstList, USER_LIST_CONTRACT_IDS.secondList]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-user-list-contract';
      try {
        await run(createPostgresUserListRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerPeopleRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = PEOPLE_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (id, title, released, fetched_at) VALUES
          ($1, 'Alpha People VN', '2020-01-01', 1),
          ($2, 'Beta People VN', '2022-01-01', 1)
      `, [ids.ownedVn, ids.otherVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at)
        VALUES ($1, 'completed', 1, 1)
      `, [ids.ownedVn]);
      await pool.query(`
        INSERT INTO vn_staff_credit (vn_id, sid, eid, role, note, name, original, lang) VALUES
          ($1, $2, 1, 'scenario', 'Lead', 'Shared Staff', 'Staff Original', 'ja'),
          ($1, $2, 2, 'art', NULL, 'Shared Staff', 'Staff Original', 'ja'),
          ($3, $2, NULL, 'music', NULL, 'Shared Staff', 'Staff Original', 'ja'),
          ($1, $4, NULL, 'scenario', NULL, 'Shared Staff', NULL, 'ja')
      `, [ids.ownedVn, ids.primaryStaff, ids.otherVn, ids.siblingStaff]);
      await pool.query(`
        INSERT INTO vn_va_credit (
          vn_id, sid, c_id, c_name, c_original, c_image_url,
          va_name, va_original, va_lang, note
        ) VALUES
          ($1, $2, $3, 'Alpha Character', 'Shared Character', 'https://example.test/alpha.jpg',
            'Shared Staff', 'Staff Original', 'ja', 'Lead voice'),
          ($4, $2, 'c992103', 'Other Character', NULL, NULL,
            'Shared Staff', 'Staff Original', 'ja', NULL),
          ($1, $5, $6, 'Sibling Character', 'Shared Character', NULL,
            'Sibling Voice', NULL, 'ja', NULL)
      `, [
        ids.ownedVn,
        ids.primaryStaff,
        ids.primaryCharacter,
        ids.otherVn,
        ids.siblingStaff,
        ids.siblingCharacter,
      ]);
      await pool.query(`
        INSERT INTO character_image (char_id, url, local_path, fetched_at)
        VALUES ($1, 'https://example.test/alpha.jpg', 'character/alpha.jpg', 1)
      `, [ids.primaryCharacter]);
      await pool.query(`
        INSERT INTO character_vn_index (character_id, vn_id) VALUES ($1, $2)
      `, [ids.primaryCharacter, ids.ownedVn]);
      await pool.query(`
        INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
        VALUES ($1, $2, 1, 9999999999999)
      `, [
        `char_full:${ids.primaryCharacter}`,
        JSON.stringify({ profile: peopleContractCharacterProfile() }),
      ]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-people-contract';
      try {
        await run(createPostgresPeopleRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerActivityRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'Activity Contract One', 1),
          ($2, 'Activity Contract Two', 1)
      `, [ACTIVITY_CONTRACT_FIXTURE.firstVn, ACTIVITY_CONTRACT_FIXTURE.secondVn]);
      await pool.query(`
        INSERT INTO vn_activity (id, vn_id, kind, payload, occurred_at) VALUES
          ($1, $2, 'manual', '{"text":"contract note"}', $3),
          ($4, $2, 'note', 'invalid-json', $5),
          ($6, $7, 'status', '{"to":"completed"}', $5)
      `, [
        ACTIVITY_CONTRACT_FIXTURE.firstActivity,
        ACTIVITY_CONTRACT_FIXTURE.firstVn,
        ACTIVITY_CONTRACT_FIXTURE.firstDay,
        ACTIVITY_CONTRACT_FIXTURE.secondActivity,
        ACTIVITY_CONTRACT_FIXTURE.secondDay,
        ACTIVITY_CONTRACT_FIXTURE.thirdActivity,
        ACTIVITY_CONTRACT_FIXTURE.secondVn,
      ]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-activity-contract';
      try {
        await run(createPostgresActivityRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerVnDetailRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const fixture = VN_DETAIL_CONTRACT_FIXTURE;
      await pool.query(`
        INSERT INTO vn (id, title, screenshots, fetched_at) VALUES
          ($1, 'Detail Contract One', '[]', 1),
          ($2, 'Detail Contract Screenshot', '[{"dims":[1920,1080]}]', 1),
          ($3, 'Detail Contract Neighbor', '[]', 1),
          ($4, 'Detail Contract Other', '[]', 1)
      `, [fixture.firstVn, fixture.screenshotVn, fixture.neighborVn, fixture.otherVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, source_pref, added_at, updated_at) VALUES
          ($1, 'playing', '{"image":"egs","description":"custom"}', 1, 1),
          ($2, 'planning', '{"invalid":"value"}', 1, 1),
          ($3, 'completed', NULL, 1, 1),
          ($4, 'completed', NULL, 1, 1)
      `, [fixture.firstVn, fixture.screenshotVn, fixture.neighborVn, fixture.otherVn]);
      await pool.query(`
        INSERT INTO egs_game (vn_id, egs_id, gamename, median, source, fetched_at)
        VALUES ($1, 994101, 'Contract EGS', 78, 'manual', 1)
      `, [fixture.firstVn]);
      await pool.query(`
        INSERT INTO vn_game_log (
          id, vn_id, note, logged_at, session_minutes, created_at, updated_at
        ) VALUES
          ($1, $2, 'Before update', 100, 25, 100, 100),
          ($3, $4, 'Other VN', 200, NULL, 200, 200)
      `, [fixture.gameLogId, fixture.firstVn, fixture.otherGameLogId, fixture.otherVn]);
      await pool.query(`
        INSERT INTO owned_release (vn_id, release_id, notes, added_at)
        VALUES ($1, $2, NULL, 1)
      `, [fixture.firstVn, fixture.releaseId]);
      await pool.query(`
        INSERT INTO owned_release_aspect_override (
          vn_id, release_id, width, height, aspect_key, note, updated_at
        ) VALUES ($1, $2, 800, 600, '4:3', NULL, 1)
      `, [fixture.firstVn, fixture.releaseId]);
      await pool.query(`
        INSERT INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES
          ($1, 'g994101', 'Seed', 0, 'cont'),
          ($2, 'g994101', 'Seed', 0, 'cont'),
          ($2, 'g994102', 'Adjacent Alpha', 0, 'cont'),
          ($2, 'g994103', 'Adjacent Beta', 0, 'tech'),
          ($3, 'g994101', 'Seed', 0, 'cont'),
          ($3, 'g994102', 'Adjacent Alpha', 0, 'cont')
      `, [fixture.firstVn, fixture.neighborVn, fixture.otherVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-vn-detail-contract';
      try {
        await run(createPostgresVnDetailRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerDumpRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = DUMP_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'Zeta Partial', 1),
          ($2, 'Beta Untouched', 1),
          ($3, 'Gamma Complete', 1),
          ($4, 'Alpha Collection Complete', 1),
          ($5, 'Omega Ignored', 1)
      `, [ids.partialVn, ids.untouchedVn, ids.editionCompleteVn, ids.collectionCompleteVn, ids.ignoredVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, dumped, dumped_ignored, added_at, updated_at) VALUES
          ($1, 'playing', 0, 0, 1, 1),
          ($2, 'planning', 0, 0, 1, 1),
          ($3, 'completed', 0, 0, 1, 1),
          ($4, 'completed', 1, 0, 1, 1),
          ($5, 'completed', 1, 1, 1, 1)
      `, [ids.partialVn, ids.untouchedVn, ids.editionCompleteVn, ids.collectionCompleteVn, ids.ignoredVn]);
      await pool.query(`
        INSERT INTO owned_release (vn_id, release_id, dumped, added_at) VALUES
          ($1, 'r994201', 1, 1),
          ($1, 'r994202', 0, 1),
          ($2, 'r994203', 0, 1),
          ($3, 'r994204', 1, 1),
          ($4, 'r994205', 1, 1)
      `, [ids.partialVn, ids.untouchedVn, ids.editionCompleteVn, ids.ignoredVn]);
      await pool.query(`
        INSERT INTO shelf_unit (id, name, cols, rows, order_index, created_at, updated_at)
        VALUES ($1, 'Dump Contract Shelf', 2, 2, 0, 1, 1)
      `, [ids.shelf]);
      await pool.query(`
        INSERT INTO shelf_slot (shelf_id, row, col, vn_id, release_id, placed_at)
        VALUES ($1, 0, 0, $2, 'r994201', 1)
      `, [ids.shelf, ids.partialVn]);
      await pool.query(`
        INSERT INTO shelf_display_slot (shelf_id, after_row, position, vn_id, release_id, placed_at)
        VALUES ($1, 0, 0, $2, 'r994203', 1)
      `, [ids.shelf, ids.untouchedVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-dump-contract';
      try {
        await run(createPostgresDumpRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerQuoteRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = QUOTE_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (id, title, image_url, local_image, local_image_thumb, fetched_at) VALUES
          ($1, 'Quote Contract One', 'https://example.test/v994301.jpg', 'covers/v994301.jpg', 'covers/v994301-thumb.jpg', 1),
          ($2, 'Quote Contract Outside', NULL, NULL, NULL, 1)
      `, [ids.firstVn, ids.outsideCollectionVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at)
        VALUES ($1, 'completed', 1, 1)
      `, [ids.firstVn]);
      await pool.query(`
        INSERT INTO character_image (char_id, url, local_path, fetched_at)
        VALUES ('c994301', 'https://example.test/c994301.jpg', 'characters/c994301.jpg', 1)
      `);
      await pool.query(`
        INSERT INTO vn_quote (
          quote_id, vn_id, quote, score, character_id, character_name, fetched_at
        ) VALUES
          ($1, $2, 'A 100%_real contract quote', 10, 'c994301', 'Contract Heroine', 1),
          ($3, $4, 'Outside collection', 99, NULL, NULL, 1)
      `, [ids.firstQuote, ids.firstVn, ids.secondQuote, ids.outsideCollectionVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-quote-contract';
      try {
        await run(createPostgresQuoteRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerEgsOverviewRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = EGS_OVERVIEW_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (id, title, alttitle, image_thumb, fetched_at) VALUES
          ($1, 'Alpha Linked', NULL, 'https://example.test/linked.jpg', 1),
          ($2, 'Zulu Negative', 'Negative Alt', NULL, 1),
          ($3, 'Beta Missing', NULL, NULL, 1)
      `, [ids.linkedVn, ids.negativeVn, ids.missingVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
          ($1, 'completed', 1, 1),
          ($2, 'planning', 1, 1),
          ($3, 'playing', 1, 1)
      `, [ids.linkedVn, ids.negativeVn, ids.missingVn]);
      await pool.query(`
        INSERT INTO egs_game (
          vn_id, egs_id, median, playtime_median_minutes, source, fetched_at
        ) VALUES
          ($1, 994401, 84, 180, 'manual', 1),
          ($2, NULL, NULL, NULL, NULL, 1)
      `, [ids.linkedVn, ids.negativeVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-egs-overview-contract';
      try {
        await run(createPostgresEgsOverviewRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerAnalyticsRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const fixture = ANALYTICS_CONTRACT_FIXTURE;
      await pool.query(`
        INSERT INTO vn (id, title, released, rating, fetched_at) VALUES
          ($1, 'Alpha Analytics', '2020-01-01', 74, 1),
          ($2, 'Beta Analytics', '2021-01-01', 64, 1),
          ($3, 'Gamma Analytics', NULL, NULL, 1)
      `, [fixture.firstVn, fixture.secondVn, fixture.thirdVn]);
      await pool.query(`
        INSERT INTO collection (
          vn_id, status, user_rating, playtime_minutes, finished_date, favorite,
          location, edition_type, added_at, updated_at
        ) VALUES
          ($1, 'completed', 80, 120, '2098-02-01', 1, 'jp', 'physical', 1, 1),
          ($2, 'completed', 60, 60, '2098-02-10', 0, 'fr', 'digital', 1, 1),
          ($3, 'planning', NULL, 30, NULL, 1, 'unknown', 'none', 1, 1)
      `, [fixture.firstVn, fixture.secondVn, fixture.thirdVn]);
      await pool.query(`
        INSERT INTO vn_language_index (vn_id, lang) VALUES
          ($1, 'ja'), ($1, 'en'), ($2, 'ja')
      `, [fixture.firstVn, fixture.secondVn]);
      await pool.query(`
        INSERT INTO vn_platform_index (vn_id, platform) VALUES
          ($1, 'win'), ($2, 'swi')
      `, [fixture.firstVn, fixture.secondVn]);
      await pool.query(`
        INSERT INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES
          ($1, $2, 'Story', 0, 'cont'),
          ($1, $3, 'Erotic', 0, 'ero'),
          ($4, $2, 'Story', 0, 'cont')
      `, [fixture.firstVn, fixture.storyTag, fixture.eroTag, fixture.secondVn]);
      await pool.query(`
        INSERT INTO egs_game (
          vn_id, egs_id, median, playtime_median_minutes, source, fetched_at
        ) VALUES
          ($1, 994501, 81, 100, 'extlink', 1),
          ($2, NULL, NULL, NULL, NULL, 1)
      `, [fixture.firstVn, fixture.secondVn]);
      await pool.query(
        'INSERT INTO reading_goal (year, target, updated_at) VALUES ($1, 3, 1)',
        [fixture.year],
      );

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-analytics-contract';
      try {
        await run(createPostgresAnalyticsRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerProducerRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const fixture = PRODUCER_CONTRACT_FIXTURE;
      await pool.query(`
        INSERT INTO producer (
          id, name, original, lang, type, description, aliases, extlinks, logo_path, fetched_at
        ) VALUES ($1, 'Explicit Developer', NULL, 'ja', 'co', NULL, $2, $3, '/producer-logo.png', 1)
      `, [
        fixture.developer,
        JSON.stringify(['Explicit Dev']),
        JSON.stringify([{ url: 'https://example.test/dev', label: 'Official', name: 'Site' }]),
      ]);
      await pool.query(`
        INSERT INTO vn (id, title, developers, publishers, rating, fetched_at) VALUES
          ($1, 'First Producer VN', $2, $3, 70, 1),
          ($4, 'Second Producer VN', $5, $6, 90, 1)
      `, [
        fixture.firstVn,
        JSON.stringify([
          { id: fixture.developer, name: 'Explicit Developer' },
          { id: fixture.fallbackDeveloper, name: 'Fallback Developer' },
        ]),
        JSON.stringify([{ id: fixture.publisher, name: 'Fallback Publisher' }]),
        fixture.secondVn,
        JSON.stringify([{ id: fixture.developer, name: 'Explicit Developer' }]),
        JSON.stringify([{ id: fixture.publisher, name: 'Fallback Publisher' }]),
      ]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, user_rating, added_at, updated_at) VALUES
          ($1, 'completed', 80, 1, 1),
          ($2, 'completed', 60, 1, 2)
      `, [fixture.firstVn, fixture.secondVn]);
      await pool.query(`
        INSERT INTO vn_developer_index (vn_id, producer_id) VALUES
          ($1, $2), ($1, $3), ($4, $2)
      `, [fixture.firstVn, fixture.developer, fixture.fallbackDeveloper, fixture.secondVn]);
      await pool.query(`
        INSERT INTO vn_publisher_index (vn_id, producer_id) VALUES ($1, $2), ($3, $2)
      `, [fixture.firstVn, fixture.publisher, fixture.secondVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-producer-contract';
      try {
        await run(createPostgresProducerRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerSavedFilterRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query(`
        INSERT INTO saved_filter (name, params, position, created_at) VALUES
          ($1, 'tag=g1', 2, 1),
          ($2, 'status=playing', 1, 2),
          ($3, '', 3, 3)
      `, [
        `${SAVED_FILTER_CONTRACT_PREFIX}First`,
        `${SAVED_FILTER_CONTRACT_PREFIX}Second`,
        `${SAVED_FILTER_CONTRACT_PREFIX}Third`,
      ]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-saved-filter-contract';
      try {
        await run(createPostgresSavedFilterRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerVnRouteRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = VN_ROUTE_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'Route VN', 1), ($2, 'Foreign Route VN', 1)
      `, [ids.vn, ids.foreignVn]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
          ($1, 'playing', 1, 1), ($2, 'playing', 1, 1)
      `, [ids.vn, ids.foreignVn]);
      const routeResult = await pool.query<{ id: number } & QueryResultRow>(`
        INSERT INTO vn_route (vn_id, name, order_index, created_at, updated_at) VALUES
          ($1, 'Common route', 0, 1, 1),
          ($1, 'Second route', 1, 2, 2),
          ($2, 'Foreign route', 0, 3, 3)
        RETURNING id
      `, [ids.vn, ids.foreignVn]);
      const rows: VnRouteContractRows = {
        first: routeResult.rows[0]!.id,
        second: routeResult.rows[1]!.id,
        foreign: routeResult.rows[2]!.id,
      };

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-vn-route-contract';
      try {
        await run(createPostgresVnRouteRepository(), rows);
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerRecommendationReadRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = RECOMMENDATION_READ_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (
          id, title, alttitle, released, image_thumb, image_sexual, developers, fetched_at
        ) VALUES
          ($1, 'First Recommendation VN', 'First alternate', '2097-01-02', 'first-thumb.jpg', 1, $2, 1),
          ($3, 'Second Recommendation VN', NULL, NULL, NULL, NULL, 'malformed', 1),
          ($4, 'Third Recommendation VN', NULL, NULL, NULL, NULL, NULL, 1)
      `, [
        ids.first,
        JSON.stringify([{ id: ids.developer, name: 'Recommendation Studio' }]),
        ids.second,
        ids.third,
      ]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, user_rating, added_at, updated_at) VALUES
          ($1, 'completed', 80, 1, 1),
          ($2, 'completed', 90, 1, 2),
          ($3, 'completed', 60, 1, 3)
      `, [ids.first, ids.second, ids.third]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-recommendation-read-contract';
      try {
        await run(createPostgresRecommendationReadRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerMaintenanceRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = MAINTENANCE_CONTRACT_IDS;
      const now = Date.now();
      await pool.query(`
        INSERT INTO vn (id, title, image_url, fetched_at) VALUES
          ($1, 'Duplicate: Title!', NULL, 1),
          ($2, 'duplicate title', 'second.jpg', 1),
          ($3, 'abc', 'short.jpg', 1),
          ($4, 'Fresh Missing Cover', NULL, $5),
          ($6, 'Fresh Complete', 'fresh.jpg', $5)
      `, [ids.duplicateA, ids.duplicateB, ids.shortTitle, ids.freshMissingCover, now, ids.freshComplete]);
      await pool.query(`
        INSERT INTO egs_game (vn_id, egs_id, source, fetched_at) VALUES ($1, 994902, 'manual', 1)
      `, [ids.duplicateB]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-maintenance-contract';
      try {
        await run(createPostgresMaintenanceRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerEgsRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const ids = EGS_CONTRACT_IDS;
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at) VALUES
          ($1, 'EGS VN', 1), ($2, 'Other EGS VN', 1)
      `, [ids.vn, ids.otherVn]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-egs-contract';
      try {
        await run(createPostgresEgsRepository());
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

registerVnAssetRepositoryContract('PostgreSQL', {
  async withRepository(run) {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query('INSERT INTO vn (id, title, fetched_at) VALUES ($1, $2, 1)', [
        VN_ASSET_CONTRACT_IDS.vn,
        'Asset Contract VN',
      ]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-vn-asset-contract';
      try {
        await run(createPostgresVnAssetRepository(), async () => {
          const rowResult = await pool.query<Omit<VnAssetContractSnapshot, 'publisherIds'> & QueryResultRow>(`
            SELECT custom_cover AS "customCover", cover_rotation AS "coverRotation",
              banner_image AS "bannerImage", banner_position AS "bannerPosition",
              banner_rotation AS "bannerRotation", local_image AS "localImage",
              local_image_thumb AS "localImageThumb", screenshots,
              release_images AS "releaseImages", publishers
            FROM vn WHERE id = $1
          `, [VN_ASSET_CONTRACT_IDS.vn]);
          const publisherResult = await pool.query<{ producer_id: string } & QueryResultRow>(`
            SELECT producer_id FROM vn_publisher_index WHERE vn_id = $1 ORDER BY producer_id
          `, [VN_ASSET_CONTRACT_IDS.vn]);
          return {
            ...rowResult.rows[0]!,
            publisherIds: publisherResult.rows.map((row) => row.producer_id),
          };
        });
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }
    });
  },
});

describe('PostgreSQL VN identity migration', () => {
  it('moves personal and commercial references while preserving canonical metadata', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const fromId = 'egs_995001';
      const toId = 'v995002';
      const now = Date.now();
      await pool.query(`
        INSERT INTO vn (id, title, fetched_at, egs_only) VALUES
          ($1, 'Synthetic', 1, 1),
          ($2, 'Canonical', 2, 0)
      `, [fromId, toId]);
      await pool.query(`
        INSERT INTO collection (vn_id, status, user_rating, playtime_minutes, favorite, added_at, updated_at)
        VALUES ($1, 'completed', 77, 120, 1, $3, $3), ($2, 'planning', 99, 0, 0, $3, $3)
      `, [fromId, toId, now]);
      await pool.query(`
        INSERT INTO collection_place_index (vn_id, place) VALUES ($1, 'Shelf A'), ($2, 'Shelf B')
      `, [fromId, toId]);
      await pool.query(`
        INSERT INTO owned_release (vn_id, release_id, notes, added_at, condition)
        VALUES ($1, 'r995001', 'source edition', $3, 'new'),
               ($2, 'r995001', 'target edition', $3, 'used')
      `, [fromId, toId, now]);
      await pool.query(`
        INSERT INTO physical_bundle (name, anchor_vn_id, anchor_release_id, created_at, updated_at)
        VALUES ('Synthetic bundle', $1, 'r995001', $2, $2)
      `, [fromId, now]);
      await pool.query(`
        INSERT INTO vn_quote (quote_id, vn_id, quote, fetched_at) VALUES ('q995001', $1, 'line', $2)
      `, [fromId, now]);
      await pool.query(`
        INSERT INTO reading_queue (vn_id, position, added_at) VALUES ($1, 3, $3), ($2, 9, $3)
      `, [fromId, toId, now]);
      await pool.query(`
        INSERT INTO vn_stock_alias (vn_id, alias_term, created_at) VALUES ($1, 'Synthetic alias', $2)
      `, [fromId, now]);
      await pool.query(`
        INSERT INTO staff_credit_index (sid, vn_id, is_va) VALUES
          ('s995001', $1, 1), ('s995002', $2, 0)
      `, [fromId, toId]);
      await pool.query(`
        INSERT INTO vn_tag_index (vn_id, tag_id, spoiler) VALUES
          ($1, 'g995001', 0), ($2, 'g995002', 0)
      `, [fromId, toId]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const priorApplicationName = process.env.DATABASE_APPLICATION_NAME;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      process.env.DATABASE_APPLICATION_NAME = 'vndb-identity-contract';
      try {
        await createPostgresVnIdentityRepository().migrate(fromId, toId);
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
        if (priorApplicationName === undefined) delete process.env.DATABASE_APPLICATION_NAME;
        else process.env.DATABASE_APPLICATION_NAME = priorApplicationName;
      }

      await expect(pool.query('SELECT id FROM vn WHERE id = $1', [fromId])).resolves.toMatchObject({ rows: [] });
      await expect(pool.query('SELECT title FROM vn WHERE id = $1', [toId])).resolves.toMatchObject({
        rows: [{ title: 'Canonical' }],
      });
      await expect(pool.query('SELECT status, user_rating FROM collection WHERE vn_id = $1', [toId])).resolves.toMatchObject({
        rows: [{ status: 'completed', user_rating: 77 }],
      });
      await expect(pool.query('SELECT place FROM collection_place_index WHERE vn_id = $1', [toId])).resolves.toMatchObject({
        rows: [{ place: 'Shelf A' }],
      });
      await expect(pool.query('SELECT notes, condition FROM owned_release WHERE vn_id = $1', [toId])).resolves.toMatchObject({
        rows: [{ notes: 'source edition', condition: 'new' }],
      });
      await expect(pool.query('SELECT anchor_vn_id FROM physical_bundle')).resolves.toMatchObject({
        rows: [{ anchor_vn_id: toId }],
      });
      await expect(pool.query('SELECT vn_id FROM vn_quote WHERE quote_id = $1', ['q995001'])).resolves.toMatchObject({
        rows: [{ vn_id: toId }],
      });
      await expect(pool.query('SELECT position FROM reading_queue WHERE vn_id = $1', [toId])).resolves.toMatchObject({
        rows: [{ position: 3 }],
      });
      await expect(pool.query('SELECT alias_term FROM vn_stock_alias WHERE vn_id = $1', [toId])).resolves.toMatchObject({
        rows: [{ alias_term: 'Synthetic alias' }],
      });
      await expect(pool.query('SELECT sid FROM staff_credit_index WHERE vn_id = $1 ORDER BY sid', [toId])).resolves.toMatchObject({
        rows: [{ sid: 's995001' }, { sid: 's995002' }],
      });
      await expect(pool.query('SELECT tag_id FROM vn_tag_index WHERE vn_id = $1 ORDER BY tag_id', [toId])).resolves.toMatchObject({
        rows: [{ tag_id: 'g995002' }],
      });
    });
  });

  it('rejects missing source and target rows without partial writes', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      await pool.query("INSERT INTO vn (id, title, fetched_at) VALUES ('v995010', 'Target', 1)");
      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      try {
        const repository = createPostgresVnIdentityRepository();
        await expect(repository.migrate('egs_995011', 'v995099')).rejects.toThrow('target v995099 not in vn table');
        await expect(repository.migrate('egs_995011', 'v995010')).rejects.toThrow('source egs_995011 not in vn table');
        await expect(repository.migrate('v995010', 'v995010')).resolves.toBeUndefined();
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
      }
    });
  });
});

describe('PostgreSQL Steam repository lifecycle', () => {
  it('preserves manual links and atomically applies confirmed playtime', async () => {
    await withIsolatedSchema(async (pool, schema) => {
      await applyPostgresMigrations(pool, await listPostgresMigrations());
      const now = Date.now();
      await pool.query(`
        INSERT INTO vn (id, title, alttitle, fetched_at) VALUES
          ('v995101', 'Steam Canonical', 'Steam Alternate', 1),
          ('v995102', 'Other VN', NULL, 1)
      `);
      await pool.query(`
        INSERT INTO collection (vn_id, status, playtime_minutes, favorite, added_at, updated_at)
        VALUES ('v995101', 'playing', 10, 0, $1, $1), ('v995102', 'planning', 0, 0, $1, $1)
      `, [now]);

      const priorBackend = process.env.DATABASE_BACKEND;
      const priorUrl = process.env.DATABASE_URL;
      const applicationUrl = new URL(requiredTestUrl());
      applicationUrl.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_BACKEND = 'postgres';
      process.env.DATABASE_URL = applicationUrl.toString();
      try {
        const repository = createPostgresSteamRepository();
        await repository.setLink({ vnId: 'v995101', appid: 101, steamName: 'Manual Steam', source: 'manual' });
        await expect(repository.setLink({
          vnId: 'v995101',
          appid: 202,
          steamName: 'Auto Steam',
          source: 'auto',
        })).resolves.toMatchObject({ appid: 101, source: 'manual' });
        await expect(repository.getLinkByAppid(101)).resolves.toMatchObject({ vn_id: 'v995101' });
        await expect(repository.listCollectionVndbIds()).resolves.toEqual(['v995101', 'v995102']);
        await expect(repository.listSuggestionRows(['v995101'])).resolves.toEqual([
          { vn_id: 'v995101', vn_title: 'Steam Canonical', current: 10 },
        ]);
        await expect(repository.searchCollection('alternate', 12)).resolves.toMatchObject([
          { id: 'v995101', title: 'Steam Canonical' },
        ]);
        await expect(repository.applyPlaytime([
          { vn_id: 'v995101', playtime_minutes: 40 },
          { vn_id: 'v995101', playtime_minutes: 90 },
          { vn_id: 'v995199', playtime_minutes: 500 },
        ])).resolves.toBe(1);
        await expect(repository.getLinkForVn('v995101')).resolves.toMatchObject({ last_synced_minutes: 90 });
        await expect(repository.deleteLink('v995101')).resolves.toBe(true);
        await expect(repository.deleteLink('v995101')).resolves.toBe(false);
      } finally {
        await closePostgresPool();
        if (priorBackend === undefined) delete process.env.DATABASE_BACKEND;
        else process.env.DATABASE_BACKEND = priorBackend;
        if (priorUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorUrl;
      }

      await expect(pool.query("SELECT playtime_minutes FROM collection WHERE vn_id = 'v995101'"))
        .resolves.toMatchObject({ rows: [{ playtime_minutes: 90 }] });
      const activity = await pool.query<{ payload: string } & QueryResultRow>(
        "SELECT payload FROM vn_activity WHERE vn_id = 'v995101' AND kind = 'playtime'",
      );
      expect(JSON.parse(activity.rows[0]?.payload ?? '{}')).toEqual({ from: 10, to: 90, delta: 80 });
    });
  });
});
