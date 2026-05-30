import { NextResponse } from 'next/server';
import { stat, unlink, mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { db } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const dir = await mkdtemp(join(tmpdir(), 'vndb-backup-'));
  const tmpPath = join(dir, 'snapshot.db');
  const cleanupDir = (): void => {
    rm(dir, { recursive: true, force: true }).catch(() => undefined);
  };
  try {
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
  recordActivity({
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
