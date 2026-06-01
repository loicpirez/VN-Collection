import { NextRequest, NextResponse } from 'next/server';
import { applyEgsSuggestions, computeEgsSuggestions } from '@/lib/egs-sync';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { isVndbVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const { needsConfig, suggestions } = await computeEgsSuggestions();
  return NextResponse.json({ ok: true, needsConfig, suggestions });
}

/**
 * Defensive ceiling. The UI sends rows the operator just confirmed, so
 * realistic batches are ≤ a few hundred entries. Anything larger is a
 * pathological caller; reject early so we don't `.filter` over a 10M
 * array before the validator decides only 3 rows were valid anyway.
 */
const VN_IDS_MAX = 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const body = (await readJsonObject(req)) as { vn_ids?: unknown };
  if (!Array.isArray(body.vn_ids)) {
    return NextResponse.json({ error: 'vn_ids must be an array' }, { status: 400 });
  }
  if (body.vn_ids.length > VN_IDS_MAX) {
    return NextResponse.json(
      { error: `vn_ids exceeds limit of ${VN_IDS_MAX}` },
      { status: 400 },
    );
  }
  if (body.vn_ids.some((s) => typeof s !== 'string' || !isVndbVnId(s))) {
    return NextResponse.json({ error: 'vn_ids must contain only VNDB VN ids' }, { status: 400 });
  }
  const picks = Array.from(new Set((body.vn_ids as string[]).map((id) => id.toLowerCase())));
  if (picks.length === 0) return NextResponse.json({ applied: 0 });
  const result = await applyEgsSuggestions(picks);
  try {
    recordActivity({
      kind: 'egs.sync-apply',
      entity: 'egs',
      entityId: null,
      label: 'Applied EGS sync',
      payload: { requested: picks.length },
    });
  } catch (e) {
    console.error('[egs:sync] activity log failed:', (e as Error).message);
  }
  return NextResponse.json({ ok: true, ...result });
}
