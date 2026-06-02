/**
 * Hermetic coverage for src/lib/brand-overlap.ts. VNDB producer lookup and
 * producer-completion fan-out are mocked; the staff intersection is driven
 * by genuine `staff_credit_index` rows and `vndb_cache` staff_full payloads
 * seeded through the real db helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProducerCompletion } from '@/lib/producer-completion';
import type { VndbProducer } from '@/lib/vndb';

const { fetchProducerCompletionMock } = vi.hoisted(() => ({ fetchProducerCompletionMock: vi.fn() }));
const { getProducerMock } = vi.hoisted(() => ({ getProducerMock: vi.fn() }));

vi.mock('@/lib/producer-completion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/producer-completion')>();
  return { ...actual, fetchProducerCompletion: fetchProducerCompletionMock };
});

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getProducer: getProducerMock };
});

import { findBrandStaffOverlap } from '@/lib/brand-overlap';
import { db, putCacheRow } from '@/lib/db';

const BRAND_A = 'p70001';
const BRAND_B = 'p70002';

function completion(vnIds: string[], totalKnown: number): ProducerCompletion {
  return {
    totalKnown,
    ownedCount: 0,
    pct: 0,
    vns: vnIds.map((vnId) => ({
      vnId,
      title: `Title ${vnId}`,
      alttitle: null,
      released: null,
      rating: null,
      image: null,
      owned: false,
    })),
  };
}

function producer(id: string, name: string): VndbProducer {
  return {
    id,
    name,
    original: null,
    lang: 'ja',
    type: 'co',
    description: null,
    aliases: [],
    extlinks: [],
  } as VndbProducer;
}

function seedCreditIndex(sid: string, vnId: string, isVa = false): void {
  db.prepare('INSERT OR IGNORE INTO staff_credit_index (sid, vn_id, is_va) VALUES (?, ?, ?)').run(
    sid,
    vnId,
    isVa ? 1 : 0,
  );
}

interface ProductionCreditSpec {
  id: string;
  roles: string[];
}
interface VaCreditSpec {
  id: string;
  characters: string[];
}

function staffProfile(sid: string, name: string, original: string | null) {
  return { id: sid, aid: 1, ismain: true, name, original, lang: 'ja', gender: null, description: null, aliases: [], extlinks: [] };
}

function productionCredit(spec: ProductionCreditSpec) {
  return {
    id: spec.id,
    title: `Title ${spec.id}`,
    alttitle: null,
    released: null,
    rating: null,
    image_url: null,
    image_thumb: null,
    roles: spec.roles.map((role) => ({ role, note: null })),
  };
}

function vaCredit(spec: VaCreditSpec) {
  return {
    id: spec.id,
    title: `Title ${spec.id}`,
    alttitle: null,
    released: null,
    rating: null,
    image_url: null,
    image_thumb: null,
    characters: spec.characters.map((name, i) => ({
      id: `c${9000 + i}`,
      name,
      original: null,
      image_url: null,
      note: null,
    })),
  };
}

function seedStaffFull(
  sid: string,
  name: string,
  original: string | null,
  production: ProductionCreditSpec[],
  va: VaCreditSpec[],
): void {
  const body = JSON.stringify({
    profile: staffProfile(sid, name, original),
    productionCredits: production.map(productionCredit),
    vaCredits: va.map(vaCredit),
    fetched_at: 1,
  });
  putCacheRow({
    cache_key: `staff_full:${sid.toLowerCase()}`,
    body,
    etag: null,
    last_modified: null,
    fetched_at: Date.now(),
    expires_at: Date.now() + 3_600_000,
  });
}

function resetState(): void {
  db.exec(`DELETE FROM staff_credit_index; DELETE FROM vndb_cache;`);
}

beforeEach(() => {
  resetState();
  fetchProducerCompletionMock.mockReset();
  getProducerMock.mockReset();
  getProducerMock.mockImplementation(async (id: string) =>
    id === BRAND_A ? producer(BRAND_A, 'Studio Alpha') : producer(BRAND_B, 'Studio Beta'),
  );
});

afterEach(() => {
  resetState();
});

describe('findBrandStaffOverlap', () => {
  it('returns needsMoreData when neither brand has any VNs', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion([], 0) : completion([], 0),
    );
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toEqual([]);
    expect(result.needsMoreData).toBe(true);
    expect(result.a?.name).toBe('Studio Alpha');
    expect(result.b?.name).toBe('Studio Beta');
  });

  it('reports needsMoreData=true when a candidate sid has no cached staff_full body', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71001'], 1) : completion(['v71002'], 1),
    );
    seedCreditIndex('s72001', 'v71001');
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toEqual([]);
    expect(result.needsMoreData).toBe(true);
  });

  it('reports needsMoreData=true when no candidate sids and no staff_full cache rows exist', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71010'], 1) : completion(['v71011'], 1),
    );
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toEqual([]);
    expect(result.needsMoreData).toBe(true);
  });

  it('reports needsMoreData=false when no candidate sids match but staff_full cache rows exist elsewhere', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71020'], 1) : completion(['v71021'], 1),
    );
    seedStaffFull('s72020', 'Unrelated Staff', null, [{ id: 'v79999', roles: ['scenario'] }], []);
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toEqual([]);
    expect(result.needsMoreData).toBe(false);
  });

  it('lists a staff member credited on both brands with their per-side roles', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71101'], 4) : completion(['v71102'], 6),
    );
    seedCreditIndex('s72100', 'v71101');
    seedCreditIndex('s72100', 'v71102');
    seedStaffFull(
      's72100',
      'Shared Writer',
      'シナリオ担当',
      [
        { id: 'v71101', roles: ['scenario'] },
        { id: 'v71102', roles: ['scenario', 'director'] },
      ],
      [],
    );
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.sid).toBe('s72100');
    expect(entry.isVa).toBe(false);
    expect(entry.aCredits.map((c) => c.vn_id)).toEqual(['v71101']);
    expect(entry.bCredits[0].roles).toEqual(['scenario', 'director']);
    expect(result.a?.vnCount).toBe(4);
    expect(result.b?.vnCount).toBe(6);
  });

  it('marks voice-only crossovers as VA with a synthetic va:<characters> role', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71201'], 1) : completion(['v71202'], 1),
    );
    seedCreditIndex('s72200', 'v71201', true);
    seedCreditIndex('s72200', 'v71202', true);
    seedStaffFull(
      's72200',
      'Shared Seiyuu',
      null,
      [],
      [
        { id: 'v71201', characters: ['Heroine A'] },
        { id: 'v71202', characters: ['Heroine B', 'Heroine C'] },
      ],
    );
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].isVa).toBe(true);
    expect(result.entries[0].aCredits[0].roles[0]).toBe('va:Heroine A');
    expect(result.entries[0].bCredits[0].roles[0]).toBe('va:Heroine B, Heroine C');
  });

  it('excludes a staff member who only has credits on one side', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71301'], 1) : completion(['v71302'], 1),
    );
    seedCreditIndex('s72300', 'v71301');
    seedStaffFull('s72300', 'One Side Only', null, [{ id: 'v71301', roles: ['art'] }], []);
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries).toEqual([]);
    expect(result.needsMoreData).toBe(false);
  });

  it('sorts entries by total credit count descending', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion(['v71401', 'v71403'], 2) : completion(['v71402', 'v71404'], 2),
    );
    for (const sid of ['s72400', 's72401']) {
      seedCreditIndex(sid, 'v71401');
      seedCreditIndex(sid, 'v71402');
    }
    seedStaffFull(
      's72400',
      'Few Credits',
      null,
      [
        { id: 'v71401', roles: ['music'] },
        { id: 'v71402', roles: ['music'] },
      ],
      [],
    );
    seedStaffFull(
      's72401',
      'Many Credits',
      null,
      [
        { id: 'v71401', roles: ['scenario'] },
        { id: 'v71402', roles: ['scenario'] },
        { id: 'v71403', roles: ['art'] },
        { id: 'v71404', roles: ['art'] },
      ],
      [],
    );
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.entries.map((e) => e.sid)).toEqual(['s72401', 's72400']);
  });

  it('falls back to the brand id as name when getProducer rejects', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion([], 0) : completion([], 0),
    );
    getProducerMock.mockRejectedValue(new Error('vndb producer fetch failed'));
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.a?.name).toBe(BRAND_A);
    expect(result.b?.name).toBe(BRAND_B);
  });

  it('returns a null brand when getProducer resolves to null', async () => {
    fetchProducerCompletionMock.mockImplementation(async (id: string) =>
      id === BRAND_A ? completion([], 0) : completion([], 0),
    );
    getProducerMock.mockResolvedValue(null);
    const result = await findBrandStaffOverlap(BRAND_A, BRAND_B);
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });
});
