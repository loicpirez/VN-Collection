import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postProxyTest } from '@/app/api/proxy/test/route';
import { PATCH as patchSourcePref } from '@/app/api/collection/[id]/source-pref/route';
import { addToCollection, db, upsertVn } from '@/lib/db';

const VN_ID = 'v99875';
const REFLECTED_TEXT = '<script>fixture-reflection</script>';

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  upsertVn({ id: VN_ID, title: 'Reflected error fixture' });
  addToCollection(VN_ID);
});

describe('validation errors do not reflect caller text', () => {
  it('returns a static proxy-provider error', async () => {
    const response = await postProxyTest(jsonRequest('/api/proxy/test', 'POST', {
      provider: REFLECTED_TEXT,
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unknown provider' });
  });

  it('returns static source-preference field and value errors', async () => {
    const context = { params: Promise.resolve({ id: VN_ID }) };
    const fieldResponse = await patchSourcePref(
      jsonRequest(`/api/collection/${VN_ID}/source-pref`, 'PATCH', { [REFLECTED_TEXT]: 'vndb' }),
      context,
    );
    expect(fieldResponse.status).toBe(400);
    expect(await fieldResponse.json()).toEqual({ error: 'unknown field' });
    const valueResponse = await patchSourcePref(
      jsonRequest(`/api/collection/${VN_ID}/source-pref`, 'PATCH', { title: REFLECTED_TEXT }),
      context,
    );
    expect(valueResponse.status).toBe(400);
    expect(await valueResponse.json()).toEqual({ error: 'invalid value for title' });
  });
});
