import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { listCollection, upsertVn } from '@/lib/db';
import { GET, POST } from '@/app/api/physical-bundles/route';
import { DELETE, PATCH } from '@/app/api/physical-bundles/[id]/route';
import * as dbFunctions from '@/lib/db';

listCollection({});
const db = new Database(process.env.DB_PATH!);

function request(path: string, method = 'GET', body?: object, host = 'localhost'): NextRequest {
  return new NextRequest(`http://${host}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function seed(): void {
  for (const suffix of ['1', '2', '3']) {
    const vnId = `v99030${suffix}`;
    const releaseId = `r99030${suffix}`;
    upsertVn({ id: vnId, title: `Synthetic route title ${suffix}` });
    db.prepare('INSERT INTO owned_release (vn_id, release_id, added_at) VALUES (?, ?, ?)')
      .run(vnId, releaseId, Number(suffix));
  }
}

const validBody = {
  name: 'Synthetic API bundle',
  anchor: { vn_id: 'V990301', release_id: 'r990301' },
  members: [
    { vn_id: 'v990301', release_id: 'r990301' },
    { vn_id: 'v990302', release_id: 'r990302' },
  ],
};

beforeEach(() => {
  db.exec(`
    DELETE FROM physical_bundle;
    DELETE FROM owned_release WHERE vn_id LIKE 'v99030%';
    DELETE FROM vn WHERE id LIKE 'v99030%';
  `);
  seed();
});

afterAll(() => db.close());

describe('physical bundle API routes', () => {
  it('lists and creates a validated bundle', async () => {
    expect(await (await GET()).json()).toEqual({ bundles: [] });
    const response = await POST(request('/api/physical-bundles', 'POST', validBody));
    expect(response.status).toBe(201);
    const payload = await response.json() as { bundle: { id: number; name: string; anchor_vn_id: string; members: object[] } };
    expect(payload.bundle).toMatchObject({ name: 'Synthetic API bundle', anchor_vn_id: 'v990301' });
    expect(payload.bundle.members).toHaveLength(2);
    expect((await (await GET()).json()).bundles).toHaveLength(1);
  });

  it('rejects unauthenticated and malformed creation requests', async () => {
    expect((await POST(request('/api/physical-bundles', 'POST', validBody, 'example.test'))).status).toBe(403);
    expect((await POST(request('/api/physical-bundles', 'POST', {}))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, anchor: [] }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, anchor: null }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, anchor: { vn_id: 'bad', release_id: 'r1' } }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, members: 'bad' }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, members: [validBody.members[0]] }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, members: [null, validBody.members[1]] }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', { ...validBody, members: [[], validBody.members[1]] }))).status).toBe(400);
    expect((await POST(request('/api/physical-bundles', 'POST', {
      ...validBody,
      members: [{ vn_id: 'bad', release_id: 'r1' }, validBody.members[1]],
    }))).status).toBe(400);

    const first = await POST(request('/api/physical-bundles', 'POST', validBody));
    expect(first.status).toBe(201);
    expect((await POST(request('/api/physical-bundles', 'POST', {
      ...validBody,
      name: 'Overlapping bundle',
      anchor: { vn_id: 'v990302', release_id: 'r990302' },
      members: [validBody.members[1], { vn_id: 'v990303', release_id: 'r990303' }],
    }))).status).toBe(400);
  });

  it('renames and dissolves a bundle with safe id handling', async () => {
    const created = await POST(request('/api/physical-bundles', 'POST', validBody));
    const { bundle } = await created.json() as { bundle: { id: number } };

    expect((await PATCH(request(`/api/physical-bundles/${bundle.id}`, 'PATCH', { name: 'Blocked' }, 'example.test'), context(String(bundle.id)))).status).toBe(403);
    expect((await PATCH(request('/api/physical-bundles/bad', 'PATCH', { name: 'Name' }), context('bad'))).status).toBe(400);
    expect((await PATCH(request('/api/physical-bundles/999999', 'PATCH', { name: 'Name' }), context('999999'))).status).toBe(404);
    expect((await PATCH(request(`/api/physical-bundles/${bundle.id}`, 'PATCH', { name: '' }), context(String(bundle.id)))).status).toBe(400);

    const renamed = await PATCH(
      request(`/api/physical-bundles/${bundle.id}`, 'PATCH', { name: 'Renamed API bundle' }),
      context(String(bundle.id)),
    );
    expect((await renamed.json()).bundle.name).toBe('Renamed API bundle');

    expect((await DELETE(request(`/api/physical-bundles/${bundle.id}`, 'DELETE', undefined, 'example.test'), context(String(bundle.id)))).status).toBe(403);
    expect((await DELETE(request('/api/physical-bundles/0', 'DELETE'), context('0'))).status).toBe(400);
    expect((await DELETE(request('/api/physical-bundles/999999', 'DELETE'), context('999999'))).status).toBe(404);
    expect((await DELETE(request(`/api/physical-bundles/${bundle.id}`, 'DELETE'), context(String(bundle.id)))).status).toBe(200);
    expect((await DELETE(request(`/api/physical-bundles/${bundle.id}`, 'DELETE'), context(String(bundle.id)))).status).toBe(404);
  });

  it('returns opaque errors when bundle mutations fail internally', async () => {
    const created = await POST(request('/api/physical-bundles', 'POST', validBody));
    const { bundle } = await created.json() as { bundle: { id: number } };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const rename = vi.spyOn(dbFunctions, 'renamePhysicalBundle').mockImplementationOnce(() => {
      throw new Error('sensitive rename detail');
    });
    const renameResponse = await PATCH(
      request(`/api/physical-bundles/${bundle.id}`, 'PATCH', { name: 'Rejected rename' }),
      context(String(bundle.id)),
    );
    expect(renameResponse.status).toBe(400);
    expect(await renameResponse.json()).toEqual({ error: 'physical bundle rename failed' });
    rename.mockRestore();

    const remove = vi.spyOn(dbFunctions, 'deletePhysicalBundle').mockImplementationOnce(() => {
      throw new Error('sensitive delete detail');
    });
    const deleteResponse = await DELETE(
      request(`/api/physical-bundles/${bundle.id}`, 'DELETE'),
      context(String(bundle.id)),
    );
    expect(deleteResponse.status).toBe(500);
    expect(await deleteResponse.json()).toEqual({ error: 'physical bundle delete failed' });
    remove.mockRestore();
    consoleError.mockRestore();
  });
});
