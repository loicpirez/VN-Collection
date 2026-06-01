import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH as patchVndbStatus } from '@/app/api/vn/[id]/vndb-status/route';
import { PATCH as patchCollectionOrder } from '@/app/api/collection/order/route';
import { POST as postFullDownload } from '@/app/api/collection/full-download/route';
import { POST as postEgsSync } from '@/app/api/egs/sync/route';
import { POST as postStockBatch } from '@/app/api/stock/batch/route';
import { POST as postErogamescape } from '@/app/api/vn/[id]/erogamescape/route';
import { DELETE as deleteStockSource } from '@/app/api/vn/[id]/stock/sources/route';
import { POST as postVnStock } from '@/app/api/vn/[id]/stock/route';
import { POST as postSteamSync } from '@/app/api/steam/sync/route';
import { POST as postShelf, PATCH as patchShelf } from '@/app/api/shelves/route';
import { PATCH as patchShelfById } from '@/app/api/shelves/[id]/route';
import { POST as postReadingGoal } from '@/app/api/reading-goal/route';
import { POST as postEgsOnlyAdd } from '@/app/api/egs/[id]/add/route';
import { DELETE as deleteSeriesVn } from '@/app/api/series/[id]/vn/[vnId]/route';
import { GET as getStockQueue } from '@/app/api/stock/queue/route';

