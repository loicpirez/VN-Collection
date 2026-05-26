import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { refreshStockForVn, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BATCH = 100;

function parseVnIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && /^(v\d+|egs_\d+)$/i.test(v)).slice(0, MAX_BATCH);
}

function parseProviders(value: unknown): StockProviderId[] {
  if (!Array.isArray(value)) return [...STOCK_PROVIDER_IDS];
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  const providers = value.filter((item): item is StockProviderId => typeof item === 'string' && allowed.has(item));
  return providers.length > 0 ? providers : [...STOCK_PROVIDER_IDS];
}

export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const vnIds = parseVnIds(body.vnIds);
  if (vnIds.length === 0) return NextResponse.json({ error: 'no valid vnIds' }, { status: 400 });
  const providers = parseProviders(body.providers);

  const results: Array<{ vnId: string; ok: boolean; offerCount?: number; error?: string }> = [];
  for (const vnId of vnIds) {
    if (req.signal?.aborted) break;
    try {
      const snapshot = await refreshStockForVn(vnId, providers, req.signal);
      results.push({ vnId, ok: true, offerCount: snapshot.summary.total });
    } catch (e) {
      results.push({ vnId, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({ queued: vnIds.length, results });
}
