import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getStockProviderMaintenanceRepository } from '@/lib/db/repositories/stock-provider-maintenance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Return provider-level stock freshness diagnostics for the maintenance panel. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const providers = await getStockProviderMaintenanceRepository().listFreshness();
  return NextResponse.json({ providers });
}
