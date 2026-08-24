import { describe, expect, it } from 'vitest';
import type { EgsRepository, EgsUpsert } from '@/lib/db/repositories/egs';

/** Stable identifiers shared by the EGS repository parity contract. */
export const EGS_CONTRACT_IDS = {
  vn: 'v995001',
  otherVn: 'v995002',
  egs: 995001,
  otherEgs: 995002,
} as const;

/** Harness that supplies a freshly seeded EGS repository. */
export interface EgsContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: EgsRepository) => Promise<void>): Promise<void>;
}

function egsRow(overrides: Partial<EgsUpsert> = {}): EgsUpsert {
  return {
    vn_id: EGS_CONTRACT_IDS.vn,
    egs_id: EGS_CONTRACT_IDS.egs,
    gamename: 'EGS Contract Game',
    gamename_furigana: 'egs contract',
    brand_id: 12,
    brand_name: 'Contract Brand',
    model: 'pkg',
    description: null,
    image_url: '/api/egs-cover/995001',
    local_image: '/egs-local.jpg',
    okazu: 1,
    erogame: 1,
    raw_json: '{"genre":"test"}',
    median: 80,
    average: 79.5,
    dispersion: 12.5,
    count: 42,
    sellday: '2095-01-02',
    playtime_median_minutes: 600,
    source: 'manual',
    ...overrides,
  };
}

/** Register EGS metadata and bidirectional mapping parity tests. */
export function registerEgsRepositoryContract(label: string, harness: EgsContractHarness): void {
  describe(`${label} EGS repository contract`, () => {
    it('upserts EGS metadata while retaining a previously downloaded image', async () => {
      await harness.withRepository(async (repository) => {
        const ids = EGS_CONTRACT_IDS;
        await expect(repository.getForVn(ids.vn)).resolves.toBeNull();
        await repository.upsertForVn(egsRow());
        await expect(repository.getCoverSource(ids.egs)).resolves.toEqual({
          vn_id: ids.vn,
          raw_json: '{"genre":"test"}',
        });
        await expect(repository.getForVn(ids.vn)).resolves.toMatchObject({
          egs_id: ids.egs,
          gamename: 'EGS Contract Game',
          local_image: '/egs-local.jpg',
          median: 80,
          source: 'manual',
        });
        await repository.upsertForVn(egsRow({ gamename: 'Refreshed EGS Game', local_image: undefined }));
        await expect(repository.getForVn(ids.vn)).resolves.toMatchObject({
          gamename: 'Refreshed EGS Game',
          local_image: '/egs-local.jpg',
        });
        await repository.setLocalImage(ids.vn, null);
        await expect(repository.getForVn(ids.vn)).resolves.toMatchObject({ local_image: null });
        await repository.clearForVn(ids.vn);
        await expect(repository.getForVn(ids.vn)).resolves.toBeNull();
      });
    });

    it('persists reversible VN-to-EGS decisions including explicit no-match', async () => {
      await harness.withRepository(async (repository) => {
        const ids = EGS_CONTRACT_IDS;
        await expect(repository.getVnLink(ids.vn)).resolves.toBeNull();
        await repository.setVnLink(ids.vn.toUpperCase(), ids.egs, 'manual choice');
        await expect(repository.getVnLink(ids.vn)).resolves.toMatchObject({
          vn_id: ids.vn,
          egs_id: ids.egs,
          note: 'manual choice',
        });
        await repository.setVnLink(ids.vn, null);
        await expect(repository.getVnLink(ids.vn)).resolves.toMatchObject({ egs_id: null, note: null });
        await repository.clearVnLink(ids.vn);
        await expect(repository.getVnLink(ids.vn)).resolves.toBeNull();
        await expect(repository.setVnLink('invalid', ids.egs)).rejects.toThrow('invalid vn id');
        await expect(repository.setVnLink(ids.vn, 0)).rejects.toThrow('invalid egs id');
      });
    });

    it('persists reversible EGS-to-VN decisions and returns their overlay map', async () => {
      await harness.withRepository(async (repository) => {
        const ids = EGS_CONTRACT_IDS;
        await expect(repository.getEgsLink(ids.egs)).resolves.toBeNull();
        await repository.setEgsLink(ids.egs, ids.vn.toUpperCase(), 'feed choice');
        await repository.setEgsLink(ids.otherEgs, null);
        await expect(repository.getEgsLink(ids.egs)).resolves.toMatchObject({
          egs_id: ids.egs,
          vn_id: ids.vn,
          note: 'feed choice',
        });
        const links = await repository.listAllEgsLinks();
        expect(links.get(ids.egs)).toBe(ids.vn);
        expect(links.get(ids.otherEgs)).toBeNull();
        await repository.clearEgsLink(ids.egs);
        await expect(repository.getEgsLink(ids.egs)).resolves.toBeNull();
        await expect(repository.setEgsLink(0, ids.vn)).rejects.toThrow('invalid egs id');
        await expect(repository.setEgsLink(ids.egs, 'invalid')).rejects.toThrow('invalid vn id');
      });
    });

    it('returns collection sync rows only for linked owned games', async () => {
      await harness.withRepository(async (repository) => {
        const ids = EGS_CONTRACT_IDS;
        await expect(repository.listCollectionSyncRows([])).resolves.toEqual([]);
        await repository.upsertForVn(egsRow());
        await expect(repository.listCollectionSyncRows([ids.egs, 999_999])).resolves.toEqual([{
          vn_id: ids.vn,
          egs_id: ids.egs,
          playtime_minutes: 45,
          user_rating: 75,
          title: 'EGS VN',
          started_date: '2095-01-01',
          finished_date: null,
        }]);
      });
    });
  });
}
