/**
 * Manual matching endpoint for the Eroge Price aggregator.
 *
 * An exact-title query can return many candidates (e.g. `沙耶の唄` →
 * the 2003 original AND the 2015 BD re-release). `searchAndFetchAll`
 * hydrates every one, but the operator might prefer the candidate the
 * heuristic didn't auto-pick. This route updates `selectedEgsId`
 * inside the persisted `extras_json` blob so the StockPanel renders
 * the operator's choice as the primary card from then on.
 *
 *   PATCH /api/vn/[id]/stock/eroge-price
 *     body: { egs_id: number }
 *     200:  { ok: true, selectedEgsId: number, candidates: number[] }
 *     400:  invalid id / missing / not-in-candidates
 *     404:  no eroge_price extras stored for this VN yet
 *
 * The body is the candidate's Eroge Price `egs_id` (NOT the VNDB VN
 * id). The route refuses any egs_id that isn't present in the stored
 * candidates list — this prevents an operator from typoing an id and
 * silently breaking the active-tab default. Only the
 * `selectedEgsId` field of the envelope is mutated; the bundles
 * themselves are untouched.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { getStockProviderExtras, setStockProviderExtras } from '@/lib/db';
import type { ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = await readJsonObject(req);
  const egsId = typeof body.egs_id === 'number' ? body.egs_id : Number(body.egs_id);
  if (!Number.isFinite(egsId) || egsId <= 0 || !Number.isInteger(egsId)) {
    return NextResponse.json({ error: 'egs_id required (positive integer)' }, { status: 400 });
  }

  const extras = getStockProviderExtras<ErogePriceExtrasV1>(id, 'eroge_price');
  if (!extras || !Array.isArray(extras.candidates) || extras.candidates.length === 0) {
    return NextResponse.json(
      { error: 'no eroge_price extras stored for this VN' },
      { status: 404 },
    );
  }

  const candidateIds = extras.candidates.map((c) => c.egsId);
  if (!candidateIds.includes(egsId)) {
    return NextResponse.json(
      { error: 'egs_id not in candidates', candidates: candidateIds },
      { status: 400 },
    );
  }

  // Only mutate the pointer field — bundles stay untouched so the
  // next auto-refresh can update prices without losing the manual
  // pin (the refresh path re-runs `searchAndFetchAll` which resets
  // `selectedEgsId` to the first candidate; operators expect their
  // manual pick to survive that, so the refresh path now honours
  // an existing `selectedEgsId` when the candidate is still there).
  const updated: ErogePriceExtrasV1 = {
    ...extras,
    selectedEgsId: egsId,
  };
  setStockProviderExtras(id, 'eroge_price', updated);

  return NextResponse.json({
    ok: true,
    selectedEgsId: egsId,
    candidates: candidateIds,
  });
}
