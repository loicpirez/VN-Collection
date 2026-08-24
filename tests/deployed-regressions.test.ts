import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeLibraryCollectionResponse } from '@/lib/collection-client-shape';
import { findSharedVasForVns } from '@/lib/compare-credits';
import { listCollection, upsertVn } from '@/lib/db';
import { summarizeStockProviderFreshness } from '@/lib/db/repositories/stock-provider-maintenance';
import { readApiErrorDetails } from '@/lib/api-error-read';
import { deployedRegressionFixture as fixture } from './fixtures/deployed-regressions';

listCollection({});
const db = new Database(process.env.DB_PATH!);

beforeEach(() => {
  db.prepare("DELETE FROM vn_va_credit WHERE vn_id IN ('v990101', 'v990102')").run();
});

afterAll(() => db.close());

describe('sanitized deployment regression fixture', () => {
  it('accepts a realistic library payload without losing canonical IDs', () => {
    const decoded = decodeLibraryCollectionResponse(fixture.collectionPayload);
    expect(decoded?.items[0]).toMatchObject({
      id: 'v990101',
      title: 'Synthetic deployment title',
      physical_location: ['Synthetic shelf'],
    });
    expect(decoded?.pagination).toEqual(fixture.collectionPayload.pagination);
  });

  it('marks only providers that wrote after their selected batch as refreshed', () => {
    const rows = summarizeStockProviderFreshness(
      fixture.stockStatuses.map((row) => ({ ...row })),
      fixture.stockBatches.map((row) => ({ ...row })),
    );
    expect(rows.find((row) => row.provider === 'sofmap')?.updated_after_last_batch).toBe(true);
    expect(rows.find((row) => row.provider === 'surugaya')?.updated_after_last_batch).toBe(false);
  });

  it('keeps wishlist upstream failures structured and user-readable', async () => {
    const response = new Response(JSON.stringify(fixture.wishlistFailure), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readApiErrorDetails(response, 'Wishlist unavailable')).resolves.toEqual({
      message: 'upstream service unavailable',
      code: 'upstream_unavailable',
      context: 'wishlist/read',
      status: 503,
      usedFallback: false,
    });
  });

  it('matches shared seiyuu by canonical staff ID across aliases', async () => {
    upsertVn({ id: 'v990101', title: 'Synthetic deployment title A' });
    upsertVn({ id: 'v990102', title: 'Synthetic deployment title B' });
    const insert = db.prepare(`
      INSERT INTO vn_va_credit (vn_id, sid, aid, va_name, va_original, c_id, c_name, c_original, note)
      VALUES (@vn_id, @sid, 1, @va_name, @va_original, @c_id, @c_name, NULL, NULL)
    `);
    for (const credit of fixture.voiceCredits) insert.run(credit);

    await expect(findSharedVasForVns(['v990101', 'v990102'])).resolves.toEqual([{
      sid: 's990101',
      va_name: 'Synthetic voice',
      va_original: null,
      creditsByVn: [
        { vn_id: 'v990101', characters: [{ c_id: 'c990101', c_name: 'Synthetic character A' }] },
        { vn_id: 'v990102', characters: [{ c_id: 'c990102', c_name: 'Synthetic character B' }] },
      ],
      totalCharacters: 2,
    }]);
  });
});
