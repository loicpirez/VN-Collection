import { NextRequest, NextResponse } from 'next/server';
import { getPlaceRepository } from '@/lib/db/repositories/place';
import { getGeneratedIdRepository } from '@/lib/db/repositories/generated-id';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { readJsonObject } from '@/lib/api-body';
import { hasFiniteCoordinates } from '@/lib/place-coordinates';
import { validateText } from '@/lib/input-validators';
import { parseOptionalPlaceKind, parseOptionalPlaceText, parseOptionalPlaceUrl } from '@/lib/place-input';
import { parsePlaceRegistryQuery, queryPlaceRegistry } from '@/lib/place-registry-page';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(req?: NextRequest): Promise<NextResponse> {
  try {
    const params = req?.nextUrl.searchParams ?? new URLSearchParams();
    const repository = getPlaceRepository();
    const [places, knownPlaces] = await Promise.all([repository.list(), repository.listKnownPlaces()]);
    const result = queryPlaceRegistry(places, parsePlaceRegistryQuery(params));
    return NextResponse.json({ ...result, known_places: knownPlaces });
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
      kind?: unknown;
      address?: unknown;
      lat?: unknown;
      lng?: unknown;
      url?: unknown;
      notes?: unknown;
    };
    const name = validateText(body.name, { field: 'name', max: 200 });
    if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
    const nameJa = parseOptionalPlaceText(body.name_ja, 'name_ja', 200);
    if (!nameJa.ok) return NextResponse.json({ error: nameJa.error }, { status: 400 });
    const kind = parseOptionalPlaceKind(body.kind);
    if (!kind.ok) return NextResponse.json({ error: kind.error }, { status: 400 });
    const address = parseOptionalPlaceText(body.address, 'address', 1000);
    if (!address.ok) return NextResponse.json({ error: address.error }, { status: 400 });
    const url = parseOptionalPlaceUrl(body.url);
    if (!url.ok) return NextResponse.json({ error: url.error }, { status: 400 });
    const notes = parseOptionalPlaceText(body.notes, 'notes', 10_000);
    if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });
    if (
      ('lat' in body && body.lat !== null && typeof body.lat !== 'number')
      || ('lng' in body && body.lng !== null && typeof body.lng !== 'number')
    ) {
      return NextResponse.json({ error: 'lat and lng must be numbers or null' }, { status: 400 });
    }
    const coordinates = {
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
    };
    const hasAnyCoordinate = coordinates.lat != null || coordinates.lng != null;
    if (hasAnyCoordinate && !hasFiniteCoordinates(coordinates)) {
      return NextResponse.json({ error: 'valid lat and lng required together' }, { status: 400 });
    }
    const id = await getGeneratedIdRepository().createPlace({
      name: name.value,
      name_ja: nameJa.value ?? null,
      kind: kind.value ?? 'shop',
      address: address.value ?? null,
      lat: coordinates.lat,
      lng: coordinates.lng,
      url: url.value ?? null,
      notes: notes.value ?? null,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return internalError('places.POST', err);
  }
}
