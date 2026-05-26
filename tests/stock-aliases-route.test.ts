import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/vn/[id]/stock/aliases/route';
import { deleteStockAlias, listStockAliases, upsertStockAlias } from '@/lib/db';

const VN_ID = 'v98765';

function clearAliases() {
  for (const row of listStockAliases(VN_ID)) {
    deleteStockAlias(VN_ID, row.alias_term);
  }
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/vn/v98765/stock/aliases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

beforeEach(clearAliases);
afterEach(clearAliases);

describe('POST /api/vn/[id]/stock/aliases — validation', () => {
  it('rejects empty term with 400', async () => {
    const res = await POST(
      makeReq({ term: '   ', action: 'add' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/term required/);
  });

  it('rejects 1-char term with 400 (too short)', async () => {
    const res = await POST(
      makeReq({ term: 'a', action: 'add' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too short/);
  });

  it('rejects term longer than 100 chars with 400', async () => {
    const longTerm = 'a'.repeat(101);
    const res = await POST(
      makeReq({ term: longTerm, action: 'add' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too long/);
  });

  it('rejects more than 20 aliases per VN', async () => {
    for (let i = 0; i < 20; i++) upsertStockAlias(VN_ID, `alias-${i}`);
    const res = await POST(
      makeReq({ term: 'extra', action: 'add' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many aliases/);
    expect(body.aliases).toHaveLength(20);
  });

  it('updating an existing alias when at the cap is allowed', async () => {
    for (let i = 0; i < 20; i++) upsertStockAlias(VN_ID, `alias-${i}`);
    // Re-upsert an existing term — should succeed (no new row added).
    const res = await POST(
      makeReq({ term: 'alias-3', action: 'add' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    expect(listStockAliases(VN_ID)).toHaveLength(20);
  });

  it('normalises full-width and trims whitespace', async () => {
    const res = await POST(
      makeReq({ term: '  ＳａｍｐＬｅ   　 タイトル  ', action: 'add' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    const stored = listStockAliases(VN_ID).map((r) => r.alias_term);
    expect(stored).toContain('SampLe タイトル');
  });

  it('delete still works at the cap', async () => {
    for (let i = 0; i < 20; i++) upsertStockAlias(VN_ID, `alias-${i}`);
    const res = await POST(
      makeReq({ term: 'alias-5', action: 'delete' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    expect(listStockAliases(VN_ID)).toHaveLength(19);
  });
});
