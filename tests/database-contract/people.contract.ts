import { describe, expect, it } from 'vitest';
import type { PeopleRepository } from '@/lib/db/repositories/people';

/** Stable identifiers shared by the people parity contract. */
export const PEOPLE_CONTRACT_IDS = {
  ownedVn: 'v992101',
  otherVn: 'v992102',
  primaryStaff: 's992101',
  siblingStaff: 's992102',
  primaryCharacter: 'c992101',
  siblingCharacter: 'c992102',
} as const;

/** Harness that supplies a freshly seeded people repository. */
export interface PeopleContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: PeopleRepository) => Promise<void>): Promise<void>;
}

/** Complete synthetic character payload accepted by the cache decoder. */
export function peopleContractCharacterProfile(): Record<string, object | string | number | null> {
  return {
    id: PEOPLE_CONTRACT_IDS.primaryCharacter,
    name: 'Alpha Character',
    original: 'Shared Character',
    aliases: ['Search Alias'],
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: null,
    gender: null,
    vns: [],
    traits: [],
  };
}

/** Register staff, character, portrait, and local-search parity tests. */
export function registerPeopleRepositoryContract(
  label: string,
  harness: PeopleContractHarness,
): void {
  describe(`${label} people repository contract`, () => {
    it('reconstructs profiles and groups production and voice credits', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.staffProfile(PEOPLE_CONTRACT_IDS.primaryStaff)).resolves.toEqual({
          sid: PEOPLE_CONTRACT_IDS.primaryStaff,
          name: 'Shared Staff',
          original: 'Staff Original',
          lang: 'ja',
        });
        await expect(repository.staffProfile('s999999')).resolves.toBeNull();

        const production = await repository.productionCredits(PEOPLE_CONTRACT_IDS.primaryStaff);
        expect(production).toHaveLength(2);
        expect(production[0]).toMatchObject({
          vn: { id: PEOPLE_CONTRACT_IDS.otherVn, in_collection: false },
        });
        expect(production[1]).toMatchObject({
          vn: { id: PEOPLE_CONTRACT_IDS.ownedVn, in_collection: true },
        });
        expect(production[1]?.roles.map((role) => role.role).sort()).toEqual(['art', 'scenario']);
        await expect(repository.productionCredits(
          PEOPLE_CONTRACT_IDS.primaryStaff,
          { inCollectionOnly: true },
        )).resolves.toHaveLength(1);

        const voice = await repository.voiceCredits(PEOPLE_CONTRACT_IDS.primaryStaff);
        expect(voice).toHaveLength(2);
        expect(voice.find((credit) => credit.vn.id === PEOPLE_CONTRACT_IDS.ownedVn)).toMatchObject({
          vn: { in_collection: true },
          characters: [{
            id: PEOPLE_CONTRACT_IDS.primaryCharacter,
            local_image: 'character/alpha.jpg',
          }],
        });
        await expect(repository.voiceCredits(
          PEOPLE_CONTRACT_IDS.primaryStaff,
          { inCollectionOnly: true },
        )).resolves.toHaveLength(1);
      });
    });

    it('builds timelines and conservative character and staff relationships', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.voiceTimeline(PEOPLE_CONTRACT_IDS.primaryStaff)).resolves.toEqual([
          {
            year: 2020,
            total: 1,
            inCollection: 1,
            vnIds: [PEOPLE_CONTRACT_IDS.ownedVn],
          },
          {
            year: 2022,
            total: 1,
            inCollection: 0,
            vnIds: [PEOPLE_CONTRACT_IDS.otherVn],
          },
        ]);
        await expect(repository.voiceTimeline('s999999')).resolves.toEqual([]);
        await expect(repository.voiceActorsForCharacter(
          PEOPLE_CONTRACT_IDS.primaryCharacter,
        )).resolves.toMatchObject([{
          sid: PEOPLE_CONTRACT_IDS.primaryStaff,
          vns: [{ id: PEOPLE_CONTRACT_IDS.ownedVn, in_collection: true }],
        }]);
        await expect(repository.characterSiblings(
          PEOPLE_CONTRACT_IDS.primaryCharacter,
        )).resolves.toMatchObject([{
          c_id: PEOPLE_CONTRACT_IDS.siblingCharacter,
          vns: [{ vn_id: PEOPLE_CONTRACT_IDS.ownedVn }],
        }]);
        await expect(repository.characterSiblings('c999999')).resolves.toEqual([]);
        await expect(repository.staffSiblings(
          PEOPLE_CONTRACT_IDS.primaryStaff,
        )).resolves.toMatchObject([{
          sid: PEOPLE_CONTRACT_IDS.siblingStaff,
          vns: [{ vn_id: PEOPLE_CONTRACT_IDS.ownedVn }],
        }]);
        await expect(repository.staffSiblings('s999999')).resolves.toEqual([]);
      });
    });

    it('searches decoded local profiles and filtered collection staff', async () => {
      await harness.withRepository(async (repository) => {
        const characters = await repository.searchCharacters({ q: 'search alias', limit: 10 });
        expect(characters).toHaveLength(1);
        expect(characters[0]).toMatchObject({
          profile: { id: PEOPLE_CONTRACT_IDS.primaryCharacter },
          voice_languages: ['ja'],
        });
        await expect(repository.searchCharacters({ q: 'absent', limit: 10 })).resolves.toEqual([]);

        await expect(repository.searchStaff({
          q: PEOPLE_CONTRACT_IDS.primaryStaff,
          role: 'scenario',
          lang: 'ja',
          limit: 10,
        })).resolves.toEqual([{
          id: PEOPLE_CONTRACT_IDS.primaryStaff,
          name: 'Shared Staff',
          original: 'Staff Original',
          lang: 'ja',
          roles: ['scenario'],
          vn_count: 1,
        }]);
        await expect(repository.searchStaff({ q: 'absent' })).resolves.toEqual([]);
      });
    });

    it('reads, batches, and updates character portraits', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.characterImage('c999999')).resolves.toBeNull();
        await expect(repository.characterImages([])).resolves.toEqual(new Map());
        await expect(repository.characterImage(
          PEOPLE_CONTRACT_IDS.primaryCharacter,
        )).resolves.toMatchObject({
          url: 'https://example.test/alpha.jpg',
          local_path: 'character/alpha.jpg',
        });
        const images = await repository.characterImages([
          PEOPLE_CONTRACT_IDS.primaryCharacter,
          PEOPLE_CONTRACT_IDS.siblingCharacter,
          'c999999',
        ]);
        expect(images.size).toBe(1);
        await repository.upsertCharacterImage(
          PEOPLE_CONTRACT_IDS.siblingCharacter,
          'https://example.test/beta.jpg',
          'character/beta.jpg',
        );
        await expect(repository.characterImage(
          PEOPLE_CONTRACT_IDS.siblingCharacter,
        )).resolves.toMatchObject({
          url: 'https://example.test/beta.jpg',
          local_path: 'character/beta.jpg',
        });
      });
    });
  });
}
