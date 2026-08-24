import { describe, expect, it } from 'vitest';
import type { EgsSchemaRepository } from '@/lib/db/repositories/egs-schema';

/** Stable identifiers used by the EGS schema diagnostics parity contract. */
export const EGS_SCHEMA_CONTRACT_IDS = {
  firstVn: 'v994901',
  secondVn: 'v994902',
  wishlistCache: 'egs:contract:first',
  staleCache: 'egs:contract:stale',
} as const;

/** Harness that supplies seeded EGS schema diagnostics. */
export interface EgsSchemaContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: EgsSchemaRepository) => Promise<void>): Promise<void>;
}

/** Register backend-neutral EGS schema diagnostics assertions. */
export function registerEgsSchemaRepositoryContract(
  label: string,
  harness: EgsSchemaContractHarness,
): void {
  describe(`${label} EGS schema repository contract`, () => {
    it('aggregates counts, freshness, stale fallback state, and account presence', async () => {
      await harness.withRepository(async (repository) => {
        const summary = await repository.summary();
        expect(summary).toEqual({
          tables: [
            { key: 'egs_game', rowCount: 2, lastFetchedAt: 20 },
            { key: 'vndb_cache_egs', rowCount: 2, lastFetchedAt: 30 },
            { key: 'vn_egs_link', rowCount: 1, lastFetchedAt: 40 },
            { key: 'egs_vn_link', rowCount: 1, lastFetchedAt: 50 },
          ],
          staleWhileError: true,
          egsUsernameSet: true,
        });
        expect(JSON.stringify(summary)).not.toContain('schema-contract-secret');
      });
    });
  });
}
