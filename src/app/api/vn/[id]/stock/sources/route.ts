import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { deleteStockSource, listStockSources, upsertStockSource } from '@/lib/db';
import { detectStockProviderFromUrl, extractAmazonAsin, getStockForVn } from '@/lib/stock';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import { isValidVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Maximum allowed length for a manually-pasted shop URL. */
export const STOCK_SOURCE_URL_MAX_LENGTH = 1024;
/** Maximum number of manual sources stored per VN. */
export const STOCK_SOURCE_MAX_COUNT = 32;

function normalizeSourceUrl(raw: unknown): { url: string; provider: string; productId: string | null } | { error: string } {
  if (typeof raw !== 'string' || raw.trim().length === 0) return { error: 'url required' };
  const trimmed = raw.trim();
  if (trimmed.length > STOCK_SOURCE_URL_MAX_LENGTH) return { error: 'url too long' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: 'invalid url' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'unsupported url' };
  const normalizedUrl = url.toString();
  if (!isAllowedHttpTarget(normalizedUrl)) return { error: 'unsupported provider' };
  const provider = detectStockProviderFromUrl(normalizedUrl);
  if (!provider) return { error: 'unsupported provider' };
  const productId = provider === 'amazon_jp' ? extractAmazonAsin(normalizedUrl) : null;
  const canonicalUrl = productId ? `https://www.amazon.co.jp/dp/${productId}` : normalizedUrl;
  return { url: canonicalUrl, provider, productId };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  return NextResponse.json({ sources: listStockSources(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawIdPost } = await ctx.params;
  const id = rawIdPost.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  const parsed = normalizeSourceUrl(body.url);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const releaseIdRaw = typeof body.release_id === 'string' && body.release_id.trim() ? body.release_id.trim() : null;
  if (body.release_id != null && (!releaseIdRaw || !/^r\d+$/i.test(releaseIdRaw))) {
    return NextResponse.json({ error: 'invalid release_id' }, { status: 400 });
  }
  const releaseId = releaseIdRaw && /^r\d+$/i.test(releaseIdRaw) ? releaseIdRaw : null;
  const existing = listStockSources(id);
  // Allow updating an existing (vn_id, provider, url) tuple even at the cap.
  const isUpdate = existing.some((s) => s.provider === parsed.provider && s.url === parsed.url);
  if (!isUpdate && existing.length >= STOCK_SOURCE_MAX_COUNT) {
    return NextResponse.json(
      { error: `too many manual sources (max ${STOCK_SOURCE_MAX_COUNT})` },
      { status: 400 },
    );
  }
  upsertStockSource({
    vn_id: id,
    release_id: releaseId,
    provider: parsed.provider,
    url: parsed.url,
    product_id: parsed.productId,
  });
  return NextResponse.json(getStockForVn(id));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawIdDelete } = await ctx.params;
  const id = rawIdDelete.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  const sourceId = typeof body.id === 'number' ? body.id : typeof body.source_id === 'number' ? body.source_id : null;
  if (typeof sourceId !== 'number' || !Number.isSafeInteger(sourceId) || sourceId <= 0) {
    return NextResponse.json({ error: 'source id required' }, { status: 400 });
  }
  deleteStockSource(id, sourceId);
  return NextResponse.json(getStockForVn(id));
}
