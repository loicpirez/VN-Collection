import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  createPostgresBackupDownload,
  POSTGRES_BACKUP_CONTENT_TYPE,
  PostgresBackupTooLargeError,
  restorePostgresBackup,
  type PostgresBackupClient,
  type PostgresBackupPool,
} from '@/lib/db/backup';
import { POSTGRES_TABLE_ORDER, type PostgresMigrationTable } from '@/lib/db/postgres-migration-manifest';
import type { PostgresParameter } from '@/lib/db/postgres';

const MIGRATIONS = [
  '0001_baseline',
  '0002_json_quarantine',
  '0003_search_normalization',
  '0004_text_search',
  '0005_stock_batch_providers',
  '0006_physical_bundles',
  '0007_query_plan_indexes',
];

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function typedRows<Row extends QueryResultRow>(rows: QueryResultRow[]): Row[] {
  return rows.map((row) => row as Row);
}

interface FakeOptions {
  mode: 'export' | 'restore';
  missingTable?: PostgresMigrationTable;
  exportValue?: PostgresParameter | Record<string, string>;
  failOn?: RegExp;
  countOffset?: number;
  unsafeColumn?: boolean;
  rollbackFails?: boolean;
  identityTable?: PostgresMigrationTable;
}

class FakeClient implements PostgresBackupClient {
  readonly release = vi.fn();
  readonly queries: string[] = [];
  private readonly fetched = new Set<string>();
  private readonly stageCounts = new Map<string, number>();
  private readonly targetCounts = new Map<string, number>();

  constructor(private readonly options: FakeOptions) {}

  async query<Row extends QueryResultRow>(text: string, values: PostgresParameter[] = []): Promise<QueryResult<Row>> {
    const sql = text.replace(/\s+/g, ' ').trim();
    this.queries.push(sql);
    if (sql === 'ROLLBACK' && this.options.rollbackFails) throw new Error('synthetic rollback failure');
    if (this.options.failOn?.test(sql)) throw new Error('synthetic database failure');
    if (sql.includes("to_regclass('schema_migration')")) return result(typedRows<Row>([{ relation: 'schema_migration' }]));
    if (sql === 'SELECT version FROM schema_migration ORDER BY version') {
      return result(typedRows<Row>(MIGRATIONS.map((version) => ({ version }))));
    }
    if (sql.includes('FROM information_schema.columns')) {
      const rows: QueryResultRow[] = [];
      for (const table of POSTGRES_TABLE_ORDER) {
        if (table === this.options.missingTable) continue;
        rows.push({
          table_name: table,
          column_name: this.options.unsafeColumn && table === 'vn' ? 'unsafe-column' : 'value',
          ordinal_position: 1,
          is_identity: this.options.identityTable === table ? 'YES' : 'NO',
        });
      }
      return result(typedRows<Row>(rows));
    }
    if (sql.startsWith('FETCH FORWARD')) {
      const cursor = sql.split(' FROM ')[1];
      if (cursor === 'backup_cursor_0' && !this.fetched.has(cursor)) {
        this.fetched.add(cursor);
        const value = this.options.exportValue ?? 'first row';
        return result(typedRows<Row>([{ value }, { value: null }]));
      }
      return result([]);
    }
    const stageInsert = /^INSERT INTO (backup_stage_\d+) \("value"\) VALUES /.exec(sql);
    if (stageInsert) {
      this.stageCounts.set(stageInsert[1], (this.stageCounts.get(stageInsert[1]) ?? 0) + values.length);
      return result([]);
    }
    const targetInsert = /^INSERT INTO "([a-z0-9_]+)" \("value"\) SELECT "value" FROM (backup_stage_\d+)$/.exec(sql);
    if (targetInsert) {
      this.targetCounts.set(targetInsert[1], this.stageCounts.get(targetInsert[2]) ?? 0);
      return result([]);
    }
    const count = /^SELECT COUNT\(\*\)::BIGINT AS count FROM "([a-z0-9_]+)"$/.exec(sql);
    if (count) {
      const value = (this.targetCounts.get(count[1]) ?? 0) + (this.options.countOffset ?? 0);
      return result(typedRows<Row>([{ count: value }]));
    }
    return result([]);
  }
}

