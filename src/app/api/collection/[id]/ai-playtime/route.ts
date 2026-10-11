import { NextRequest, NextResponse } from 'next/server';
import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getAiPlaytimeRepository } from '@/lib/db/repositories/ai-playtime';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { recordActivity } from '@/lib/activity';
import { normalizeVnId, validateVnIdOr400 } from '@/lib/vn-id';
import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

const MAX_MINUTES = 10_000_000;

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!await getCollectionCoreRepository().contains(id)) {
    return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  }
  return NextResponse.json({ estimate: await getAiPlaytimeRepository().get(id) });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!await getCollectionCoreRepository().contains(id)) {
    return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  }
  const body = await readJsonObject(req);
  if (!integerInRange(body.minutes, 1, MAX_MINUTES)) {
    return NextResponse.json({ error: 'minutes must be a positive integer' }, { status: 400 });
  }
  if (!integerInRange(body.lower_minutes, 1, MAX_MINUTES)) {
    return NextResponse.json({ error: 'lower_minutes must be a positive integer' }, { status: 400 });
  }
  if (!integerInRange(body.upper_minutes, 1, MAX_MINUTES)) {
    return NextResponse.json({ error: 'upper_minutes must be a positive integer' }, { status: 400 });
  }
  if (body.lower_minutes > body.minutes || body.minutes > body.upper_minutes) {
    return NextResponse.json({ error: 'expected lower_minutes <= minutes <= upper_minutes' }, { status: 400 });
  }
  if (!(body.confidence === null || (typeof body.confidence === 'number' && Number.isFinite(body.confidence) && body.confidence >= 0 && body.confidence <= 1))) {
    return NextResponse.json({ error: 'confidence must be between 0 and 1 or null' }, { status: 400 });
  }
  if (typeof body.model !== 'string' || !body.model.trim() || body.model.trim().length > 200) {
    return NextResponse.json({ error: 'model must be a non-empty string up to 200 characters' }, { status: 400 });
  }
  if (!(body.rationale === null || body.rationale === undefined || (typeof body.rationale === 'string' && body.rationale.length <= 2000))) {
    return NextResponse.json({ error: 'rationale must be a string up to 2000 characters or null' }, { status: 400 });
  }
  const generatedAt = body.generated_at === undefined ? Date.now() : body.generated_at;
  if (!integerInRange(generatedAt, 0, Number.MAX_SAFE_INTEGER) || generatedAt > Date.now() + 300_000) {
    return NextResponse.json({ error: 'generated_at must be a valid Unix timestamp in milliseconds' }, { status: 400 });
  }
  const estimate = {
    minutes: body.minutes,
    lower_minutes: body.lower_minutes,
    upper_minutes: body.upper_minutes,
    confidence: body.confidence,
    model: body.model.trim(),
    rationale: typeof body.rationale === 'string' ? body.rationale.trim() || null : null,
    generated_at: generatedAt,
  };
  await getAiPlaytimeRepository().set(id, estimate);
  await recordActivity({
    kind: 'collection.ai-playtime',
    entity: 'vn',
    entityId: id,
    label: 'Updated AI playtime estimate',
    payload: {
      minutes: estimate.minutes,
      lower_minutes: estimate.lower_minutes,
      upper_minutes: estimate.upper_minutes,
      confidence: estimate.confidence,
      model: estimate.model,
      generated_at: estimate.generated_at,
    },
  });
  return NextResponse.json({ estimate: await getAiPlaytimeRepository().get(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  const collection = getCollectionCoreRepository();
  if (!await collection.contains(id)) {
    return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  }
  await getAiPlaytimeRepository().clear(id);
  const preferences = await collection.getSourcePreferences(id);
  const resetPreference = preferences.playtime === 'ai';
  if (resetPreference) {
    const nextPreferences = { ...preferences };
    delete nextPreferences.playtime;
    await collection.setSourcePreferences(id, nextPreferences);
  }
  await recordActivity({
    kind: 'collection.ai-playtime',
    entity: 'vn',
    entityId: id,
    label: 'Cleared AI playtime estimate',
    payload: { cleared: true, source_preference_reset: resetPreference },
  });
  return NextResponse.json({ ok: true, estimate: null });
}
