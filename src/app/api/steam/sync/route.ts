import { NextRequest, NextResponse } from 'next/server';
import { computeSteamSuggestions, fetchOwnedGames } from '@/lib/steam';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { isValidVnId } from '@/lib/vn-id-shape';
import { getSteamRepository } from '@/lib/db/repositories/steam';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Defensive ceiling on `applies` array size. Realistic batches are at
 * most a few hundred entries; anything larger is a hostile caller.
 */
const APPLIES_MAX = 2000;
const PLAYTIME_MINUTES_MAX = 10_000_000;

interface SteamApply {
  vn_id: string;
  playtime_minutes: number;
}

function parseApplies(value: unknown): { applies: SteamApply[]; error: string | null } {
  if (!Array.isArray(value)) return { applies: [], error: 'applies array required' };
  if (value.length > APPLIES_MAX) return { applies: [], error: `applies exceeds limit of ${APPLIES_MAX}` };
  const applies: SteamApply[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { applies: [], error: 'invalid applies row' };
    const candidate = row as Record<string, unknown>;
    if (
      typeof candidate.vn_id !== 'string'
      || !isValidVnId(candidate.vn_id)
      || typeof candidate.playtime_minutes !== 'number'
      || !Number.isSafeInteger(candidate.playtime_minutes)
      || candidate.playtime_minutes < 0
      || candidate.playtime_minutes > PLAYTIME_MINUTES_MAX
    ) {
      return { applies: [], error: 'invalid applies row' };
    }
    applies.push({ vn_id: candidate.vn_id.toLowerCase(), playtime_minutes: candidate.playtime_minutes });
  }
  return { applies, error: null };
}

/**
 * GET — preview suggestions.
 *   Hits Steam, cross-references against the local collection, returns
 *   one row per match with the proposed delta.
 *
 * POST — apply.
 *   Body: { applies: [{ vn_id, playtime_minutes }] } — caller is expected
 *   to confirm each row from the preview. The route writes them inside
 *   the existing `updateCollection` transaction so the activity log
 *   captures every change.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const games = await fetchOwnedGames();
    const suggestions = await computeSteamSuggestions(games);
    return NextResponse.json({ ok: true, suggestions });
  } catch (e) {
    const raw = (e as Error).message ?? 'unknown error';
    const safe = raw
      .replace(/key=[^&\s]+/g, 'key=***')
      .replace(/steamid=\d+/gi, 'steamid=***')
      .slice(0, 500);
    console.error('steam sync failed:', safe);
    const notConfigured = /Steam not configured/i.test(raw);
    const code = notConfigured ? 'steam_not_configured' : 'steam_sync_failed';
    return NextResponse.json(
      { ok: false, error: 'Steam sync failed', code },
      { status: notConfigured ? 400 : 502 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const parsed = parseApplies(body.applies);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const applied = await getSteamRepository().applyPlaytime(parsed.applies);
  try {
    await recordActivity({
      kind: 'steam.sync-apply',
      entity: 'steam',
      entityId: null,
      label: 'Applied Steam playtime sync',
      payload: { applied, requested: parsed.applies.length },
    });
  } catch (e) {
    console.error('[steam:sync] activity log failed:', (e as Error).message);
  }
  return NextResponse.json({ applied });
}
