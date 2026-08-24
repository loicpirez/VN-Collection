import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getShelfRepository } from '@/lib/db/repositories/shelf';
import { validateText } from '@/lib/input-validators';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Rename one physical bundle. */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await readJsonObject(req);
  const name = validateText(body.name, { field: 'name', max: 120 });
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
  try {
    const bundle = await getShelfRepository().renameBundle(id, name.value);
    if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await recordActivity({
      kind: 'shelf.bundle.rename',
      entity: 'physical_bundle',
      entityId: String(id),
      label: 'Renamed physical bundle',
      payload: { name: bundle.name },
    });
    return NextResponse.json({ bundle });
  } catch (error) {
    console.error('physical bundle rename failed:', (error as Error).message);
    return NextResponse.json({ error: 'physical bundle rename failed' }, { status: 400 });
  }
}

/** Dissolve one physical bundle while preserving every owned edition. */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const repository = getShelfRepository();
  const existing = await repository.getBundle(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    await repository.deleteBundle(id);
    await recordActivity({
      kind: 'shelf.bundle.delete',
      entity: 'physical_bundle',
      entityId: String(id),
      label: 'Dissolved physical bundle',
      payload: { name: existing.name, member_count: existing.members.length },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('physical bundle delete failed:', (error as Error).message);
    return NextResponse.json({ error: 'physical bundle delete failed' }, { status: 500 });
  }
}
