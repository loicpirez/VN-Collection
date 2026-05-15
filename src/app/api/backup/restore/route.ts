import { NextRequest, NextResponse } from 'next/server';
import { restoreFromSqliteFile } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf-8');
// 1 GiB hard ceiling. Past versions buffered the whole upload into
// RAM before validating, so a multi-GB POST could OOM the process.
// The local DB rarely exceeds 200 MB even with many GB of image
// assets, since images live on disk not in the SQLite file.
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Restoring overwrites every row — must be loopback / token only.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }
  const fd = await req.formData();
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
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
