import type { QueryResult, QueryResultRow } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RawCacheExportClient,
  RawCacheExportPool,
} from '@/lib/db/raw-cache-export';

interface RawRow {
  cache_key: string;
  body: string;
  etag: string | null;
  last_modified: string | null;
  fetched_at: number;
  expires_at: number;
}

const sqliteMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  iterate: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
  backend: 'sqlite',
  getPostgresPool: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { prepare: sqliteMocks.prepare },
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => runtimeMocks.backend === 'postgres'
    ? { backend: 'postgres' }
    : { backend: 'sqlite' },
}));

vi.mock('@/lib/db/postgres', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/postgres')>();
  return { ...actual, getPostgresPool: runtimeMocks.getPostgresPool };
});

import {
  createRawCacheExport,
  createPostgresRawCacheExport,
  createSqliteRawCacheExport,
} from '@/lib/db/raw-cache-export';

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function typedRows<Row extends QueryResultRow>(rows: QueryResultRow[]): Row[] {
  return rows.map((entry) => entry as Row);
}

function row(overrides: Partial<RawRow> = {}): RawRow {
  return {
    cache_key: 'cache:one',
    body: '{"ok":true}',
    etag: null,
    last_modified: null,
    fetched_at: 1,
    expires_at: 2,
    ...overrides,
  };
}

class FakeClient implements RawCacheExportClient {
  readonly release = vi.fn();
  readonly queries: string[] = [];
  private fetched = false;

  constructor(
    private readonly options: {
      failOn?: RegExp;
      closeFails?: boolean;
      rollbackFails?: boolean;
      emptyCount?: boolean;
    } = {},
  ) {}

  async query<Row extends QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    const sql = text.replace(/\s+/g, ' ').trim();
    this.queries.push(sql);
    if (sql === 'CLOSE raw_cache_export_cursor' && this.options.closeFails) {
      throw new Error('synthetic close failure');
    }
    if (sql === 'ROLLBACK' && this.options.rollbackFails) {
      throw new Error('synthetic rollback failure');
    }
    if (this.options.failOn?.test(sql)) throw new Error('synthetic database failure');
    if (sql.startsWith('SELECT COUNT(*)')) {
      if (this.options.emptyCount) return result([]);
      return result(typedRows<Row>([{ count: 2 }]));
    }
    if (sql.startsWith('FETCH FORWARD')) {
      if (this.fetched) return result([]);
      this.fetched = true;
      return result(typedRows<Row>([
        row(),
        row({ cache_key: 'cache:two', body: '{broken', etag: 'etag' }),
      ]));
    }
    return result([]);
  }
}

class FakePool implements RawCacheExportPool {
  readonly connect = vi.fn(async () => this.client);

  constructor(readonly client: FakeClient) {}
}

function returningIterator(onReturn: () => void): IterableIterator<RawRow> {
  let yielded = false;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      if (yielded) return { done: true, value: undefined };
      yielded = true;
      return { done: false, value: row() };
    },
    return() {
      onReturn();
      return { done: true, value: undefined };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMocks.backend = 'sqlite';
  sqliteMocks.prepare.mockImplementation((sql: string) => sql.includes('COUNT(*)')
    ? { get: () => ({ count: 2 }) }
    : { iterate: sqliteMocks.iterate });
  sqliteMocks.iterate.mockReturnValue([row(), row({ cache_key: 'cache:two', body: '{broken' })][Symbol.iterator]());
});

describe('raw cache export', () => {
  it('selects the configured backend and uses the shared PostgreSQL pool', async () => {
    const sqlite = await createRawCacheExport();
    await new Response(sqlite.stream).text();

    const client = new FakeClient();
    runtimeMocks.backend = 'postgres';
    runtimeMocks.getPostgresPool.mockReturnValueOnce(new FakePool(client));
    const postgres = await createRawCacheExport();
    await new Response(postgres.stream).text();

    expect(runtimeMocks.getPostgresPool).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('streams valid SQLite JSON while preserving malformed cached bodies', async () => {
    const download = await createSqliteRawCacheExport();
    const parsed = JSON.parse(await new Response(download.stream).text()) as {
      entry_count: number;
      entries: Array<{ cache_key: string; body: unknown }>;
    };

    expect(download.filename).toMatch(/^vndb-raw-\d{4}-\d{2}-\d{2}\.json$/);
    expect(parsed.entry_count).toBe(2);
    expect(parsed.entries).toEqual([
      expect.objectContaining({ cache_key: 'cache:one', body: { ok: true } }),
      expect.objectContaining({ cache_key: 'cache:two', body: '{broken' }),
    ]);
  });

  it('closes the SQLite iterator when the consumer cancels', async () => {
    const onReturn = vi.fn();
    sqliteMocks.iterate.mockReturnValue(returningIterator(onReturn));
    const download = await createSqliteRawCacheExport();
    const reader = download.stream.getReader();

    await reader.read();
    await reader.read();
    await reader.cancel();

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('streams a repeatable-read PostgreSQL snapshot and releases its client', async () => {
    const client = new FakeClient();
    const download = await createPostgresRawCacheExport(new FakePool(client));
    const parsed = JSON.parse(await new Response(download.stream).text()) as {
      entry_count: number;
      entries: Array<{ body: unknown }>;
    };

    expect(parsed.entry_count).toBe(2);
    expect(parsed.entries[0]?.body).toEqual({ ok: true });
    expect(parsed.entries[1]?.body).toBe('{broken');
    expect(client.queries).toContain('COMMIT');
    expect(client.queries).not.toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases a cancelled PostgreSQL snapshot', async () => {
    const client = new FakeClient();
    const download = await createPostgresRawCacheExport(new FakePool(client));
    const reader = download.stream.getReader();

    await reader.read();
    await reader.cancel();

    expect(client.queries).toContain('CLOSE raw_cache_export_cursor');
    expect(client.queries).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('cleans up PostgreSQL setup and cursor failures', async () => {
    const begin = new FakeClient({ failOn: /^BEGIN/ });
    await expect(createPostgresRawCacheExport(new FakePool(begin))).rejects.toThrow('synthetic database failure');
    expect(begin.queries).not.toContain('ROLLBACK');
    expect(begin.release).toHaveBeenCalledTimes(1);

    const setup = new FakeClient({ failOn: /^SELECT COUNT/ });
    await expect(createPostgresRawCacheExport(new FakePool(setup))).rejects.toThrow('synthetic database failure');
    expect(setup.queries).toContain('ROLLBACK');
    expect(setup.release).toHaveBeenCalledTimes(1);

    const fetch = new FakeClient({ failOn: /^FETCH FORWARD/ });
    const download = await createPostgresRawCacheExport(new FakePool(fetch));
    await expect(new Response(download.stream).text()).rejects.toThrow('synthetic database failure');
    expect(fetch.queries).toContain('ROLLBACK');
    expect(fetch.release).toHaveBeenCalledTimes(1);
  });

  it('uses zero when the PostgreSQL count query returns no row', async () => {
    const client = new FakeClient({ emptyCount: true });
    const download = await createPostgresRawCacheExport(new FakePool(client));
    const parsed = JSON.parse(await new Response(download.stream).text()) as { entry_count: number };
    expect(parsed.entry_count).toBe(0);
  });

  it('still releases the PostgreSQL client when close and rollback fail', async () => {
    const client = new FakeClient({ closeFails: true, rollbackFails: true });
    const download = await createPostgresRawCacheExport(new FakePool(client));
    const reader = download.stream.getReader();

    await reader.read();
    await reader.cancel();

    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
