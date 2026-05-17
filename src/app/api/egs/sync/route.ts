import { NextRequest, NextResponse } from 'next/server';
import { applyEgsSuggestions, computeEgsSuggestions } from '@/lib/egs-sync';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { needsConfig, suggestions } = await computeEgsSuggestions();
  return NextResponse.json({ ok: true, needsConfig, suggestions });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { vn_ids?: unknown };
  if (!Array.isArray(body.vn_ids)) {
    return NextResponse.json({ error: 'vn_ids must be an array' }, { status: 400 });
  }
  const picks = body.vn_ids.filter((s): s is string => typeof s === 'string' && /^v\d+$/i.test(s));
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
