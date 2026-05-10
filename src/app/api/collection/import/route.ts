import { NextRequest, NextResponse } from 'next/server';
import { importData, type CollectionExportPayload } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: CollectionExportPayload;
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.startsWith('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
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
