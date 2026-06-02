/**
 * NEW-SECA-021 — lists field length caps.
 * NEW-SECA-022 — game-log note length cap.
 * NEW-SECA-023 — security headers in next.config.mjs.
 * NEW-TCO-003  — tests for game-log note length.
 * NEW-TCO-004  — tests for lists field length.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { addToCollection, db, upsertVn } from '@/lib/db';

const MAX_NOTE = 10000;
const GAME_LOG_VN = 'v1';
const GAME_LOG_NOTE_DB_CAP = 8000;
const MAX_NAME = 200;
const MAX_DESC = 2000;
const MAX_COLOR = 64;
const MAX_ICON = 64;

function localReq(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('seca-input-length-caps — game-log note length cap', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM vn_game_log WHERE vn_id = ?').run(GAME_LOG_VN);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(GAME_LOG_VN);
    db.prepare('DELETE FROM vn WHERE id = ?').run(GAME_LOG_VN);
    upsertVn({ id: GAME_LOG_VN, title: 'Heroine A' });
    addToCollection(GAME_LOG_VN, { status: 'playing' });
  });

  afterEach(() => {
    db.prepare('DELETE FROM vn_game_log WHERE vn_id = ?').run(GAME_LOG_VN);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(GAME_LOG_VN);
    db.prepare('DELETE FROM vn WHERE id = ?').run(GAME_LOG_VN);
  });

  it('POST rejects note longer than 10000 chars with 400', async () => {
    const { POST } = await import('@/app/api/collection/[id]/game-log/route');
    const note = 'x'.repeat(MAX_NOTE + 1);
    const req = localReq(`/api/collection/${GAME_LOG_VN}/game-log`, 'POST', { note });
    const res = await POST(req, { params: Promise.resolve({ id: GAME_LOG_VN }) });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('10000');
  });

  it('POST accepts a 10000-char note (200) and persists it at the 8000-char DB cap', async () => {
    const { POST } = await import('@/app/api/collection/[id]/game-log/route');
    const note = 'y'.repeat(MAX_NOTE);
    const req = localReq(`/api/collection/${GAME_LOG_VN}/game-log`, 'POST', { note });
    const res = await POST(req, { params: Promise.resolve({ id: GAME_LOG_VN }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { entry: { note: string } };
    expect(body.entry.note).toHaveLength(GAME_LOG_NOTE_DB_CAP);
  });
});

describe('seca-input-length-caps — lists field length caps', () => {
  it.each([
    { name: 'x'.repeat(MAX_NAME + 1) },
    { name: 'Valid', description: 'x'.repeat(MAX_DESC + 1) },
    { name: 'Valid', color: 'x'.repeat(MAX_COLOR + 1) },
    { name: 'Valid', icon: 'x'.repeat(MAX_ICON + 1) },
    { name: 'Valid', description: {} },
    { name: 'Valid', color: {} },
    { name: 'Valid', icon: {} },
  ])('POST /api/lists rejects invalid metadata %#', async (body) => {
    const { POST } = await import('@/app/api/lists/route');
    const res = await POST(localReq('/api/lists', 'POST', body));
    expect(res.status).toBe(400);
  });

  it.each([
    { name: 'x'.repeat(MAX_NAME + 1) },
    { description: 'x'.repeat(MAX_DESC + 1) },
    { color: 'x'.repeat(MAX_COLOR + 1) },
    { icon: 'x'.repeat(MAX_ICON + 1) },
    { name: {} },
    { description: {} },
    { color: {} },
    { icon: {} },
    { pinned: 'yes' },
  ])('PATCH /api/lists/[id] rejects invalid metadata %#', async (body) => {
    const { PATCH } = await import('@/app/api/lists/[id]/route');
    const res = await PATCH(localReq('/api/lists/1', 'PATCH', body), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('POST /api/lists/[id]/items rejects malformed notes instead of discarding them', async () => {
    const { createUserList } = await import('@/lib/db');
    const { POST } = await import('@/app/api/lists/[id]/items/route');
    const list = createUserList({ name: 'Note validation' });
    const res = await POST(
      localReq(`/api/lists/${list.id}/items`, 'POST', { vn_id: 'v1', note: { text: 'invalid' } }),
      { params: Promise.resolve({ id: String(list.id) }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('seca-input-length-caps — security headers in next.config.mjs', () => {
  it('next.config.mjs exports headers() with X-Content-Type-Options, X-Frame-Options, Referrer-Policy', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'next.config.mjs'), 'utf8');
    expect(src).toContain('X-Content-Type-Options');
    expect(src).toContain('nosniff');
    expect(src).toContain('X-Frame-Options');
    expect(src).toContain('SAMEORIGIN');
    expect(src).toContain('Referrer-Policy');
    expect(src).toContain('Permissions-Policy');
    expect(src).toContain('poweredByHeader: false');
  });
});
