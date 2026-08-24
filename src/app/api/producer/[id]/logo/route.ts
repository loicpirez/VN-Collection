import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getProducerRepository } from '@/lib/db/repositories/producer';
import { getProducer as fetchProducer } from '@/lib/vndb';
import { saveUpload, UnsupportedFileType } from '@/lib/files';
import { recordActivity } from '@/lib/activity';
import { precheckContentLength } from '@/lib/upload-precheck';
import { reparseWithLimit, PayloadTooLargeError } from '@/lib/read-limited-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const tooLarge = precheckContentLength(req, MAX_LOGO_BYTES);
  if (tooLarge) return tooLarge;
  const { id } = await ctx.params;
  if (!/^p\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const repository = getProducerRepository();
  if (!await repository.get(id)) {
    try {
      const fresh = await fetchProducer(id);
      if (!fresh) return NextResponse.json({ error: 'producer not found' }, { status: 404 });
      await repository.upsert(fresh);
    } catch (err) {
      return upstreamError('producer/[id]/logo', err);
    }
  }

  let bounded: Request;
  try {
    bounded = await reparseWithLimit(req, MAX_LOGO_BYTES);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: 'file too large (max 5MB)' }, { status: 413 });
    }
    throw e;
  }
  const fd = await bounded.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  const file = fd.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'file too large (max 5MB)' }, { status: 400 });
  }
  let path: string;
  try {
    path = await saveUpload('producerLogo', file, id);
  } catch (e) {
    if (e instanceof UnsupportedFileType) {
      return NextResponse.json({ error: 'must be an image' }, { status: 400 });
    }
    throw e;
  }
  await repository.setLogo(id, path);
  try {
    await recordActivity({
      kind: 'producer.logo-set',
      entity: 'producer',
      entityId: id,
      label: 'Uploaded producer logo',
      payload: { bytes: file.size },
    });
  } catch (e) {
    console.error(`[producer:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ producer: await repository.get(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^p\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const repository = getProducerRepository();
  if (!await repository.get(id)) {
    return NextResponse.json({ error: 'producer not found' }, { status: 404 });
  }
  await repository.setLogo(id, null);
  try {
    await recordActivity({
      kind: 'producer.logo-clear',
      entity: 'producer',
      entityId: id,
      label: 'Cleared producer logo',
    });
  } catch (e) {
    console.error(`[producer:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ producer: await repository.get(id) });
}