class FakePool implements PostgresBackupPool {
  readonly connect = vi.fn(async () => this.client);

  constructor(readonly client: FakeClient) {}
}

class RejectingPool implements PostgresBackupPool {
  async connect(): Promise<PostgresBackupClient> {
    throw new Error('synthetic connect failure');
  }
}

async function downloadBytes(client = new FakeClient({ mode: 'export' })): Promise<{ bytes: Uint8Array; client: FakeClient }> {
  const backup = await createPostgresBackupDownload(new FakePool(client));
  expect(backup.contentType).toBe(POSTGRES_BACKUP_CONTENT_TYPE);
  expect(backup.filename).toMatch(/^vndb-collection-\d{4}-\d{2}-\d{2}\.vncbackup$/);
  const bytes = new Uint8Array(await new Response(backup.stream).arrayBuffer());
  return { bytes, client };
}

function byteStream(bytes: Uint8Array, chunkSize = bytes.byteLength): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.byteLength, offset + chunkSize);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

function textStream(text: string): ReadableStream<Uint8Array> {
  return byteStream(new TextEncoder().encode(text));
}

function backupLines(bytes: Uint8Array): string[] {
  return new TextDecoder().decode(bytes).trimEnd().split('\n');
}

function withFooter(lines: string[], rows: Array<{ table: PostgresMigrationTable; values: PostgresParameter[] }>): string {
  const body = rows.map((row) => `${JSON.stringify({ type: 'row', ...row })}\n`).join('');
  const counts = Object.fromEntries(POSTGRES_TABLE_ORDER.map((table) => [table, 0])) as Record<PostgresMigrationTable, number>;
  for (const row of rows) counts[row.table] += 1;
  const footer = {
    type: 'footer',
    rows: rows.length,
    counts,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
  return `${lines[0]}\n${body}${JSON.stringify(footer)}\n`;
}

async function expectRestoreError(text: string, message: string | RegExp): Promise<void> {
  await expect(restorePostgresBackup(textStream(text), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
    .rejects.toThrow(message);
}

describe('PostgreSQL logical backup', () => {
  it('streams a snapshot and restores it through verified staging tables', async () => {
    const exported = await downloadBytes();
    expect(exported.client.queries).toContain('COMMIT');
    expect(exported.client.release).toHaveBeenCalledTimes(1);
    const restoreClient = new FakeClient({ mode: 'restore' });
    const summary = await restorePostgresBackup(byteStream(exported.bytes, 17), exported.bytes.byteLength + 1, new FakePool(restoreClient));

    expect(summary.tables).toHaveLength(POSTGRES_TABLE_ORDER.length);
    expect(summary.tables[0]).toEqual({ name: 'vn', rows_replaced: 2 });
    expect(summary.skipped).toEqual([]);
    expect(restoreClient.queries).toContain('COMMIT');
    expect(restoreClient.release).toHaveBeenCalledTimes(1);
  });

  it('realigns identity sequences after restoring explicit identifiers', async () => {
    const exported = await downloadBytes(new FakeClient({ mode: 'export', identityTable: 'vn', exportValue: 7 }));
    const restoreClient = new FakeClient({ mode: 'restore', identityTable: 'vn' });
    await restorePostgresBackup(byteStream(exported.bytes), undefined, new FakePool(restoreClient));
    expect(restoreClient.queries.some((query) => query.includes('SELECT setval(') && query.includes('FROM "vn"'))).toBe(true);
  });

  it('rolls back and releases a cancelled export stream', async () => {
    const client = new FakeClient({ mode: 'export' });
    const backup = await createPostgresBackupDownload(new FakePool(client));
    const reader = backup.stream.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    expect(client.queries).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('cleans up setup and serialization failures', async () => {
    const missing = new FakeClient({ mode: 'export', missingTable: 'vn' });
    await expect(createPostgresBackupDownload(new FakePool(missing))).rejects.toThrow('PostgreSQL backup table is missing: vn');
    expect(missing.queries).toContain('ROLLBACK');
    expect(missing.release).toHaveBeenCalledTimes(1);

    const unsupported = new FakeClient({ mode: 'export', exportValue: { invalid: 'object' } });
    const backup = await createPostgresBackupDownload(new FakePool(unsupported));
    await expect(new Response(backup.stream).text()).rejects.toThrow('Unsupported PostgreSQL backup value');
    expect(unsupported.release).toHaveBeenCalledTimes(1);

    const unsafe = new FakeClient({ mode: 'export', unsafeColumn: true });
    await expect(createPostgresBackupDownload(new FakePool(unsafe))).rejects.toThrow('unsafe column');

    for (const exportValue of [true, 42, Number.POSITIVE_INFINITY]) {
      const scalarClient = new FakeClient({ mode: 'export', exportValue });
      const scalarBackup = await createPostgresBackupDownload(new FakePool(scalarClient));
      if (exportValue !== Number.POSITIVE_INFINITY) await expect(new Response(scalarBackup.stream).text()).resolves.toContain('"type":"footer"');
      else await expect(new Response(scalarBackup.stream).text()).rejects.toThrow('Unsupported PostgreSQL backup value');
    }
  });

  it('rejects empty, malformed, unsupported, and oversized input before replacement', async () => {
    const pool = new FakePool(new FakeClient({ mode: 'restore' }));
    await expect(restorePostgresBackup(textStream(''), 100, pool)).rejects.toThrow('PostgreSQL backup is empty');
    await expect(restorePostgresBackup(textStream('{bad}\n'), 100, pool)).rejects.toThrow('invalid JSON');
    await expect(restorePostgresBackup(textStream('[]\n'), 100, pool)).rejects.toThrow('must be an object');
    await expect(restorePostgresBackup(textStream('{}\n'), 100, pool)).rejects.toThrow('Unsupported PostgreSQL backup header');
    await expect(restorePostgresBackup(textStream('x'.repeat(101)), 100, pool)).rejects.toBeInstanceOf(PostgresBackupTooLargeError);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects incompatible header metadata and rolls back', async () => {
    const { bytes } = await downloadBytes();
    const lines = backupLines(bytes);
    const header = JSON.parse(lines[0]) as { migrations: string[]; tables: Array<{ name: string; columns: string[] }> };
    header.migrations = header.migrations.slice(0, -1);
    lines[0] = JSON.stringify(header);
    const migrationClient = new FakeClient({ mode: 'restore' });
    await expect(restorePostgresBackup(textStream(`${lines.join('\n')}\n`), undefined, new FakePool(migrationClient)))
      .rejects.toThrow('migration versions');
    expect(migrationClient.queries).toContain('ROLLBACK');

    const tableLines = backupLines(bytes);
    const tableHeader = JSON.parse(tableLines[0]) as { tables: Array<{ name: string; columns: string[] }> };
    tableHeader.tables[0].columns = ['different'];
    tableLines[0] = JSON.stringify(tableHeader);
    await expect(restorePostgresBackup(textStream(`${tableLines.join('\n')}\n`), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
      .rejects.toThrow('schema mismatch for vn');
  });

  it('validates every header collection and identifier boundary', async () => {
    const { bytes } = await downloadBytes();
    const original = backupLines(bytes);
    const variants: Array<{ mutate: (header: Record<string, unknown>) => void; message: string }> = [
      { mutate: (header) => { header.migrations = 'bad'; }, message: 'migration list is invalid' },
      { mutate: (header) => { header.tables = [null]; }, message: 'table metadata is invalid' },
      { mutate: (header) => { header.tables = [{ name: 'not_a_table', columns: ['value'] }]; }, message: 'table metadata is invalid' },
      { mutate: (header) => { header.tables = [{ name: 'vn', columns: 'bad' }]; }, message: 'columns for vn is invalid' },
      { mutate: (header) => { header.tables = [{ name: 'vn', columns: ['unsafe-column'], identity_columns: [] }]; }, message: 'columns for vn are invalid' },
      { mutate: (header) => { header.tables = [{ name: 'vn', columns: ['value'], identity_columns: ['missing'] }]; }, message: 'identity columns for vn are invalid' },
    ];
    for (const variant of variants) {
      const lines = [...original];
      const header = JSON.parse(lines[0]) as Record<string, unknown>;
      variant.mutate(header);
      lines[0] = JSON.stringify(header);
      await expectRestoreError(`${lines.join('\n')}\n`, variant.message);
    }

    const fewer = [...original];
    const fewerHeader = JSON.parse(fewer[0]) as { tables: object[] };
    fewerHeader.tables.pop();
    fewer[0] = JSON.stringify(fewerHeader);
    await expectRestoreError(`${fewer.join('\n')}\n`, 'table set does not match');

    const wrongName = [...original];
    const wrongNameHeader = JSON.parse(wrongName[0]) as { tables: Array<{ name: string; columns: string[] }> };
    [wrongNameHeader.tables[0], wrongNameHeader.tables[1]] = [wrongNameHeader.tables[1], wrongNameHeader.tables[0]];
    wrongName[0] = JSON.stringify(wrongNameHeader);
    await expectRestoreError(`${wrongName.join('\n')}\n`, 'schema mismatch for vn');

    const extraColumn = [...original];
    const extraColumnHeader = JSON.parse(extraColumn[0]) as { tables: Array<{ columns: string[] }> };
    extraColumnHeader.tables[0].columns.push('other');
    extraColumn[0] = JSON.stringify(extraColumnHeader);
    await expectRestoreError(`${extraColumn.join('\n')}\n`, 'schema mismatch for vn');

    const wrongMigration = [...original];
    const wrongMigrationHeader = JSON.parse(wrongMigration[0]) as { migrations: string[] };
    wrongMigrationHeader.migrations[0] = '0001_changed';
    wrongMigration[0] = JSON.stringify(wrongMigrationHeader);
    await expectRestoreError(`${wrongMigration.join('\n')}\n`, 'migration versions');
  });

  it('rejects malformed rows, ordering errors, and invalid footer integrity', async () => {
    const { bytes } = await downloadBytes();
    const lines = backupLines(bytes);
    const badRow = [...lines];
    badRow[1] = JSON.stringify({ type: 'row', table: 'vn', values: [] });
    await expect(restorePostgresBackup(textStream(`${badRow.join('\n')}\n`), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
      .rejects.toThrow('values are invalid');

    const outOfOrder = withFooter(lines, [
      { table: 'collection', values: ['second table'] },
      { table: 'vn', values: ['first table too late'] },
    ]);
    await expect(restorePostgresBackup(textStream(outOfOrder), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
      .rejects.toThrow('out of table order');

    const missingFooter = `${lines[0]}\n${lines[1]}\n`;
    await expect(restorePostgresBackup(textStream(missingFooter), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
      .rejects.toThrow('footer is missing');

    const trailing = `${lines.join('\n')}\n{}\n`;
    await expect(restorePostgresBackup(textStream(trailing), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
      .rejects.toThrow('data after the footer');

    const corrupt = [...lines];
    const footer = JSON.parse(corrupt.at(-1)!) as { sha256: string };
    footer.sha256 = '0'.repeat(64);
    corrupt[corrupt.length - 1] = JSON.stringify(footer);
    await expect(restorePostgresBackup(textStream(`${corrupt.join('\n')}\n`), undefined, new FakePool(new FakeClient({ mode: 'restore' }))))
      .rejects.toThrow('integrity check failed');
  });

  it('validates row records and all footer count contracts', async () => {
    const { bytes } = await downloadBytes();
    const lines = backupLines(bytes);
    await expectRestoreError(withFooter(lines, []) .replace(`${JSON.stringify(JSON.parse(lines[0]))}\n`, `${lines[0]}\n{}\n`), 'row is invalid');
    await expectRestoreError(`${lines[0]}\n\n${lines.at(-1)}\n`, 'empty record');

    const invalidFooterVariants: Array<{ mutate: (footer: Record<string, unknown>) => void; message: string }> = [
      { mutate: (footer) => { footer.rows = -1; }, message: 'footer is invalid' },
      { mutate: (footer) => { footer.sha256 = 'bad'; }, message: 'footer is invalid' },
      { mutate: (footer) => { footer.counts = null; }, message: 'footer is invalid' },
      { mutate: (footer) => { (footer.counts as Record<string, number>).vn = -1; }, message: 'count is invalid for vn' },
      { mutate: (footer) => { (footer.counts as Record<string, number>).extra = 0; }, message: 'footer has unexpected tables' },
    ];
    for (const variant of invalidFooterVariants) {
      const changed = [...lines];
      const footer = JSON.parse(changed.at(-1)!) as Record<string, unknown>;
      variant.mutate(footer);
      changed[changed.length - 1] = JSON.stringify(footer);
      await expectRestoreError(`${changed.join('\n')}\n`, variant.message);
    }

    const countMismatch = [...lines];
    const countFooter = JSON.parse(countMismatch.at(-1)!) as { counts: Record<string, number> };
    countFooter.counts.vn += 1;
    countMismatch[countMismatch.length - 1] = JSON.stringify(countFooter);
    await expectRestoreError(`${countMismatch.join('\n')}\n`, 'count mismatch for vn');

    const totalMismatch = [...lines];
    const totalFooter = JSON.parse(totalMismatch.at(-1)!) as { rows: number };
    totalFooter.rows += 1;
    totalMismatch[totalMismatch.length - 1] = JSON.stringify(totalFooter);
    await expectRestoreError(`${totalMismatch.join('\n')}\n`, 'total row count');
  });

  it('handles final records without newlines, batched inserts, and line limits', async () => {
    const { bytes } = await downloadBytes();
    const withoutFinalNewline = bytes.slice(0, -1);
    const restored = await restorePostgresBackup(byteStream(withoutFinalNewline), undefined, new FakePool(new FakeClient({ mode: 'restore' })));
    expect(restored.tables[0].rows_replaced).toBe(2);

    const lines = backupLines(bytes);
    const rows = Array.from({ length: 100 }, (_, index) => ({ table: 'vn' as const, values: [`row ${index}`] }));
    const batched = await restorePostgresBackup(textStream(withFooter(lines, rows)), undefined, new FakePool(new FakeClient({ mode: 'restore' })));
    expect(batched.tables[0].rows_replaced).toBe(100);

    const oversizedRecord = 'x'.repeat(16 * 1024 * 1024 + 1);
    await expectRestoreError(`${lines[0]}\n${oversizedRecord}\n`, 'record is too large');
    await expectRestoreError(`${lines[0]}\n${oversizedRecord}`, 'record is too large');
  });

  it('closes the input reader when pool connection and rollback fail', async () => {
    const { bytes } = await downloadBytes();
    await expect(restorePostgresBackup(byteStream(bytes), undefined, new RejectingPool())).rejects.toThrow('synthetic connect failure');

    const rollbackFailure = new FakeClient({ mode: 'restore', failOn: /^TRUNCATE TABLE/, rollbackFails: true });
    await expect(restorePostgresBackup(byteStream(bytes), undefined, new FakePool(rollbackFailure))).rejects.toThrow('synthetic database failure');
    expect(rollbackFailure.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back database and post-restore verification failures', async () => {
    const { bytes } = await downloadBytes();
    const failed = new FakeClient({ mode: 'restore', failOn: /^TRUNCATE TABLE/ });
    await expect(restorePostgresBackup(byteStream(bytes), undefined, new FakePool(failed))).rejects.toThrow('synthetic database failure');
    expect(failed.queries).toContain('ROLLBACK');
    expect(failed.release).toHaveBeenCalledTimes(1);

    const mismatch = new FakeClient({ mode: 'restore', countOffset: 1 });
    await expect(restorePostgresBackup(byteStream(bytes), undefined, new FakePool(mismatch))).rejects.toThrow('restore verification failed for vn');
    expect(mismatch.queries).toContain('ROLLBACK');
  });
});
