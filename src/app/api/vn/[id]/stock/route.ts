import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { clearVnStockCache } from '@/lib/db';
import { getStockForVn, refreshStockForVn, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock';


export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseProviders(value: unknown): StockProviderId[] {
  if (!Array.isArray(value)) return [...STOCK_PROVIDER_IDS];
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  const providers = value.filter((item): item is StockProviderId => typeof item === 'string' && allowed.has(item));
  return providers.length > 0 ? providers : [...STOCK_PROVIDER_IDS];
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  return NextResponse.json(getStockForVn(id));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  try {
    const snapshot = await refreshStockForVn(id, parseProviders(body.providers), req.signal);
    return NextResponse.json(snapshot);
  } catch (e) {
    const msg = (e as Error).message ?? 'stock refresh failed';
    // VN-not-found is the realistic 404 branch; everything else stays opaque.
    if (/VN not found/i.test(msg)) {
      return NextResponse.json({ error: 'vn not found' }, { status: 404 });
    }
    console.error('[stock] refresh failed', { id, msg });
    return NextResponse.json({ error: 'stock refresh failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const result = clearVnStockCache(id);
  // Return cleared counts + a fresh (now empty) snapshot so the client
  // doesn't need a follow-up GET to repaint.
  return NextResponse.json({ ...result, snapshot: getStockForVn(id) });
}
