import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { readJsonObject } from '@/lib/api-body';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import {
  decodeVndbLocalImportSelections,
  importLocalLibraryToVndb,
} from '@/lib/vndb-local-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Preview or apply selected local collection rows to VNDB user lists. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const action = body.action;
  if (action !== 'preview' && action !== 'apply') {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }
  try {
    let result;
    if (action === 'preview') {
      result = await importLocalLibraryToVndb({ action: 'preview', signal: req.signal });
    } else {
      const selections = decodeVndbLocalImportSelections(body.selections);
      if (!selections) return NextResponse.json({ error: 'invalid import selections' }, { status: 400 });
      result = await importLocalLibraryToVndb({ action: 'apply', selections, signal: req.signal });
    }
    if (result.ok && result.action === 'apply') {
      try {
        await recordActivity({
          kind: 'vndb.library.import',
          entity: 'vndb',
          entityId: 'user-lists',
          label: 'Imported local library into VNDB',
          payload: {
            applied: result.applied.length,
            conflicts: result.conflicts.length,
            failures: result.failures.length,
          },
        });
      } catch (error) {
        console.error('[vndb:import-local-library] activity log failed:', (error as Error).message);
      }
    }
    const status = result.ok ? 200 : result.needsAuth ? 401 : 403;
    return NextResponse.json(result, { status });
  } catch (error) {
    return upstreamError('vndb/import-local-library', error);
  }
}
