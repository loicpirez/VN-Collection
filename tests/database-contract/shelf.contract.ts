import { describe, expect, it } from 'vitest';
import type { OwnedReleaseRepository } from '@/lib/db/repositories/owned-release';
import type { ShelfRepository } from '@/lib/db/repositories/shelf';

/** Stable identifiers shared by the SQLite and PostgreSQL shelf contract. */
export const SHELF_CONTRACT_IDS = {
  firstVn: 'v991201',
  secondVn: 'v991202',
  thirdVn: 'v991203',
  firstRelease: 'r991201',
  secondRelease: 'r991202',
  thirdRelease: 'r991203',
  firstShelf: 991201,
  secondShelf: 991202,
} as const;

/** Harness that supplies freshly seeded edition and shelf repositories. */
export interface ShelfContractHarness {
  /** Run one assertion against a reset database. */
  withRepositories(
    run: (owned: OwnedReleaseRepository, shelf: ShelfRepository) => Promise<void>,
  ): Promise<void>;
}

async function markContractEditions(repository: OwnedReleaseRepository): Promise<void> {
  await repository.mark(SHELF_CONTRACT_IDS.firstVn, SHELF_CONTRACT_IDS.firstRelease, {
    edition_label: 'First press',
    physical_location: ['Rack A'],
    price_paid: 5000,
    currency: 'JPY',
  });
  await repository.mark(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease, {
    edition_label: 'Second press',
  });
  await repository.mark(SHELF_CONTRACT_IDS.thirdVn, SHELF_CONTRACT_IDS.thirdRelease, {
    edition_label: 'Third press',
  });
}

