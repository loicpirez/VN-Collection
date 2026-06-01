import { NextRequest, NextResponse } from 'next/server';
import { importData } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';
import { PayloadTooLargeError, readBodyWithLimit, reparseWithLimit } from '@/lib/read-limited-body';
import { decodeCollectionImportPayload } from '@/lib/collection-import';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// Personal-app collections rarely exceed a few MB even with full
// asset metadata. A 100 MB cap protects against either an accidental
// file upload or a malicious sustained-payload attack while leaving
// 10× headroom over realistic real-world dumps.
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Import overwrites the entire collection — gate.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const contentLength = req.headers.get('content-length');
  const transferEncoding = req.headers.get('transfer-encoding');
  if (!contentLength && transferEncoding?.toLowerCase().includes('chunked')) {
    return NextResponse.json(
      { error: 'Content-Length required (chunked transfer not accepted for import)' },
      { status: 411 },
    );
  }
  if (contentLength) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: `payload too large (${(n / 1024 / 1024).toFixed(1)} MB, max ${MAX_IMPORT_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      );
    }
  }

  let rawBody: unknown;
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.startsWith('multipart/form-data')) {
      const bounded = await reparseWithLimit(req, MAX_IMPORT_BYTES);
      const fd = await bounded.formData();
      const file = fd.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
      if (file.size > MAX_IMPORT_BYTES) {
        return NextResponse.json({ error: 'file too large' }, { status: 413 });
      }
      rawBody = JSON.parse(await file.text()) as unknown;
    } else {
      const bytes = await readBodyWithLimit(req, MAX_IMPORT_BYTES);
      rawBody = JSON.parse(bytes.toString('utf8')) as unknown;
    }
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: 'payload too large' }, { status: 413 });
    }
    console.error('[collection/import] JSON parse failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const decoded = decodeCollectionImportPayload(rawBody);
  if (!decoded.ok) return NextResponse.json({ error: decoded.error }, { status: 400 });
  try {
    const summary = importData(decoded.value);
    recordActivity({
      kind: 'collection.import',
      entity: 'collection',
      entityId: 'all',
      label: 'Collection import',
      payload: { ...summary },
    });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.error('[collection/import] importData failed:', (e as Error).message);
    return NextResponse.json({ error: 'import failed' }, { status: 500 });
  }
}
