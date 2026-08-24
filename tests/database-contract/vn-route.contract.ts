import { describe, expect, it } from 'vitest';
import type { VnRouteRepository } from '@/lib/db/repositories/vn-route';

/** Stable VN identifiers shared by the route parity contract. */
export const VN_ROUTE_CONTRACT_IDS = {
  vn: 'v994701',
  foreignVn: 'v994702',
} as const;

/** Generated route ids supplied by each backend harness. */
export interface VnRouteContractRows {
  first: number;
  second: number;
  foreign: number;
}

/** Harness that supplies a freshly seeded VN-route repository. */
export interface VnRouteContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(
    run: (repository: VnRouteRepository, rows: VnRouteContractRows) => Promise<void>,
  ): Promise<void>;
}

/** Register VN-route read, update, reorder, and delete parity tests. */
export function registerVnRouteRepositoryContract(
  label: string,
  harness: VnRouteContractHarness,
): void {
  describe(`${label} VN-route repository contract`, () => {
    it('reads routes in order and handles missing ids', async () => {
      await harness.withRepository(async (repository, rows) => {
        await expect(repository.listForVn(VN_ROUTE_CONTRACT_IDS.vn)).resolves.toMatchObject([
          { id: rows.first, name: 'Common route', completed: false, order_index: 0 },
          { id: rows.second, name: 'Second route', completed: false, order_index: 1 },
        ]);
        await expect(repository.get(rows.first)).resolves.toMatchObject({ vn_id: VN_ROUTE_CONTRACT_IDS.vn });
        await expect(repository.get(9_999_999)).resolves.toBeNull();
      });
    });

    it('applies completion defaults and explicit route fields', async () => {
      await harness.withRepository(async (repository, rows) => {
        await expect(repository.update(rows.first, {})).resolves.toMatchObject({ name: 'Common route' });
        const completed = await repository.update(rows.first, {
          name: 'Completed route',
          completed: true,
          order_index: 4,
          notes: 'Done',
        });
        expect(completed).toMatchObject({
          name: 'Completed route',
          completed: true,
          order_index: 4,
          notes: 'Done',
        });
        expect(completed?.completed_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        await expect(repository.update(rows.first, { completed: false })).resolves.toMatchObject({
          completed: false,
          completed_date: null,
        });
        await expect(repository.update(rows.first, { completed_date: '2099-12-31' })).resolves.toMatchObject({
          completed_date: '2099-12-31',
        });
        await expect(repository.update(9_999_999, { name: 'Missing' })).resolves.toBeNull();
      });
    });

    it('reorders only matching VN routes and deletes idempotently', async () => {
      await harness.withRepository(async (repository, rows) => {
        await repository.reorder(VN_ROUTE_CONTRACT_IDS.vn, [rows.second, rows.foreign, rows.first]);
        await expect(repository.listForVn(VN_ROUTE_CONTRACT_IDS.vn)).resolves.toMatchObject([
          { id: rows.second, order_index: 0 },
          { id: rows.first, order_index: 2 },
        ]);
        await expect(repository.get(rows.foreign)).resolves.toMatchObject({ order_index: 0 });
        await expect(repository.delete(rows.second)).resolves.toBe(true);
        await expect(repository.delete(rows.second)).resolves.toBe(false);
      });
    });
  });
}
