import { describe, expect, it } from 'vitest';
import type { UserListRepository } from '@/lib/db/repositories/user-list';

/** Stable identifiers shared by the personal-list parity contract. */
export const USER_LIST_CONTRACT_IDS = {
  firstList: 991801,
  secondList: 991802,
  firstVn: 'v991801',
  secondVn: 'v991802',
} as const;

/** Harness that supplies a freshly seeded personal-list repository. */
export interface UserListContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: UserListRepository) => Promise<void>): Promise<void>;
}

/**
 * Register personal-list metadata, slug, membership, and ordering parity tests.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Reset and repository factory for the engine.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerUserListRepositoryContract(
  label: string,
  harness: UserListContractHarness,
): void {
  describe(`${label} personal-list repository contract`, () => {
    it('lists, reads, patches, and deletes list metadata with collision-free slugs', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.list()).resolves.toMatchObject([
          { id: USER_LIST_CONTRACT_IDS.secondList, name: 'Beta List', vn_count: 0 },
          { id: USER_LIST_CONTRACT_IDS.firstList, name: 'Alpha List', vn_count: 0 },
        ]);
        await expect(repository.get(USER_LIST_CONTRACT_IDS.firstList)).resolves.toMatchObject({
          id: USER_LIST_CONTRACT_IDS.firstList,
          slug: 'alpha-list',
        });
        await expect(repository.get(999999)).resolves.toBeNull();
        await expect(repository.update(USER_LIST_CONTRACT_IDS.firstList, {
          name: 'Beta List',
          description: 'Updated description',
          color: '#123456',
          icon: 'Bookmark',
          pinned: true,
        })).resolves.toMatchObject({
          name: 'Beta List',
          slug: 'beta-list-2',
          description: 'Updated description',
          color: '#123456',
          icon: 'Bookmark',
          pinned: 1,
        });
        await expect(repository.update(USER_LIST_CONTRACT_IDS.firstList, { name: '   ' })).rejects.toThrow('name required');
        await expect(repository.update(999999, { name: 'Missing' })).resolves.toBeNull();
        await expect(repository.remove(USER_LIST_CONTRACT_IDS.secondList)).resolves.toBe(true);
        await expect(repository.remove(USER_LIST_CONTRACT_IDS.secondList)).resolves.toBe(false);
        await expect(repository.get(USER_LIST_CONTRACT_IDS.secondList)).resolves.toBeNull();
      });
    });

    it('adds idempotently, updates notes, reorders, and removes memberships', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.addItem(999999, USER_LIST_CONTRACT_IDS.firstVn)).resolves.toBeNull();
        const first = await repository.addItem(
          USER_LIST_CONTRACT_IDS.firstList,
          USER_LIST_CONTRACT_IDS.firstVn.toUpperCase(),
          'Initial note',
        );
        expect(first).toMatchObject({
          list_id: USER_LIST_CONTRACT_IDS.firstList,
          vn_id: USER_LIST_CONTRACT_IDS.firstVn,
          order_index: 0,
          note: 'Initial note',
        });
        await expect(repository.addItem(
          USER_LIST_CONTRACT_IDS.firstList,
          USER_LIST_CONTRACT_IDS.secondVn,
        )).resolves.toMatchObject({
          vn_id: USER_LIST_CONTRACT_IDS.secondVn,
          order_index: 1,
          note: null,
        });
        await expect(repository.addItem(
          USER_LIST_CONTRACT_IDS.firstList,
          USER_LIST_CONTRACT_IDS.firstVn,
          'Revised note',
        )).resolves.toMatchObject({
          vn_id: USER_LIST_CONTRACT_IDS.firstVn,
          order_index: 0,
          added_at: first?.added_at,
          note: 'Revised note',
        });

        await repository.reorder(USER_LIST_CONTRACT_IDS.firstList, [
          USER_LIST_CONTRACT_IDS.secondVn.toUpperCase(),
          USER_LIST_CONTRACT_IDS.firstVn,
        ]);
        await expect(repository.items(USER_LIST_CONTRACT_IDS.firstList)).resolves.toMatchObject([
          { vn_id: USER_LIST_CONTRACT_IDS.secondVn, order_index: 0 },
          { vn_id: USER_LIST_CONTRACT_IDS.firstVn, order_index: 1, note: 'Revised note' },
        ]);
        await expect(repository.listForVn(USER_LIST_CONTRACT_IDS.firstVn)).resolves.toMatchObject([
          { id: USER_LIST_CONTRACT_IDS.firstList, name: 'Alpha List' },
        ]);
        const lists = await repository.list();
        expect(lists.find((list) => list.id === USER_LIST_CONTRACT_IDS.firstList)?.vn_count).toBe(2);
        await expect(repository.removeItem(
          USER_LIST_CONTRACT_IDS.firstList,
          USER_LIST_CONTRACT_IDS.firstVn.toUpperCase(),
        )).resolves.toBe(true);
        await expect(repository.removeItem(
          USER_LIST_CONTRACT_IDS.firstList,
          USER_LIST_CONTRACT_IDS.firstVn,
        )).resolves.toBe(false);
        await expect(repository.listForVn(USER_LIST_CONTRACT_IDS.firstVn)).resolves.toEqual([]);
      });
    });
  });
}
