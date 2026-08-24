import { describe, expect, it } from 'vitest';
import type { PlaceRepository } from '@/lib/db/repositories/place';
import { ALICENET_BRANCH_LABEL, ALICENET_PROVIDER_ID } from '@/lib/stock-provider-constants';

/** Fixed identifiers used by both database engines in the place contract. */
export const PLACE_CONTRACT_IDS = {
  firstPlace: 991101,
  secondPlace: 991102,
  firstVn: 'v991101',
  secondVn: 'v991102',
} as const;

/** Harness that seeds one isolated place-registry scenario. */
export interface PlaceContractHarness {
  /** Run one assertion against a newly migrated and seeded database. */
  withRepository(run: (repository: PlaceRepository) => Promise<void>): Promise<void>;
}

/**
 * Register place-registry parity tests for one database engine.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Isolated seeded repository harness.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerPlaceRepositoryContract(label: string, harness: PlaceContractHarness): void {
  describe(`${label} place repository contract`, () => {
    it('aggregates persisted and AliceNet stock with deterministic freshness', async () => {
      await harness.withRepository(async (repository) => {
        const places = await repository.list();
        expect(places.map((place) => place.id)).toEqual([
          PLACE_CONTRACT_IDS.firstPlace,
          PLACE_CONTRACT_IDS.secondPlace,
        ]);
        expect(places[0]).toMatchObject({
          name: 'Alpha Shop',
          provider_labels: ['AliceNet', 'Branch A'],
          stock_count: 2,
          stock_updated_at: 300,
        });
        await expect(repository.get(PLACE_CONTRACT_IDS.firstPlace)).resolves.toMatchObject({
          stock_count: 2,
          stock_updated_at: 300,
        });

        const vns = await repository.listVns(PLACE_CONTRACT_IDS.firstPlace);
        expect(vns).toHaveLength(2);
        expect(vns.find((row) => row.vn_id === PLACE_CONTRACT_IDS.firstVn)).toMatchObject({
          in_collection: 1,
          min_price: 5000,
          offer_count: 1,
          in_stock_count: 1,
          out_of_stock_count: 0,
        });
        expect(vns.find((row) => row.vn_id === PLACE_CONTRACT_IDS.secondVn)).toMatchObject({
          min_price: 3000,
          offer_count: 2,
          in_stock_count: 1,
          out_of_stock_count: 1,
          max_updated_at: 300,
        });

        const offers = await repository.listOffers(PLACE_CONTRACT_IDS.firstPlace, 'all');
        expect(offers).toHaveLength(3);
        expect(offers.find((offer) => offer.provider === ALICENET_PROVIDER_ID)).toMatchObject({
          vn_id: PLACE_CONTRACT_IDS.secondVn,
          availability: 'in_stock',
          price: 3000,
          currency: 'JPY',
          location_branch: ALICENET_BRANCH_LABEL,
        });
        await expect(repository.listOffers(PLACE_CONTRACT_IDS.firstPlace, 'out_of_stock')).resolves.toHaveLength(1);
      });
    });

    it('returns branch, provider-map, and collection-place facets consistently', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.providerMap()).resolves.toEqual({
          AliceNet: PLACE_CONTRACT_IDS.firstPlace,
          'Branch A': PLACE_CONTRACT_IDS.firstPlace,
          'Branch B': PLACE_CONTRACT_IDS.secondPlace,
        });
        await expect(repository.listUnassignedBranches()).resolves.toEqual(['Branch C']);
        await expect(repository.listKnownPlaces()).resolves.toEqual(['Storage A']);
        await expect(repository.listOtherBranches(PLACE_CONTRACT_IDS.firstPlace)).resolves.toEqual([{
          provider_label: 'Branch B',
          place_id: PLACE_CONTRACT_IDS.secondPlace,
          place_name: 'Beta Shop',
        }]);
      });
    });

    it('updates places and moves branch ownership atomically', async () => {
      await harness.withRepository(async (repository) => {
        await repository.update(PLACE_CONTRACT_IDS.firstPlace, {
          name: 'Alpha Shop Updated',
          lat: 35.6,
          lng: 139.7,
          notes: null,
        });
        await expect(repository.get(PLACE_CONTRACT_IDS.firstPlace)).resolves.toMatchObject({
          name: 'Alpha Shop Updated',
          lat: 35.6,
          lng: 139.7,
          notes: null,
        });
        await repository.update(PLACE_CONTRACT_IDS.firstPlace, {});
        await repository.linkProvider(PLACE_CONTRACT_IDS.firstPlace, 'New Branch');
        await repository.linkProvider(PLACE_CONTRACT_IDS.firstPlace, 'New Branch');
        await repository.moveProvider(PLACE_CONTRACT_IDS.secondPlace, PLACE_CONTRACT_IDS.firstPlace, 'Branch B');
        await repository.unlinkProvider(PLACE_CONTRACT_IDS.firstPlace, 'New Branch');
        expect(await repository.providerMap()).toMatchObject({
          'Branch B': PLACE_CONTRACT_IDS.firstPlace,
        });
        await repository.delete(PLACE_CONTRACT_IDS.secondPlace);
        await expect(repository.get(PLACE_CONTRACT_IDS.secondPlace)).resolves.toBeNull();
      });
    });
  });
}
