import { NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { db, getDbPath } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: Request) {
  // The .db file contains the VNDB token, Steam API key, EGS
  // username, and the full collection — gate behind localhost /
  // admin token so a LAN snoop can't pull credentials.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  // Issue a SQLite checkpoint so the WAL is flushed before reading.
  // (Best-effort — even without it, the .db is consistent thanks to WAL,
  // but a clean checkpoint produces a smaller, single-file backup.)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // ignore
  }

  const dbPath = getDbPath();
  let size: number;
  try {
    size = (await stat(dbPath)).size;
  } catch {
    return NextResponse.json({ error: 'db file not found' }, { status: 500 });
  }
  const stream = Readable.toWeb(createReadStream(dbPath)) as ReadableStream<Uint8Array>;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="vndb-collection-${date}.db"`,
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}
