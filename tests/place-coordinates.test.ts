import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH as patchPlace } from '@/app/api/places/[id]/route';
import { GET as listPlacesRoute, POST as createPlaceRoute } from '@/app/api/places/route';
import { addToCollection, createPlace, db, getPlace, updatePlace, upsertVn } from '@/lib/db';
import { hasFiniteCoordinates, normalizeOptionalCoordinate } from '@/lib/place-coordinates';

const PLACE_NAME_PREFIX = '__test_coordinates_';
const VN_ID = 'v991901';

function jsonRequest(path: string, method: 'POST' | 'PATCH', body: object): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  db.prepare('DELETE FROM place_registry WHERE name LIKE ?').run(`${PLACE_NAME_PREFIX}%`);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
});

describe('place coordinate helpers', () => {
  it('requires a complete finite coordinate pair', () => {
    expect(hasFiniteCoordinates({ lat: 35.6, lng: 139.7 })).toBe(true);
    expect(hasFiniteCoordinates({ lat: Number.POSITIVE_INFINITY, lng: 139.7 })).toBe(false);
    expect(hasFiniteCoordinates({ lat: 35.6, lng: Number.NaN })).toBe(false);
    expect(hasFiniteCoordinates({ lat: 35.6, lng: null })).toBe(false);
    expect(hasFiniteCoordinates({ lat: 91, lng: 139.7 })).toBe(false);
    expect(hasFiniteCoordinates({ lat: 35.6, lng: -181 })).toBe(false);
  });

  it('normalizes invalid internal coordinate values to null', () => {
    expect(normalizeOptionalCoordinate(35.6, 'lat')).toBe(35.6);
    expect(normalizeOptionalCoordinate(Number.POSITIVE_INFINITY, 'lat')).toBeNull();
    expect(normalizeOptionalCoordinate(Number.NaN, 'lng')).toBeNull();
    expect(normalizeOptionalCoordinate(undefined, 'lng')).toBeNull();
    expect(normalizeOptionalCoordinate(91, 'lat')).toBeNull();
    expect(normalizeOptionalCoordinate(-181, 'lng')).toBeNull();
  });
});

describe('place coordinate persistence', () => {
  it('normalizes non-finite values from direct create and update callers', () => {
    const id = createPlace({
      name: `${PLACE_NAME_PREFIX}direct`,
      lat: Number.POSITIVE_INFINITY,
      lng: Number.NaN,
    });
    expect(getPlace(id)).toMatchObject({ lat: null, lng: null });
    updatePlace(id, { lat: 35.6, lng: Number.NEGATIVE_INFINITY });
    expect(getPlace(id)).toMatchObject({ lat: 35.6, lng: null });
  });
});

describe('place coordinate API validation', () => {
  it('returns registry rows separately from physical-location suggestions', async () => {
    createPlace({ name: `${PLACE_NAME_PREFIX}registry` });
    upsertVn({ id: VN_ID, title: `${PLACE_NAME_PREFIX}vn` });
    addToCollection(VN_ID, { status: 'planning', physical_location: ['Shelf Tokyo'] });

    const response = await listPlacesRoute();
    const payload = await response.json();

    expect(payload.places).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: `${PLACE_NAME_PREFIX}registry` })]),
    );
    expect(payload.known_places).toContain('Shelf Tokyo');
  });

  it('rejects incomplete or non-finite coordinates on create', async () => {
    const incomplete = await createPlaceRoute(
      jsonRequest('/api/places', 'POST', { name: `${PLACE_NAME_PREFIX}incomplete`, lat: 35.6 }),
    );
    expect(incomplete.status).toBe(400);

    const infinite = await createPlaceRoute(
      jsonRequest('/api/places', 'POST', {
        name: `${PLACE_NAME_PREFIX}infinite`,
        lat: Number.POSITIVE_INFINITY,
        lng: 139.7,
      }),
    );
    expect(infinite.status).toBe(400);

    const outOfRange = await createPlaceRoute(
      jsonRequest('/api/places', 'POST', {
        name: `${PLACE_NAME_PREFIX}range`,
        lat: 91,
        lng: 139.7,
      }),
    );
    expect(outOfRange.status).toBe(400);

    const wrongType = await createPlaceRoute(
      jsonRequest('/api/places', 'POST', {
        name: `${PLACE_NAME_PREFIX}type`,
        lat: '35.6',
        lng: 139.7,
      }),
    );
    expect(wrongType.status).toBe(400);
  });

  it('rejects a partial coordinate patch that leaves an invalid pair', async () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}patch` });
    const response = await patchPlace(
      jsonRequest(`/api/places/${id}`, 'PATCH', { lat: 35.6 }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(response.status).toBe(400);
  });

  it('rejects malformed optional metadata and non-HTTP URLs on create', async () => {
    const malformed = await createPlaceRoute(
      jsonRequest('/api/places', 'POST', { name: `${PLACE_NAME_PREFIX}metadata`, notes: { text: 'invalid' } }),
    );
    expect(malformed.status).toBe(400);
    const unsafeUrl = await createPlaceRoute(
      jsonRequest('/api/places', 'POST', { name: `${PLACE_NAME_PREFIX}url`, url: 'javascript:alert(1)' }),
    );
    expect(unsafeUrl.status).toBe(400);
  });

  it('rejects malformed optional patches without erasing persisted values', async () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}patch-metadata`, notes: 'before' });
    const response = await patchPlace(
      jsonRequest(`/api/places/${id}`, 'PATCH', { notes: { text: 'invalid' } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(response.status).toBe(400);
    expect(getPlace(id)?.notes).toBe('before');
  });
});
