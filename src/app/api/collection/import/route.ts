import { NextRequest, NextResponse } from 'next/server';
import { importData, type CollectionExportPayload } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';

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
  // Audit S-050: a chunked request without Content-Length skips the
  // pre-buffer cap below. Reject it with 411 so an attacker can't sidestep
  // the size limit by streaming an unbounded chunked payload.
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
    console.error('[collection/import] JSON parse failed:', (e as Error).message);
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.collection) || !Array.isArray(body.vns)) {
    return NextResponse.json({ error: 'unexpected payload shape' }, { status: 400 });
  }
  // Audit S-041: per-row validation so malformed entries are rejected
  // BEFORE they reach `importData` — every accepted row must carry a
  // VN id matching `v\d+` or `egs_\d+`. The previous handler relied on
  // `importData` to either swallow or surface unexpected shapes via the
  // returned summary, which let bad rows persist into the local tables.
  const VN_ID_RE = /^(v\d+|egs_\d+)$/i;
  const cap = 50_000; // hard ceiling per import file (one-shot user import).
  if (body.vns.length > cap || body.collection.length > cap) {
    return NextResponse.json(
      { error: `import exceeds row cap (max ${cap} per table)` },
      { status: 413 },
    );
  }
  const badVn = body.vns.findIndex((v) => !v || typeof v !== 'object' || typeof (v as { id?: unknown }).id !== 'string' || !VN_ID_RE.test((v as { id: string }).id));
  if (badVn !== -1) {
    return NextResponse.json({ error: `vns[${badVn}].id must match v\\d+ or egs_\\d+` }, { status: 400 });
  }
  const badC = body.collection.findIndex((c) => !c || typeof c !== 'object' || typeof (c as { vn_id?: unknown }).vn_id !== 'string' || !VN_ID_RE.test((c as { vn_id: string }).vn_id));
  if (badC !== -1) {
    return NextResponse.json({ error: `collection[${badC}].vn_id must match v\\d+ or egs_\\d+` }, { status: 400 });
  }
  try {
    const summary = importData(body);
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
