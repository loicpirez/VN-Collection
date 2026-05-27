import { NextRequest, NextResponse } from 'next/server';
import { createSeries, listSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';

// intentionally public — single-user self-hosted app; series metadata
// carries no PII. Mutating handlers below remain gated.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ series: listSeries() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { name?: unknown; description?: unknown };
  // Audit S-012: type-check + length-cap both fields before any DB write.
  if (typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
  }
  const name = body.name.trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  let description: string | null = null;
  if (body.description != null) {
    if (typeof body.description !== 'string') {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
    }
    if (body.description.length > 5000) {
      return NextResponse.json({ error: 'description too long (max 5000)' }, { status: 400 });
    }
    description = body.description;
  }
  try {
    const created = createSeries(name, description);
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
