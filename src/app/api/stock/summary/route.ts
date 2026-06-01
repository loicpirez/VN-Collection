import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { batchVnStockSummaries } from '@/lib/db';
import { readJsonObject } from '@/lib/api-body';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IDS = 200;
/**
 * Read-only batch lookup for the VnCard stock chip.
 * Accepts either ?ids=v1,v2 in the query or POST { ids: [...] } body.
 * Returns a map of vnId → { available, best_price } for VNs with offers.
 * VNs without offers are omitted (callers should treat as zero stock).
 */
function parseIds(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const flat = Array.isArray(raw) ? raw.join(',') : raw;
  return flat
    .split(',')
    .map((s) => s.trim())
    .filter(isValidVnId)
    .map(normalizeVnId)
    .slice(0, MAX_IDS);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const ids = parseIds(req.nextUrl.searchParams.get('ids'));
  if (ids.length === 0) return NextResponse.json({ summary: {} });
  const map = batchVnStockSummaries(ids);
  const summary: Record<string, { available: number; best_price: number | null }> = {};
  for (const [vnId, value] of map) summary[vnId] = value;
  return NextResponse.json({ summary });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const raw = body.ids;
  const ids = parseIds(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : null);
  if (ids.length === 0) return NextResponse.json({ summary: {} });
  const map = batchVnStockSummaries(ids);
  const summary: Record<string, { available: number; best_price: number | null }> = {};
  for (const [vnId, value] of map) summary[vnId] = value;
  return NextResponse.json({ summary });
}
