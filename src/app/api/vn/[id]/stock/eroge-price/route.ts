/**
 * Manual matching + manual candidate management for the Eroge Price
 * aggregator.
 *
 * Three operator actions, three HTTP verbs:
 *
 *   PATCH /api/vn/[id]/stock/eroge-price
 *     body: { ep_id: number }    (legacy: { egs_id })
 *     Pin a candidate as the primary one rendered by the panel.
 *     200: { ok, selectedEpId, candidates: number[] }
 *
 *   POST  /api/vn/[id]/stock/eroge-price
 *     body: { ep_id: number }
 *     Append a candidate by fetching its bundle from eroge-price.com.
 *     Useful when `searchAndFetchAll` missed an entry the operator
 *     knows belongs in the panel.
 *     200: { ok, candidates: number[] }
 *
 *   DELETE /api/vn/[id]/stock/eroge-price?ep_id=N
 *     Remove a candidate from the envelope. If the removed candidate
 *     was the selected one, the first remaining candidate becomes
 *     selected. If the last candidate is removed, the entire blob
 *     is cleared.
 *     200: { ok, candidates: number[] }
 *
 * NAMING — `ep_id` is the eroge-price.com numeric game id, NOT the
 * project's ErogameScape id. Legacy `egs_id` body parameter still
 * accepted in PATCH for backwards compatibility with older clients;
 * POST and DELETE use the new `ep_id` name only.
 *
 * All three handlers are gated by `requireLocalhostOrToken`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { clearStockProviderExtras, getStockProviderExtras, setStockProviderExtras } from '@/lib/db';
import {
  decodeStoredExtras,
  fetchErogePriceBundle,
  type ErogePriceExtrasV1,
} from '@/lib/erogeprice-meta';
import { erogePriceJsonFetcher } from '@/lib/stock';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isValidVnId(id: string): boolean {
  return /^(v\d+|egs_\d+)$/i.test(id);
}

function parseEpId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Read + upgrade the persisted blob. Returns null if the row is absent. */
function readExtras(vnId: string): ErogePriceExtrasV1 | null {
  const row = getStockProviderExtras<unknown>(vnId, 'eroge_price');
  // `getStockProviderExtras` returns JSON.parse'd — wrap back through
  // `decodeStoredExtras` so legacy `egsId` keys still work even when
  // operators upgrade in-place.
  return row ? decodeStoredExtras(JSON.stringify(row)) : null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isValidVnId(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = await readJsonObject(req);
  // Accept both `ep_id` (new) and `egs_id` (legacy) to avoid
  // breaking older client builds.
  const epId = parseEpId(body.ep_id ?? body.egs_id);
  if (epId == null) {
    return NextResponse.json({ error: 'ep_id required (positive integer)' }, { status: 400 });
  }

  const extras = readExtras(id);
  if (!extras || extras.candidates.length === 0) {
    return NextResponse.json(
      { error: 'no eroge_price extras stored for this VN' },
      { status: 404 },
    );
  }

  const candidateIds = extras.candidates.map((c) => c.epId);
  if (!candidateIds.includes(epId)) {
    return NextResponse.json(
      { error: 'ep_id not in candidates', candidates: candidateIds },
      { status: 400 },
    );
  }

  const updated: ErogePriceExtrasV1 = { ...extras, selectedEpId: epId };
  setStockProviderExtras(id, 'eroge_price', updated);

  return NextResponse.json({
    ok: true,
    selectedEpId: epId,
    candidates: candidateIds,
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isValidVnId(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = await readJsonObject(req);
  const epId = parseEpId(body.ep_id);
  if (epId == null) {
    return NextResponse.json({ error: 'ep_id required (positive integer)' }, { status: 400 });
  }

  const existing = readExtras(id);
  if (existing && existing.candidates.some((c) => c.epId === epId)) {
    return NextResponse.json({
      ok: true,
      message: 'already present',
      candidates: existing.candidates.map((c) => c.epId),
    });
  }

  let bundle;
  try {
    bundle = await fetchErogePriceBundle(epId, erogePriceJsonFetcher, req.signal);
  } catch (e) {
    console.error('[ep:add]', { id, epId, msg: (e as Error).message });
    return NextResponse.json(
      { error: 'eroge-price fetch failed (check ep_id)' },
      { status: 502 },
    );
  }
  if (!bundle) {
    return NextResponse.json(
      { error: 'eroge-price returned no detail (invalid ep_id?)' },
      { status: 404 },
    );
  }

  const next: ErogePriceExtrasV1 = existing
    ? { ...existing, candidates: [...existing.candidates, bundle], refreshedAt: Date.now() }
    : {
        schemaVersion: 1,
        candidates: [bundle],
        selectedEpId: epId,
        searchQuery: null,
        refreshedAt: Date.now(),
      };
  setStockProviderExtras(id, 'eroge_price', next);

  return NextResponse.json({
    ok: true,
    candidates: next.candidates.map((c) => c.epId),
    selectedEpId: next.selectedEpId,
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isValidVnId(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const epId = parseEpId(url.searchParams.get('ep_id') ?? url.searchParams.get('egs_id'));
  if (epId == null) {
    return NextResponse.json({ error: 'ep_id query param required' }, { status: 400 });
  }

  const extras = readExtras(id);
  if (!extras) {
    return NextResponse.json({ ok: true, candidates: [], note: 'no extras to remove from' });
  }

  const remaining = extras.candidates.filter((c) => c.epId !== epId);
  if (remaining.length === extras.candidates.length) {
    return NextResponse.json(
      { error: 'ep_id not in candidates', candidates: extras.candidates.map((c) => c.epId) },
      { status: 400 },
    );
  }

  if (remaining.length === 0) {
    clearStockProviderExtras(id, 'eroge_price');
    return NextResponse.json({ ok: true, candidates: [], cleared: true });
  }

  const nextSelected =
    extras.selectedEpId === epId ? remaining[0].epId : extras.selectedEpId;
  const next: ErogePriceExtrasV1 = {
    ...extras,
    candidates: remaining,
    selectedEpId: nextSelected,
    refreshedAt: Date.now(),
  };
  setStockProviderExtras(id, 'eroge_price', next);

  return NextResponse.json({
    ok: true,
    candidates: remaining.map((c) => c.epId),
    selectedEpId: nextSelected,
  });
}
