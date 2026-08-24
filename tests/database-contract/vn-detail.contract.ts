import { describe, expect, it } from 'vitest';
import type { VnDetailRepository } from '@/lib/db/repositories/vn-detail';

/** Stable identifiers shared by the VN-detail parity contract. */
export const VN_DETAIL_CONTRACT_FIXTURE = {
  firstVn: 'v994101',
  screenshotVn: 'v994102',
  neighborVn: 'v994103',
  otherVn: 'v994104',
  gameLogId: 994101,
  otherGameLogId: 994102,
  releaseId: 'r994101',
} as const;

/** Harness that supplies a freshly seeded VN-detail repository. */
export interface VnDetailContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: VnDetailRepository) => Promise<void>): Promise<void>;
}

/** Register VN-detail metadata, game-log, aspect, and tag parity tests. */
export function registerVnDetailRepositoryContract(
  label: string,
  harness: VnDetailContractHarness,
): void {
  describe(`${label} VN-detail repository contract`, () => {
    it('reads EGS metadata and validates source preferences', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.egs(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toMatchObject({
          vn_id: VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          egs_id: 994101,
          gamename: 'Contract EGS',
          median: 78,
        });
        await expect(repository.egs('v999999')).resolves.toBeNull();
        await expect(repository.sourcePreference(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toEqual({
          image: 'egs',
          description: 'custom',
        });
        await expect(repository.sourcePreference(VN_DETAIL_CONTRACT_FIXTURE.screenshotVn)).resolves.toEqual({});
      });
    });

    it('lists, updates, and deletes game-log rows within VN scope', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.gameLog(VN_DETAIL_CONTRACT_FIXTURE.firstVn, 10)).resolves.toMatchObject([{
          id: VN_DETAIL_CONTRACT_FIXTURE.gameLogId,
          note: 'Before update',
          session_minutes: 25,
        }]);
        await expect(repository.updateGameLog(
          VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          VN_DETAIL_CONTRACT_FIXTURE.otherGameLogId,
          { note: 'Wrong VN' },
        )).resolves.toBeNull();
        await expect(repository.updateGameLog(
          VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          VN_DETAIL_CONTRACT_FIXTURE.gameLogId,
          { note: '  After update  ', logged_at: 500, session_minutes: 0 },
        )).resolves.toMatchObject({
          note: 'After update',
          logged_at: 500,
          session_minutes: null,
        });
        await expect(repository.deleteGameLog(
          VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          VN_DETAIL_CONTRACT_FIXTURE.otherGameLogId,
        )).resolves.toBe(false);
        await expect(repository.deleteGameLog(
          VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          VN_DETAIL_CONTRACT_FIXTURE.gameLogId,
        )).resolves.toBe(true);
      });
    });

    it('preserves manual, edition, and screenshot aspect priority', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.aspectKey(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toBe('4:3');
        await expect(repository.aspectDisplay(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toMatchObject({
          aspect: '4:3',
          source: 'edition',
          width: 800,
          height: 600,
        });
        await repository.setAspectOverride({
          vnId: VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          aspectKey: '16:10',
          note: '  manual contract  ',
        });
        await expect(repository.aspectOverride(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toMatchObject({
          aspect_key: '16:10',
          note: 'manual contract',
        });
        await expect(repository.aspectDisplay(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toMatchObject({
          aspect: '16:10',
          source: 'manual',
        });
        await repository.setAspectOverride({
          vnId: VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          aspectKey: null,
        });
        await expect(repository.aspectOverride(VN_DETAIL_CONTRACT_FIXTURE.firstVn)).resolves.toBeNull();
        await expect(repository.aspectKey(VN_DETAIL_CONTRACT_FIXTURE.screenshotVn)).resolves.toBe('16:9');
      });
    });

    it('returns deterministic co-occurring tags outside the seed set', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.coOccurringTags(
          VN_DETAIL_CONTRACT_FIXTURE.firstVn,
          10,
        )).resolves.toEqual([
          { id: 'g994102', name: 'Adjacent Alpha', category: 'cont', shared: 2 },
          { id: 'g994103', name: 'Adjacent Beta', category: 'tech', shared: 1 },
        ]);
        await expect(repository.coOccurringTags('v999999', 10)).resolves.toEqual([]);
      });
    });
  });
}
