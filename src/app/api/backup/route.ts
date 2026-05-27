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
  // Helper: blow away the whole tmp directory. Use this on every exit
  // path so a backup() failure or a Readable.toWeb() throw doesn't
  // leave the directory behind (the file alone would be unlinked by
  // the `close` listener, but the *directory* never was — a long-
  // running process would accumulate empty dirs in /tmp under
  // repeated backup pulls).
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
  // Unlink the file then the directory once the read stream closes.
  // Also handle stream error so a failed pipe doesn't leak.
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
    nodeStream.destroy();
    cleanupDir();
    console.error('[backup] stream conversion failed:', (e as Error).message);
    return NextResponse.json({ error: 'backup failed' }, { status: 500 });
  }
}
