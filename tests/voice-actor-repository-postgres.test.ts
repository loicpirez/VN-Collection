import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postgresQuery: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => ({ backend: 'postgres' }),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
}));

import {
  createPostgresVoiceActorRepository,
  getVoiceActorRepository,
  type VoiceActorBrowseOptions,
  type VoiceActorSort,
} from '@/lib/db/repositories/voice-actors';

function options(overrides: Partial<VoiceActorBrowseOptions> = {}): VoiceActorBrowseOptions {
  return {
    query: 'Alias %_',
    language: 'ja',
    scope: 'collection',
    sort: 'vns',
    direction: 'desc',
    minimumVns: 10,
    page: 8,
    pageSize: 48,
    ...overrides,
  };
}

function installPopulatedResponses(): void {
  mocks.postgresQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('AS actor_count') && sql.includes('collection_actor_count')) {
      return { rows: [{ actor_count: 9, vn_count: 30, character_count: 20, credit_count: 45, collection_actor_count: 4, collection_vn_count: 8 }] };
    }
    if (sql.includes('GROUP BY va_lang')) return { rows: [{ language: 'ja', actor_count: 9 }] };
    if (sql.includes('SELECT COUNT(*)::integer AS total')) return { rows: [{ total: 49 }] };
    if (sql.includes('n.va_name AS name')) {
      return { rows: [{
        sid: 's981001',
        name: 'Primary',
        original: 'Original',
        language: 'ja',
        vn_count: 15,
        collection_vn_count: 4,
        character_count: 3,
        credit_count: 18,
        alias_count: 2,
        first_year: 2000,
        last_year: 2020,
      }] };
    }
    if (sql.includes('SELECT sid, va_name AS name')) {
      return { rows: [
        { sid: 's981001', name: 'Primary' },
        { sid: 's981001', name: 'Alias' },
        { sid: 's981001', name: 'Alias' },
      ] };
    }
    return { rows: [
      { sid: 's981001', c_id: 'c981001', c_name: 'Role one', c_original: null, c_image_url: null, local_image: null, vn_count: 3 },
      { sid: 's981001', c_id: 'c981002', c_name: 'Role two', c_original: 'Original role', c_image_url: 'https://example.test/role.jpg', local_image: 'role.webp', vn_count: 2 },
    ] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installPopulatedResponses();
});

describe('PostgreSQL local seiyuu repository', () => {
  it('uses parameterized facets and returns the enriched paginated projection', async () => {
    const repository = getVoiceActorRepository();
    expect(getVoiceActorRepository()).toBe(repository);
    const result = await repository.browse(options());

    expect(result).toEqual({
      rows: [{
        id: 's981001',
        name: 'Primary',
        original: 'Original',
        language: 'ja',
        vnCount: 15,
        collectionVnCount: 4,
        characterCount: 3,
        creditCount: 18,
        aliasCount: 2,
        firstYear: 2000,
        lastYear: 2020,
        aliases: ['Alias'],
        characters: [
          { id: 'c981001', name: 'Role one', original: null, imageUrl: null, localImage: null, vnCount: 3 },
          { id: 'c981002', name: 'Role two', original: 'Original role', imageUrl: 'https://example.test/role.jpg', localImage: 'role.webp', vnCount: 2 },
        ],
      }],
      total: 49,
      page: 2,
      pageSize: 48,
      stats: { actorCount: 9, vnCount: 30, characterCount: 20, creditCount: 45, collectionActorCount: 4, collectionVnCount: 8 },
      languages: [{ language: 'ja', actorCount: 9 }],
    });

    const countCall = mocks.postgresQuery.mock.calls.find(([sql]) => String(sql).includes('SELECT COUNT(*)::integer AS total'));
    expect(countCall?.[1]).toEqual(['ja', '%alias \\%\\_%', 10]);
    const pageCall = mocks.postgresQuery.mock.calls.find(([sql]) => String(sql).includes('n.va_name AS name'));
    expect(pageCall?.[1]).toEqual(['ja', '%alias \\%\\_%', 10, 48, 48]);
    expect(String(pageCall?.[0])).toContain('WHERE collection_credit.sid = va.sid');
    expect(String(pageCall?.[0])).toContain('app_search_normalize(va.va_name) LIKE $2');
  });

  it('supports all ranking SQL and both directions', async () => {
    const expectedOrder: Record<VoiceActorSort, string> = {
      vns: 'a.vn_count',
      collection: 'a.collection_vn_count',
      characters: 'a.character_count',
      recent: 'a.last_year',
      name: 'app_search_normalize(n.va_name)',
    };
    for (const sort of Object.keys(expectedOrder) as VoiceActorSort[]) {
      for (const direction of ['asc', 'desc'] as const) {
        vi.clearAllMocks();
        installPopulatedResponses();
        await createPostgresVoiceActorRepository().browse(options({
          query: '',
          language: null,
          scope: 'all',
          sort,
          direction,
          page: 1,
        }));
        const pageCall = mocks.postgresQuery.mock.calls.find(([sql]) => String(sql).includes('n.va_name AS name'));
        expect(String(pageCall?.[0])).toContain(`ORDER BY ${expectedOrder[sort]}`);
        expect(String(pageCall?.[0])).toContain(direction === 'asc' ? 'ASC' : 'DESC');
      }
    }
  });

  it('returns stable zero defaults and skips enrichment for an empty page', async () => {
    mocks.postgresQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COUNT(*)::integer AS total')) return { rows: [] };
      return { rows: [] };
    });

    const result = await createPostgresVoiceActorRepository().browse(options({
      query: '',
      language: null,
      scope: 'all',
      page: 1,
    }));

    expect(result).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 48,
      stats: { actorCount: 0, vnCount: 0, characterCount: 0, creditCount: 0, collectionActorCount: 0, collectionVnCount: 0 },
      languages: [],
    });
    expect(mocks.postgresQuery).toHaveBeenCalledTimes(4);
  });

  it('keeps a ranked row when optional aliases and character previews are absent', async () => {
    installPopulatedResponses();
    const populatedImplementation = mocks.postgresQuery.getMockImplementation();
    mocks.postgresQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT sid, va_name AS name') || sql.includes('SELECT sid, c_id, c_name')) {
        return { rows: [] };
      }
      return populatedImplementation?.(sql);
    });

    const result = await createPostgresVoiceActorRepository().browse(options());
    expect(result.rows[0]?.aliases).toEqual([]);
    expect(result.rows[0]?.characters).toEqual([]);
  });
});
