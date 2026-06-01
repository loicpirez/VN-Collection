import { NextRequest, NextResponse } from 'next/server';
import {
  getSourcePref,
  isInCollection,
  setSourcePref,
  type SourceChoice,
  type SourceField,
  type SourcePrefMap,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { normalizeVnId, validateVnIdOr400 } from '@/lib/vn-id';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_FIELDS: SourceField[] = ['title', 'description', 'image', 'brand', 'rating', 'playtime'];
const VALID_CHOICES: SourceChoice[] = ['auto', 'vndb', 'egs', 'custom'];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return NextResponse.json({ pref: getSourcePref(id) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const next: SourcePrefMap = { ...getSourcePref(id) };
  for (const key of Object.keys(body)) {
    if (!(VALID_FIELDS as string[]).includes(key)) {
      return NextResponse.json({ error: 'unknown field' }, { status: 400 });
    }
    const value = body[key];
    if (!(typeof value === 'string') || !(VALID_CHOICES as string[]).includes(value)) {
      return NextResponse.json({ error: `invalid value for ${key}` }, { status: 400 });
    }
    next[key as SourceField] = value as SourceChoice;
  }
  setSourcePref(id, next);
  try {
    recordActivity({
      kind: 'collection.source-pref',
      entity: 'vn',
      entityId: id,
      label: 'Updated source preference',
      payload: { changed: Object.keys(body) },
    });
  } catch (e) {
    console.error(`[source-pref:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ pref: getSourcePref(id) });
}
