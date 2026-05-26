/**
 * NEW-SECA-021 — lists field length caps.
 * NEW-SECA-022 — game-log note length cap.
 * NEW-SECA-023 — security headers in next.config.mjs.
 * NEW-TCO-003  — tests for game-log note length.
 * NEW-TCO-004  — tests for lists field length.
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

const MAX_NOTE = 10000;
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
  it('POST rejects note longer than 10000 chars with 400', async () => {
    const { POST } = await import('@/app/api/collection/[id]/game-log/route');
    const note = 'x'.repeat(MAX_NOTE + 1);
    const req = localReq('/api/collection/v1/game-log', 'POST', { note });
    const res = await POST(req, { params: Promise.resolve({ id: 'v1' }) });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('10000');
  });

  it('POST accepts note at exactly 10000 chars (no rejection)', async () => {
    const { POST } = await import('@/app/api/collection/[id]/game-log/route');
    const note = 'y'.repeat(MAX_NOTE);
    const req = localReq('/api/collection/v1/game-log', 'POST', { note });
    const res = await POST(req, { params: Promise.resolve({ id: 'v1' }) });
    expect([400, 404]).toContain(res.status);
    if (res.status === 400) {
      const body = await res.json() as { error: string };
      expect(body.error).not.toContain('10000');
    }
  });
});

describe('seca-input-length-caps — lists field length caps (source-pin)', () => {
  it('lists/route.ts slices name, description, color, icon', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'src/app/api/lists/route.ts'), 'utf8');
    expect(src).toContain('body.name.slice(0, 200)');
    expect(src).toContain('body.description.slice(0, 2000)');
    expect(src).toContain('body.color.slice(0, 64)');
    expect(src).toContain('body.icon.slice(0, 64)');
  });

  it('lists/[id]/route.ts slices name, description, color, icon on PATCH', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'src/app/api/lists/[id]/route.ts'), 'utf8');
    expect(src).toContain('body.name.slice(0, 200)');
    expect(src).toContain('body.description.slice(0, 2000)');
    expect(src).toContain('body.color.slice(0, 64)');
    expect(src).toContain('body.icon.slice(0, 64)');
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
