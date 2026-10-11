import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { repository, collection, recordActivity } = vi.hoisted(() => ({
  repository: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
  collection: {
    contains: vi.fn(),
    getSourcePreferences: vi.fn(),
    setSourcePreferences: vi.fn(),
  },
  recordActivity: vi.fn(),
}));

vi.mock('@/lib/db/repositories/ai-playtime', () => ({ getAiPlaytimeRepository: () => repository }));
vi.mock('@/lib/db/repositories/collection-core', () => ({ getCollectionCoreRepository: () => collection }));
vi.mock('@/lib/activity', () => ({ recordActivity }));

import { DELETE, GET, PUT } from '@/app/api/collection/[id]/ai-playtime/route';
import { PATCH as PATCH_SOURCE_PREFERENCE } from '@/app/api/collection/[id]/source-pref/route';
import { mapCollectionItemRow, type CollectionItemDatabaseRow } from '@/lib/db/collection-item-mapper';
import { COMBINED_PLAYTIME_SORT_SQL } from '@/lib/db/collection-sort';

const VN_ID = 'v991901';
const NOW = Date.now();

function context(id = VN_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(method: string, body?: unknown, id = VN_ID): NextRequest {
  return new Request(`http://localhost/api/collection/${id}/ai-playtime`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const estimate = {
  minutes: 900,
  lower_minutes: 720,
  upper_minutes: 1080,
  confidence: 0.75,
  model: 'local-estimator-v1',
  rationale: 'Bounded estimate from local metadata.',
  generated_at: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
  collection.contains.mockResolvedValue(true);
  collection.getSourcePreferences.mockResolvedValue({});
  collection.setSourcePreferences.mockResolvedValue(undefined);
  repository.get.mockResolvedValue(estimate);
  repository.set.mockResolvedValue(undefined);
  repository.clear.mockResolvedValue(undefined);
  recordActivity.mockResolvedValue(undefined);
});

describe('AI playtime estimate API', () => {
  it('persists a validated estimate with provenance', async () => {
    const response = await PUT(request('PUT', estimate), context());
    expect(response.status).toBe(200);
    expect(repository.set).toHaveBeenCalledWith(VN_ID, estimate);
    expect(await response.json()).toEqual({ estimate });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'collection.ai-playtime',
      entityId: VN_ID,
      payload: expect.objectContaining({ minutes: 900, model: 'local-estimator-v1' }),
    }));
  });

  it('reads the estimate and rejects a VN outside the collection', async () => {
    const response = await GET(request('GET'), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ estimate });
    collection.contains.mockResolvedValueOnce(false);
    const missing = await GET(request('GET'), context());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not in collection' });
  });

  it('rejects inconsistent bounds and invalid confidence', async () => {
    const bounds = await PUT(request('PUT', { ...estimate, lower_minutes: 901 }), context());
    expect(bounds.status).toBe(400);
    expect(await bounds.json()).toEqual({ error: 'expected lower_minutes <= minutes <= upper_minutes' });

    const confidence = await PUT(request('PUT', { ...estimate, confidence: 1.1 }), context());
    expect(confidence.status).toBe(400);
    expect(await confidence.json()).toEqual({ error: 'confidence must be between 0 and 1 or null' });
    expect(repository.set).not.toHaveBeenCalled();
  });

  it('clears the estimate without touching the actual playtime API', async () => {
    collection.getSourcePreferences.mockResolvedValueOnce({ playtime: 'ai', title: 'vndb' });
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(200);
    expect(repository.clear).toHaveBeenCalledWith(VN_ID);
    expect(collection.setSourcePreferences).toHaveBeenCalledWith(VN_ID, { title: 'vndb' });
    expect(await response.json()).toEqual({ ok: true, estimate: null });
  });

  it.each([GET, PUT, DELETE])('rejects invalid and absent collection identifiers before persistence', async (handler) => {
    const invalid = await handler(request('PUT', estimate, 'invalid'), context('invalid'));
    expect(invalid.status).toBe(400);
    collection.contains.mockResolvedValueOnce(false);
    const missing = await handler(request('PUT', estimate), context());
    expect(missing.status).toBe(404);
    expect(repository.set).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();
  });

  it.each([
    ['minutes', null], ['minutes', 0], ['minutes', -1], ['minutes', 1.5], ['minutes', 10_000_001], ['minutes', Number.MAX_SAFE_INTEGER + 1], ['minutes', '900'],
    ['lower_minutes', null], ['lower_minutes', 0], ['lower_minutes', 1.5], ['lower_minutes', 10_000_001], ['lower_minutes', 901],
    ['upper_minutes', null], ['upper_minutes', 0], ['upper_minutes', 1.5], ['upper_minutes', 10_000_001], ['upper_minutes', 899],
    ['confidence', -0.01], ['confidence', 1.01], ['confidence', '0.5'],
    ['model', null], ['model', ''], ['model', '  '], ['model', 'x'.repeat(201)],
    ['rationale', 1], ['rationale', 'x'.repeat(2001)],
    ['generated_at', null], ['generated_at', -1], ['generated_at', 0.5], ['generated_at', NOW + 600_000],
  ])('rejects invalid %s value %s without persisting an estimate', async (field, value) => {
    const response = await PUT(request('PUT', { ...estimate, [String(field)]: value }), context());
    expect(response.status).toBe(400);
    expect(repository.set).not.toHaveBeenCalled();
  });

  it.each([null, undefined, '', '  ', ' Synthetic evidence. '])('normalizes optional rationale %s and defaults the generation timestamp', async (rationale) => {
    const response = await PUT(request('PUT', { ...estimate, model: ' synthetic ', confidence: null, rationale, generated_at: undefined }, 'V991901'), context('V991901'));
    expect(response.status).toBe(200);
    expect(repository.set).toHaveBeenCalledWith(VN_ID, expect.objectContaining({
      model: 'synthetic', confidence: null, rationale: rationale?.trim() || null, generated_at: expect.any(Number),
    }));
  });

  it('clears AI while preserving a non-AI preference', async () => {
    collection.getSourcePreferences.mockResolvedValueOnce({ playtime: 'egs', title: 'vndb' });
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(200);
    expect(collection.setSourcePreferences).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ payload: { cleared: true, source_preference_reset: false } }));
  });

  it('protects DELETE with the same authentication policy as PUT', async () => {
    const external = new Request(`http://collection.example/api/collection/${VN_ID}/ai-playtime`, { method: 'DELETE' }) as NextRequest;
    const response = await DELETE(external, context());
    expect(response.status).toBe(403);
    expect(repository.clear).not.toHaveBeenCalled();
  });

  it('keeps public reads open while protecting external writes with the existing auth gate', async () => {
    const external = new Request(`http://collection.example/api/collection/${VN_ID}/ai-playtime`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(estimate),
    }) as unknown as NextRequest;
    const denied = await PUT(external, context());
    expect(denied.status).toBe(403);
    expect(repository.set).not.toHaveBeenCalled();

    const read = await GET(external, context());
    expect(read.status).toBe(200);
  });

  it('accepts AI only for playtime source preference', async () => {
    for (const field of ['title', 'description', 'image', 'brand', 'rating']) {
      const rejected = await PATCH_SOURCE_PREFERENCE(request('PATCH', { [field]: 'ai' }), context());
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ error: 'ai is only valid for playtime' });
    }
    expect(collection.setSourcePreferences).not.toHaveBeenCalled();

    const accepted = await PATCH_SOURCE_PREFERENCE(request('PATCH', { playtime: 'ai' }), context());
    expect(accepted.status).toBe(200);
    expect(collection.setSourcePreferences).toHaveBeenCalledWith(VN_ID, { playtime: 'ai' });
  });
});

