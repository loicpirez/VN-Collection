import { describe, expect, it } from 'vitest';
import type { ActivityRepository } from '@/lib/db/repositories/activity';

/** Stable identifiers and timestamps shared by the activity parity contract. */
export const ACTIVITY_CONTRACT_FIXTURE = {
  firstVn: 'v993101',
  secondVn: 'v993102',
  firstActivity: 993101,
  secondActivity: 993102,
  thirdActivity: 993103,
  firstDay: Date.UTC(2024, 0, 2, 3, 4, 5),
  secondDay: Date.UTC(2024, 0, 3, 4, 5, 6),
} as const;

/** Harness that supplies a freshly seeded activity repository. */
export interface ActivityContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: ActivityRepository) => Promise<void>): Promise<void>;
}

/** Register global-feed and per-VN activity parity tests. */
export function registerActivityRepositoryContract(
  label: string,
  harness: ActivityContractHarness,
): void {
  describe(`${label} activity repository contract`, () => {
    it('records, filters, orders, and bounds global activity', async () => {
      await harness.withRepository(async (repository) => {
        await repository.record({
          occurredAt: 100,
          kind: 'zeta.action',
          entity: 'vn',
          entityId: ACTIVITY_CONTRACT_FIXTURE.firstVn,
          label: 'Older event',
          payload: '{"query":"plain"}',
          actor: 'contract',
        });
        await repository.record({
          occurredAt: 200,
          kind: 'alpha.action',
          entity: 'vn',
          entityId: ACTIVITY_CONTRACT_FIXTURE.secondVn,
          label: 'Literal %_\\ marker',
          payload: '{"query":"literal %_\\\\ marker"}',
          actor: 'contract',
        });

        await expect(repository.listKinds()).resolves.toEqual(['alpha.action', 'zeta.action']);
        await expect(repository.listUser({ limit: 1 })).resolves.toMatchObject([
          { occurred_at: 200, kind: 'alpha.action' },
        ]);
        await expect(repository.listUser({
          kind: 'alpha.action',
          entity: 'vn',
          q: 'Literal %_\\ marker',
          from: 150,
          to: 250,
          limit: 10,
        })).resolves.toMatchObject([{
          entity_id: ACTIVITY_CONTRACT_FIXTURE.secondVn,
          actor: 'contract',
        }]);
        await expect(repository.listUser({ q: 'absent' })).resolves.toEqual([]);
        await expect(repository.listUser({ limit: 0 })).resolves.toHaveLength(1);
      });
    });

    it('decodes and orders per-VN activity and resolves recent titles', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.listForVn(ACTIVITY_CONTRACT_FIXTURE.firstVn, 10)).resolves.toEqual([
          {
            id: ACTIVITY_CONTRACT_FIXTURE.secondActivity,
            vn_id: ACTIVITY_CONTRACT_FIXTURE.firstVn,
            kind: 'note',
            payload: null,
            occurred_at: ACTIVITY_CONTRACT_FIXTURE.secondDay,
          },
          {
            id: ACTIVITY_CONTRACT_FIXTURE.firstActivity,
            vn_id: ACTIVITY_CONTRACT_FIXTURE.firstVn,
            kind: 'manual',
            payload: { text: 'contract note' },
            occurred_at: ACTIVITY_CONTRACT_FIXTURE.firstDay,
          },
        ]);
        await expect(repository.listRecent(1)).resolves.toMatchObject([{
          vn_id: ACTIVITY_CONTRACT_FIXTURE.secondVn,
          title: 'Activity Contract Two',
          occurred_at: ACTIVITY_CONTRACT_FIXTURE.secondDay,
        }]);
      });
    });

    it('deletes only rows owned by the requested VN', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.deleteForVn(
          ACTIVITY_CONTRACT_FIXTURE.firstActivity,
          ACTIVITY_CONTRACT_FIXTURE.secondVn,
        )).resolves.toBe(false);
        await expect(repository.deleteForVn(
          ACTIVITY_CONTRACT_FIXTURE.firstActivity,
          ACTIVITY_CONTRACT_FIXTURE.firstVn,
        )).resolves.toBe(true);
        await expect(repository.listForVn(
          ACTIVITY_CONTRACT_FIXTURE.firstVn,
          10,
        )).resolves.toHaveLength(1);
      });
    });

    it('groups heatmap counts by UTC calendar day', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.heatmap(2024)).resolves.toEqual([
          { day: '2024-01-02', count: 1 },
          { day: '2024-01-03', count: 2 },
        ]);
        await expect(repository.heatmap(2023)).resolves.toEqual([]);
      });
    });
  });
}
