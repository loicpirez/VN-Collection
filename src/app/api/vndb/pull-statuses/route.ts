import { NextRequest, NextResponse } from 'next/server';
import { decodePullSelections, pullStatusesFromVndb, type PullOptions } from '@/lib/vndb-sync';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pull every status-bearing ulist entry from the authenticated user's VNDB
 * list and align local statuses to match. One-way (VNDB → local). Only VNs
 * already present in the local collection are touched.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  let options: PullOptions;
  if (body.action === undefined || body.action === 'preview') {
    options = { action: 'preview' };
  } else if (body.action === 'apply') {
    const selections = decodePullSelections(body.selections);
    if (!selections) return NextResponse.json({ error: 'invalid status selections' }, { status: 400 });
    options = { action: 'apply', selections };
  } else {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }
  let result: Awaited<ReturnType<typeof pullStatusesFromVndb>>;
  try {
    result = await pullStatusesFromVndb(options);
  } catch (error) {
    return internalError('vndb/pull-statuses', error);
  }
  const status = result.ok ? 200 : result.needsAuth ? 401 : result.failedLabels.length > 0 ? 502 : 500;
  if (result.ok && result.action === 'apply') {
    try {
      await recordActivity({
        kind: 'vndb.status.pull',
        entity: 'vndb',
        entityId: 'ulist',
        label: 'VNDB status pull',
        payload: {
          updated: result.updated,
          conflicts: result.conflicts,
          scanned: result.scanned,
          remaining: result.changes.length,
        },
      });
    } catch (error) {
      console.error('[vndb:pull-statuses] activity log failed:', (error as Error).message);
    }
  }
  return NextResponse.json(result, { status });
}