const ROOT = join(__dirname, '..');

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function request(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/vn/v90001/vndb-status', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'v90001' }) };

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('mutation route boolean validation', () => {
  it('does not truthy-coerce collection flags', () => {
    const body = source('src/app/api/collection/[id]/route.ts');
    expect(body).toContain("typeof body.favorite !== 'boolean'");
    expect(body).toContain("typeof body.dumped !== 'boolean'");
    expect(body).toContain("typeof body.dumped_ignored !== 'boolean'");
    expect(body).not.toContain('fields.favorite = !!body.favorite');
    expect(body).not.toContain('fields.dumped = !!body.dumped');
  });

  it('does not truthy-coerce owned-release dumped flags', () => {
    const body = source('src/app/api/collection/[id]/owned-releases/route.ts');
    expect(body).toContain("typeof body.dumped !== 'boolean'");
    expect(body).not.toContain('patch.dumped = !!body.dumped');
  });

  it('validates route completion and ordering fields', () => {
    const body = source('src/app/api/route/[routeId]/route.ts');
    expect(body).toContain("typeof body.completed !== 'boolean'");
    expect(body).toContain('!Number.isSafeInteger(body.order_index)');
    expect(body).not.toContain('fields.completed = !!body.completed');
  });

  it('validates series expansion and ordering fields', () => {
    const body = source('src/app/api/series/[id]/vn/[vnId]/route.ts');
    expect(body).toContain("typeof body.expand !== 'boolean'");
    expect(body).toContain('!Number.isSafeInteger(body.order_index)');
    expect(body).toContain('if (body.expand === true)');
  });

  it('validates game-log identifiers and minutes without coercion or flooring', () => {
    const body = source('src/app/api/collection/[id]/game-log/route.ts');
    expect(body).toContain("typeof eid !== 'number'");
    expect(body).toContain("field: 'session_minutes', min: 0, max: 100_000");
    expect(body).not.toContain('Math.floor(body.session_minutes)');
  });

  it('validates manual activity timestamps without silent flooring', () => {
    const body = source('src/app/api/collection/[id]/activity/route.ts');
    expect(body).toContain('validateIsoDate(body.occurred_at)');
    expect(body).not.toContain('Math.floor(body.occurred_at)');
  });
});

describe('PATCH /api/vn/[id]/vndb-status strict boundary', () => {
  it.each([
    { labels_set: ['5'] },
    { labels_unset: Array.from({ length: 101 }, (_, index) => index) },
    { vote: 10.5 },
    { notes: {} },
    { notes: 'a'.repeat(10_001) },
    { started: '2026/01/01' },
    { finished: false },
  ])('rejects malformed upstream patch input %#', async (body) => {
    const response = await patchVndbStatus(request(body), context);
    expect(response.status).toBe(400);
  });
});

describe('bulk mutation arrays reject partial application', () => {
  it('rejects malformed custom-order members', async () => {
    expect((await patchCollectionOrder(jsonRequest('/api/collection/order', 'PATCH', { ids: ['v1', 'bad'] }))).status).toBe(400);
  });

  it('rejects malformed selective-download members', async () => {
    expect((await postFullDownload(jsonRequest('/api/collection/full-download', 'POST', { vn_ids: ['v1', 'bad'] }))).status).toBe(400);
  });

  it('rejects malformed EGS-sync members', async () => {
    expect((await postEgsSync(jsonRequest('/api/egs/sync', 'POST', { vn_ids: ['v1', 'bad'] }))).status).toBe(400);
  });

  it('rejects malformed and oversized stock batches', async () => {
    expect((await postStockBatch(jsonRequest('/api/stock/batch', 'POST', { vnIds: ['v1', 'bad'] }))).status).toBe(400);
    expect((await postStockBatch(jsonRequest('/api/stock/batch', 'POST', {
      vnIds: Array.from({ length: 5001 }, (_, index) => `v${index + 1}`),
    }))).status).toBe(400);
  });
});

describe('numeric mutation fields reject coercion', () => {
  it('rejects string EGS ids before contacting the upstream', async () => {
    const response = await postErogamescape(
      jsonRequest('/api/vn/v90001/erogamescape', 'POST', { egs_id: '123' }),
      context,
    );
    expect(response.status).toBe(400);
  });

  it('rejects fractional manual stock-source ids', async () => {
    const response = await deleteStockSource(
      jsonRequest('/api/vn/v90001/stock/sources', 'DELETE', { id: 1.5 }),
      context,
    );
    expect(response.status).toBe(400);
  });

  it('rejects malformed VN stock provider selections', async () => {
    const response = await postVnStock(
      jsonRequest('/api/vn/v90001/stock', 'POST', { providers: ['sofmap', 'bad'] }),
      context,
    );
    expect(response.status).toBe(400);
  });

  it('rejects fractional Steam playtime rows before applying any changes', async () => {
    const response = await postSteamSync(
      jsonRequest('/api/steam/sync', 'POST', { applies: [{ vn_id: 'v90001', playtime_minutes: 1.5 }] }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects malformed shelf dimensions instead of flooring or clamping them', async () => {
    expect((await postShelf(jsonRequest('/api/shelves', 'POST', { name: 'Fractional', cols: 1.5 }))).status).toBe(400);
    expect((await patchShelf(jsonRequest('/api/shelves', 'PATCH', { order: [1.5] }))).status).toBe(400);
    expect((await patchShelfById(
      jsonRequest('/api/shelves/1', 'PATCH', { rows: 201 }),
      { params: Promise.resolve({ id: '1' }) },
    )).status).toBe(400);
  });

  it('rejects malformed reading-goal years instead of silently using the current year', async () => {
    expect((await postReadingGoal(jsonRequest('/api/reading-goal', 'POST', { year: '2026', target: 1 }))).status).toBe(400);
    expect((await postReadingGoal(jsonRequest('/api/reading-goal', 'POST', { year: 999999, target: 1 }))).status).toBe(400);
  });

  it('rejects malformed EGS-only collection status before upstream work starts', async () => {
    const response = await postEgsOnlyAdd(
      jsonRequest('/api/egs/1/add', 'POST', { status: 'invalid' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(response.status).toBe(400);
  });

  it('rejects malformed series unlink VN ids', async () => {
    const response = await deleteSeriesVn(
      jsonRequest('/api/series/1/vn/invalid', 'DELETE', {}),
      { params: Promise.resolve({ id: '1', vnId: '../etc/passwd' }) },
    );
    expect(response.status).toBe(400);
  });

  it('rejects malformed stock queue pagination', async () => {
    const response = await getStockQueue(new NextRequest('http://127.0.0.1/api/stock/queue?page_size=501'));
    expect(response.status).toBe(400);
  });
});
