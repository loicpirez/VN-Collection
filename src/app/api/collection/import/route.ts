import { NextRequest, NextResponse } from 'next/server';
import { importData, type CollectionExportPayload } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// Personal-app collections rarely exceed a few MB even with full
// asset metadata. A 100 MB cap protects against either an accidental
// file upload or a malicious sustained-payload attack while leaving
// 10× headroom over realistic real-world dumps.
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Import overwrites the entire collection — gate.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: `payload too large (${(n / 1024 / 1024).toFixed(1)} MB, max ${MAX_IMPORT_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      );
    }
  }

  let body: CollectionExportPayload;
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.startsWith('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
      if (file.size > MAX_IMPORT_BYTES) {
        return NextResponse.json({ error: 'file too large' }, { status: 413 });
      }
      body = JSON.parse(await file.text()) as CollectionExportPayload;
    } else {
      body = (await req.json()) as CollectionExportPayload;
    }
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.collection) || !Array.isArray(body.vns)) {
    return NextResponse.json({ error: 'unexpected payload shape' }, { status: 400 });
  }
  try {
    const summary = importData(body);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