describe('AI playtime collection integration', () => {
  it('maps complete provenance into the distinct ai_playtime field', () => {
    const row = {
      id: VN_ID,
      title: 'Synthetic title',
      fetched_at: NOW,
      ai_playtime_minutes: 900,
      ai_playtime_lower_minutes: 720,
      ai_playtime_upper_minutes: 1080,
      ai_playtime_confidence: 0.75,
      ai_playtime_model: 'local-estimator-v1',
      ai_playtime_rationale: 'Bounded estimate from local metadata.',
      ai_playtime_generated_at: NOW,
    } as CollectionItemDatabaseRow;
    expect(mapCollectionItemRow(row)?.ai_playtime).toEqual(estimate);
    expect(mapCollectionItemRow({ ...row, ai_playtime_model: null })?.ai_playtime).toBeNull();
  });

  it('executes the shared four-source SQL and sorts by the positive-source median', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE vn (id TEXT PRIMARY KEY, length_minutes INTEGER);
      CREATE TABLE egs_game (vn_id TEXT PRIMARY KEY, playtime_median_minutes INTEGER);
      CREATE TABLE collection (
        vn_id TEXT PRIMARY KEY,
        playtime_minutes INTEGER,
        ai_playtime_minutes INTEGER
      );
      INSERT INTO vn VALUES ('four', 600), ('single', 1000), ('zeros', 900), ('negative', -100);
      INSERT INTO egs_game VALUES ('four', 600), ('single', NULL), ('zeros', 0), ('negative', 1200);
      INSERT INTO collection VALUES ('four', 600, 2402), ('single', NULL, NULL), ('zeros', 0, 0), ('negative', -50, 0);
    `);
    const rows = db.prepare(`
      SELECT c.vn_id AS id, ${COMBINED_PLAYTIME_SORT_SQL} AS combined
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      LEFT JOIN egs_game e ON e.vn_id = c.vn_id
      ORDER BY ${COMBINED_PLAYTIME_SORT_SQL} DESC
    `).all() as Array<{ id: string; combined: number }>;
    expect(rows).toEqual([
      { id: 'negative', combined: 1200 },
      { id: 'single', combined: 1000 },
      { id: 'zeros', combined: 900 },
      { id: 'four', combined: 600 },
    ]);
    db.close();
  });

  it('projects all AI provenance columns from the SQLite detail read', () => {
    const source = readFileSync('src/lib/db.ts', 'utf8');
    const detailRead = source.slice(
      source.indexOf('export function getCollectionItem(vnId: string)'),
      source.indexOf('export function getStats()', source.indexOf('export function getCollectionItem(vnId: string)')),
    );
    for (const column of [
      'ai_playtime_minutes',
      'ai_playtime_lower_minutes',
      'ai_playtime_upper_minutes',
      'ai_playtime_confidence',
      'ai_playtime_model',
      'ai_playtime_rationale',
      'ai_playtime_generated_at',
    ]) {
      expect(detailRead).toContain(`c.${column}`);
    }
  });
});
