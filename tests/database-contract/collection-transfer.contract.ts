import { describe, expect, it } from 'vitest';
import type { CollectionExportPayload } from '@/lib/db';
import type { CollectionTransferRepository } from '@/lib/db/repositories/collection-transfer';

/** Stable values used by the collection transfer parity contract. */
export const COLLECTION_TRANSFER_CONTRACT = {
  vnId: 'v991901',
  missingVnId: 'v991999',
  sourceSeriesId: 991901,
  seriesName: 'Collection Transfer Contract Series',
} as const;

/** Runtime hooks required by the shared collection transfer assertions. */
export interface CollectionTransferContractHarness {
  /** Run one assertion against a clean database and expose normalized places for verification. */
  withRepository(
    run: (
      repository: CollectionTransferRepository,
      listPlaces: (vnId: string) => Promise<string[]>,
    ) => Promise<void>,
  ): Promise<void>;
}

function payload(): CollectionExportPayload {
  const fixture = COLLECTION_TRANSFER_CONTRACT;
  return {
    version: 2,
    exported_at: 1_800_000_000_000,
    vns: [{
      id: fixture.vnId,
      title: 'Collection transfer VN',
      raw: {
        id: fixture.vnId,
        title: 'Collection transfer VN',
        languages: ['ja'],
        platforms: ['win'],
        tags: [{ id: 'g991901', name: 'Transfer tag', rating: 2, spoiler: 0, category: 'cont' }],
      },
      fetched_at: 1_700_000_000_000,
    }],
    collection: [
      {
        vn_id: fixture.vnId,
        status: 'completed',
        user_rating: 88,
        playtime_minutes: 240,
        started_date: '2026-01-01',
        finished_date: '2026-01-03',
        notes: 'Imported note',
        favorite: 1,
        location: 'jp',
        edition_type: 'physical',
        edition_label: 'First press',
        physical_location: '["Shelf A","Drawer B"]',
        added_at: 1_600_000_000_000,
        updated_at: 1_650_000_000_000,
      },
      {
        vn_id: fixture.missingVnId,
        status: 'planning',
        user_rating: null,
        started_date: null,
        finished_date: null,
        notes: null,
        edition_label: null,
        physical_location: null,
      },
    ],
    series: [{
      id: fixture.sourceSeriesId,
      name: fixture.seriesName,
      description: 'Imported series',
      cover_path: 'series/transfer-cover.webp',
      banner_path: 'series/transfer-banner.webp',
      created_at: 1_500_000_000_000,
      updated_at: 1_550_000_000_000,
    }],
    series_vn: [
      { series_id: fixture.sourceSeriesId, vn_id: fixture.vnId, order_index: 4 },
      { series_id: fixture.sourceSeriesId, vn_id: fixture.missingVnId, order_index: 5 },
    ],
  };
}

/**
 * Register round-trip, idempotence, and soft-error parity for collection transfers.
 *
 * @param label Database engine name displayed by Vitest.
 * @param harness Clean database lifecycle and verification hooks.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerCollectionTransferRepositoryContract(
  label: string,
  harness: CollectionTransferContractHarness,
): void {
  describe(`${label} collection transfer repository contract`, () => {
    it('imports valid rows, isolates invalid rows, and exports a complete round trip', async () => {
      await harness.withRepository(async (repository, listPlaces) => {
        const first = await repository.importData(payload());
        expect(first).toEqual({
          vns_upserted: 1,
          collection_upserted: 1,
          series_created: 1,
          series_links: 1,
          errors: [
            `collection ${COLLECTION_TRANSFER_CONTRACT.missingVnId}: import failed`,
            `series_vn ${COLLECTION_TRANSFER_CONTRACT.sourceSeriesId}/${COLLECTION_TRANSFER_CONTRACT.missingVnId}: import failed`,
          ],
        });
        await expect(listPlaces(COLLECTION_TRANSFER_CONTRACT.vnId)).resolves.toEqual(['Drawer B', 'Shelf A']);

        const exported = await repository.exportData();
        expect(exported.version).toBe(2);
        expect(exported.exported_at).toEqual(expect.any(Number));
        expect(exported.vns.find((vn) => vn.id === COLLECTION_TRANSFER_CONTRACT.vnId)).toMatchObject({
          title: 'Collection transfer VN',
          fetched_at: 1_700_000_000_000,
          raw: {
            languages: ['ja'],
            platforms: ['win'],
            tags: [{ id: 'g991901', name: 'Transfer tag' }],
          },
        });
        expect(exported.collection.find((entry) => entry.vn_id === COLLECTION_TRANSFER_CONTRACT.vnId)).toMatchObject({
          status: 'completed',
          user_rating: 88,
          favorite: 1,
          physical_location: '["Shelf A","Drawer B"]',
        });
        const series = exported.series.find((entry) => entry.name === COLLECTION_TRANSFER_CONTRACT.seriesName);
        expect(series).toMatchObject({
          description: 'Imported series',
          cover_path: 'series/transfer-cover.webp',
          banner_path: 'series/transfer-banner.webp',
        });
        expect(exported.series_vn).toContainEqual({
          series_id: series?.id,
          vn_id: COLLECTION_TRANSFER_CONTRACT.vnId,
          order_index: 4,
        });

        const second = await repository.importData(payload());
        expect(second).toMatchObject({
          vns_upserted: 1,
          collection_upserted: 1,
          series_created: 0,
          series_links: 1,
        });
        expect(second.errors).toHaveLength(2);
      });
    });
  });
}
