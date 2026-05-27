import { NextRequest, NextResponse } from 'next/server';
import { findDuplicates } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    return NextResponse.json({ groups: findDuplicates() });
  } catch (err) {
    return internalError('maintenance.duplicates.GET', err);
  }
}
