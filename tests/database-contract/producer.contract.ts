import { describe, expect, it } from 'vitest';
import type { ProducerRepository } from '@/lib/db/repositories/producer';

/** Stable identifiers shared by the producer repository parity contract. */
export const PRODUCER_CONTRACT_FIXTURE = {
  firstVn: 'v994601',
  secondVn: 'v994602',
  developer: 'p994601',
  fallbackDeveloper: 'p994602',
  publisher: 'p994603',
  missing: 'p994699',
} as const;

/** Harness that supplies a freshly seeded producer repository. */
export interface ProducerContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: ProducerRepository) => Promise<void>): Promise<void>;
}

/** Register producer metadata, ranking, and ownership parity tests. */
export function registerProducerRepositoryContract(
  label: string,
  harness: ProducerContractHarness,
): void {
  describe(`${label} producer repository contract`, () => {
    it('reads and refreshes producer metadata without clearing its logo', async () => {
      await harness.withRepository(async (repository) => {
        const fixture = PRODUCER_CONTRACT_FIXTURE;
        await expect(repository.get(fixture.missing)).resolves.toBeNull();
        await expect(repository.get(fixture.developer)).resolves.toMatchObject({
          id: fixture.developer,
          name: 'Explicit Developer',
          aliases: ['Explicit Dev'],
          extlinks: [{ url: 'https://example.test/dev', label: 'Official', name: 'Site' }],
          logo_path: '/producer-logo.png',
        });
        await repository.upsert({
          id: fixture.developer,
          name: 'Refreshed Developer',
          aliases: ['Refreshed Dev'],
        });
        await expect(repository.get(fixture.developer)).resolves.toMatchObject({
          name: 'Refreshed Developer',
          aliases: ['Refreshed Dev'],
          extlinks: [],
          logo_path: '/producer-logo.png',
        });
        await repository.setLogo(fixture.developer, null);
        await expect(repository.get(fixture.developer)).resolves.toMatchObject({ logo_path: null });
      });
    });

    it('keeps developer and publisher rankings distinct with JSON name fallbacks', async () => {
      await harness.withRepository(async (repository) => {
        const fixture = PRODUCER_CONTRACT_FIXTURE;
        const developers = await repository.listDeveloperStats();
        expect(developers).toHaveLength(2);
        expect(developers[0]).toMatchObject({
          id: fixture.developer,
          name: 'Explicit Developer',
          vn_count: 2,
          avg_user_rating: 70,
          avg_rating: 80,
        });
        expect(developers[1]).toMatchObject({
          id: fixture.fallbackDeveloper,
          name: 'Fallback Developer',
          vn_count: 1,
          avg_user_rating: 80,
          avg_rating: 70,
        });
        await expect(repository.listPublisherStats()).resolves.toMatchObject([{
          id: fixture.publisher,
          name: 'Fallback Publisher',
          vn_count: 2,
          avg_user_rating: 70,
          avg_rating: 80,
        }]);
      });
    });

    it('returns owned ids and safely decoded fallback-name samples', async () => {
      await harness.withRepository(async (repository) => {
        const fixture = PRODUCER_CONTRACT_FIXTURE;
        const summary = await repository.ownershipSummary(fixture.developer);
        expect([...summary.ownedIds]).toEqual([fixture.secondVn, fixture.firstVn]);
        expect(summary.sample).toEqual({
          developers: [{ id: fixture.developer, name: 'Explicit Developer' }],
          publishers: [{ id: fixture.publisher, name: 'Fallback Publisher' }],
        });
        await expect(repository.ownershipSummary(fixture.missing)).resolves.toEqual({
          ownedIds: new Set(),
          sample: null,
        });
      });
    });
  });
}
