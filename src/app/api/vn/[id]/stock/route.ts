import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { clearVnStockCache } from '@/lib/db';
import { getStockForVn, refreshStockForVn, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock';
import { sanitizeErrorMessage } from '@/lib/error-sanitize';
import { isValidVnId } from '@/lib/vn-id-shape';


export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ProviderParse {
  providers: StockProviderId[];
  error: string | null;
}

function parseProviders(value: unknown): ProviderParse {
  if (value === undefined) return { providers: [...STOCK_PROVIDER_IDS], error: null };
  if (!Array.isArray(value)) return { providers: [], error: 'providers must be an array' };
  if (value.length > STOCK_PROVIDER_IDS.length) return { providers: [], error: 'too many providers' };
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  if (value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    return { providers: [], error: 'invalid providers' };
  }
  const providers = value as StockProviderId[];
  if (new Set(providers).size !== providers.length) return { providers: [], error: 'duplicate providers' };
  return { providers: providers.length > 0 ? providers : [...STOCK_PROVIDER_IDS], error: null };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  return NextResponse.json(getStockForVn(id));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawIdPost } = await ctx.params;
  const id = rawIdPost.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  const parsedProviders = parseProviders(body.providers);
  if (parsedProviders.error) return NextResponse.json({ error: parsedProviders.error }, { status: 400 });
  try {
    const snapshot = await refreshStockForVn(id, parsedProviders.providers, req.signal);
    return NextResponse.json(snapshot);
  } catch (e) {
    const rawMsg = (e as Error).message ?? 'stock refresh failed';
    // VN-not-found is the realistic 404 branch; everything else stays opaque.
    if (/VN not found/i.test(rawMsg)) {
      return NextResponse.json({ error: 'vn not found' }, { status: 404 });
    }
    console.error('[stock] refresh failed', { id, msg: rawMsg });
    // Single-user self-hosted app — surfacing the underlying error message
    // is fine for diagnostics. Sanitize so credential-shaped substrings
    // and proxy URLs never reach the UI even on a malformed Error.message.
    return NextResponse.json(
      { error: 'stock refresh failed', detail: sanitizeErrorMessage(rawMsg) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawIdDelete } = await ctx.params;
  const id = rawIdDelete.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const result = clearVnStockCache(id);
  // Return cleared counts + a fresh (now empty) snapshot so the client
  // doesn't need a follow-up GET to repaint.
  return NextResponse.json({ ...result, snapshot: getStockForVn(id) });
}
