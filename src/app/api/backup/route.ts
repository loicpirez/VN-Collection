import { NextResponse } from 'next/server';
import { stat, unlink, mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';
import { readDatabaseConfig } from '@/lib/db/postgres-config';
import { createPostgresBackupDownload } from '@/lib/db/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  if (readDatabaseConfig().backend === 'postgres') {
    try {
      const backup = await createPostgresBackupDownload();
      await recordActivity({
        kind: 'backup.export',
        entity: 'backup',
        entityId: new Date().toISOString().slice(0, 10),
        label: 'PostgreSQL logical backup export',
      });
      return new NextResponse(backup.stream, {
        status: 200,
        headers: {
          'Content-Type': backup.contentType,
          'Content-Disposition': `attachment; filename="${backup.filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (e) {
      console.error('[backup] PostgreSQL backup failed:', (e as Error).message);
      return NextResponse.json({ error: 'backup failed' }, { status: 500 });
    }
  }

  const dir = await mkdtemp(join(tmpdir(), 'vndb-backup-'));
  const tmpPath = join(dir, 'snapshot.db');
  const cleanupDir = (): void => {
    rm(dir, { recursive: true, force: true }).catch(() => undefined);
  };
  try {
    const { db } = await import('@/lib/db');
    await db.backup(tmpPath);
  } catch (e) {
    console.error('[backup] SQLite backup failed:', (e as Error).message);
    cleanupDir();
    return NextResponse.json({ error: 'backup failed' }, { status: 500 });
  }

  let size: number;
  try {
    size = (await stat(tmpPath)).size;
  } catch {
    cleanupDir();
    return NextResponse.json({ error: 'backup file not found after write' }, { status: 500 });
  }

  const date = new Date().toISOString().slice(0, 10);
  await recordActivity({
    kind: 'backup.export',
    entity: 'backup',
    entityId: date,
    label: 'SQLite backup export',
    payload: { size },
  });

  const nodeStream = createReadStream(tmpPath);
  const cleanup = (): void => {
    unlink(tmpPath).catch(() => undefined).finally(() => cleanupDir());
  };
  nodeStream.on('close', cleanup);
  nodeStream.on('error', cleanup);

  try {
    const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="vndb-collection-${date}.db"`,
        'Content-Length': String(size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    nodeStream.off('close', cleanup);
    nodeStream.off('error', cleanup);
    nodeStream.destroy();
    cleanup();
    console.error('[backup] stream conversion failed:', (e as Error).message);
    return NextResponse.json({ error: 'backup failed' }, { status: 500 });
  }
}
