import { NextRequest, NextResponse } from 'next/server';
import { restoreFromSqliteFile } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf-8');

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }
  const fd = await req.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
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
