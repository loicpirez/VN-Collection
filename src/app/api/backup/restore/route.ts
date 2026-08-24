import { NextRequest, NextResponse } from 'next/server';
import { restoreFromSqliteFile } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';
import { precheckContentLength } from '@/lib/upload-precheck';
import { reparseWithLimit, PayloadTooLargeError } from '@/lib/read-limited-body';
import { readDatabaseConfig } from '@/lib/db/postgres-config';
import {
  POSTGRES_BACKUP_CONTENT_TYPE,
  POSTGRES_BACKUP_MAX_BYTES,
  PostgresBackupTooLargeError,
  restorePostgresBackup,
} from '@/lib/db/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf-8');
// 1 GiB hard ceiling. Past versions buffered the whole upload into
// RAM before validating, so a multi-GB POST could OOM the process.
// The local DB rarely exceeds 200 MB even with many GB of image
// assets, since images live on disk not in the SQLite file.
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Restoring overwrites every row — must be loopback / token only.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const databaseConfig = readDatabaseConfig();
  if (databaseConfig.backend === 'sqlite-readonly') {
    return NextResponse.json({ error: 'database is read-only' }, { status: 409 });
  }
  if (databaseConfig.backend === 'postgres') {
    if (req.headers.get('x-vncoll-restore-confirm') !== 'RESTORE') {
      return NextResponse.json({ error: 'restore confirmation required' }, { status: 400 });
    }
    const contentType = req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== POSTGRES_BACKUP_CONTENT_TYPE) {
      return NextResponse.json({ error: 'expected a PostgreSQL logical backup' }, { status: 415 });
    }
    const postgresTooLarge = precheckContentLength(req, POSTGRES_BACKUP_MAX_BYTES);
    if (postgresTooLarge) return postgresTooLarge;
    if (!req.body) return NextResponse.json({ error: 'missing backup body' }, { status: 400 });
    try {
      const summary = await restorePostgresBackup(req.body, POSTGRES_BACKUP_MAX_BYTES);
      await recordActivity({
        kind: 'backup.restore',
        entity: 'backup',
        entityId: 'postgres',
        label: 'PostgreSQL logical backup restore',
        payload: {
          tables: summary.tables.length,
          rows: summary.tables.reduce((total, table) => total + table.rows_replaced, 0),
        },
      });
      return NextResponse.json({ ok: true, summary });
    } catch (e) {
      if (e instanceof PostgresBackupTooLargeError) {
        return NextResponse.json({ error: `file too large (max ${POSTGRES_BACKUP_MAX_BYTES} bytes)` }, { status: 413 });
      }
      console.error('[backup/restore] PostgreSQL restore failed:', (e as Error).message);
      return NextResponse.json({ error: 'restore failed' }, { status: 500 });
    }
  }
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }
  const tooLarge = precheckContentLength(req, MAX_UPLOAD_BYTES);
  if (tooLarge) return tooLarge;
  let bounded: Request;
  try {
    bounded = await reparseWithLimit(req, MAX_UPLOAD_BYTES);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` },
        { status: 413 },
      );
    }
    throw e;
  }
  const fd = await bounded.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size} > ${MAX_UPLOAD_BYTES})` },
      { status: 413 },
    );
  }
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length < SQLITE_MAGIC.length || !buf.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
    return NextResponse.json({ error: 'file is not a SQLite database' }, { status: 400 });
  }
  try {
    const summary = await restoreFromSqliteFile(buf);
    await recordActivity({
      kind: 'backup.restore',
      entity: 'backup',
      entityId: 'sqlite',
      label: 'SQLite backup restore',
      payload: { ...summary },
    });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.error('[backup/restore] restore failed:', (e as Error).message);
    return NextResponse.json({ error: 'restore failed' }, { status: 500 });
  }
}
