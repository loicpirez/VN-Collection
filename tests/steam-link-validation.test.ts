import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, POST } from '@/app/api/steam/link/route';
import { addToCollection, deleteSteamLink, getSteamLinkForVn, upsertVn } from '@/lib/db';

const VN_ID = 'v99872';

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/steam/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  deleteSteamLink(VN_ID);
  upsertVn({ id: VN_ID, title: 'Steam link fixture' });
  addToCollection(VN_ID);
});

describe('Steam manual-link validation', () => {
  it('rejects unsafe app ids', async () => {
    const response = await POST(jsonRequest({
      vn_id: VN_ID,
      appid: Number.MAX_SAFE_INTEGER + 1,
      steam_name: 'Fixture',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'appid is out of safe integer range' });
  });

  it('rejects names longer than the persisted maximum', async () => {
    const response = await POST(jsonRequest({
      vn_id: VN_ID,
      appid: 99872,
      steam_name: 's'.repeat(201),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'steam_name too long (max 200)' });
    expect(getSteamLinkForVn(VN_ID)).toBeNull();
  });

  it('persists the normalized display name', async () => {
    const response = await POST(jsonRequest({
      vn_id: VN_ID.toUpperCase(),
      appid: 99872,
      steam_name: '  Fixture title  ',
    }));
    expect(response.status).toBe(200);
    expect(getSteamLinkForVn(VN_ID)?.steam_name).toBe('Fixture title');
  });

  it('normalizes VN ids before unlinking', async () => {
    const addResponse = await POST(jsonRequest({
      vn_id: VN_ID,
      appid: 99872,
      steam_name: 'Fixture title',
    }));
    expect(addResponse.status).toBe(200);
    const deleteResponse = await DELETE(new NextRequest(
      `http://127.0.0.1/api/steam/link?vn_id=${VN_ID.toUpperCase()}`,
      { method: 'DELETE' },
    ));
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ ok: true });
    expect(getSteamLinkForVn(VN_ID)).toBeNull();
  });
});
