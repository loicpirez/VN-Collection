import { NextRequest, NextResponse } from 'next/server';
import { getMaintenanceRepository } from '@/lib/db/repositories/maintenance';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    return NextResponse.json({ groups: await getMaintenanceRepository().findDuplicates() });
  } catch (err) {
    return internalError('maintenance.duplicates.GET', err);
  }
}
