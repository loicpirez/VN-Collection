import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import type { PhysicalBundleIdentity } from '@/lib/db';
import { getShelfRepository } from '@/lib/db/repositories/shelf';
import { validateText } from '@/lib/input-validators';
import { parseOwnedReleaseIdentity } from '@/lib/owned-release-id';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

/** Return every physical bundle and its ordered owned-release members. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ bundles: await getShelfRepository().listBundles() });
}

function parseMembers(value: unknown): PhysicalBundleIdentity[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) return null;
  const members: PhysicalBundleIdentity[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const identity = parseOwnedReleaseIdentity(row.vn_id, row.release_id);
    if (!identity.ok) return null;
    members.push(identity.value);
  }
  return members;
}

/** Create one physical multi-release box from existing owned editions. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const name = validateText(body.name, { field: 'name', max: 120 });
  const anchorRaw = body.anchor;
  if (!name.ok || anchorRaw === null || typeof anchorRaw !== 'object' || Array.isArray(anchorRaw)) {
    return NextResponse.json({ error: 'valid name, anchor, and members required' }, { status: 400 });
  }
  const anchorRecord = anchorRaw as Record<string, unknown>;
  const anchor = parseOwnedReleaseIdentity(anchorRecord.vn_id, anchorRecord.release_id);
  const members = parseMembers(body.members);
  if (!anchor.ok || !members) {
    return NextResponse.json({ error: 'valid name, anchor, and members required' }, { status: 400 });
  }
  try {
    const bundle = await getShelfRepository().createBundle({ name: name.value, anchor: anchor.value, members });
    await recordActivity({
      kind: 'shelf.bundle.create',
      entity: 'physical_bundle',
      entityId: String(bundle.id),
      label: 'Created physical bundle',
      payload: { name: bundle.name, member_count: bundle.members.length },
    });
    return NextResponse.json({ bundle }, { status: 201 });
  } catch (error) {
    console.error('physical bundle create failed:', (error as Error).message);
    return NextResponse.json({ error: 'physical bundle create failed' }, { status: 400 });
  }
}
