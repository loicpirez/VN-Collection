import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { readJsonObject } from '@/lib/api-body';
import { apiErrorBody } from '@/lib/api-error-shape';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { createRequestDeadline } from '@/lib/request-deadline';
import {
  deleteRlistEntry,
  fetchUlistEntry,
  patchRlistEntry,
} from '@/lib/vndb';
import { isVndbReleaseListStatus } from '@/lib/vndb-release-list-shape';
import { isVndbReleaseId, isVndbVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function listWriteError(context: string, error: unknown): NextResponse {
  if (error instanceof Error && /\/rlist\/r\d+ -> (401|403):/i.test(error.message)) {
    console.error(`[upstream:${context}] VNDB rejected the release-list write`);
    return NextResponse.json(
      apiErrorBody('VNDB token requires listwrite permission', 'vndb_listwrite_required', context),
      { status: 401 },
    );
  }
  return upstreamError(context, error);
}

async function recordReleaseActivity(kind: string, releaseId: string, label: string): Promise<void> {
  try {
    await recordActivity({ kind, entity: 'release', entityId: releaseId, label });
  } catch (error) {
    console.error(`[vndb-release-list:${releaseId}] activity log failed:`, error instanceof Error ? error.message : String(error));
  }
}

/** Read the authenticated user's VNDB release-list state for one edition. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbReleaseId(id)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const url = new URL(req.url);
  const vnId = url.searchParams.get('vn');
  if (!isVndbVnId(vnId)) return NextResponse.json({ error: 'invalid VN id' }, { status: 400 });
  const deadline = createRequestDeadline(req.signal);
  try {
    const entry = await fetchUlistEntry(vnId.toLowerCase(), {
      fresh: url.searchParams.get('fresh') === '1',
      signal: deadline.signal,
    });
    if (entry && 'needsAuth' in entry) {
      return NextResponse.json({ needsAuth: true, status: null });
    }
    const releaseId = id.toLowerCase();
    const status = entry?.releases.find((release) => release.id === releaseId)?.list_status ?? null;
    return NextResponse.json({ needsAuth: false, status });
  } catch (error) {
    return upstreamError('release/[id]/vndb-list.GET', error);
  } finally {
    deadline.dispose();
  }
}

/** Set the authenticated user's VNDB release-list state for one edition. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbReleaseId(id)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const body = await readJsonObject(req);
  if (!isVndbReleaseListStatus(body.status)) {
    return NextResponse.json({ error: 'status must be an integer from 0 to 4' }, { status: 400 });
  }
  const releaseId = id.toLowerCase();
  try {
    const result = await patchRlistEntry(releaseId, body.status);
    if ('needsAuth' in result) {
      return NextResponse.json(
        apiErrorBody('VNDB token required', 'vndb_token_required', 'release/[id]/vndb-list.PATCH'),
        { status: 401 },
      );
    }
    await recordReleaseActivity('vndb-release-list.update', releaseId, 'Updated VNDB release-list state');
    return NextResponse.json({ ok: true, status: body.status });
  } catch (error) {
    return listWriteError('release/[id]/vndb-list.PATCH', error);
  }
}

/** Remove one edition from the authenticated user's VNDB release list. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbReleaseId(id)) return NextResponse.json({ error: 'invalid release id' }, { status: 400 });
  const releaseId = id.toLowerCase();
  try {
    const result = await deleteRlistEntry(releaseId);
    if ('needsAuth' in result) {
      return NextResponse.json(
        apiErrorBody('VNDB token required', 'vndb_token_required', 'release/[id]/vndb-list.DELETE'),
        { status: 401 },
      );
    }
    await recordReleaseActivity('vndb-release-list.remove', releaseId, 'Removed VNDB release-list entry');
    return NextResponse.json({ ok: true, status: null });
  } catch (error) {
    return listWriteError('release/[id]/vndb-list.DELETE', error);
  }
}
