import { describe, expect, it } from 'vitest';
import type { DiscoveryRepository } from '@/lib/db/repositories/discovery';

/** Stable identifiers shared by the discovery repository parity contract. */
export const DISCOVERY_CONTRACT_IDS = {
  firstVn: 'v994701',
  secondVn: 'v994702',
  unownedVn: 'v994703',
  firstStaff: 's994701',
  secondStaff: 's994702',
} as const;

/** Harness that supplies a freshly seeded discovery repository. */
export interface DiscoveryContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: DiscoveryRepository) => Promise<void>): Promise<void>;
}

/** Register collection-discovery parity tests. */
export function registerDiscoveryRepositoryContract(
  label: string,
  harness: DiscoveryContractHarness,
): void {
  describe(`${label} discovery repository contract`, () => {
    it('lists only developer payloads belonging to collected VNs', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.listCollectionDeveloperPayloads()).resolves.toEqual([
          '[{"id":"p994701","name":"Discovery Studio"}]',
          null,
        ]);
      });
    });

    it('deduplicates staff identifiers across bounded VN lookups', async () => {
      await harness.withRepository(async (repository) => {
        const ids = DISCOVERY_CONTRACT_IDS;
        await expect(repository.listStaffIdsForVns([
          ids.firstVn,
          ids.secondVn,
        ])).resolves.toEqual([ids.firstStaff, ids.secondStaff]);
        await expect(repository.listStaffIdsForVns([])).resolves.toEqual([]);
      });
    });

    it('counts all full-staff cache rows and reads exact requested bodies', async () => {
      await harness.withRepository(async (repository) => {
        const ids = DISCOVERY_CONTRACT_IDS;
        await expect(repository.countStaffFullCache()).resolves.toBe(2);
        await expect(repository.listCacheBodies([
          `staff_full:${ids.secondStaff}`,
          'staff_full:missing',
        ])).resolves.toEqual(['{"staff":2}']);
        await expect(repository.listCacheBodies([])).resolves.toEqual([]);
      });
    });
  });
}
