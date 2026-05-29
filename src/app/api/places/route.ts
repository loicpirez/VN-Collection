import { NextRequest, NextResponse } from 'next/server';
import { listPlaces, createPlace } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// intentionally public — single-user self-hosted app, collection metadata
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ places: listPlaces() });
  } catch (err) {
    return internalError('places.GET', err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const body = (await readJsonObject(req)) as {
      name?: unknown;
      name_ja?: unknown;
      address?: unknown;
      lat?: unknown;
      lng?: unknown;
      url?: unknown;
      notes?: unknown;
    };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }
    const id = createPlace({
      name: body.name.trim(),
      name_ja: typeof body.name_ja === 'string' ? body.name_ja.trim() || null : null,
      address: typeof body.address === 'string' ? body.address.trim() || null : null,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
      url: typeof body.url === 'string' ? body.url.trim() || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return internalError('places.POST', err);
  }
}
