import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/settings/route';
import { getAppSetting, setAppSetting } from '@/lib/db';

function request(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setAppSetting('vndb_token', null);
  setAppSetting('steam_api_key', null);
  setAppSetting('steam_id', null);
  setAppSetting('stock_disabled_providers', null);
});

describe('settings credential validation', () => {
  it('rejects malformed Steam keys instead of truncating them', async () => {
    const response = await PATCH(request({ steam_api_key: 'x'.repeat(64) }));
    expect(response.status).toBe(400);
    expect(getAppSetting('steam_api_key')).toBeNull();
  });

  it('requires a 17-digit SteamID64', async () => {
    expect((await PATCH(request({ steam_id: '1234' }))).status).toBe(400);
    expect((await PATCH(request({ steam_id: '76561197960287930' }))).status).toBe(200);
    expect(getAppSetting('steam_id')).toBe('76561197960287930');
  });

  it('uses canonical VNDB token validation', async () => {
    expect((await PATCH(request({ vndb_token: 'contains whitespace' }))).status).toBe(400);
    expect((await PATCH(request({ vndb_token: 'tok-abc.def' }))).status).toBe(200);
    expect(getAppSetting('vndb_token')).toBe('tok-abc.def');
  });

  it('deduplicates disabled stock-provider ids before persistence', async () => {
    const response = await PATCH(request({ stock_disabled_providers: ['sofmap', 'sofmap'] }));
    expect(response.status).toBe(200);
    expect(getAppSetting('stock_disabled_providers')).toBe('["sofmap"]');
  });

  it('filters malformed persisted stock-provider ids from GET responses', async () => {
    setAppSetting('stock_disabled_providers', JSON.stringify(['sofmap', 123, 'unknown_provider']));
    const malformedResponse = await GET(new Request('http://127.0.0.1/api/settings'));
    expect(malformedResponse.status).toBe(200);
    expect((await malformedResponse.json()).stock_disabled_providers).toEqual([]);
    setAppSetting('stock_disabled_providers', JSON.stringify(['sofmap', 'unknown_provider']));
    const unknownResponse = await GET(new Request('http://127.0.0.1/api/settings'));
    expect(unknownResponse.status).toBe(200);
    expect((await unknownResponse.json()).stock_disabled_providers).toEqual(['sofmap']);
  });
});