/**
 * Register owned-edition and shelf parity tests for one database engine.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Reset and repository factory for the engine.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerShelfRepositoryContract(label: string, harness: ShelfContractHarness): void {
  describe(`${label} owned-edition and shelf repository contract`, () => {
    it('round-trips edition metadata, aspect provenance, and singleton platforms', async () => {
      await harness.withRepositories(async (owned) => {
        await markContractEditions(owned);
        await expect(owned.get(SHELF_CONTRACT_IDS.firstVn, SHELF_CONTRACT_IDS.firstRelease)).resolves.toMatchObject({
          edition_label: 'First press',
          physical_location: ['Rack A'],
          price_paid: 5000,
          currency: 'JPY',
          owned_platform: 'win',
        });

        await owned.mark(SHELF_CONTRACT_IDS.firstVn, SHELF_CONTRACT_IDS.firstRelease, {
          notes: 'Updated through mark',
        });
        await owned.updateWithAspect(
          SHELF_CONTRACT_IDS.firstVn,
          SHELF_CONTRACT_IDS.firstRelease,
          { physical_location: ['Rack B'], dumped: true },
          { width: 1920, height: 1080, note: 'Manual measurement' },
        );
        const first = (await owned.listWithShelfForVn(SHELF_CONTRACT_IDS.firstVn))[0];
        expect(first).toMatchObject({
          notes: 'Updated through mark',
          physical_location: ['Rack B'],
          dumped: true,
          rel_platforms: ['win'],
          shelf: null,
          aspect: {
            width: 1920,
            height: 1080,
            aspect_key: '16:9',
            source: 'manual',
            note: 'Manual measurement',
          },
        });

        await owned.setAspectOverride(
          SHELF_CONTRACT_IDS.firstVn,
          SHELF_CONTRACT_IDS.firstRelease,
          null,
        );
        await owned.upsertResolutionCache({
          releaseId: SHELF_CONTRACT_IDS.firstRelease,
          vnId: SHELF_CONTRACT_IDS.firstVn,
          resolution: '1280x960',
          fetchedAt: 400,
        });
        await expect(owned.listWithShelfForVn(SHELF_CONTRACT_IDS.firstVn)).resolves.toEqual([
          expect.objectContaining({
            aspect: expect.objectContaining({
              width: 1280,
              height: 960,
              aspect_key: '4:3',
              source: 'vndb',
            }),
          }),
        ]);

        await owned.remove(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease);
        await expect(owned.get(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease)).resolves.toBeNull();
      });
    });

    it('keeps cell swaps, display eviction, resizing, and counts atomic', async () => {
      await harness.withRepositories(async (owned, shelf) => {
        await markContractEditions(owned);
        expect((await shelf.listAllOwned()).map((entry) => entry.vn_id)).toEqual([
          SHELF_CONTRACT_IDS.firstVn,
          SHELF_CONTRACT_IDS.secondVn,
          SHELF_CONTRACT_IDS.thirdVn,
        ]);
        const firstEntry = (await shelf.listAllOwned())[0];
        expect(firstEntry).toMatchObject({
          rel_image_url: 'https://example.test/release-first.jpg',
          rel_platforms: ['win'],
          rel_languages: ['ja'],
          rel_resolution: '1920x1080',
        });
        await expect(shelf.listUnplaced()).resolves.toHaveLength(3);

        await shelf.placeItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          row: 0,
          col: 0,
          vnId: SHELF_CONTRACT_IDS.firstVn,
          releaseId: SHELF_CONTRACT_IDS.firstRelease,
        });
        await shelf.placeItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          row: 0,
          col: 1,
          vnId: SHELF_CONTRACT_IDS.secondVn,
          releaseId: SHELF_CONTRACT_IDS.secondRelease,
        });
        await expect(shelf.placeItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          row: 0,
          col: 1,
          vnId: SHELF_CONTRACT_IDS.firstVn,
          releaseId: SHELF_CONTRACT_IDS.firstRelease,
        })).resolves.toEqual({
          swapped: {
            vn_id: SHELF_CONTRACT_IDS.secondVn,
            release_id: SHELF_CONTRACT_IDS.secondRelease,
            row: 0,
            col: 0,
          },
        });
        expect(await shelf.getPlacement(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease)).toMatchObject({
          kind: 'cell',
          shelf_id: SHELF_CONTRACT_IDS.firstShelf,
          row: 0,
          col: 0,
        });

        await shelf.placeDisplayItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          afterRow: 1,
          position: 1,
          vnId: SHELF_CONTRACT_IDS.firstVn,
          releaseId: SHELF_CONTRACT_IDS.firstRelease,
        });
        await shelf.placeDisplayItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          afterRow: 1,
          position: 1,
          vnId: SHELF_CONTRACT_IDS.thirdVn,
          releaseId: SHELF_CONTRACT_IDS.thirdRelease,
        });
        await expect(shelf.getPlacement(SHELF_CONTRACT_IDS.firstVn, SHELF_CONTRACT_IDS.firstRelease)).resolves.toBeNull();
        await expect(shelf.listDisplaySlots(SHELF_CONTRACT_IDS.firstShelf)).resolves.toEqual([
          expect.objectContaining({
            vn_id: SHELF_CONTRACT_IDS.thirdVn,
            after_row: 1,
            position: 1,
          }),
        ]);

        const resized = await shelf.resize(SHELF_CONTRACT_IDS.firstShelf, 1, 1);
        expect(resized).toMatchObject({ shelf: { cols: 1, rows: 1 } });
        expect(resized?.evicted).toEqual([
          {
            vn_id: SHELF_CONTRACT_IDS.thirdVn,
            release_id: SHELF_CONTRACT_IDS.thirdRelease,
            row: 1,
            col: 1,
          },
        ]);
        await expect(shelf.list()).resolves.toEqual([
          expect.objectContaining({ id: SHELF_CONTRACT_IDS.firstShelf, placed_count: 1 }),
          expect.objectContaining({ id: SHELF_CONTRACT_IDS.secondShelf, placed_count: 0 }),
        ]);
        expect(await shelf.listPlacedVnIds()).toEqual(new Set([SHELF_CONTRACT_IDS.secondVn]));
        await expect(shelf.removePlacement(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease)).resolves.toBe(true);
        await expect(shelf.removePlacement(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease)).resolves.toBe(false);

        await shelf.rename(SHELF_CONTRACT_IDS.secondShelf, 'Renamed shelf');
        await shelf.reorder([SHELF_CONTRACT_IDS.secondShelf, SHELF_CONTRACT_IDS.firstShelf]);
        expect((await shelf.list()).map((entry) => entry.name)).toEqual(['Renamed shelf', 'Shelf Alpha']);
        await expect(shelf.delete(SHELF_CONTRACT_IDS.secondShelf)).resolves.toBe(true);
        await expect(shelf.delete(SHELF_CONTRACT_IDS.secondShelf)).resolves.toBe(false);
      });
    });

    it('represents multi-release boxes through their anchor without losing members', async () => {
      await harness.withRepositories(async (owned, shelf) => {
        await markContractEditions(owned);
        await shelf.placeItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          row: 0,
          col: 0,
          vnId: SHELF_CONTRACT_IDS.secondVn,
          releaseId: SHELF_CONTRACT_IDS.secondRelease,
        });
        const bundle = await shelf.createBundle({
          name: 'Contract trilogy',
          anchor: {
            vnId: SHELF_CONTRACT_IDS.firstVn,
            releaseId: SHELF_CONTRACT_IDS.firstRelease,
          },
          members: [
            { vnId: SHELF_CONTRACT_IDS.firstVn, releaseId: SHELF_CONTRACT_IDS.firstRelease },
            { vnId: SHELF_CONTRACT_IDS.secondVn, releaseId: SHELF_CONTRACT_IDS.secondRelease },
          ],
        });
        expect(bundle).toMatchObject({ name: 'Contract trilogy' });
        expect(bundle.members.map((member) => member.vn_id)).toEqual([
          SHELF_CONTRACT_IDS.firstVn,
          SHELF_CONTRACT_IDS.secondVn,
        ]);
        await expect(shelf.getPlacement(SHELF_CONTRACT_IDS.secondVn, SHELF_CONTRACT_IDS.secondRelease)).resolves.toBeNull();
        const visible = await shelf.listAllOwned();
        expect(visible.map((entry) => entry.vn_id)).toEqual([
          SHELF_CONTRACT_IDS.firstVn,
          SHELF_CONTRACT_IDS.thirdVn,
        ]);
        expect(visible[0]).toMatchObject({
          bundle_id: bundle.id,
          bundle_name: 'Contract trilogy',
          bundle_member_count: 2,
        });
        await expect(shelf.placeItem({
          shelfId: SHELF_CONTRACT_IDS.firstShelf,
          row: 0,
          col: 0,
          vnId: SHELF_CONTRACT_IDS.secondVn,
          releaseId: SHELF_CONTRACT_IDS.secondRelease,
        })).rejects.toThrow('bundle members must be placed through the anchor edition');

        await expect(shelf.renameBundle(bundle.id, 'Renamed trilogy')).resolves.toMatchObject({
          name: 'Renamed trilogy',
        });
        await expect(shelf.listBundles()).resolves.toEqual([
          expect.objectContaining({ id: bundle.id, name: 'Renamed trilogy' }),
        ]);
        await expect(shelf.deleteBundle(bundle.id)).resolves.toBe(true);
        await expect(shelf.deleteBundle(bundle.id)).resolves.toBe(false);
        await expect(shelf.listAllOwned()).resolves.toHaveLength(3);
      });
    });
  });
}
