import { NextRequest, NextResponse } from 'next/server';
import { createSeries, listSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { validateText } from '@/lib/input-validators';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ series: listSeries() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { name?: unknown; description?: unknown };
  const nameResult = validateText(body.name, { field: 'name', max: 200 });
  if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
  let description: string | null = null;
  if (body.description != null) {
    const descResult = validateText(body.description, { field: 'description', max: 20000, allowEmpty: true });
    if (!descResult.ok) return NextResponse.json({ error: descResult.error }, { status: 400 });
    description = descResult.value;
  }
  try {
    const created = createSeries(nameResult.value, description);
    try {
      recordActivity({
        kind: 'series.create',
        entity: 'series',
        entityId: String(created.id),
        label: created.name,
        payload: { hasDescription: !!description },
      });
    } catch (e) {
      console.error('[series:create] activity log failed:', (e as Error).message);
    }
    return NextResponse.json({ series: created });
  } catch (err) {
    return NextResponse.json({ error: 'create failed' }, { status: 400 });
  }
}
