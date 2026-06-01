import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/collection/import/route';
import { decodeCollectionImportPayload } from '@/lib/collection-import';

const NOW = Date.now();

function emptyPayload(): Record<string, unknown> {
  return {
    version: 2,
    exported_at: NOW,
    vns: [],
    collection: [],
    series: [],
    series_vn: [],
  };
}

function importRequest(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/collection/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('collection import validation', () => {
  it('accepts the empty version-2 backup contract', () => {
    expect(decodeCollectionImportPayload(emptyPayload())).toEqual({
      ok: true,
      value: emptyPayload(),
    });
  });

  it('normalizes ids and persisted physical-location JSON', () => {
    const payload = emptyPayload();
    payload.vns = [{ id: 'V990060', title: ' Fixture ', raw: {}, fetched_at: NOW }];
    payload.collection = [{
      vn_id: 'V990060',
      status: 'planning',
      user_rating: null,
      playtime_minutes: 0,
      started_date: null,
      finished_date: null,
      notes: null,
      favorite: 0,
      location: 'unknown',
      edition_type: 'none',
      edition_label: null,
      physical_location: JSON.stringify([' Shelf A ', 'Shelf A']),
      added_at: NOW,
      updated_at: NOW,
    }];
    const decoded = decodeCollectionImportPayload(payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.vns[0]).toMatchObject({ id: 'v990060', title: 'Fixture' });
    expect(decoded.value.collection[0]).toMatchObject({
      vn_id: 'v990060',
      physical_location: JSON.stringify(['Shelf A']),
    });
  });

  it('rejects malformed raw producer arrays before import starts', async () => {
    const payload = emptyPayload();
    payload.vns = [{
      id: 'v990061',
      title: 'Fixture',
      raw: { developers: { id: 'p990061', name: 'Fixture' } },
      fetched_at: NOW,
    }];
    const response = await POST(importRequest(payload));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'vns[0].raw has an invalid shape' });
  });

  it('rejects malformed collection enums', () => {
    const payload = emptyPayload();
    payload.collection = [{
      vn_id: 'v990062',
      status: 'not-a-status',
    }];
    expect(decodeCollectionImportPayload(payload)).toEqual({
      ok: false,
      error: 'collection[0].status is invalid',
    });
  });

  it('rejects duplicate canonical ids', () => {
    const payload = emptyPayload();
    payload.vns = [
      { id: 'v990063', title: 'Fixture A', raw: {}, fetched_at: NOW },
      { id: 'V990063', title: 'Fixture B', raw: {}, fetched_at: NOW },
    ];
    expect(decodeCollectionImportPayload(payload)).toEqual({
      ok: false,
      error: 'vns contains duplicate ids',
    });
  });

  it('rejects malformed series memberships', () => {
    const payload = emptyPayload();
    payload.series_vn = [{ series_id: 1, vn_id: 'v990064', order_index: -1 }];
    expect(decodeCollectionImportPayload(payload)).toEqual({
      ok: false,
      error: 'series_vn[0].order_index must be a non-negative safe integer',
    });
  });
});
