import { describe, expect, it } from 'vitest';
import type { EgsOverviewRepository } from '@/lib/db/repositories/egs-overview';

/** Stable identifiers shared by the EGS overview parity contract. */
export const EGS_OVERVIEW_CONTRACT_IDS = {
  linkedVn: 'v994401',
  negativeVn: 'v994402',
  missingVn: 'v994403',
} as const;

/** Harness that supplies a freshly seeded EGS overview repository. */
export interface EgsOverviewContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: EgsOverviewRepository) => Promise<void>): Promise<void>;
}

/** Register EGS linked, negative, and unmapped overview parity tests. */
export function registerEgsOverviewRepositoryContract(
  label: string,
  harness: EgsOverviewContractHarness,
): void {
  describe(`${label} EGS overview repository contract`, () => {
    it('separates resolved links from negative and missing mappings', async () => {
      await harness.withRepository(async (repository) => {
        const data = await repository.load();
        expect(data.unmatched).toBe(2);
        expect(data.links).toEqual([
          expect.objectContaining({
            vn_id: EGS_OVERVIEW_CONTRACT_IDS.linkedVn,
            egs_id: 994401,
            median: 84,
            playtime_minutes: 180,
            source: 'manual',
          }),
        ]);
        expect(data.unlinkedRows.map((row) => row.vn_id)).toEqual([
          EGS_OVERVIEW_CONTRACT_IDS.missingVn,
          EGS_OVERVIEW_CONTRACT_IDS.negativeVn,
        ]);
      });
    });
  });
}
