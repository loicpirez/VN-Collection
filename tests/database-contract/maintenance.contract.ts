import { describe, expect, it } from 'vitest';
import type { MaintenanceRepository } from '@/lib/db/repositories/maintenance';

/** Stable identifiers shared by the maintenance parity contract. */
export const MAINTENANCE_CONTRACT_IDS = {
  duplicateA: 'v994901',
  duplicateB: 'v994902',
  shortTitle: 'v994903',
  freshMissingCover: 'v994904',
  freshComplete: 'v994905',
} as const;

/** Harness that supplies a freshly seeded maintenance repository. */
export interface MaintenanceContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: MaintenanceRepository) => Promise<void>): Promise<void>;
}

/** Register duplicate and stale-diagnostic parity tests. */
export function registerMaintenanceRepositoryContract(
  label: string,
  harness: MaintenanceContractHarness,
): void {
  describe(`${label} maintenance repository contract`, () => {
    it('groups normalized duplicate titles while excluding short keys', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.findDuplicates()).resolves.toContainEqual({
          prefix: 'duplicate title',
          ids: [MAINTENANCE_CONTRACT_IDS.duplicateA, MAINTENANCE_CONTRACT_IDS.duplicateB],
        });
        expect((await repository.findDuplicates()).some((group) => group.ids.includes(MAINTENANCE_CONTRACT_IDS.shortTitle))).toBe(false);
      });
    });

    it('reports old or cover-less rows with cover and EGS flags', async () => {
      await harness.withRepository(async (repository) => {
        const rows = await repository.findStaleVns(60_000);
        expect(rows).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: MAINTENANCE_CONTRACT_IDS.duplicateA,
            has_cover: false,
            has_egs: false,
          }),
          expect.objectContaining({
            id: MAINTENANCE_CONTRACT_IDS.duplicateB,
            has_cover: true,
            has_egs: true,
          }),
          expect.objectContaining({
            id: MAINTENANCE_CONTRACT_IDS.freshMissingCover,
            has_cover: false,
          }),
        ]));
        expect(rows.some((row) => row.id === MAINTENANCE_CONTRACT_IDS.freshComplete)).toBe(false);
      });
    });
  });
}
