import { describe, expect, it } from 'vitest';
import type { EntityNameRepository } from '@/lib/db/repositories/entity-name';

/** Stable identifiers shared by entity-name repository parity tests. */
export const ENTITY_NAME_CONTRACT_IDS = {
  vn: 'v994801',
  developerHost: 'v994802',
  directProducer: 'p994801',
  embeddedProducer: 'p994802',
  productionStaff: 's994801',
  voiceOnlyStaff: 's994802',
  character: 'c994801',
} as const;

/** Harness that supplies a freshly seeded entity-name repository. */
export interface EntityNameContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: EntityNameRepository) => Promise<void>): Promise<void>;
}

/** Register display-name lookup parity tests for one database backend. */
export function registerEntityNameRepositoryContract(
  label: string,
  harness: EntityNameContractHarness,
): void {
  describe(`${label} entity-name repository contract`, () => {
    it('resolves direct and fallback names without inventing missing rows', async () => {
      await harness.withRepository(async (repository) => {
        const ids = ENTITY_NAME_CONTRACT_IDS;
        await expect(repository.vnTitles([])).resolves.toEqual(new Map());
        await expect(repository.producerNames([])).resolves.toEqual(new Map());
        await expect(repository.staffNames([])).resolves.toEqual(new Map());
        await expect(repository.characterNames([])).resolves.toEqual(new Map());

        await expect(repository.vnTitles([ids.vn, 'v994899'])).resolves.toEqual(new Map([
          [ids.vn, 'Named VN'],
        ]));
        await expect(repository.producerNames([
          ids.directProducer,
          ids.embeddedProducer,
          'p994899',
        ])).resolves.toEqual(new Map([
          [ids.directProducer, 'Direct Producer'],
          [ids.embeddedProducer, 'Embedded Producer'],
        ]));
        await expect(repository.staffNames([
          ids.productionStaff,
          ids.voiceOnlyStaff,
          's994899',
        ])).resolves.toEqual(new Map([
          [ids.productionStaff, 'Production Staff'],
          [ids.voiceOnlyStaff, 'Voice Only Staff'],
        ]));
        await expect(repository.characterNames([
          ids.character,
          'c994899',
        ])).resolves.toEqual(new Map([
          [ids.character, 'Contract Character'],
        ]));
      });
    });
  });
}
