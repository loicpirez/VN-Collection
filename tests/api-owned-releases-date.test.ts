import { beforeEach, describe, expect, it } from 'vitest';
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PATCH, POST } from '@/app/api/collection/[id]/owned-releases/route';

const VN_ID = 'v99999';
const RELEASE_ID = `synthetic:${VN_ID}`;
const NOW = Date.now();

function request(method: 'POST' | 'PATCH', body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost/api/collection/${VN_ID}/owned-releases`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function ctx(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: VN_ID }) };
}

function seedCollection(): void {
  db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES (?, 'Fixture VN', ?) ON CONFLICT(id) DO NOTHING`).run(VN_ID, NOW);
  db.prepare(
    `INSERT INTO collection (vn_id, status, added_at, updated_at, playtime_minutes)
     VALUES (?, 'playing', ?, ?, 0)
     ON CONFLICT(vn_id) DO NOTHING`,
  ).run(VN_ID, NOW, NOW);
}

function clearRows(): void {
  db.prepare('DELETE FROM owned_release WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
}

beforeEach(() => {
  clearRows();
  seedCollection();
});

describe('owned release acquired date validation', () => {
  it('rejects non-ISO acquired_date strings', async () => {
    const res = await POST(request('POST', { release_id: RELEASE_ID, acquired_date: 'tomorrow' }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('acquired_date');
  });

  it('accepts YYYY-MM-DD acquired_date strings', async () => {
    const res = await POST(request('POST', { release_id: RELEASE_ID, acquired_date: '2024-01-15' }), ctx());
    expect(res.status).toBe(200);
    const row = db
      .prepare('SELECT acquired_date FROM owned_release WHERE vn_id = ? AND release_id = ?')
      .get(VN_ID, RELEASE_ID) as { acquired_date: string } | undefined;
    expect(row?.acquired_date).toBe('2024-01-15');
  });

  it('rejects non-ISO acquired_date updates', async () => {
    await POST(request('POST', { release_id: RELEASE_ID, acquired_date: '2024-01-15' }), ctx());
    const res = await PATCH(request('PATCH', { release_id: RELEASE_ID, acquired_date: '2024/01/16' }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('acquired_date');
  });
});
