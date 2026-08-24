import { describe, expect, it } from 'vitest';
import type { RawVnPayload } from '@/lib/db';
import type { CollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import type { TextSearchRepository } from '@/lib/db/repositories/text-search';
import type { VnReadRepository } from '@/lib/db/repositories/vn-read';
import type { VnWriteRepository } from '@/lib/db/repositories/vn-write';

/** Stable identifiers shared by the core SQLite/PostgreSQL contract. */
export const CORE_CONTRACT_IDS = {
  firstVn: 'v991301',
  secondVn: 'v991302',
  syntheticVn: 'egs_991303',
  firstTag: 'g991301',
  secondTag: 'g991302',
} as const;

/** Engine-specific inspection limited to materialized data not exposed by repositories yet. */
export interface CoreContractInspector {
  /** Insert one quote used by the textual-search contract. */
  insertQuote(vnId: string, quote: string): Promise<void>;
  /** Return materialized tag identifiers for one VN. */
  tagIds(vnId: string): Promise<string[]>;
  /** Return collection custom-order values keyed by VN id. */
  customOrders(): Promise<Record<string, number>>;
}

/** Harness that supplies freshly seeded core repositories. */
export interface CoreContractHarness {
  /** Run one assertion against a reset database. */
  withRepositories(run: (
    collection: CollectionCoreRepository,
    read: VnReadRepository,
    write: VnWriteRepository,
    search: TextSearchRepository,
    inspect: CoreContractInspector,
  ) => Promise<void>): Promise<void>;
}

function vnPayload(id: string, title: string, tagId: string): RawVnPayload {
  return {
    id,
    title,
    alttitle: `${title} Alternative`,
    aliases: [`${title} Alias`],
    titles: [{ lang: 'ja', title, latin: null, official: true, main: true }],
    released: '2025-05-21',
    olang: 'ja',
    languages: ['ja', 'en'],
    platforms: ['win'],
    length_minutes: 120,
    rating: 80,
    description: `${title} description`,
    image: { url: `https://example.test/${id}.jpg`, thumbnail: `https://example.test/${id}-thumb.jpg`, sexual: 0 },
    developers: [{ id: 'p991301', name: 'Contract Developer' }],
    tags: [{ id: tagId, name: `Tag ${tagId}`, rating: 2, spoiler: 0, lie: false, category: 'cont' }],
    screenshots: [],
    relations: [],
    extlinks: [{ url: `https://example.test/${id}`, label: 'Official', name: 'Official' }],
    editions: [],
    staff: [],
    va: [],
  };
}

/**
 * Register collection, VN, wishlist, tag-index, and search parity tests.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Reset and repository factory for the engine.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerCoreRepositoryContract(label: string, harness: CoreContractHarness): void {
  describe(`${label} collection, VN, tags, wishlist, and search contract`, () => {
    it('round-trips canonical VN payloads and planning-status collection rows', async () => {
      await harness.withRepositories(async (collection, read, write, _search, inspect) => {
        await write.upsert(vnPayload(CORE_CONTRACT_IDS.firstVn, '東京物語', CORE_CONTRACT_IDS.firstTag));
        await write.upsert(vnPayload(CORE_CONTRACT_IDS.secondVn, 'Second Story', CORE_CONTRACT_IDS.secondTag));
        await collection.add(CORE_CONTRACT_IDS.firstVn, {
          status: 'planning',
          notes: 'Wishlist note',
          custom_description: 'Personal searchable summary',
          physical_location: ['Room A'],
          favorite: true,
        });
        await collection.add(CORE_CONTRACT_IDS.secondVn, { status: 'playing' });

        await expect(collection.contains(CORE_CONTRACT_IDS.firstVn)).resolves.toBe(true);
        await expect(collection.containsMany([
          CORE_CONTRACT_IDS.firstVn,
          'v991399',
        ])).resolves.toEqual(new Set([CORE_CONTRACT_IDS.firstVn]));
        expect(new Set(await collection.listIds())).toEqual(new Set([
          CORE_CONTRACT_IDS.firstVn,
          CORE_CONTRACT_IDS.secondVn,
        ]));

        const item = await read.getCollectionItem(CORE_CONTRACT_IDS.firstVn);
        expect(item).toMatchObject({
          id: CORE_CONTRACT_IDS.firstVn,
          title: '東京物語',
          status: 'planning',
          notes: 'Wishlist note',
          custom_description: 'Personal searchable summary',
          physical_location: ['Room A'],
          favorite: true,
          languages: ['ja', 'en'],
          platforms: ['win'],
        });
        expect(item?.tags.map((tag) => tag.id)).toEqual([CORE_CONTRACT_IDS.firstTag]);
        await expect(read.getTagIds(CORE_CONTRACT_IDS.firstVn)).resolves.toEqual([
          CORE_CONTRACT_IDS.firstTag,
        ]);
        const rawPayload = await read.getRawPayload(CORE_CONTRACT_IDS.firstVn);
        expect(JSON.parse(rawPayload ?? '{}')).toMatchObject({
          id: CORE_CONTRACT_IDS.firstVn,
          title: '東京物語',
        });
        await expect(read.getRawPayload('v991399')).resolves.toBeNull();
        await expect(inspect.tagIds(CORE_CONTRACT_IDS.firstVn)).resolves.toEqual([CORE_CONTRACT_IDS.firstTag]);
        await expect(read.getStockContext(CORE_CONTRACT_IDS.firstVn)).resolves.toMatchObject({
          title: '東京物語',
          alttitle: '東京物語 Alternative',
        });
        await expect(read.findTitleMatch('物語')).resolves.toEqual({
          vnId: CORE_CONTRACT_IDS.firstVn,
          title: '東京物語',
        });
        await expect(read.isEgsOnly(CORE_CONTRACT_IDS.firstVn)).resolves.toBe(false);

        await collection.update(CORE_CONTRACT_IDS.firstVn, {
          status: 'completed',
          user_rating: 90,
          playtime_minutes: 180,
          physical_location: ['Room B'],
        });
        await expect(read.getCollectionItem(CORE_CONTRACT_IDS.firstVn)).resolves.toMatchObject({
          status: 'completed',
          user_rating: 90,
          playtime_minutes: 180,
          physical_location: ['Room B'],
        });

        await collection.setCustomDescription(CORE_CONTRACT_IDS.firstVn, '  Updated personal synopsis  ');
        await expect(read.getCollectionItem(CORE_CONTRACT_IDS.firstVn)).resolves.toMatchObject({
          custom_description: 'Updated personal synopsis',
        });
        await collection.setSourcePreferences(CORE_CONTRACT_IDS.firstVn, {
          description: 'egs',
          image: 'auto',
        });
        await expect(collection.getSourcePreferences(CORE_CONTRACT_IDS.firstVn)).resolves.toEqual({
          description: 'egs',
        });

        await collection.setCustomOrder([
          CORE_CONTRACT_IDS.secondVn,
          CORE_CONTRACT_IDS.firstVn,
        ]);
        await expect(inspect.customOrders()).resolves.toEqual({
          [CORE_CONTRACT_IDS.firstVn]: 2,
          [CORE_CONTRACT_IDS.secondVn]: 1,
        });
        await collection.resetCustomOrder();
        await expect(inspect.customOrders()).resolves.toEqual({
          [CORE_CONTRACT_IDS.firstVn]: 0,
          [CORE_CONTRACT_IDS.secondVn]: 0,
        });
      });
    });

    it('searches collection notes, custom descriptions, and quotes in stable order', async () => {
      await harness.withRepositories(async (collection, _read, write, search, inspect) => {
        await write.upsert(vnPayload(CORE_CONTRACT_IDS.firstVn, '東京物語', CORE_CONTRACT_IDS.firstTag));
        await collection.add(CORE_CONTRACT_IDS.firstVn, {
          notes: 'Needle appears in collection notes',
          custom_description: 'Needle also appears in the personal synopsis',
        });
        await inspect.insertQuote(CORE_CONTRACT_IDS.firstVn, 'A quoted Needle for the contract');
        const hits = await search.search('Needle', 10);
        expect(hits.map((hit) => hit.source)).toEqual(['notes', 'custom_description', 'quote']);
        expect(hits.every((hit) => hit.vn_id === CORE_CONTRACT_IDS.firstVn)).toBe(true);
        await expect(search.search('x', 10)).resolves.toEqual([]);
      });
    });

    it('removes collection membership without deleting canonical VN metadata', async () => {
      await harness.withRepositories(async (collection, read, write) => {
        await write.upsert(vnPayload(CORE_CONTRACT_IDS.firstVn, '東京物語', CORE_CONTRACT_IDS.firstTag));
        await collection.add(CORE_CONTRACT_IDS.firstVn, { status: 'planning' });
        await collection.remove(CORE_CONTRACT_IDS.firstVn);
        await expect(collection.contains(CORE_CONTRACT_IDS.firstVn)).resolves.toBe(false);
        const item = await read.getCollectionItem(CORE_CONTRACT_IDS.firstVn);
        expect(item?.id).toBe(CORE_CONTRACT_IDS.firstVn);
        expect(item?.status).toBeUndefined();
      });
    });

    it('round-trips synthetic EGS-only rows and preserves absent optional values', async () => {
      await harness.withRepositories(async (_collection, read, write) => {
        await write.upsertEgsOnly({
          vnId: CORE_CONTRACT_IDS.syntheticVn,
          title: 'Synthetic EGS title',
          alttitle: 'Synthetic reading',
          released: '2026-08-24',
          description: 'Synthetic description',
          imageUrl: 'https://example.test/egs-cover.jpg',
        });
        await write.upsertEgsOnly({
          vnId: CORE_CONTRACT_IDS.syntheticVn,
          title: 'Updated EGS title',
          alttitle: null,
          released: null,
          description: null,
          imageUrl: null,
        });

        await expect(read.isEgsOnly(CORE_CONTRACT_IDS.syntheticVn)).resolves.toBe(true);
        await expect(read.getCollectionItem(CORE_CONTRACT_IDS.syntheticVn)).resolves.toMatchObject({
          id: CORE_CONTRACT_IDS.syntheticVn,
          title: 'Updated EGS title',
          alttitle: null,
          released: '2026-08-24',
          description: 'Synthetic description',
          image_url: 'https://example.test/egs-cover.jpg',
        });
      });
    });
  });
}
